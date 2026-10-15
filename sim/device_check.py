#!/usr/bin/env python3
"""On-device check through Safari Web Inspector (pymobiledevice3 Python API).
Phases: A single reel (swipe lock, with an on-screen cue), B home feed scrolled (ad label), C DM thread (shared reel markup).
Read-only apart from injecting instagram-focus.user.js; nothing is posted, liked or sent.
Usage: USBMUXD_SOCKET_ADDRESS=/var/run/usbmuxd .venv/bin/python sim/device_check.py"""
import asyncio, json, os
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.cli.webinspector import webinspector_service

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = open(os.path.join(HERE, "..", "instagram-focus.user.js"), encoding="utf-8").read()
REEL_URL = "https://www.instagram.com/reel/DeezPpxt6vZ/"
DM_URL = "https://www.instagram.com/direct/t/6040689019332880/"
SWIPE_SECONDS = 30

PROBE = r"""JSON.stringify((() => {
  const vis = (e) => e && getComputedStyle(e).display !== 'none' && !e.closest('[style*="display: none"]');
  const short = [...document.querySelectorAll('span, div, a, h2, h3, button')].filter((e) => e.children.length <= 1 && e.textContent.trim().length > 0 && e.textContent.trim().length < 80);
  return {
    url: location.href,
    reelsTabVisible: [...document.querySelectorAll('a[href="/reels/"]')].some(vis),
    exploreVisible: [...document.querySelectorAll('a[href^="/explore"]')].some(vis),
    articles: document.querySelectorAll('article').length,
    articlesVisible: [...document.querySelectorAll('article')].filter(vis).length,
    sponsoredish: short.filter((e) => /sponsor|commandit|partenariat|paid partnership/i.test(e.textContent)).map((e) => e.tagName + ':' + e.textContent.trim() + (vis(e) ? '' : ' [hidden]')).slice(0, 8),
    suggestedish: short.filter((e) => /^(Suggested|Suggestion|Publications sugg)/.test(e.textContent.trim())).map((e) => e.tagName + ':' + e.textContent.trim() + (vis(e) ? '' : ' [hidden]')).slice(0, 8),
    appWords: short.filter((e) => /\b(app|application)\b/i.test(e.textContent)).map((e) => e.tagName + ':' + e.textContent.trim()).slice(0, 6),
    smartBannerMeta: !!document.querySelector('meta[name="apple-itunes-app"]'),
    following: short.some((e) => /^(Following|Abonnements)$/.test(e.textContent.trim())),
    lockEngaged: document.documentElement.style.overscrollBehavior === 'none',
    scriptMark: !!document.querySelector('[data-focus-checked]'),
  };
})())"""

REEL_PROBE = r"""JSON.stringify((() => {
  const big = [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return /auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 50 && e.clientHeight > 300; });
  return {
    url: location.href,
    videos: document.querySelectorAll('video').length,
    scrollSnap: [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).scrollSnapType !== 'none').map((e) => e.tagName + ' snap=' + getComputedStyle(e).scrollSnapType).slice(0, 4),
    scrollers: big.map((e) => e.tagName + ' h=' + e.clientHeight + ' sh=' + e.scrollHeight + ' top=' + e.scrollTop).slice(0, 4),
    docScroll: { h: innerHeight, sh: document.documentElement.scrollHeight, y: scrollY },
    lockEngaged: document.documentElement.style.overscrollBehavior === 'none',
  };
})())"""

CUE_ON = r"""(() => { let d = document.getElementById('__cue'); if (!d) { d = document.createElement('div'); d.id = '__cue'; d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#ff0;color:#000;font:bold 22px -apple-system;padding:14px;text-align:center;pointer-events:none'; document.body.appendChild(d); } d.textContent = 'TEST: SWIPE UP on the reel now (30 s)'; return 1; })()"""
CUE_OFF = r"""(() => { const d = document.getElementById('__cue'); if (d) d.remove(); return 1; })()"""

DM_CARDS = r"""JSON.stringify((() => {
  const out = [];
  for (const e of document.querySelectorAll('[role="button"], a')) {
    const t = (e.textContent || '').trim();
    const aria = e.getAttribute('aria-label') || '';
    const img = e.querySelector('img, video');
    if (!(img || /reel/i.test(aria + t))) continue;
    if (e.querySelector('[role="button"]')) continue;
    out.push({ tag: e.tagName, role: e.getAttribute('role'), href: (e.getAttribute('href') || '').slice(0, 50), aria: aria.slice(0, 60), alt: img ? (img.getAttribute('alt') || '').slice(0, 60) : '', text: t.slice(0, 50), html: e.outerHTML.replace(/\s+/g, ' ').slice(0, 220) });
  }
  return out.slice(0, 8);
})())"""

def out(k, v):
    print(f"{k}: {v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)}", flush=True)

async def main():
    lockdown = await asyncio.wait_for(create_using_usbmux(), 20)
    async with webinspector_service(lockdown) as inspector:
        pages = await inspector.get_open_application_pages(timeout=2)
        target = next((p for p in pages if "instagram.com" in (p.page.web_url or "")), None)
        if target is None:
            out("error", "no instagram.com tab in the foreground"); return
        session = await inspector.inspector_session(target.application, target.page)
        await session.runtime_enable()
        js = lambda expr: asyncio.wait_for(session.runtime_evaluate(expr, return_by_value=True), 25)
        loads = lambda v: json.loads(v) if isinstance(v, str) else v
        inject = lambda: js(SCRIPT + "\n;(() => { const s = document.createElement('span'); document.body.appendChild(s); s.remove(); return 'injected'; })()")

        # A. single reel: inject, cue the user, watch URL and the scroller's scrollTop
        await session.navigate_to_url(REEL_URL); await asyncio.sleep(6)
        out("A reel BEFORE", loads(await js(REEL_PROBE)))
        await inject(); await asyncio.sleep(2)
        before = loads(await js(REEL_PROBE))
        out("A reel AFTER inject", before)
        await js(CUE_ON)
        changed = None
        for _ in range(SWIPE_SECONDS * 2):
            await asyncio.sleep(0.5)
            u = loads(await js("JSON.stringify({u: location.href})"))["u"]
            if u != before["url"]: changed = u; break
        await js(CUE_OFF)
        after = loads(await js(REEL_PROBE))
        out("A swipe result", {"urlChanged": changed, "scrollersBefore": before["scrollers"], "scrollersAfter": after["scrollers"], "videosBefore": before["videos"], "videosAfter": after["videos"]})

        # B. home feed, scrolled to load more posts
        await session.navigate_to_url("https://www.instagram.com/?variant=following"); await asyncio.sleep(6)
        for _ in range(5):
            await js("(() => { scrollTo(0, document.documentElement.scrollHeight); return 1; })()"); await asyncio.sleep(2)
        out("B home BEFORE", loads(await js(PROBE)))
        await inject(); await asyncio.sleep(2)
        out("B home AFTER", loads(await js(PROBE)))

        # C. DM thread: how is a shared reel built?
        await session.navigate_to_url(DM_URL); await asyncio.sleep(6)
        out("C dm BEFORE", loads(await js(PROBE)))
        out("C dm cards", loads(await js(DM_CARDS)))

asyncio.run(main())

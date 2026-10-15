#!/usr/bin/env python3
"""Verify the INSTALLED userscript (no injection), one step at a time with its own timeout, so a hang
shows where it happens: home responsiveness, reel page lock + frozen scroller, wheel, in-page navigation."""
import asyncio, json, time
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.cli.webinspector import webinspector_service

HOME = "https://www.instagram.com/?variant=following"
REEL = "https://www.instagram.com/reels/DecwfGcyRn9/"
STATE = r"""JSON.stringify((() => {
  const vids = [...document.querySelectorAll('video')];
  const fr = [];
  for (const v of vids) for (let el = v.parentElement, i = 0; el && i < 25; el = el.parentElement, i++) if (el.style.overflowY === 'hidden') fr.push(el.tagName + ' h=' + el.clientHeight + ' sh=' + el.scrollHeight + ' top=' + el.scrollTop);
  return {
    url: location.href,
    version: document.documentElement.dataset.focusVersion || null,
    lockEngaged: document.documentElement.style.overscrollBehavior === 'none',
    videos: vids.length,
    bigVideo: vids.some((v) => { const r = v.getBoundingClientRect(); return r.height >= innerHeight * 0.85 && r.width >= innerWidth * 0.6; }),
    frozen: [...new Set(fr)].slice(0, 4),
    smartBannerMeta: !!document.querySelector('meta[name="apple-itunes-app"]'),
    reelsTabVisible: [...document.querySelectorAll('a[href="/reels/"]')].some((a) => getComputedStyle(a).display !== 'none'),
  };
})())"""

async def main():
    lockdown = await asyncio.wait_for(create_using_usbmux(), 20)
    async with webinspector_service(lockdown) as inspector:
        pages = await inspector.get_open_application_pages(timeout=2)
        target = next((p for p in pages if "instagram.com" in (p.page.web_url or "")), None) or next((p for p in pages if p.page.web_url), None)
        if target is None: print("no page in the foreground"); return
        session = await inspector.inspector_session(target.application, target.page)
        await session.runtime_enable()
        async def ev(label, expr, t=12):
            t0 = time.time()
            try:
                v = await asyncio.wait_for(session.runtime_evaluate(expr, return_by_value=True), t)
                print(f"{label}: {v} ({time.time()-t0:.1f}s)", flush=True)
            except asyncio.TimeoutError:
                print(f"{label}: TIMEOUT after {t}s (page JavaScript not answering)", flush=True)
        await session.navigate_to_url(HOME); await asyncio.sleep(6)
        await ev("home", STATE)
        await session.navigate_to_url(REEL); await asyncio.sleep(2)
        await ev("reel +2s", STATE)
        await asyncio.sleep(6)
        await ev("reel +8s", STATE)
        await ev("wheel", "(() => { const v = document.querySelector('video'); if (!v) return 'no video'; v.dispatchEvent(new WheelEvent('wheel', { deltaY: 400, bubbles: true, cancelable: true })); return 'sent'; })()")
        await asyncio.sleep(1)
        await ev("reel after wheel", STATE)
        await ev("spa nav", "(() => { const a = document.querySelector('a[href=\"/direct/inbox/\"]'); if (a) { a.click(); return 'clicked'; } history.pushState(null, '', '/direct/inbox/'); dispatchEvent(new PopStateEvent('popstate')); return 'pushed'; })()")
        await asyncio.sleep(4)
        await ev("after spa nav", STATE)

asyncio.run(main())

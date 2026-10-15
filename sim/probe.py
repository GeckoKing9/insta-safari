#!/usr/bin/env python3
"""Read-only probe of the live instagram.com tab: is the Userscripts-installed script active? No injection."""
import asyncio, json
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.cli.webinspector import webinspector_service

PROBE = r"""JSON.stringify((() => {
  const vis = (e) => e && getComputedStyle(e).display !== 'none' && !e.closest('[style*="display: none"]');
  return {
    url: location.href,
    scriptActive: !!document.querySelector('[data-focus-checked]'),
    ourCss: [...document.querySelectorAll('style')].some((s) => /a\[href="\/reels\/"\]\{display:none/.test(s.textContent)),
    reelsTabVisible: [...document.querySelectorAll('a[href="/reels/"]')].some(vis),
    exploreVisible: [...document.querySelectorAll('a[href^="/explore"]')].some(vis),
    smartBannerMeta: !!document.querySelector('meta[name="apple-itunes-app"]'),
    following: [...document.querySelectorAll('span, div')].some((e) => e.children.length === 0 && /^(Following|Abonnements)$/.test(e.textContent.trim())),
    articles: document.querySelectorAll('article').length,
    lockEngaged: document.documentElement.style.overscrollBehavior === 'none',
  };
})())"""

async def main():
    lockdown = await asyncio.wait_for(create_using_usbmux(), 20)
    async with webinspector_service(lockdown) as inspector:
        pages = await inspector.get_open_application_pages(timeout=2)
        print("tabs:", [p.page.web_url for p in pages if p.page.web_url], flush=True)
        target = next((p for p in pages if "instagram.com" in (p.page.web_url or "")), None)
        if target is None: print("no instagram.com tab in the foreground"); return
        session = await inspector.inspector_session(target.application, target.page)
        await session.runtime_enable()
        v = await asyncio.wait_for(session.runtime_evaluate(PROBE, return_by_value=True), 25)
        print("probe:", json.dumps(json.loads(v) if isinstance(v, str) else v, ensure_ascii=False), flush=True)

asyncio.run(main())

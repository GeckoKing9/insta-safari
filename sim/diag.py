#!/usr/bin/env python3
"""Is page JS evaluation working at all? example.com first (no script), then Instagram (script version + responsiveness)."""
import asyncio, json, time
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.cli.webinspector import webinspector_service

async def main():
    lockdown = await asyncio.wait_for(create_using_usbmux(), 20)
    async with webinspector_service(lockdown) as inspector:
        pages = await inspector.get_open_application_pages(timeout=2)
        target = next((p for p in pages if p.page.web_url), None)
        if target is None: print("no page"); return
        session = await inspector.inspector_session(target.application, target.page)
        await session.runtime_enable()
        async def ev(expr, t=12):
            t0 = time.time()
            try:
                v = await asyncio.wait_for(session.runtime_evaluate(expr, return_by_value=True), t)
                return f"{v!r} ({time.time()-t0:.1f}s)"
            except asyncio.TimeoutError:
                return f"TIMEOUT after {t}s"
        await session.navigate_to_url("https://example.com/"); await asyncio.sleep(4)
        print("example.com 1+1:", await ev("1+1"), flush=True)
        await session.navigate_to_url("https://www.instagram.com/?variant=following"); await asyncio.sleep(8)
        print("instagram version:", await ev("document.documentElement.dataset.focusVersion || 'none'"), flush=True)
        print("instagram 1+1:", await ev("1+1"), flush=True)
        print("instagram state:", await ev("JSON.stringify({url: location.href, reelsTab: !![...document.querySelectorAll('a[href=\"/reels/\"]')].find(a => getComputedStyle(a).display !== 'none'), meta: !!document.querySelector('meta[name=\"apple-itunes-app\"]'), checked: document.querySelectorAll('[data-focus-checked]').length})"), flush=True)

asyncio.run(main())

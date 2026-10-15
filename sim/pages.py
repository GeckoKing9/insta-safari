#!/usr/bin/env python3
"""Checker: list every inspectable web page on the phone (Safari tabs AND Home Screen web apps) with the
owning app and whether our script is active in it. Exit 0 only when an instagram.com page is open in
Safari proper with the script active, and no instagram.com page is running as a Home Screen web app."""
import asyncio, json, sys
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.cli.webinspector import webinspector_service

PROBE = "JSON.stringify({v: document.documentElement.dataset.focusVersion || null, standalone: !!navigator.standalone, reelsTab: [...document.querySelectorAll('a[href=\"/reels/\"]')].some(a => getComputedStyle(a).display !== 'none'), url: location.href})"

async def main():
    lockdown = await asyncio.wait_for(create_using_usbmux(), 20)
    ok, bad = False, []
    async with webinspector_service(lockdown) as inspector:
        pages = await inspector.get_open_application_pages(timeout=3)
        for ap in pages:
            if not ap.page.web_url or "instagram.com" not in ap.page.web_url: continue
            app = f"{ap.application.name} ({ap.application.bundle})"
            try:
                session = await inspector.inspector_session(ap.application, ap.page)
                await session.runtime_enable()
                v = await asyncio.wait_for(session.runtime_evaluate(PROBE, return_by_value=True), 12)
                d = json.loads(v) if isinstance(v, str) else v
            except Exception as e:
                d = {"error": str(e)[:60]}
            print(f"{app}: {json.dumps(d)}", flush=True)
            is_safari = ap.application.bundle == "com.apple.mobilesafari"
            if is_safari and d.get("v"): ok = True
            if not is_safari or d.get("standalone"): bad.append(app)
    if bad: print("FAIL: instagram.com running outside Safari (no extensions there): " + ", ".join(bad))
    if not ok: print("FAIL: no Safari tab with the script active")
    print("PASS" if ok and not bad else "not yet")
    sys.exit(0 if ok and not bad else 1)

asyncio.run(main())

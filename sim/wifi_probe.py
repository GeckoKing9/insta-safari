#!/usr/bin/env python3
"""Reach the iPhone over Wi-Fi (lockdown TCP, no USB/IP) and run the same step-by-step verification.
Usage: .venv/bin/python sim/wifi_probe.py <phone-ip>"""
import asyncio, json, sys, time
from pymobiledevice3.lockdown import create_using_tcp
from pymobiledevice3.cli.webinspector import webinspector_service

UDID = "00008120-0011301102D1A01E"
HOME = "https://www.instagram.com/?variant=following"
REEL = "https://www.instagram.com/reels/DecwfGcyRn9/"
STATE = open(__file__.replace("wifi_probe.py", "verify_lock.py")).read().split('STATE = r"""')[1].split('"""')[0]

async def main(ip):
    lockdown = await asyncio.wait_for(create_using_tcp(hostname=ip, identifier=UDID, autopair=False), 25)
    info = await lockdown.get_value()
    print("wifi lockdown ok:", info.get("DeviceName"), info.get("ProductVersion"), flush=True)
    async with webinspector_service(lockdown) as inspector:
        pages = await inspector.get_open_application_pages(timeout=3)
        print("tabs:", [p.page.web_url for p in pages if p.page.web_url], flush=True)
        target = next((p for p in pages if p.page.web_url), None)
        if target is None: print("no page in the foreground"); return
        session = await inspector.inspector_session(target.application, target.page)
        await session.runtime_enable()
        async def ev(label, expr, t=12):
            t0 = time.time()
            try:
                v = await asyncio.wait_for(session.runtime_evaluate(expr, return_by_value=True), t)
                print(f"{label}: {v} ({time.time()-t0:.1f}s)", flush=True)
            except asyncio.TimeoutError:
                print(f"{label}: TIMEOUT after {t}s", flush=True)
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

asyncio.run(main(sys.argv[1]))

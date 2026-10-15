import asyncio, json, logging, sys
logging.basicConfig(level=logging.INFO, stream=sys.stdout, format='%(name)s: %(message)s')
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.cli.webinspector import webinspector_service
Q = "JSON.stringify({v: document.documentElement.dataset.focusVersion || null, reelsTab: [...document.querySelectorAll('a[href=\"/reels/\"]')].some(a => getComputedStyle(a).display !== 'none'), explore: [...document.querySelectorAll('a[href^=\"/explore\"]')].some(a => getComputedStyle(a).display !== 'none'), meta: !!document.querySelector('meta[name=\"apple-itunes-app\"]'), url: location.href, ready: document.readyState})"
async def main():
    ld = await asyncio.wait_for(create_using_usbmux(), 20)
    async with webinspector_service(ld) as insp:
        ap = next((p for p in await insp.get_open_application_pages(timeout=3) if p.page.web_url and 'instagram.com' in p.page.web_url and p.application.bundle == 'com.apple.mobilesafari'), None)
        if not ap: print('no safari tab'); return
        s = await insp.inspector_session(ap.application, ap.page)
        await s.console_enable(); await s.runtime_enable()
        await s.navigate_to_url('https://www.instagram.com/?variant=following')
        for t in (3, 6, 10):
            await asyncio.sleep(3 if t == 3 else 3 if t == 6 else 4)
            try: print(f'+{t}s:', await asyncio.wait_for(s.runtime_evaluate(Q, return_by_value=True), 12), flush=True)
            except asyncio.TimeoutError: print(f'+{t}s: TIMEOUT', flush=True)
asyncio.run(main())

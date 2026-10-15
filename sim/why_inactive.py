import asyncio, json, logging, os, sys
logging.basicConfig(level=logging.INFO, stream=sys.stdout, format='%(name)s: %(message)s')
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.cli.webinspector import webinspector_service
SCRIPT = open(os.path.join(os.path.dirname(__file__), '..', 'instagram-focus.user.js'), encoding='utf-8').read()
Q = "JSON.stringify({v: document.documentElement.dataset.focusVersion || null, reelsTab: [...document.querySelectorAll('a[href=\"/reels/\"]')].some(a => getComputedStyle(a).display !== 'none'), meta: !!document.querySelector('meta[name=\"apple-itunes-app\"]')})"
async def main():
    ld = await asyncio.wait_for(create_using_usbmux(), 20)
    async with webinspector_service(ld) as insp:
        ap = next((p for p in await insp.get_open_application_pages(timeout=3) if p.page.web_url and 'instagram' in p.page.web_url and p.application.bundle == 'com.apple.mobilesafari'), None)
        if not ap: print('no safari instagram tab'); return
        s = await insp.inspector_session(ap.application, ap.page)
        await s.console_enable(); await s.runtime_enable()
        await asyncio.sleep(2)
        ev = lambda e: asyncio.wait_for(s.runtime_evaluate(e, return_by_value=True), 15)
        print('BEFORE inject:', await ev(Q), flush=True)
        try:
            r = await ev(SCRIPT + "\n;'ran'")
            print('inject result:', r, flush=True)
        except Exception as e:
            print('inject raised:', repr(e)[:200], flush=True)
        await asyncio.sleep(2)
        print('AFTER inject:', await ev(Q), flush=True)
asyncio.run(main())

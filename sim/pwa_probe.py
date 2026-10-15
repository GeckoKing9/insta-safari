import asyncio, json
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.cli.webinspector import webinspector_service
P = """JSON.stringify((() => ({
  url: location.href, standalone: !!navigator.standalone, ua: navigator.userAgent.slice(-60),
  navHrefs: [...new Set([...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => /^\\/(reels?|explore|direct|$|\\?)/.test(h)))].slice(0, 12),
  navRoles: [...document.querySelectorAll('[role="tablist"] *, nav *, [role="navigation"] *')].filter(e => e.childElementCount === 0 && (e.getAttribute('aria-label') || e.textContent.trim())).map(e => e.tagName + ':' + (e.getAttribute('aria-label') || e.textContent.trim()).slice(0, 25)).slice(0, 14),
  svgLabels: [...document.querySelectorAll('svg[aria-label]')].map(s => s.getAttribute('aria-label')).slice(0, 14),
  meta: !!document.querySelector('meta[name="apple-itunes-app"]'),
}))())"""
async def main():
    ld = await asyncio.wait_for(create_using_usbmux(), 20)
    async with webinspector_service(ld) as insp:
        for ap in await insp.get_open_application_pages(timeout=3):
            if not ap.page.web_url or 'instagram' not in ap.page.web_url: continue
            s = await insp.inspector_session(ap.application, ap.page); await s.runtime_enable()
            v = await asyncio.wait_for(s.runtime_evaluate(P, return_by_value=True), 15)
            print(ap.application.bundle, json.dumps(json.loads(v) if isinstance(v, str) else v, ensure_ascii=False), flush=True)
asyncio.run(main())

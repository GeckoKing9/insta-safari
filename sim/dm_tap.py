#!/usr/bin/env python3
"""Interactive: inject the script on the DM thread, cue the user to tap the shared reel, and record what
Instagram does (URL change? overlay viewer? how many videos? did the lock engage?)."""
import asyncio, json, os
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.cli.webinspector import webinspector_service

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = open(os.path.join(HERE, "..", "instagram-focus.user.js"), encoding="utf-8").read()
DM_URL = "https://www.instagram.com/direct/t/6040689019332880/"
WINDOW = 40

STATE = r"""JSON.stringify((() => {
  const big = [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return /auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 50 && e.clientHeight > 300; });
  const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].map((d) => d.tagName + ' videos=' + d.querySelectorAll('video').length + ' h=' + d.clientHeight);
  return { url: location.href, videos: document.querySelectorAll('video').length, dialogs, scrollers: big.map((e) => e.tagName + ' h=' + e.clientHeight + ' sh=' + e.scrollHeight + ' top=' + e.scrollTop).slice(0, 3), lockEngaged: document.documentElement.style.overscrollBehavior === 'none' };
})())"""
CUE = r"""(() => { let d = document.getElementById('__cue'); if (!d) { d = document.createElement('div'); d.id = '__cue'; d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#ff0;color:#000;font:bold 20px -apple-system;padding:12px;text-align:center;pointer-events:none'; document.body.appendChild(d); } d.textContent = 'TEST: TAP the reel your friend sent, then swipe up on it (40 s)'; return 1; })()"""
CUE_OFF = r"""(() => { const d = document.getElementById('__cue'); if (d) d.remove(); return 1; })()"""

def out(k, v): print(f"{k}: {json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v}", flush=True)

async def main():
    lockdown = await asyncio.wait_for(create_using_usbmux(), 20)
    async with webinspector_service(lockdown) as inspector:
        pages = await inspector.get_open_application_pages(timeout=2)
        target = next((p for p in pages if "instagram.com" in (p.page.web_url or "")), None)
        if target is None: out("error", "no instagram.com tab in the foreground"); return
        session = await inspector.inspector_session(target.application, target.page)
        await session.runtime_enable()
        js = lambda expr: asyncio.wait_for(session.runtime_evaluate(expr, return_by_value=True), 25)
        loads = lambda v: json.loads(v) if isinstance(v, str) else v
        await session.navigate_to_url(DM_URL); await asyncio.sleep(6)
        await js(SCRIPT + "\n;1"); await asyncio.sleep(1)
        out("DM start", loads(await js(STATE)))
        await js(CUE)
        seen, last = [], None
        for _ in range(WINDOW * 2):
            await asyncio.sleep(0.5)
            try: s = loads(await js(STATE))
            except Exception as e: seen.append({"error": str(e)[:80]}); break
            key = (s["url"], s["videos"], tuple(s["dialogs"]), s["lockEngaged"])
            if key != last: seen.append(s); last = key
            if len(seen) > 12: break
        try: await js(CUE_OFF)
        except Exception: pass
        out("timeline", seen)

asyncio.run(main())

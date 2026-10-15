#!/usr/bin/env python3
"""Screenshot + layout probe of the first Instagram Safari tab: `probe.py [URL|-] [NAME] [OUT_DIR]`.
Saves what the phone shows (WebKit Page.snapshotRect, the visible viewport) as OUT_DIR/NAME.png and prints the
items of the bottom tab bar and the top header: href or label, centre x, width, visible. URL '-' keeps the page."""
import asyncio, base64, json, os, sys
from _device import inspector, instagram_pages, session, ev, out

BARS = r"""JSON.stringify((() => {
  const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const label = (e) => e.getAttribute('href') || e.getAttribute('aria-label') || e.querySelector('svg[aria-label]')?.getAttribute('aria-label') || e.textContent.trim().slice(0, 16);
  const items = (pred) => [...document.querySelectorAll('a[href], [role="button"], button')]
    .filter((e) => shown(e) && pred(e.getBoundingClientRect()) && !e.parentElement.closest('a[href], [role="button"], button'))
    .map((e) => { const r = e.getBoundingClientRect(); return { l: label(e), cx: Math.round(r.x + r.width / 2), w: Math.round(r.width), top: Math.round(r.top) }; })
    .sort((a, b) => a.cx - b.cx);
  return { url: location.pathname + location.search, v: document.documentElement.dataset.focusVersion, w: innerWidth, h: innerHeight,
    bottom: items((r) => r.top > innerHeight - 90 && r.bottom <= innerHeight + 2), top: items((r) => r.bottom < 70) };
})())"""


async def snapshot(s, path):
    dims = await ev(s, "JSON.stringify({ w: innerWidth, h: innerHeight })")
    msg = await s.send_and_receive({"method": "Page.snapshotRect", "params": {
        "x": 0, "y": 0, "width": dims["w"], "height": dims["h"], "coordinateSystem": "Viewport"}})
    if isinstance(msg, dict) and "params" in msg:  # a page target answers through Target.dispatchMessageFromTarget
        msg = json.loads(msg["params"]["message"])
    url = (msg.get("result") or {}).get("dataURL") if isinstance(msg, dict) else None
    if not url: return f"no snapshot: {str(msg)[:160]}"
    with open(path, "wb") as f: f.write(base64.b64decode(url.split(",", 1)[1]))
    return path


async def main():
    url = sys.argv[1] if len(sys.argv) > 1 else "-"
    name = sys.argv[2] if len(sys.argv) > 2 else "shot"
    out_dir = sys.argv[3] if len(sys.argv) > 3 else "."
    async with inspector() as insp:
        pages = await instagram_pages(insp)
        if not pages: print("no Instagram tab open in Safari"); return
        s = await session(insp, pages[0])
        if url != "-":  # a full load replaces the page target, so talk to the new one afterwards
            await s.navigate_to_url(url); await asyncio.sleep(7)
            pages = await instagram_pages(insp)
            if not pages: print("tab gone after navigating"); return
            s = await session(insp, pages[0])
        out("bars", await ev(s, BARS))
        out("png", await snapshot(s, os.path.join(out_dir, name + ".png")))

asyncio.run(main())

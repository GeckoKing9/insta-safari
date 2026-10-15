#!/usr/bin/env python3
"""Measure home-feed scroll smoothness on the phone: auto-scroll for 5 s while counting animation frames
and long main-thread tasks. Run once with the script installed and once with a blank script for an A/B.
Note: WebKit has no 'longtask' performance entries, so on the iPhone the long-task numbers are always 0; fps is the signal.
Usage: jank.py <label>"""
import asyncio, sys
from _device import inspector, instagram_pages, session, ev, out

HOME = "https://www.instagram.com/?variant=following"
START = r"""(() => {
  window.__jank = null;
  const longs = []; let frames = 0;
  const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(Math.round(e.duration)); });
  try { po.observe({ type: 'longtask', buffered: false }); } catch (_) {}
  const t0 = performance.now();
  const tick = () => { frames++; if (performance.now() - t0 < 5000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const scroller = setInterval(() => scrollBy(0, 24), 16);
  setTimeout(() => {
    clearInterval(scroller); po.disconnect();
    window.__jank = {
      version: document.documentElement.dataset.focusVersion || null,
      fps: Math.round(frames / 5),
      longTasks: longs.length, longTaskMs: longs.reduce((a, b) => a + b, 0), worstMs: Math.max(0, ...longs),
      scrolledPx: Math.round(scrollY), articles: document.querySelectorAll('article').length,
      hiddenArticles: document.querySelectorAll('article[style*="display: none"]').length,
    };
  }, 5200);
  return 'started';
})()"""

async def main(label):
    async with inspector() as insp:
        pages = await instagram_pages(insp)
        if not pages: print("no Instagram tab open in Safari"); return
        s = await session(insp, pages[0])
        await s.navigate_to_url(HOME); await asyncio.sleep(7)
        out(label + " start", await ev(s, START, 10))
        await asyncio.sleep(6.5)
        out(label, await ev(s, "JSON.stringify(window.__jank || {pending: true})", 10))

asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "run"))

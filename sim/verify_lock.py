#!/usr/bin/env python3
"""Drive the first Instagram Safari tab through the home feed, a feed-style reel page, a wheel event and an
in-page navigation, reading the installed script's state at each step (no injection)."""
import asyncio
from _device import inspector, instagram_pages, session, ev, out, STATE

HOME = "https://www.instagram.com/?variant=following"
REEL = "https://www.instagram.com/reels/DecwfGcyRn9/"
REEL_STATE = STATE  # carries "locked": the script's own data-focus-locked flag

async def main():
    async with inspector() as insp:
        pages = await instagram_pages(insp)
        if not pages: print("no Instagram tab open in Safari"); return
        s = await session(insp, pages[0])
        await s.navigate_to_url(HOME); await asyncio.sleep(6)
        out("home", await ev(s, STATE))
        await s.navigate_to_url(REEL); await asyncio.sleep(8)
        out("reel", await ev(s, REEL_STATE))
        out("wheel", await ev(s, "(() => { const v = document.querySelector('video'); if (!v) return 'no video'; v.dispatchEvent(new WheelEvent('wheel', { deltaY: 400, bubbles: true, cancelable: true })); return 'sent'; })()"))
        await asyncio.sleep(1)
        out("reel after wheel", await ev(s, REEL_STATE))
        out("spa nav", await ev(s, "(() => { const a = document.querySelector('a[href=\"/direct/inbox/\"]'); if (a) { a.click(); return 'clicked'; } return 'no inbox link'; })()"))
        await asyncio.sleep(4)
        out("after spa nav", await ev(s, STATE))

asyncio.run(main())

#!/usr/bin/env python3
"""Reload every open Instagram Safari tab (Instagram is a single-page app and never reloads by itself,
so a tab keeps the script version it loaded with) and report the version each one runs afterwards."""
import asyncio
from _device import inspector, instagram_pages, session, ev, out, STATE

async def main():
    async with inspector() as insp:
        sessions = []
        for ap in await instagram_pages(insp):
            s = await session(insp, ap)
            await s.navigate_to_url(ap.page.web_url.split("#")[0])
            sessions.append((ap.page.web_url, s))
        await asyncio.sleep(8)
        for url, s in sessions:
            out("reloaded " + url, await ev(s, STATE, 15))

asyncio.run(main())

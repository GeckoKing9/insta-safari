#!/usr/bin/env python3
"""Evaluate a JS file (its last expression must be a JSON string or plain value) in the first Instagram Safari
tab and print the result: `evaljs.py FILE.js`. For one-off DOM questions during on-device work."""
import asyncio, sys
from _device import inspector, instagram_pages, session, ev, out

async def main():
    js = open(sys.argv[1]).read()
    async with inspector() as insp:
        pages = await instagram_pages(insp)
        if not pages: print("no Instagram tab open in Safari"); return
        out("result", await ev(await session(insp, pages[0]), js, 20))

asyncio.run(main())

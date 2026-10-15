#!/usr/bin/env python3
"""Read the script's in-page event log (<html data-focus-log>, DEBUG builds) from every Instagram Safari tab."""
import asyncio, json
from _device import inspector, instagram_pages, session, ev

async def main():
    async with inspector() as insp:
        for ap in await instagram_pages(insp):
            d = await ev(await session(insp, ap), "JSON.stringify({url: location.href, v: document.documentElement.dataset.focusVersion || null, log: JSON.parse(document.documentElement.dataset.focusLog || '[]')})", 12)
            if isinstance(d, dict) and "log" in d:
                print(f"== {d['url']} (v{d['v']}), {len(d['log'])} events:")
                for line in d["log"]: print("  " + line)
            else:
                print(f"== {ap.page.web_url}: {json.dumps(d)}")

asyncio.run(main())

#!/usr/bin/env python3
"""Checker: every open instagram.com page (Safari tabs and Home Screen web apps) with its owning app and
script version. Exit 0 only when a real Safari tab runs the repo's version and no copy runs as a web app."""
import asyncio, sys
from _device import inspector, instagram_pages, session, ev, out, STATE, SAFARI, REPO_VERSION

async def main():
    ok, bad = False, []
    async with inspector() as insp:
        for ap in await instagram_pages(insp, safari_only=False):
            app = f"{ap.application.name} ({ap.application.bundle})"
            try: d = await ev(await session(insp, ap), STATE, 12)
            except Exception as e: d = {"error": repr(e)[:60]}
            out(app, d)
            is_safari = ap.application.bundle == SAFARI
            if is_safari and d.get("version") == REPO_VERSION: ok = True
            if not is_safari or d.get("standalone"): bad.append(app)
    if bad: print("FAIL: instagram.com running outside Safari (no extensions there): " + ", ".join(bad))
    if not ok: print(f"FAIL: no Safari tab running the repo's v{REPO_VERSION} (push the script, then reload the tab)")
    print("PASS" if ok and not bad else "not yet")
    sys.exit(0 if ok and not bad else 1)

asyncio.run(main())

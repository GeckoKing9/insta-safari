#!/usr/bin/env python3
"""On-device checker for the tab bar, the DM inbox bar, the search tab and double-tap zoom, on the first Instagram
Safari tab. Moves only by in-page navigation (one inspector session), prints one FAIL line per failing item and
exits 0 only when there are none. Phone unlocked, Safari in front, logged in."""
import asyncio, json, re, sys
from pathlib import Path
from _device import inspector, instagram_pages, session, ev

WANT_VERSION = re.search(r"SITE_VERSION = '(\d+)'", (Path(__file__).parent.parent / "instagram-focus.user.js").read_text()).group(1)
fails = []
def fail(item, why): fails.append(f"FAIL {item}: {why}"); print(fails[-1], flush=True)

# the visible links along the bottom edge that a finger would hit, left to right (same rule as check.js)
TABS = r"""JSON.stringify([...document.querySelectorAll('a[href]')].filter((a) => { const r = a.getBoundingClientRect();
  if (!r.width || r.top < innerHeight - 60 || r.bottom > innerHeight + 1 || getComputedStyle(a).visibility === 'hidden') return false;
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && a.contains(hit); })
  .map((a) => { const r = a.getBoundingClientRect(); return { href: a.getAttribute('href'), cx: r.x + r.width / 2, top: r.top, current: a.getAttribute('aria-current') }; })
  .sort((a, b) => a.cx - b.cx).concat([{ w: innerWidth, url: location.pathname, doc: window.__focusDoc }]))"""
GO = """(() => { history.pushState(null, '', '%s'); dispatchEvent(new PopStateEvent('popstate', { state: null })); return 'ok'; })()"""
TAP_TAB = """(() => { const a = [...document.querySelectorAll('a[href="%s"]')].find((e) => e.getBoundingClientRect().top >= innerHeight - 60); if (!a) return 'none'; a.click(); return 'tapped'; })()"""
STATE = r"""JSON.stringify({ url: location.pathname, doc: window.__focusDoc, v: document.documentElement.dataset.focusVersion,
  inputs: [...document.querySelectorAll('input')].filter((e) => e.getClientRects().length).length,
  tiles: [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').length,
  touch: [document.documentElement, document.body, document.querySelector('main a, article a')].filter(Boolean).map((e) => getComputedStyle(e).touchAction) })"""
INBOX_CLEAR = r"""JSON.stringify((() => {
  const box = [...document.querySelectorAll('div')].filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 20)
    .sort((a, b) => b.clientHeight - a.clientHeight)[0];
  if (!box) return { err: 'no inbox scroller' };
  box.scrollTop = box.scrollHeight;
  const rows = [...box.querySelectorAll('[role="button"], [role="link"], a')].filter((e) => { const r = e.getBoundingClientRect(); return r.height >= 50 && r.height <= 110 && r.width > innerWidth * 0.7; });
  const last = rows[rows.length - 1]?.getBoundingClientRect();
  const barTop = Math.min(...[...document.querySelectorAll('a[href="/"]')].map((a) => a.getBoundingClientRect().top).filter((t) => t > innerHeight - 100), innerHeight);
  return { lastBottom: last ? Math.round(last.bottom) : null, barTop: Math.round(barTop), rows: rows.length };
})())"""
OPEN_THREAD = r"""(() => { const box = [...document.querySelectorAll('div')].filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 20).sort((a, b) => b.clientHeight - a.clientHeight)[0];
  if (!box) return 'no scroller'; box.scrollTop = 0;
  const row = [...box.querySelectorAll('[role="button"], [role="link"], a')].find((e) => { const r = e.getBoundingClientRect(); return r.height >= 50 && r.height <= 110 && r.width > innerWidth * 0.7 && r.top > 0; });
  if (!row) return 'no row'; row.click(); return 'opened'; })()"""


async def tabs(s):
    t = await ev(s, TABS)
    if not isinstance(t, list): return [], {"url": "?", "w": 0, "doc": None, "err": t}
    return t[:-1], t[-1]


def check_tabs(item, t, meta, profile):
    hrefs = [x["href"] for x in t]
    want = ["/", "/explore/", "/direct/inbox/", profile]
    if hrefs != want: fail(item, f"bottom tabs on {meta['url']} are {hrefs}, expected {want}"); return None
    c = [x["cx"] for x in t]; gaps = [c[1] - c[0], c[2] - c[1], c[3] - c[2]]
    if max(gaps) - min(gaps) > 1: fail(item, f"tab gaps uneven on {meta['url']}: {[round(g) for g in gaps]}")
    if abs(c[0] - (meta["w"] - c[3])) > 1: fail(item, f"tabs off-centre on {meta['url']}: left {round(c[0])} vs right {round(meta['w'] - c[3])}")
    return t


async def main():
    async with inspector() as insp:
        pages = await instagram_pages(insp)
        if not pages: print("FAIL setup: no Instagram tab open in Safari"); sys.exit(1)
        s = await session(insp, pages[0])
        await ev(s, "window.__focusDoc = window.__focusDoc || Math.random(); 'ok'")
        await ev(s, GO % "/"); await asyncio.sleep(4)
        st = await ev(s, STATE)
        if st.get("v") != WANT_VERSION: fail("version", f"phone runs v{st.get('v')}, repo is v{WANT_VERSION} (push + reload first)")
        doc = st.get("doc")
        t, meta = await tabs(s)
        profile = t[-1]["href"] if t else "?"
        home = check_tabs("S19 home", t, meta, profile)
        if any(v != "manipulation" for v in st.get("touch", [])): fail("S22", f"touch-action on home is {st.get('touch')}")

        # search tab: one tap to the search page, in place, grid never shown, Back goes home
        print("tap search tab:", await ev(s, TAP_TAB % "/explore/"), flush=True); await asyncio.sleep(3)
        st = await ev(s, STATE)
        if st.get("url") != "/explore/search/": fail("S3", f"search tab landed on {st.get('url')}")
        if st.get("doc") != doc: fail("S3", "search tab reloaded the page")
        if not st.get("inputs"): fail("S3", "no search box on the search page")
        if st.get("tiles"): fail("S3", f"{st.get('tiles')} grid tiles visible on the search page")
        check_tabs("S19 search", *(await tabs(s)), profile)
        await ev(s, "history.back(); 'ok'"); await asyncio.sleep(3)
        st = await ev(s, STATE)
        if st.get("url") != "/": fail("S3", f"Back from the search page went to {st.get('url')}")

        # DM inbox bar: same centres, Messages current, last chat clear of the bar, each tab in place
        for tab, dest in (("/explore/", "/explore/search/"), ("/", "/"), (profile, profile)):
            print("tap messages:", await ev(s, TAP_TAB % "/direct/inbox/"), flush=True); await asyncio.sleep(4)
            t, meta = await tabs(s)
            if meta.get("url") != "/direct/inbox/": fail("S20", f"Messages tab landed on {meta.get('url')}"); break
            inbox = check_tabs("S20 inbox", t, meta, profile)
            if home and inbox:
                off = [round(a["cx"] - b["cx"], 1) for a, b in zip(inbox, home)]
                if any(abs(o) > 1 for o in off): fail("S20", f"inbox tab centres differ from home by {off} px")
                if abs(inbox[0]["top"] - home[0]["top"]) > 1: fail("S20", f"inbox tabs at y={inbox[0]['top']}, home at y={home[0]['top']}")
                cur = [x["href"] for x in inbox if x.get("current") == "page"]
                if cur != ["/direct/inbox/"]: fail("S20", f"inbox current tab is {cur}, expected Messages")
            if tab == "/explore/":
                c = await ev(s, INBOX_CLEAR)
                if c.get("err") or c.get("lastBottom") is None: fail("S20", f"inbox scroll check: {c}")
                elif c["lastBottom"] > c["barTop"] + 1: fail("S20", f"last chat ends at {c['lastBottom']}, under the bar at {c['barTop']}")
            print(f"tap {tab} on inbox:", await ev(s, TAP_TAB % tab), flush=True); await asyncio.sleep(4)
            st = await ev(s, STATE)
            if st.get("url") != dest: fail("S20", f"inbox {tab} tab went to {st.get('url')}, expected {dest}")
            if st.get("doc") != doc: fail("S20", f"inbox {tab} tab reloaded the page"); doc = st.get("doc")
            check_tabs(f"S20 after {tab}", *(await tabs(s)), profile)

        # a DM thread keeps no tab bar over the composer
        print("tap messages:", await ev(s, TAP_TAB % "/direct/inbox/"), flush=True); await asyncio.sleep(4)
        print("open thread:", await ev(s, OPEN_THREAD), flush=True); await asyncio.sleep(4)
        t, meta = await tabs(s)
        if not str(meta.get("url", "")).startswith("/direct/t/"): fail("S20", f"thread did not open, url {meta.get('url')}")
        elif t: fail("S20", f"DM thread shows tab links {[x['href'] for x in t]}")
        await ev(s, GO % "/")
    print(f"{len(fails)} failing" if fails else "DEVICE PASS")
    sys.exit(1 if fails else 0)

asyncio.run(main())

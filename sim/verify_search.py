#!/usr/bin/env python3
"""Drive the first Instagram Safari tab through the search tab the way a thumb would (nav link, search box,
typing, Enter), then a keyword results page and a hashtag page, reading what is visible at each step:
the search box, result links, and how many post/reel tiles are shown vs hidden (no injection of the script)."""
import asyncio
from _device import inspector, instagram_pages, session, ev, out

HOME = "https://www.instagram.com/"
KEYWORD = "https://www.instagram.com/explore/search/keyword/?q=cats"
TAG = "https://www.instagram.com/explore/tags/cats/"
SEARCH_STATE = r"""JSON.stringify((() => {
  const shown = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
  const tiles = [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')];
  return {
    url: location.href,
    version: document.documentElement.dataset.focusVersion || null,
    gridHidingOn: document.documentElement.hasAttribute('data-focus-explore'),
    searchTab: [...document.querySelectorAll('a[href="/explore/"]')].some(shown),
    inputs: [...document.querySelectorAll('input')].filter(shown).map((i) => i.placeholder || i.getAttribute('aria-label') || i.type),
    searchLinks: [...document.querySelectorAll('a[href^="/explore/search"]')].filter(shown).map((a) => a.getAttribute('href')),
    tiles: tiles.length, tilesShown: tiles.filter(shown).length,
    tileHrefs: tiles.slice(0, 3).map((a) => a.getAttribute('href')),
    otherLinks: [...document.querySelectorAll('main a[href], [role="dialog"] a[href]')].filter(shown)
      .map((a) => a.getAttribute('href')).filter((h) => !/\/(p|reel)\//.test(h)).slice(0, 8),
  };
})())"""
CLICK_SEARCH_TAB = """(() => { const a = [...document.querySelectorAll('a[href="/explore/"]')].find((e) => e.getClientRects().length); if (!a) return 'no search tab link'; a.click(); return 'clicked'; })()"""
FOCUS_BOX = """(() => {
  const i = [...document.querySelectorAll('input')].find((e) => e.getClientRects().length);
  const a = [...document.querySelectorAll('a[href^="/explore/search"]')].find((e) => e.getClientRects().length);
  const t = i || a; if (!t) return 'no search box';
  t.click(); if (i) i.focus(); return 'tapped ' + (i ? 'input' : 'link');
})()"""
TYPE = """(() => {
  const i = document.activeElement && document.activeElement.tagName === 'INPUT' ? document.activeElement
    : [...document.querySelectorAll('input')].find((e) => e.getClientRects().length);
  if (!i) return 'no input';
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'cats');
  i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed';
})()"""
ENTER = """(() => {
  const i = [...document.querySelectorAll('input')].find((e) => e.getClientRects().length); if (!i) return 'no input';
  for (const t of ['keydown', 'keypress', 'keyup']) i.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  return 'enter sent';
})()"""


async def main():
    async with inspector() as insp:
        pages = await instagram_pages(insp)
        if not pages: print("no Instagram tab open in Safari"); return
        s = await session(insp, pages[0])
        await s.navigate_to_url(HOME); await asyncio.sleep(6)
        out("tap search tab", await ev(s, CLICK_SEARCH_TAB)); await asyncio.sleep(5)
        out("search tab", await ev(s, SEARCH_STATE))
        out("tap search box", await ev(s, FOCUS_BOX)); await asyncio.sleep(3)
        out("search page", await ev(s, SEARCH_STATE))
        out("type", await ev(s, TYPE)); await asyncio.sleep(4)
        out("results", await ev(s, SEARCH_STATE))
        out("enter", await ev(s, ENTER)); await asyncio.sleep(5)
        out("after enter", await ev(s, SEARCH_STATE))
        await s.navigate_to_url(KEYWORD); await asyncio.sleep(8)
        out("keyword page", await ev(s, SEARCH_STATE))
        await s.navigate_to_url(TAG); await asyncio.sleep(8)
        out("hashtag page", await ev(s, SEARCH_STATE))
        await s.navigate_to_url(HOME)

asyncio.run(main())

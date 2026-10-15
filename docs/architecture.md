# Architecture

One userscript, `instagram-focus.user.js`, injected by the Userscripts Safari extension at document-start into
instagram.com (content world, no frames). Everything is a toggle in `CFG`. No build step, no dependencies.

## Sections of the script

1. **Routing.** Instagram is a single-page app. `route()` runs at start and on every URL change (from the
   mutation observer, so a page is routed before it paints, plus a 300 ms poll). It redirects the Reels feed,
   sends the search tab (`/explore/`) to the search page, sets the `data-focus-*` attributes the CSS keys on,
   and resyncs the lock, the tab bar and the `:hover` rewrite.
2. **Swipe lock.** Engaged by URL (`/reel/ID`, `/reels/ID`, `/user/reel/ID`) or by content (a near-fullscreen
   video in a scroll box: the DM reel overlay). Pins only reel scroll boxes; swallows one-finger swipes that start
   inside them (pinches and taps pass); with no finger down, only re-centring within a quarter of the box from where
   it was pinned is kept, so smooth or stepped scrolling can't walk to the next reel. The state is exposed as
   `data-focus-locked` on `<html>` for the test tools.
3. **CSS.** Hides links by href (Reels tab, app links), Explore tiles on the search pages, the `data-focus-hidden`
   tab slots, pads the inbox list, lifts the tab bar above the search results layer.
4. **Tab bar.** Hides the empty slot of a hidden tab so the row spaces evenly; draws the same bar on the DM inbox
   (Instagram's icon paths, colours learned per colour scheme in `localStorage.focusTabs`, only on phone-width
   layouts). The Profile tab follows the signed-in account shown on the inbox, over what was remembered. Tabs move
   in place: `history.pushState` + a synthetic `popstate`, which Instagram's router renders (verified on the phone),
   with a 2 s full-load fallback that a later move cancels.
5. **Content.** Exact-text labels (EN + FR) on nodes Instagram adds, including text that arrives later: ads (the
   label alone or with a separator, never a caption that merely starts with the word), the suggested-accounts
   carousel (home; decided only once a post exists, so the column can't go) and list (notifications, as a
   debounced pass), app prompts.
6. **One tap.** Safari takes a tap as a hover when its hover events or `:hover` reveal something. A finger's hover
   events (over/out/enter/leave/move) are stopped at window capture before React sees them when the hover lands on
   something that opens (link, button, `cursor: pointer`), so plain DM bubbles still show React / Reply / More; on
   `any-hover: none` every `:hover` selector in Instagram's sheets is rewritten to `:hover:not(*)`, checked again on
   every touch, page change and new stylesheet.

The script runs once per page even if installed twice, and has no debug code (removed in v20; v19 has the on-screen
event log if it is ever needed again).

## Decisions

- **Measure the phone, then model it.** Every structural assumption (tab row, inbox scroller, search layer z-index,
  hover reveals) was measured on the iPhone through Web Inspector (`sim/probe.py`, `sim/evaljs.py`) before the
  fixture (`sim/app.html`) copied it. The harness proves logic; `sim/device_check.py` proves the phone.
- **Hit-tests, not geometry.** "Tab is there" means `elementFromPoint` at its centre lands on it: rects and
  `checkVisibility` missed the search layer covering the bar.
- **In-place navigation over reloads**, with a fallback, because Instagram's router listens to popstate.
- **Never blank a page.** Hiding climbs only through wrappers that hold nothing else (one-link tab slots, the
  heading's own wrappers); anything larger is left alone.

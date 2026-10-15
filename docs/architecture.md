# Architecture

One userscript, `instagram-focus.user.js`, injected by the Userscripts Safari extension at document-start into
instagram.com (content world, no frames). Everything is a toggle in `CFG`. No build step, no dependencies.

## Sections of the script

1. **Routing.** Instagram is a single-page app. `route()` runs at start and on every URL change (from the
   mutation observer, so a page is routed before it paints, plus a 300 ms poll). It redirects the Reels feed,
   sends the search tab (`/explore/`) to the search page, sets the `data-focus-*` attributes the CSS keys on,
   and resyncs the lock, the tab bar and the `:hover` rewrite.
2. **Swipe lock.** Engaged by URL (`/reel/ID`, `/reels/ID`, `/user/reel/ID`) or by content (a near-fullscreen
   video in a scroll box: the DM reel overlay). Pins only reel scroll boxes; swallows vertical gestures that start
   inside them; taps untouched.
3. **CSS.** Hides links by href (Reels tab, app links), Explore tiles on the search pages, the `data-focus-hidden`
   tab slots, pads the inbox list, lifts the tab bar above the search results layer.
4. **Tab bar.** Hides the empty slot of a hidden tab so the row spaces evenly; draws the same bar on the DM inbox
   (Instagram's icon paths, colours learned per colour scheme in `localStorage.focusTabs`). Tabs move in place:
   `history.pushState` + a synthetic `popstate`, which Instagram's router renders (verified on the phone), with a
   2 s full-load fallback.
5. **Content.** Exact-text labels (EN + FR) on nodes Instagram adds: ads, the suggested-accounts carousel (home)
   and list (notifications, as a debounced pass), app prompts.
6. **One tap.** Safari takes a tap as a hover when its hover events or `:hover` reveal something. Finger hover
   events (over/out/enter/leave/move) are stopped at window capture before React sees them; on `any-hover: none`
   every `:hover` selector in Instagram's sheets is rewritten to `:hover:not(*)`.

## Decisions

- **Measure the phone, then model it.** Every structural assumption (tab row, inbox scroller, search layer z-index,
  hover reveals) was measured on the iPhone through Web Inspector (`sim/probe.py`, `sim/evaljs.py`) before the
  fixture (`sim/app.html`) copied it. The harness proves logic; `sim/device_check.py` proves the phone.
- **Hit-tests, not geometry.** "Tab is there" means `elementFromPoint` at its centre lands on it: rects and
  `checkVisibility` missed the search layer covering the bar.
- **In-place navigation over reloads**, with a fallback, because Instagram's router listens to popstate.
- **Never blank a page.** Hiding climbs only through wrappers that hold nothing else (one-link tab slots, the
  heading's own wrappers); anything larger is left alone.

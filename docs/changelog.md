# Changelog

## v18 (2026-10-15, not yet released)
- Notifications: the "Suggested for you" accounts block at the end (heading, accounts with Follow buttons, "See All Suggestions" to /explore/people/) is hidden under `hideSuggestedAccounts`; activity rows, including "Following" buttons, stay. Runs as a pass after Instagram stops adding to the page, because the heading renders before its list.
- Only the heading's own wrappers (holding nothing but its text) and the Follow/See-All blocks after it are hidden, so activity rows can never go with them, even if Instagram nests the heading inside the activity block. The pass runs at most 1 s after the first change (a page that keeps mutating cannot starve it), skips headings already hidden, and does nothing once you have left the page. "Follow Back" counts as a Follow button.
- A Profile tap on a cold inbox (profile not yet known) goes on to your profile only within 5 s, never later on an unrelated page.
- Harness S23: list arriving 400 ms after its heading, EN + FR, and the nested layout with "Following" rows.
- Second review gate (/code-review high, 8 findings): all fixed; the nested-layout bug had a failing scenario first.

## v17 (2026-10-15)
- Four tabs, evenly spaced: hiding the Reels link had left its empty slot in Instagram's space-evenly row (centres 87/128/87 px apart); the whole slot is hidden now, and with `hideSearch` the Search slot too (3 tabs, also even). Only one-link slots are hidden, so a Reels link in page content never takes its column with it.
- The DM inbox keeps the tab bar (`inboxTabBar`): the same tabs at the same place, Instagram's own icons, its colours learned per colour scheme, your profile picture, Messages marked current; tabs switch pages in place (no reload, 2 s full-load fallback); the inbox list is padded clear of the bar; DM threads keep no bar.
- One tap to search: the Search tab lands on the search page with its box (the blank Explore page is skipped); Cancel there steps back instead of stacking a history entry.
- On the search pages Instagram's results layer (z-index 11) covered its own tab bar (2), so a tap on Home opened a recent search; the bar is lifted above it there only.
- `touch-action: manipulation` everywhere: no double-tap zoom.
- Harness: fixture models the real tab bar, inbox, search layer and a router that renders on popstate; S0 sentinel, S3/S3b, S19-S22, S20b; `sim/device_check.py` runs the same checks on the phone (DEVICE PASS).

## v16 (2026-10-15)
- Search is back: the search tab, its results, keyword results, hashtag and place pages all open. Only the recommended grid under the search box is hidden (`hideExplore`), already when Instagram first draws it (page changes are now also picked up by the mutation observer, not only the 300 ms poll); `hideSearch` restores the v15 behaviour (whole tab gone).
- A reel opened from search is locked to that one reel like any other; `/username/reel/ID` links (Instagram's newer grid form) get the lock too.
- Harness: S3 rewritten (search tab stays, grid hidden from the first frame, every tile form untappable), S16 (search flow end to end, reel from results locked), S17 (`/username/reel/ID`), S18 (`hideSearch` still gives v15); scenarios can flip CFG lines; hidden-by-visibility now counts as hidden. S4's touch swipe started on the comments sheet, so it never exercised the lock (only the wheel check did); it now swipes on the reel.

## v0.2 (2026-10-15)
- Home feed by default; `followingFeed` is a toggle.
- Recommended ("Suggested for you") posts are kept; only the suggested-accounts carousel and ads are hidden.
- Reels shared in DMs open as an overlay without a URL change: the swipe lock now also engages when a near-fullscreen video appears inside a scroll box (triggered by the video appearing, not by a timer) and releases when it leaves.
- A reel that opens paused (Safari refused Instagram's late autoplay) is started, the on-screen one only.
- The lock pins only reel scroll boxes, never the page, so captions and comments below a reel scroll; gestures starting in another scrollable area (comments sheet) are left alone.
- A stray "Sponsored"/"Suggested" word outside a post hides nothing; an app-prompt button in the header hides the button, not the header.
- Ads: second detector on the ad's call-to-action button (EN + FR).
- Label scan is incremental (only nodes Instagram adds) and leaf-only; posts are hidden the instant they are inserted.
- Optional `DEBUG` status strip and in-page event log for bug hunting (off).
- Harness: 13 scenarios including the DM overlay; real visibility checks; guarded fixture server; shared device helper.

## v0.1 (2026-10-14)
- First version verified live on the iPhone: Reels tab and feed, Explore, ads, suggested posts and app prompts hidden; Following feed; swipe lock on reel pages; Smart App Banner tag removed synchronously.
- Known at the time: comments under a sent reel could not scroll (fixed in v0.2).

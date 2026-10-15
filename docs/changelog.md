# Changelog

## v16 (2026-10-15, not yet released)
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

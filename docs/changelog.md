# Changelog

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

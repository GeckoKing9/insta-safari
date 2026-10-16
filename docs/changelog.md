# Changelog

## v21 (2026-10-15, not yet released)
- Calls (`calls`): Audio and Video call buttons in a DM conversation's header, opening Instagram's call page for that conversation in a new tab, like its desktop buttons. On the call page only, Instagram's code is told it runs in Mac Safari before any of its scripts (its gate allows desktop Safari 16+; iPhone Safari reads as Mobile Safari, so "Start call" could not reach anyone). The page's script policy is nonce-only, so the override borrows the nonce of Instagram's first script. Measured on the phone: no call buttons on mobile web, the gate closed in the call tab, the conversation id equal to the call's `ig_thread_id`.
- Incoming calls still ring only in the app (that gate would need the whole site told it is a desktop, which brings back the desktop layout).
- Harness S30 (buttons and the URL they open), S31 (the call page's first script sees Mac Safari under a nonce-only policy; other pages keep the real user agent).

## v20 = release v0.3 (2026-10-15)
Checked on the phone: harness ALL PASS, DEVICE PASS, and in a real DM a text message shows React / More on a finger tap while a shared post shows nothing (opens on the first tap).
Fixes from the final review of the whole repo (69 findings; every behaviour fix has a harness scenario that failed first):
- One tap keeps DM actions reachable: a finger's hover is blocked only when it lands on something that opens (link, button, `cursor: pointer`), so tapping a plain message bubble still shows React / Reply / More, while a shared post still opens on the first tap.
- A friend's caption that starts with "Sponsored..." is no longer taken for an ad: the label must be the word alone or followed by a separator. Ad labels whose text arrives after the element are now seen. "Learn more" links to Instagram's or Meta's own help pages are not ad links.
- App Store links people send stay visible; only links to the Instagram app itself are hidden.
- The reel lock can't be walked past by smooth or stepped scrolling; pinches and taps pass; two fingers landing together don't bypass it; an overlay that opens slowly is caught (third check at 1.2 s).
- Home can't go blank: a suggested-accounts unit that arrives before any post is decided once a post exists.
- Inbox tab bar: Profile follows the signed-in account (Instagram's icon `<title>` had made the name lookup fail), Back after a cold Profile tap skips Home, it is drawn only on phone-width layouts, redrawn on a light/dark switch, and remembers nothing when `inboxTabBar` is off.
- `hideSearch` no longer catches profiles like `/explorecanada/`; `/explore/people/` (the full suggested-accounts page) goes home under `hideSuggestedAccounts`. The search pages get room below the lifted tab bar.
- Notifications: suggestion blocks added after the first pass are hidden too.
- Installed twice, the script runs once. Debug code removed. `@version` added (kept equal to `SITE_VERSION`, checked by the harness) for updates.
- Since v15 (v0.2) the ad call-to-action check needs the label inside a link that leaves Instagram, not any button; earlier notes said "button".
- Harness: S25-S29 (App Store links, `/explore/people/`, late Home feed, two copies, iPad width), S4c (stepped scroll), S1/S23/S24/S12 strengthened, S9 with the Following feed on; a crash still prints the failures already found. Phone tools: version-exact PASS, the script's own lock flag, all tile forms, the padded inbox box, readable errors; `readlog.py` removed with the debug code.

## v19 (2026-10-15)
- One tap opens a post shared in a DM (`oneTap`). For Safari a tap is first a hover: it sends hover events and puts `:hover` on what the finger touched, and if that makes something appear it clicks only on the second tap. Instagram's web app reveals desktop hover extras both ways (measured on the phone: a DM message row shows React / Reply / More from a mouseover handler and from `:hover` rules, opacity 0 to 1).
  - Hover events from a finger or pen (over, enter, move, and out/leave too) no longer reach Instagram's handlers. Out/leave matter: React dispatches onMouseEnter from the previous element's mouseout, and iOS keeps the last tapped element hovered, so every tap after the first still revealed (confirmed on the phone with a control run). A real mouse (iPad pointer) still hovers.
  - On a device where nothing can hover (`any-hover: none`), every `:hover` in Instagram's stylesheets is rewritten never to match (278 of ~19k rules, ~20 ms once): the page behaves as if nothing were ever hovered, `:not(:hover)` and `:has(:hover)` included. Sheets are rescanned when their rule count changes, on every page change and when a stylesheet arrives.
  - Same fix for username hover cards and icon tooltips.
- Harness S24: a tap must not run the page's hover handler, a `:hover` rule must not reveal anything on a phone, the tap still opens the post, a mouse still hovers. Third review gate (8 findings): the CSS one confirmed on the phone and fixed. Fourth (10 findings): React's out-driven enter confirmed on the phone and fixed (S24 now taps another element first); rescans, batch-level calls and a DEBUG log for unreadable sheets added; `:not(:hover)` rewriting kept on purpose (it models "never hovered"); iPad with a pointer keeps CSS hover on purpose.

## v18 (2026-10-15)
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

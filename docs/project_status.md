# Project status

**2026-11-09: v0.4.2 (= v25) released.** Calls to 1:1 chats work again: the call buttons opened Instagram's call
page on "Page not found" for a friend's 1:1 chat because they passed the URL's thread key; they now pass Instagram's
IG thread id, read from its React tree at the tap. Checked on the iPhone: the installed copy is byte-for-byte v25;
DEVICE PASS; the call button's lookup reports `igid` from the real script world; the call page for that id shows
"Ready to call?" with Start call tappable, for the 1:1 chat and for a group. The owner then called the friend from the
phone on v25: working.

How calls work: the conversation header gets Audio / Video call buttons, which open the call page with the IG
thread id; the call page is told it runs in Mac Safari and Instagram's outbound call gate is opened (it is computed
before the script can act); its desktop layout is fitted to the phone. Incoming calls still ring only in the app.

Getting the script onto the phone: never the USB file push; it hung and emptied the installed file on 2026-10-15
and again on 2026-11-09 with a healthy link. Install from the raw GitHub URL (commit-pinned while testing) with
Userscripts' Install button.

Known limits (see the brief): English and French labels only; iPad, desktop and landscape not targeted; the in-call
controls (mute, camera, end) were hidden whenever the monitor sampled them, likely Instagram auto-hiding them until
the screen is touched (the test call ended cleanly); the pre-v0.3 git history
has a DM thread id and a few rule-breaking commits that would need a force-push to clean.

<!-- session-end:auto -->
**Last session (2026-11-09, coding):** Fixed 1:1 DM calls: the call page now gets Instagram's thread id from the route object (v0.4.2 = v25). Harness and device tests pass, and the owner confirmed calls work. Added a data-focus-call-id probe.
**Next:** none
<!-- /session-end:auto -->

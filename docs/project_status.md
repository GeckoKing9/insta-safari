# Project status

**2026-10-16: v0.4.1 (= v22) released, MIT licensed.** Checked on the iPhone: the copy Userscripts injects is
byte-for-byte v22; DEVICE PASS; the call buttons are in a conversation's header; the call screen opens with the gate
patched and Start call plus its four preview controls tappable (no call placed). The real audio and video calls were
made on v0.4; v22 changed when the call screen is fitted and how pages are routed, not the call itself.

How calls work: the conversation header gets Audio / Video call buttons; the call page is told it runs in Mac
Safari and Instagram's outbound call gate is opened (it is computed before the script can act); its desktop layout
is fitted to the phone. Incoming calls still ring only in the app.

Getting the script onto the phone: the USB file push can hang and wipe the installed file (it did on 2026-10-15).
Install from the raw GitHub URL with Userscripts' Install button instead; see the project memory.

Known limits (see the brief): English and French labels only; iPad, desktop and landscape not targeted; the in-call
controls (mute, camera, end) were hidden whenever the monitor sampled them, likely Instagram auto-hiding them until
the screen is touched (the test call ended cleanly); the pre-v0.3 git history
has a DM thread id and a few rule-breaking commits that would need a force-push to clean.

<!-- session-end:auto -->
**Last session (2026-10-16, coding):** Restored Instagram search tab, fixed tab bar and double taps, enabled mobile calls and video calls in Safari, and shipped v0.4.1 under the MIT license. The phone runs a byte-identical build.
**Next:** none
<!-- /session-end:auto -->

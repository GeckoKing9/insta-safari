# Project status

**2026-10-15: v0.4 (= v21) released, with calls.** Checked on the iPhone: real audio and video calls from a DM
conversation in Safari (normal mobile view), plus everything from v0.3.

How calls work: the conversation header gets Audio / Video call buttons; the call page is told it runs in Mac
Safari and Instagram's outbound call gate is opened (it is computed before the script can act); its desktop layout
is fitted to the phone. Incoming calls still ring only in the app.

The code-review fixes made after that test (see the changelog) are checked in the harness, not yet on the phone:
reinstall from the master raw URL and open a call screen to confirm (gate `patched`, Start call on screen).

Getting the script onto the phone: the USB file push can hang and wipe the installed file (it did on 2026-10-15).
Install from the raw GitHub URL with Userscripts' Install button instead; see the project memory.

Known limits (see the brief): English and French labels only; iPad, desktop and landscape not targeted; the in-call
controls (mute, camera, end) were hidden whenever the monitor sampled them, likely Instagram auto-hiding them until
the screen is touched (the test call ended cleanly); the pre-v0.3 git history
has a DM thread id and a few rule-breaking commits that would need a force-push to clean.

Not decided: a license (none yet, so the code is visible but not reusable).

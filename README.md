# ios-mods: Instagram Focus

A Safari userscript that makes instagram.com usable on an iPhone without the attention traps: no Reels feed or tab, no Explore, no ads or suggested posts, no "open the app" prompts, the Following feed by default, and a reel someone sends you opens but cannot be swiped into the next one. Runs in Safari through the free, open-source **Userscripts** app. Nothing is installed outside the App Store; the login never leaves Safari and Meta.

## Files

| Path | What |
|---|---|
| `instagram-focus.user.js` | the script; every behaviour is a toggle in `CFG` at the top |
| `releases/instagram-focus-v0.1.user.js` | the first version verified live on the phone (also git tag `v0.1`) |
| `sim/check.js`, `sim/app.html`, `sim/server.py` | headless-Chromium harness: 12 real-use scenarios against a model of Instagram's mobile site (`node sim/check.js`, ~30 s) |
| `sim/device-attach.sh` | hands the iPhone from Windows to WSL (usbipd-win) and starts the device daemon cleanly |
| `sim/pages.py` | on-device checker: is the script active in a real Safari tab (not a Home Screen web app)? |
| `sim/_device.py` | shared connect / tab-pick / evaluate helpers for the on-device scripts |
| `sim/reload_all.py` | reloads every open Instagram tab so it picks up a freshly pushed script |
| `sim/verify_lock.py` | drives a tab through feed, reel page, wheel and in-page navigation, reading the installed script's state |

## Workflow

1. Edit `instagram-focus.user.js`; bump `SITE_VERSION` (readable on the device as `document.documentElement.dataset.focusVersion`).
2. `node sim/check.js` must print `ALL PASS`.
3. Phone plugged in, unlocked, Safari in front: `sim/device-attach.sh`, then
   `USBMUXD_SOCKET_ADDRESS=/var/run/usbmuxd .venv/bin/pymobiledevice3 apps push --documents com.userscripts.macos instagram-focus.user.js /Documents/instagram-focus.user.js`
4. `USBMUXD_SOCKET_ADDRESS=/var/run/usbmuxd .venv/bin/python sim/pages.py` → `PASS` once a fresh Safari tab reports the new version.
5. Commit; tag releases.

Rollback: `git checkout v0.1 -- instagram-focus.user.js`, then step 3.

`v0.1` is the snapshot the user approved on the phone, not a green build: its checker fails scenario 12 (comments on a reel), fixed in v0.2.

## Things learned on the device (iOS 26.6.1)

- A Home Screen icon opens as a standalone web app by default on iOS 26; Safari extensions never run there. Add the icon with "Open as Web App" off, or, with another default browser, use a Shortcut that opens `x-safari-https://www.instagram.com/?variant=following`.
- Userscripts shows "version null" until its per-site prompt is accepted in the tab; a hand injection working while the extension is silent means permission, not code.
- `/reel/ID` is a standalone single-video page; `/reels/ID` is the endless feed scroller. Both get the lock.
- Never start `usbmuxd` by hand: Ubuntu's socket-activated one (systemd/udev) grabs the phone on its own, and two daemons fighting for the interface (`LIBUSB_ERROR_BUSY`) was what made the USB link die after a session or two all afternoon. `sim/device-attach.sh` only does the usbipd hand-off now.
- Page-level probes (Web Inspector `Runtime.evaluate`) stall while the phone is locked; file transfers (AFC) still work locked. Keep the screen on during probes.
- `?variant=following` is honoured; the nav links are exactly `/reels/`, `/explore/`, `/direct/inbox/`.
- No ad has appeared in the Following feed during any probe, so the ad label text is unverified; the script matches Sponsored / Sponsorisé / Commandité / Publicité and ad call-to-action buttons.

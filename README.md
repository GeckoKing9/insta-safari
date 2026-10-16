# insta-safari: Instagram Focus

A Safari userscript that makes instagram.com usable on an iPhone without the attention traps. It runs in Safari through the free, open-source **Userscripts** app. Nothing else gets installed, and your login never leaves Safari and Meta.

What it does, out of the box:

- No Reels tab and no endless Reels feed. A reel someone sends you still opens (as a page or as the DM overlay), starts playing if Safari left it paused, and can't be swiped into the next one. Same for a reel you open from search.
- Search stays, the Explore grid goes. The Search tab lands straight on the search box (one tap to the keyboard); results, hashtags and places all work.
- No ads, no "Suggested for you" accounts (the home carousel and the list at the bottom of notifications), no "open the app" prompts.
- Four evenly spaced tabs at the bottom (Home, Search, Messages, Profile), and they stay on the DM inbox, where Instagram shows none.
- One tap opens things. Safari treats a tap as a hover first, and Instagram's hover extras made some taps (a post shared in a DM) need a second one.
- Audio and video calls from a DM conversation. Instagram's web calling is desktop-only, though iPhone Safari runs it fine; the script adds the two call buttons to the conversation header, lets the call page start, and fits Instagram's desktop call screen to the phone. Tested with a real audio call and a real video call. Calls go out; incoming calls still ring in the app only. Keep "Request Desktop Website" off, it isn't needed.

Recommended posts in the feed are kept (the feed is mostly those once you're caught up). Every behaviour is a line in `CFG` at the top of the script, except two small layout fixes that are always on: no double-tap zoom, and the tab bar sitting above the search results.

**Limits.** Ads, suggestions and app prompts are found by their visible label, in English and French only. With Instagram in another language those stay; everything else works. Built and tested for iPhone Safari in portrait; on an iPad or a computer it mostly works, but the tab-bar parts are phone-only.

## Install on your iPhone (5 minutes)

1. Install **Userscripts** from the App Store. Open it once and pick a folder for your scripts (for example *On My iPhone › Userscripts*).
2. Turn the extension on: *Settings › Apps › Safari › Extensions › Userscripts*, on, and allow it on `instagram.com` (or All Websites).
3. In Safari, open <https://raw.githubusercontent.com/GeckoKing9/insta-safari/master/instagram-focus.user.js>. Tap the extensions icon in the address bar (the puzzle piece, or **ᴀA**), then **Userscripts**, then **Install**.
4. **Type** `instagram.com` into Safari's address bar and log in. (Tapping an instagram.com link opens the Instagram app instead, where extensions never run.) If Userscripts asks for permission on the site, choose *Always Allow*. The Reels tab is gone and four evenly spaced tabs remain: it works.
5. Optional Home Screen icon: *Share › Add to Home Screen* with **Open as Web App turned off**. A web app opens outside Safari, and extensions don't run there.

**Updating.** In Safari's extensions menu, *Userscripts › Check for updates*, or repeat step 3. `master` only gets versions that were checked on a phone first.

**Changing a setting.** The iPhone Userscripts app has no editor, so open the script file from step 1 in a text editor app (from Files), flip the line in `CFG`, and save. An update replaces the file, so note your changes and redo them after updating.

**Copying the file in yourself** instead of step 3 works too, but open the Userscripts menu in Safari once afterwards: it only picks up new files then.

**Uninstall.** Delete the script in the Userscripts app.

**Privacy.** The script only rearranges and hides parts of the page in your own Safari. It sends nothing anywhere and has no analytics. It keeps three things in Instagram's own storage on your phone, to draw the tab bar on the DM inbox: your profile link, your profile-picture address and the tab-bar colours.

## Files

| Path | What |
|---|---|
| `instagram-focus.user.js` | the script; settings in `CFG` at the top |
| `releases/` | tagged releases: `v0.1` first live version, `v0.2` after the first review, `v0.3` search back, four even tabs everywhere, one tap per action |
| `sim/check.js`, `sim/app.html`, `sim/call.html`, `sim/server.py` | headless-Chromium test harness: scenarios S0 to S31 against a model of Instagram's mobile site (tab bar, inbox, search page, DM messages, the call page under its nonce-only script policy), built from measurements on a real phone (`node sim/check.js`, about a minute) |
| `sim/device_check.py`, `sim/checkall.sh` | the tab-bar, inbox and search checks on a real iPhone; `checkall.sh` runs the harness and the phone and exits 0 only when both pass |
| `sim/probe.py`, `sim/evaljs.py` | a real screenshot of the phone's tab (Web Inspector `Page.snapshotRect`) with the tab-bar layout; run a JS file in the tab |
| `sim/device-attach.sh` | hands the iPhone from Windows to WSL (usbipd-win) |
| `sim/pages.py` | is the repo's version running in a real Safari tab (not a Home Screen web app)? |
| `sim/_device.py` | shared connect / tab-pick / evaluate helpers for the phone scripts |
| `sim/reload_all.py` | reloads every open Instagram tab so it picks up a freshly pushed script |
| `sim/verify_search.py`, `sim/verify_lock.py` | walk a tab through search, or through feed, reel page and in-page navigation, and print what the script did |
| `sim/jank.py` | scroll smoothness on the phone, with and without the script |
| `sim/icon.js` | renders a Home Screen icon PNG locally (not kept in the repo) |
| `docs/` | brief, architecture, status, changelog |
| `loop/` | the research table of other ways to tame Instagram and YouTube on iOS that led to this project |

## Workflow

1. Work on a branch. Edit `instagram-focus.user.js` and bump both `@version` in the header and `SITE_VERSION` (the harness fails if they differ; Userscripts only offers an update when `@version` grows).
2. `node sim/check.js` prints `ALL PASS`.
3. Phone plugged in, unlocked, Safari in front: `sim/device-attach.sh`, then
   `USBMUXD_SOCKET_ADDRESS=/var/run/usbmuxd .venv/bin/pymobiledevice3 apps push --documents com.userscripts.macos instagram-focus.user.js /Documents/instagram-focus.user.js`
4. `sim/checkall.sh` exits 0 (harness and phone).
5. Merge to `master`, tag, copy the script into `releases/`.

Rollback: `git checkout v0.2 -- instagram-focus.user.js`, then step 3.

## Things learned on the device (iOS 26.6.1)

- A Home Screen icon opens as a standalone web app by default on iOS 26, and Safari extensions never run there. Add the icon with "Open as Web App" off, or, with another default browser, use a Shortcut that opens `x-safari-https://www.instagram.com/`.
- Userscripts shows "version null" until its per-site prompt is accepted in the tab. A hand injection working while the extension stays silent means permission, not code.
- `/reel/ID` is a standalone single-video page; `/reels/ID` is the endless feed scroller. Both get the lock. Search results and profile grids open videos as single pages (`/p/ID`, `/user/reel/ID`).
- Instagram's router renders a route on a `popstate` event, so the script can switch tabs without a reload.
- Web calls are gated in Instagram's code: on only for a desktop browser on its list (Chrome, Edge, Firefox, Safari 16+). iPhone Safari reads as "Mobile Safari", so mobile web shows no call buttons and its call page can't start a call. "Request Desktop Website" opens the gate for that tab, but the call opens in a new tab without it. The script tells the call page alone that it runs in Mac Safari; the page only allows scripts carrying its nonce, so that override borrows the nonce of Instagram's first script.
- On the search page Instagram's results list sits in a layer above its own tab bar, and DM message rows reveal React / Reply / More on hover, through both a hover handler and `:hover` CSS. Both cost taps on a phone.
- Never start `usbmuxd` by hand: Ubuntu's socket-activated one grabs the phone by itself, and two daemons fighting over the interface (`LIBUSB_ERROR_BUSY`) kill the USB link.
- Web Inspector probes stall while the phone is locked; file transfers still work. A probe that hangs the page can drop the USB link; re-attach after any timeout.
- No ad has shown up in the Following feed during any probe, so the ad label text is matched from what Instagram is known to use (Sponsored, Sponsorisé, Commandité, Publicité) plus ad links that leave Instagram.

## License

MIT, see [LICENSE](LICENSE). Not affiliated with Instagram or Meta.

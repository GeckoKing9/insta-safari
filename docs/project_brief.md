# Brief

**Goal.** Instagram on an iPhone without the parts built to keep you scrolling: no Reels feed, no Explore grid, no ads,
no suggested accounts, no prompts to open the app. Messages, search, your feed and the people you follow stay, and
everything needs one tap.

**How.** One userscript, run by the Userscripts Safari extension on instagram.com. No server, no account, no data leaves
the phone.

**Done means.** Verified on a real iPhone in Safari (`sim/device_check.py` passes and the changes were tried by hand),
not only in the test harness.

**In scope.** iPhone, Safari, portrait, Instagram in English or French.

**Not in scope.** iPad and desktop layouts (side navigation), landscape, the Instagram app itself, other languages for
the label-based hiding, accounts other than your own, anything that changes what Instagram's servers see.

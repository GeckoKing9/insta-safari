# Project status

**2026-10-15: v19 on the iPhone, master pushed, not tagged.** Last tagged release: v0.2 (= v15).

Working on the phone (DEVICE PASS + screenshots): four evenly spaced tabs everywhere incl. the DM inbox, one-tap
search tab, search results and reels from them single-reel, DM reel overlay locked and autoplaying, notifications
without suggested accounts, cold loads of inbox and Explore.

Waiting on the user's thumb: the one-tap fix for posts shared in DMs (v19). Synthetic events and the real React
app confirm the mechanism; only a real finger proves it.

Next: user verdict on v19; if clean, tag v0.3 (copy to `releases/`), strip the DEBUG code, write a friends'
install guide in the README.

Known limits: light mode and on-device timing not measured on the phone (harness only); an iPad with a pointer keeps
CSS `:hover` on purpose.

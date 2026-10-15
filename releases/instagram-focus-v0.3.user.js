// ==UserScript==
// @name         Instagram Focus
// @namespace    https://github.com/GeckoKing9/insta-safari
// @version      20
// @description  Instagram web without the Reels feed, the Explore grid (search stays), ads, suggested accounts or "open the app" prompts; four even tabs, one tap per action. Toggles below.
// @homepageURL  https://github.com/GeckoKing9/insta-safari
// @updateURL    https://raw.githubusercontent.com/GeckoKing9/insta-safari/master/instagram-focus.user.js
// @downloadURL  https://raw.githubusercontent.com/GeckoKing9/insta-safari/master/instagram-focus.user.js
// @match        https://www.instagram.com/*
// @run-at       document-start
// @inject-into  content
// @noframes
// ==/UserScript==
(() => {
  // installed twice (e.g. once from the Install button, once copied into the folder): only the first copy runs
  if (window.__instagramFocus || document.documentElement?.dataset.focusVersion) return;
  window.__instagramFocus = true;
  const CFG = {
    hideReelsFeed: true,        // the Reels tab and the endless /reels/ feed (with false, also set singleReelOnly false to scroll it)
    singleReelOnly: true,       // a reel someone sends you still opens, but swiping to the next one is blocked
    autoPlayReels: true,        // a reel that opens paused (Safari blocked Instagram's autoplay) is started for you
    hideExplore: true,          // the recommended grid on the search tab; search itself (box, results, hashtag and place pages) stays
    hideSearch: false,          // the whole search tab and every /explore/ page (the v15 behaviour)
    hideSponsored: true,        // ads in the feed
    hidePaidPartnership: false, // creators' "Paid partnership" posts (not Instagram ads)
    hideSuggestedAccounts: true, // the "Suggested for you" accounts: the carousel in the home feed, the list under notifications
    hideSuggestedPosts: false,  // recommended posts in the home feed (the feed is mostly these once you're caught up)
    followingFeed: false,       // open the Following feed instead of Home
    hideAppPrompts: true,       // "Open in app" banners, links to the Instagram app, Safari's Smart App Banner
    inboxTabBar: true,          // the four tabs stay at the bottom of the DM inbox (Instagram shows none there)
    oneTap: true,               // a tap on something you can open is never taken as a hover first (a post shared in a DM needed two taps)
  };
  const WORDS = {
    sponsored: ['Sponsored', 'Sponsorisé', 'Commandité', 'Publicité'],
    // an ad's own call-to-action button, in case the label text differs from the list above
    cta: ['Shop now', 'Learn more', 'Install now', 'Sign up', 'Book now', 'Get offer', 'Download', 'Order now',
          'Acheter', 'En savoir plus', 'Installer', 'S’inscrire', "S'inscrire", 'Réserver', 'Télécharger', 'Commander'],
    partnership: ['Paid partnership', 'Partenariat rémunéré'],
    follow: ['Follow', 'Follow Back', 'Suivre', 'Suivre en retour'],
    suggested: ['Suggested for you', 'Suggestions pour vous', 'Suggested posts', 'Publications suggérées', 'Suggested reels', 'Reels suggérés'],
    app: ['Open app', 'Use app', 'Use the app', 'Open Instagram', 'Get app', 'Get the app', 'Switch to the app',
          'Ouvrir l’application', "Ouvrir l'application", 'Utiliser l’application', "Utiliser l'application",
          'Télécharger l’application', "Télécharger l'application", 'Obtenir l’application'],
  };
  const SITE_VERSION = '20'; // keep equal to @version above: Userscripts offers an update only when @version grows

  // At document-start the <html> element may not exist yet; wait for it instead of crashing
  const onRoot = (fn) => document.documentElement ? fn()
    : new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); fn(); } }).observe(document, { childList: true });

  // 1. Routing: Instagram is a single-page app, so this runs at start and on every URL change
  const isReelsFeed = (p) => /^\/reels\/?$/.test(p);
  // /reel/ID, /reels/ID and /username/reel/ID (newer grid links); /reels/audio/… is a sound page, not a reel
  const isReelPage = (p) => /^\/(?:[^/]+\/)?reels?\/(?!audio\/)[^/]+/.test(p);
  // The Following-feed switch runs on the initial load only: Instagram may rewrite the URL afterwards
  // (dropping the query), and re-applying it from the watcher would reload the page forever.
  let lastPath = null;
  const route = (firstLoad = false) => {
    const p = location.pathname, from = lastPath;
    lastPath = p;
    if (CFG.hideReelsFeed && isReelsFeed(p)) { location.replace('/'); return; }
    if (CFG.hideSearch && (p === '/explore' || p.startsWith('/explore/'))) { location.replace('/'); return; } // not /explorecanada/
    // the full "Suggested for you" accounts page (its entry points are hidden; a typed URL or history still gets there)
    if (CFG.hideSuggestedAccounts && /^\/explore\/people(\/|$)/.test(p)) { spaGo('/', () => true, true); return; }
    // The search tab (/explore/) is a search box over the recommended grid. With the grid hidden it is a blank
    // page whose box only opens the real search page, so the tab goes straight there: one tap to the keyboard.
    // The CSS keeps tiles hidden on both paths, for the moment before the search page replaces Explore.
    document.documentElement?.toggleAttribute('data-focus-explore', CFG.hideExplore && /^\/explore\/(search\/)?$/.test(p));
    document.documentElement?.toggleAttribute('data-focus-search', p.startsWith('/explore/search'));
    if (CFG.hideExplore && /^\/explore\/?$/.test(p)) {
      // Cancel on the search page pushes /explore/: step back to that search page instead of stacking a copy of it
      if (from === '/explore/search/') history.back();
      else spaGo('/explore/search/', () => [...document.querySelectorAll(TILES)].filter((t) => t.getClientRects().length).length < 6, true);
      return;
    }
    if (firstLoad && CFG.followingFeed && p === '/' && !location.search.includes('variant=')) { location.replace('/?variant=following'); return; }
    recheckLock();
    syncTabs();
    unhoverSheets(); // a new page may have brought rules (cheap: unchanged sheets are skipped)
  };
  let last = location.href;
  const routeIfMoved = () => { if (location.href !== last) { last = location.href; route(); } };
  setInterval(routeIfMoved, 300); // also run from the mutation observer, so a new page is routed before it paints

  // 2. Swipe lock, engaged by URL (/reel/ID and /reels/ID) or by content: a reel opened from a DM is an
  // overlay on top of the DM page, the URL does not change, so a near-fullscreen video sitting in a
  // scroll box also engages it. That check runs only when a video is added or removed, never on a timer.
  // The reel feed is a scroll box (a div that scrolls, holding one reel after another); a reel opened on
  // its own (/reel/ID) is a plain page whose caption and comments sit below the video. So the lock pins
  // only reel scroll boxes, found by walking up from each video (a dozen nodes, never a page-wide
  // measurement), and never the page itself. A vertical gesture is swallowed only when it starts inside
  // a pinned box and not inside some other scrollable area in it (a comments sheet); any scroll the box
  // still performs is undone. Taps are untouched. No layout is changed, so the player is never
  // re-created by the lock.
  const stop = (e) => { e.stopImmediatePropagation(); e.preventDefault(); };
  let locked = false, startY = null, blocking = false, pinTimer = null;
  const pinned = new Map(); // reel scroll box -> { anchor: where it was pinned, top: the position held now }
  const isScrollBox = (el) => el !== document.body && el !== document.documentElement && el.clientHeight >= 300
    && el.scrollHeight >= el.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(el).overflowY);
  const reelBoxOf = (video) => {
    for (let el = video.parentElement, i = 0; el && i < 25; el = el.parentElement, i++) if (isScrollBox(el)) return el;
    return null;
  };
  const isFullscreenVideo = (v) => { const r = v.getBoundingClientRect(); return r.height >= innerHeight * 0.85 && r.width >= innerWidth * 0.6; };
  const overlayReel = () => [...document.querySelectorAll('video')].some((v) => isFullscreenVideo(v) && reelBoxOf(v) !== null);
  let recheckTimer = null;
  const recheckLock = () => {
    clearTimeout(recheckTimer);
    const apply = () => {
      lockSwipe(CFG.singleReelOnly && (isReelPage(location.pathname) || (document.querySelector('video') !== null && overlayReel())));
      if (locked) pin(); // a box that appeared while already locked is pinned now, not at the next tick
    };
    apply(); // and again after the overlay has laid out, and once more for a slow opening animation
    recheckTimer = setTimeout(() => { apply(); recheckTimer = setTimeout(apply, 800); }, 400);
  };
  // A reel that opens paused: Instagram calls play() after the data arrives, outside the tap that opened
  // it, and Safari refuses. Starting it ourselves from the same moment works for a muted video.
  // Only the reel on screen: the overlay preloads the next reels below it, equally fullscreen-sized, and
  // starting those too makes them audible once the sound is turned on.
  const onScreen = (v) => { const r = v.getBoundingClientRect(); return r.top < innerHeight / 2 && r.bottom > innerHeight / 2; };
  const nudgePlay = (v) => {
    if (!CFG.autoPlayReels) return;
    const tryPlay = () => { if (v.isConnected && v.paused && v.muted && isFullscreenVideo(v) && onScreen(v)) { v.play().catch(() => { /* refused (Low Power Mode, or not ready): Instagram's own play button still works */ }); } };
    v.addEventListener('loadeddata', tryPlay, { once: true });
    setTimeout(tryPlay, 300); setTimeout(tryPlay, 1200);
  };
  let verdicts = new WeakMap(); // target -> shouldBlock verdict, so wheel bursts don't re-walk the ancestors
  const shouldBlock = (target) => {
    if (!(target instanceof Element)) return false;
    if (verdicts.has(target)) return verdicts.get(target);
    let verdict = false; // not inside a reel box at all
    for (let n = target; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (pinned.has(n)) { verdict = true; break; } // reached the pinned reel box without crossing another scroller
      const s = getComputedStyle(n);
      if (/auto|scroll/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 10) break; // e.g. the comments sheet
    }
    verdicts.set(target, verdict);
    return verdict;
  };
  const onStart = (e) => {
    if (e.touches.length !== e.changedTouches.length) return; // a finger joining a gesture under way does not restart it
    pin(); // the box the finger is on may have appeared since the last tick
    verdicts = new WeakMap(); // a caption may have become scrollable (or stopped being) since the last touch
    startY = e.touches[0].clientY; blocking = shouldBlock(e.target);
  };
  const onMove = (e) => { if (blocking && e.touches.length === 1) stop(e); }; // two fingers: a pinch, not a swipe
  const onEnd = (e) => {
    if (e.touches.length > 0) return; // other fingers still down
    const y = e.changedTouches[0]?.clientY;
    const swipe = blocking && startY !== null && y !== undefined && Math.abs(y - startY) > 20;
    if (swipe) stop(e);
    startY = null; blocking = false;
  };
  const onWheel = (e) => { if (shouldBlock(e.target)) stop(e); };
  const handlers = [['touchstart', onStart], ['touchmove', onMove], ['touchend', onEnd], ['touchcancel', onEnd], ['wheel', onWheel]];
  // Any movement while a finger is down is undone. With no finger down, Instagram re-centring the reel by a few
  // pixels is kept, but nothing may stray more than a quarter of the box from where the reel was pinned, however
  // small its steps (smooth scrolling and arrow keys move in small steps, and each used to be accepted).
  const holdScroll = (e) => {
    const el = e.target, hold = pinned.get(el);
    if (!hold || el.scrollTop === hold.top) return;
    if (startY === null && Math.abs(el.scrollTop - hold.anchor) < el.clientHeight * 0.25) hold.top = el.scrollTop;
    else el.scrollTop = hold.top;
  };
  const pin = () => {
    let changed = false;
    for (const el of [...pinned.keys()]) if (!el.isConnected) { el.removeEventListener('scroll', holdScroll); pinned.delete(el); changed = true; }
    for (const v of document.querySelectorAll('video')) {
      const box = reelBoxOf(v);
      if (box && !pinned.has(box)) { pinned.set(box, { anchor: box.scrollTop, top: box.scrollTop }); box.addEventListener('scroll', holdScroll, { passive: true }); changed = true; }
    }
    if (changed) verdicts = new WeakMap();
  };
  const unpin = () => { for (const el of pinned.keys()) el.removeEventListener('scroll', holdScroll); pinned.clear(); verdicts = new WeakMap(); };
  const lockSwipe = (on) => {
    if (on === locked) return;
    locked = on;
    startY = null; blocking = false; // a touch that began under the other state must not carry over
    document.documentElement.toggleAttribute('data-focus-locked', on); // readable by the test tools
    for (const [t, h] of handlers) document[on ? 'addEventListener' : 'removeEventListener'](t, h, { capture: true, passive: false });
    clearInterval(pinTimer);
    if (on) { pin(); pinTimer = setInterval(pin, 500); } else unpin();
  };

  // 3. Links: matched by href, so Instagram's class-name churn doesn't break them
  const TILES = ['/p/', '/reel/', '/reels/', '/tv/'].map((h) => `a[href*="${h}"]:not([href="/reels/"])`).join(','); // post and reel tiles
  const css = [];
  if (CFG.hideReelsFeed) css.push('a[href="/reels/"]{display:none!important}'); // exact: single-reel links stay
  if (CFG.hideSearch) css.push('a[href="/explore"],a[href^="/explore/"]{display:none!important}');
  // visibility, not display: the tiles keep their space, so Instagram's grid never looks empty and keeps loading more
  if (CFG.hideExplore) css.push(TILES.split(',').map((t) => `html[data-focus-explore] ${t}`).join(',') + '{visibility:hidden!important}');
  css.push('[data-focus-hidden]{display:none!important}', '[data-focus-pad]{padding-bottom:50px!important}',
    '#focus-tabbar a[aria-current] [stroke-width]{stroke-width:3}',
    // on the search pages Instagram's results list is a layer (z-index 11) that runs over its own tab bar (2), so a
    // tap on Home opened a recent search; the bar goes above it there (only there: elsewhere sheets must cover it)
    'html[data-focus-search] [data-focus-bar]{z-index:12!important}',
    'html[data-focus-search] body{padding-bottom:50px!important}'); // so the last result can scroll clear of the lifted bar
  css.push('*{touch-action:manipulation}'); // no double-tap zoom anywhere; Instagram's own touch-action rules still win
  // Instagram's own app only (id389801252, also inside l.instagram.com shims): App Store links people send stay
  if (CFG.hideAppPrompts) css.push('a[href^="instagram://"],a[href*="389801252"]{display:none!important}');
  onRoot(() => {
    const style = document.createElement('style');
    style.textContent = css.join('\n');
    document.documentElement.appendChild(style);
    document.documentElement.dataset.focusVersion = SITE_VERSION;
  });

  // 4. Tab bar. Instagram's bottom bar is a space-evenly row of five slots. Hiding a link (Reels) left its empty
  // slot in the row, still spaced for (centres measured 87/128/87 px apart), so the slot itself is hidden and the
  // tabs space evenly. The DM inbox has no bar at all; the same tabs are drawn there with Instagram's own icons
  // (paths measured 2026-10-15) at the same place, and switch pages in place like Instagram's do.
  // Instagram renders a route when it sees a popstate (verified on the phone), so a page opens without a reload;
  // if it has not rendered 2 s later, the page is loaded normally.
  let navSeq = 0;
  const spaGo = (path, rendered, replace = false) => {
    const seq = ++navSeq; // a later move cancels this one's fallback
    history[replace ? 'replaceState' : 'pushState'](null, '', path);
    dispatchEvent(new PopStateEvent('popstate', { state: null }));
    setTimeout(() => { if (seq === navSeq && location.pathname + location.search === path && !rendered()) location.replace(path); }, 2000);
  };
  const isInbox = (p) => /^\/direct\/inbox\/?$/.test(p);
  // a tab link of Instagram's own bar: shown, along the bottom edge (a header logo also links to /)
  const nativeTab = (href) => [...document.querySelectorAll(`a[href="${href}"]:not([data-focus-tab])`)]
    .find((a) => { const r = a.getBoundingClientRect(); return r.height > 0 && r.top > innerHeight - 100 && getComputedStyle(a).visibility !== 'hidden'; });
  const barUp = () => !!nativeTab('/direct/inbox/'); // Messages is in Instagram's bar on every page that has one
  const scheme = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const store = (() => { try { return JSON.parse(localStorage.getItem('focusTabs')) || {}; } catch { return {}; } })();
  // Instagram's bar (its profile link, and its colours per colour scheme), remembered for an inbox opened cold
  const learnBar = (home) => {
    let row = home; while (row && !row.querySelector('a[href="/direct/inbox/"]')) row = row.parentElement;
    let fixed = home; while (fixed && getComputedStyle(fixed).position !== 'fixed') fixed = fixed.parentElement;
    if (!row || !fixed) return;
    fixed.setAttribute('data-focus-bar', '');
    if (!CFG.inboxTabBar) return; // nothing to remember without the inbox bar
    const edge = [fixed, ...fixed.querySelectorAll('div')].find((e) => getComputedStyle(e).borderTopWidth !== '0px'); // its 1 px divider
    const next = { ...store, [scheme()]: { fg: getComputedStyle(home.querySelector('svg') || home).color, bg: getComputedStyle(fixed).backgroundColor,
      line: edge ? getComputedStyle(edge).borderTopColor : undefined } };
    const prof = [...row.querySelectorAll('a[href]')].pop(), href = prof?.getAttribute('href');
    if (href && /^\/[^/]+\/$/.test(href) && !['/', '/explore/', '/direct/inbox/', '/reels/'].includes(href)) {
      next.profile = href; next.avatar = prof.querySelector('img')?.src || store.avatar;
    }
    if (JSON.stringify(next) === JSON.stringify(store)) return;
    Object.assign(store, next);
    try { localStorage.setItem('focusTabs', JSON.stringify(store)); } catch { /* private mode: remembered for this page only */ }
  };
  const HIDDEN_TABS = [...(CFG.hideReelsFeed ? ['a[href="/reels/"]'] : []), ...(CFG.hideSearch ? ['a[href="/explore/"]'] : [])].join(',');
  const hideSlots = () => {
    if (!HIDDEN_TABS) return;
    for (const a of document.querySelectorAll(HIDDEN_TABS)) {
      let slot = a; // the highest wrapper of the link below the row that holds the Messages tab
      while (slot.parentElement && !slot.parentElement.querySelector('a[href="/direct/inbox/"]')) slot = slot.parentElement;
      // a tab slot wraps just that link; a Reels link in the page content climbs to a whole column and is left alone
      if (slot.parentElement && slot.querySelectorAll('a[href]').length === 1) slot.setAttribute('data-focus-hidden', '');
    }
  };
  const SVG = 'http://www.w3.org/2000/svg';
  const LINE = { fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2' };
  const ICONS = {
    '/': [['path', { d: 'm21.762 8.786-7-6.68C13.266.68 10.734.68 9.238 2.106l-7 6.681A4.017 4.017 0 0 0 1 11.68V20c0 1.654 1.346 3 3 3h5.005a1 1 0 0 0 1-1L10 15c0-1.103.897-2 2-2 1.09 0 1.98.877 2 1.962L13.999 22a1 1 0 0 0 1 1H20c1.654 0 3-1.346 3-3v-8.32a4.021 4.021 0 0 0-1.238-2.894ZM21 20a1 1 0 0 1-1 1h-4.001L16 15c0-2.206-1.794-4-4-4s-4 1.794-4 4l.005 6H4a1 1 0 0 1-1-1v-8.32c0-.543.226-1.07.62-1.447l7-6.68c.747-.714 2.013-.714 2.76 0l7 6.68c.394.376.62.904.62 1.448V20Z' }]],
    '/explore/': [['path', { d: 'M19 10.5A8.5 8.5 0 1 1 10.5 2a8.5 8.5 0 0 1 8.5 8.5Z', ...LINE }], ['line', { x1: '16.511', x2: '22', y1: '16.511', y2: '22', ...LINE }]],
    '/direct/inbox/': [['path', { d: 'M13.973 20.046 21.77 6.928C22.8 5.195 21.55 3 19.535 3H4.466C2.138 3 .984 5.825 2.646 7.456l4.842 4.752 1.723 7.121c.548 2.266 3.571 2.721 4.762.717Z', ...LINE }],
      ['line', { x1: '7.488', x2: '15.515', y1: '12.208', y2: '7.641', ...LINE }]],
    profile: [['circle', { cx: '12', cy: '12', r: '10.5', ...LINE }]], // when no profile picture is known
  };
  const icon = (parts, label) => {
    const svg = document.createElementNS(SVG, 'svg');
    for (const [k, v] of Object.entries({ 'aria-label': label, fill: 'currentColor', height: '24', width: '24', viewBox: '0 0 24 24', role: 'img' })) svg.setAttribute(k, v);
    for (const [tag, attrs] of parts) { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); svg.append(el); }
    return svg;
  };
  let bar = null, profileWanted = 0; // when the Profile tab was tapped before the profile was known
  const goTab = (a) => {
    const href = a.getAttribute('href');
    // profile still unknown: open Home, whose bar has the profile link, and go on from there (syncTabs)
    if (a.hasAttribute('data-focus-unknown')) { profileWanted = performance.now(); spaGo('/', barUp); return; } // then replaced
    const dest = href === '/explore/' && CFG.hideExplore ? '/explore/search/' : href;
    if (location.pathname !== dest) spaGo(dest, barUp);
  };
  // the account name the inbox shows at the top (next to a chevron icon): the signed-in account, which wins over what
  // was remembered (another account may have used this Safari). innerText, because the icon's <title> is in textContent.
  const accountHref = () => {
    const name = [...document.querySelectorAll('[role="button"]')].find((b) => b.querySelector('svg[aria-label*="chevron" i]'))?.innerText.trim();
    return name && /^[\w.]+$/.test(name) ? `/${name}/` : null;
  };
  const buildBar = () => {
    const dark = scheme() === 'dark', c = store[scheme()] || {};
    const fg = c.fg || (dark ? 'rgb(245, 245, 245)' : 'rgb(0, 0, 0)'), bg = c.bg || (dark ? 'rgb(12, 16, 20)' : 'rgb(255, 255, 255)');
    const line = c.line || (dark ? 'rgb(54, 54, 54)' : 'rgb(219, 219, 219)');
    const el = document.createElement('div');
    el.id = 'focus-tabbar';
    el.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:50px;border-top:1px solid ${line};box-sizing:border-box;z-index:2;background:${bg}`;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-evenly;width:100%;height:48px';
    const tabs = [['/', 'Home'], ...(CFG.hideSearch ? [] : [['/explore/', 'Search']]), ['/direct/inbox/', 'Messages'], [store.profile || '/', 'Profile']];
    for (const [href, label] of tabs) {
      const a = document.createElement('a');
      a.href = href; a.setAttribute('data-focus-tab', ''); a.setAttribute('aria-label', label);
      a.style.cssText = `display:flex;width:48px;height:48px;align-items:center;justify-content:center;color:${fg};-webkit-tap-highlight-color:transparent`;
      if (href === '/direct/inbox/') a.setAttribute('aria-current', 'page');
      if (label === 'Profile' && !store.profile) a.setAttribute('data-focus-unknown', '');
      if (label === 'Profile' && store.profile && store.avatar) {
        const img = document.createElement('img');
        img.src = store.avatar; img.alt = ''; img.style.cssText = 'width:24px;height:24px;border-radius:50%;object-fit:cover';
        img.addEventListener('error', () => img.replaceWith(icon(ICONS.profile, label)), { once: true });
        a.append(img);
      } else a.append(icon(ICONS[href] && label !== 'Profile' ? ICONS[href] : ICONS.profile, label));
      a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); goTab(a); });
      row.append(a);
    }
    el.append(row);
    el.builtAt = performance.now();
    return el;
  };
  // the inbox list scrolls inside its own box down to the bottom edge: pad that box so the last chat clears the bar
  const padInbox = () => {
    if (document.querySelector('[data-focus-pad]')) return;
    const under = document.elementsFromPoint(innerWidth / 2, innerHeight - 25).find((e) => !bar.contains(e));
    for (let el = under, i = 0; el && el !== document.body && i < 25; el = el.parentElement, i++) {
      if (/auto|scroll/.test(getComputedStyle(el).overflowY) && el.clientHeight >= 200) { el.setAttribute('data-focus-pad', ''); return; }
    }
  };
  // for 10 s after the bar is drawn: the inbox list box and the account name appear as the inbox renders
  const inboxPending = () => bar?.isConnected && performance.now() - bar.builtAt < 10000 && (!document.querySelector('[data-focus-pad]') || !bar.accountChecked);
  const phoneLayout = () => innerWidth < 768; // wider, Instagram has a side navigation instead of a bottom bar
  const syncTabs = () => {
    if (!document.body) return;
    hideSlots();
    const home = nativeTab('/');
    if (home && barUp()) learnBar(home);
    if (profileWanted && performance.now() - profileWanted > 5000) profileWanted = 0; // too late: the user has moved on
    if (profileWanted && store.profile && barUp()) { profileWanted = 0; spaGo(store.profile, barUp, true); } // Back skips Home
    const want = CFG.inboxTabBar && phoneLayout() && isInbox(location.pathname) && !barUp();
    if (want && !bar?.isConnected) document.body.append(bar = buildBar());
    if (!want && bar?.isConnected) { bar.remove(); for (const e of document.querySelectorAll('[data-focus-pad]')) e.removeAttribute('data-focus-pad'); }
    if (!want || !inboxPending()) return;
    padInbox();
    const account = accountHref(), tab = bar.querySelector('[aria-label="Profile"]');
    if (!account) return;
    bar.accountChecked = true;
    if (tab.getAttribute('href') === account) return;
    tab.setAttribute('href', account); tab.removeAttribute('data-focus-unknown');
    if (store.profile !== account) tab.replaceChildren(icon(ICONS.profile, 'Profile')); // not the remembered account's picture
  };
  // switching light/dark with the inbox open: redraw the bar in the other scheme's colours
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (!bar?.isConnected) return;
    const fresh = buildBar(); bar.replaceWith(fresh); bar = fresh;
  });
  const TAB_LINKS = 'a[href="/"], a[href="/reels/"], a[href="/explore/"], a[href="/direct/inbox/"]';
  const touchesTabs = (n) => n.nodeType === 1 && !n.closest?.('#focus-tabbar') && (n.matches(TAB_LINKS) || !!n.querySelector(TAB_LINKS) || !!n.closest?.(TAB_LINKS));

  // 5. Content: labels matched by exact visible text (EN + FR). Only nodes Instagram adds are examined
  // (incremental, via the mutation records), never the whole page again, and only leaf elements are read:
  // on Instagram every wrapper div has a single child, so reading text on wrappers would re-read the
  // whole page hundreds of times. A label hides its post (closest <article>). "Suggested for you" inside a
  // post marks a recommended post (kept unless hideSuggestedPosts); outside a post, in the home feed, it
  // is the accounts carousel, where the largest wrapper holding no post is hidden. Anywhere else a stray
  // label hides nothing, so a page can never go blank.
  const LEAF = 'span, h2, h3, h4, div, button, a';
  // the ad label is the word alone or followed by a separator ("Sponsored · 2h"); "Sponsored by my mom" is a caption
  const isAdLabel = (t) => (CFG.hideSponsored && WORDS.sponsored.some((w) => t === w || (t.startsWith(w) && /^\s*[·•|]/.test(t.slice(w.length)))))
    || (CFG.hidePaidPartnership && WORDS.partnership.some((w) => t.startsWith(w)));
  // off-site: Instagram's link shim, or any host outside Instagram / Facebook / Meta (help pages are not ads)
  const isOffsiteLink = (a) => {
    let host; try { host = new URL(a.href).hostname; } catch { return false; } // no link, or not a URL: not off-site
    return host === 'l.instagram.com' || !/(^|\.)(instagram|facebook|meta|fb)\.com$/.test(host);
  };
  const hide = (node) => {
    if (!node || node === document.body || node === document.documentElement || node.style.display === 'none') return;
    node.style.display = 'none';
  };
  const LATER = {}; // carouselOf: no post on the page yet, decide once there is one
  const carouselOf = (el) => {
    if (location.pathname !== '/') return null;
    if (!document.querySelector('main article')) return LATER; // the climb would stop nowhere and take the column
    let node = el, best = el;
    while (node.parentElement && node.parentElement !== document.body && !/^(MAIN|SECTION)$/.test(node.parentElement.tagName)) {
      node = node.parentElement;
      if (node.querySelector('article')) break;
      best = node;
    }
    return best;
  };
  // On the notifications page the accounts block sits at the end: a "Suggested for you" heading, a list of accounts
  // with Follow buttons, a "See All" link to /explore/people/. What goes: the heading's own wrappers (ancestors holding
  // nothing but its text, so activity rows can never be taken along), and the blocks holding Follow buttons or that
  // link right after it (or after a close ancestor, if the heading is nested). The heading renders before its list,
  // so this runs as a pass once Instagram has added to the page for a moment (at most 1 s after the first change).
  const isFollowBlock = (n) => !!n.querySelector('a[href="/explore/people/"]')
    || [...n.querySelectorAll('button, [role="button"]')].some((b) => WORDS.follow.includes(b.textContent.trim()));
  const hideNotifSuggestions = (heading) => {
    const text = heading.textContent.trim();
    let head = heading;
    while (head.parentElement && head.parentElement.textContent.trim() === text) head = head.parentElement;
    let anchor = head; // the heading's wrapper, or up to 3 ancestors, whose next sibling is the account list
    for (let i = 0; i < 3 && !(anchor.nextElementSibling && isFollowBlock(anchor.nextElementSibling)); i++) {
      if (!anchor.parentElement || /^(MAIN|SECTION|BODY)$/.test(anchor.parentElement.tagName)) return;
      anchor = anchor.parentElement;
    }
    if (!anchor.nextElementSibling || !isFollowBlock(anchor.nextElementSibling)) return; // not the block's heading
    hide(head);
    for (let n = anchor.nextElementSibling; n && isFollowBlock(n); n = n.nextElementSibling) hide(n);
  };
  const onNotifs = () => CFG.hideSuggestedAccounts && location.pathname.startsWith('/notifications');
  let notifTimer = null, notifFirst = 0;
  const notifPass = () => {
    const now = performance.now();
    if (!notifTimer) notifFirst = now;
    else if (now - notifFirst > 1000) return; // keeps mutating: let the pending pass run, don't push it back again
    clearTimeout(notifTimer);
    notifTimer = setTimeout(() => {
      notifTimer = null;
      if (!onNotifs()) return; // left the page meanwhile
      for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
        if (WORDS.suggested.includes(h.textContent.trim())) hideNotifSuggestions(h); // hidden ones too: late blocks after them
      }
    }, 300);
  };
  const check = (el) => {
    if (el.childElementCount !== 0) return;
    const t = el.textContent.trim();
    if (!t || t.length > 40) return;
    const post = el.closest('article');
    if (isAdLabel(t)) hide(post);
    // an ad's call-to-action is an off-site link (through l.instagram.com); an organic "Learn more" overlay is not
    else if (CFG.hideSponsored && post && WORDS.cta.includes(t) && el.closest('a[href]') && isOffsiteLink(el.closest('a[href]'))) hide(post);
    else if (WORDS.suggested.includes(t)) {
      if (post) { if (CFG.hideSuggestedPosts) hide(post); }
      else if (CFG.hideSuggestedAccounts) { const unit = carouselOf(el); if (unit === LATER) pending.add(el); else hide(unit); }
    }
    // a dialog whose button says "Use the app" is the app prompt itself; in the header only the button goes
    else if (CFG.hideAppPrompts && WORDS.app.includes(t)) hide(el.closest('[role="dialog"]') || el.closest('button, a, [role="button"]') || el, 'app-prompt');
  };
  const scan = (root) => {
    if (root.nodeType !== 1) return;
    if (root.matches(LEAF)) check(root);
    for (const el of root.querySelectorAll(LEAF)) check(el);
  };
  const isBannerMeta = (n) => n.nodeName === 'META' && n.getAttribute('name') === 'apple-itunes-app';
  const pending = new Set();
  let flushTimer = null;
  // swap first: a check may queue its node again (a carousel waiting for the first post), for a later flush
  const flush = () => { flushTimer = null; const batch = [...pending]; pending.clear(); for (const n of batch) scan(n); };
  let sheetCount = 0;
  const onMutations = (muts) => {
    routeIfMoved();
    let tabsChanged = false, videoChange = false;
    for (const m of muts) {
      if (m.type === 'characterData') { const p = m.target.parentElement; if (p) pending.add(p); continue; }
      if (m.type === 'attributes') { if (CFG.hideAppPrompts && isBannerMeta(m.target)) m.target.remove(); continue; }
      for (const n of m.addedNodes) {
        if (n.nodeType === 3) { if (n.parentElement) pending.add(n.parentElement); continue; } // a label's text arriving late
        if (n.nodeType !== 1) continue;
        // Safari reads the Smart App Banner tag the moment Instagram re-inserts it, so remove it right here
        if (CFG.hideAppPrompts && isBannerMeta(n)) { n.remove(); continue; }
        scan(n); // right away: a post hidden before the feed measures it never makes the feed jump
        if (!tabsChanged && touchesTabs(n)) tabsChanged = true;
        const vids = n.tagName === 'VIDEO' ? [n] : [...n.querySelectorAll('video')];
        if (vids.length) { videoChange = true; for (const v of vids) nudgePlay(v); }
      }
      for (const n of m.removedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'VIDEO' || n.querySelector?.('video')) videoChange = true;
        if (!tabsChanged && touchesTabs(n)) tabsChanged = true; // Instagram's bar going away (the inbox)
      }
    }
    if (videoChange) recheckLock();
    if (tabsChanged || inboxPending()) syncTabs();
    if (onNotifs()) notifPass();
    if (document.styleSheets.length !== sheetCount) { sheetCount = document.styleSheets.length; unhoverSheets(); } // a <style> came or went
    if (pending.size && !flushTimer) flushTimer = setTimeout(flush, 100);
  };
  // 6. One tap. A tap is first a hover for Safari: it sends hover events (pointerover, mouseover, mousemove) and puts
  // :hover on what the finger touched. If that makes something appear, the tap counts as a hover and only the next
  // tap clicks. Instagram's web app reveals desktop hover extras both ways (measured on the phone 2026-10-15: a DM
  // message row shows React / Reply / More from a mouseover handler and from :hover rules, opacity 0 -> 1), so a post
  // shared in a DM needed two taps. So: a finger's hover events never reach Instagram's handlers (registered first,
  // on window, capture phase) when the hover lands on something that opens: a link, a button, or anything Instagram
  // marks clickable (cursor: pointer). That includes out/leave, judged by where the hover moves to: React dispatches
  // onMouseEnter from the PREVIOUS element's mouseout (its relatedTarget), and iOS keeps the last tapped element
  // hovered. A tap on a plain DM text bubble keeps its hover, so React / Reply / More stay reachable. Pen pointer
  // events count as a finger; a real mouse (iPad pointer) still hovers. And on a device where nothing can hover, every
  // :hover in Instagram's stylesheets is rewritten never to match: the page behaves as if nothing were ever hovered,
  // :not(:hover) and :has(:hover) included.
  let unhoverSheets = () => {};
  if (CFG.oneTap) {
    let fingerAt = -Infinity;
    for (const t of ['touchstart', 'touchend']) addEventListener(t, () => { fingerAt = performance.now(); unhoverSheets(); }, { capture: true, passive: true });
    addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') fingerAt = -Infinity; }, { capture: true, passive: true });
    const fromFinger = (e) => (e.pointerType ? e.pointerType !== 'mouse' : performance.now() - fingerAt < 1000);
    const OPENS = 'a[href], button, [role="button"], [role="link"], [role="tab"], [role="menuitem"], input, select, textarea, label, summary';
    const opens = (el) => el instanceof Element && (!!el.closest(OPENS) || getComputedStyle(el).cursor === 'pointer');
    const onto = (e) => (/out|leave/.test(e.type) ? e.relatedTarget : e.target); // where the hover is moving to
    for (const t of ['pointerover', 'pointerenter', 'pointerout', 'pointerleave', 'mouseover', 'mouseenter', 'mouseout', 'mouseleave', 'mousemove']) {
      addEventListener(t, (e) => { if (fromFinger(e) && opens(onto(e))) e.stopImmediatePropagation(); }, true);
    }
    if (matchMedia('(any-hover: none)').matches) {
      const seen = new WeakMap(); // sheet -> rule count when last rewritten (278 :hover rules among ~19k, ~20 ms once)
      const LIVE = /:hover(?!:not\(\*\))/, LIVE_ALL = /:hover(?!:not\(\*\))/g; // not yet rewritten
      const unhover = (rules) => {
        for (const r of rules) {
          if (r.cssRules?.length) unhover(r.cssRules);
          if (r.selectorText && LIVE.test(r.selectorText)) r.selectorText = r.selectorText.replace(LIVE_ALL, ':hover:not(*)');
        }
      };
      unhoverSheets = () => {
        for (const sh of document.styleSheets) {
          if (seen.get(sh) === -1) continue; // another origin's, never readable
          try {
            if (seen.get(sh) === sh.cssRules.length) continue; // unchanged since its last pass (rules added later are caught)
            unhover(sh.cssRules); seen.set(sh, sh.cssRules.length);
          } catch (err) {
            if (err.name === 'SecurityError') seen.set(sh, -1);
            // otherwise (InvalidAccessError) the sheet is still loading: rewritten on a later pass
          }
        }
      };
      // a <link> stylesheet arrived (load does not reach window, so on document, capture phase)
      document.addEventListener('load', (e) => { if (e.target instanceof HTMLLinkElement) unhoverSheets(); }, true);
    }
  }

  onRoot(() => new MutationObserver(onMutations).observe(document.documentElement,
    { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['name'] }));
  const initial = () => { scan(document.documentElement); unhoverSheets(); if (CFG.hideAppPrompts) document.querySelector('meta[name="apple-itunes-app"]')?.remove(); route(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initial); else initial();
  onRoot(() => route(true));
})();

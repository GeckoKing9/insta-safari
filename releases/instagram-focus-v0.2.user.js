// ==UserScript==
// @name         Instagram Focus
// @description  Instagram web without the Reels feed, Explore, ads, suggested posts or "open the app" prompts. Toggles below.
// @match        https://www.instagram.com/*
// @run-at       document-start
// @inject-into  content
// @noframes
// ==/UserScript==
(() => {
  const CFG = {
    hideReelsFeed: true,        // the Reels tab and the endless /reels/ feed
    singleReelOnly: true,       // a reel someone sends you still opens, but swiping to the next one is blocked
    autoPlayReels: true,        // a reel that opens paused (Safari blocked Instagram's autoplay) is started for you
    hideExplore: true,          // Explore / search tab + /explore/ pages
    hideSponsored: true,        // ads in the feed
    hidePaidPartnership: false, // creators' "Paid partnership" posts (not Instagram ads)
    hideSuggestedAccounts: true, // the "Suggested for you" accounts carousel in the home feed
    hideSuggestedPosts: false,  // recommended posts in the home feed (the feed is mostly these once you're caught up)
    followingFeed: false,       // open the Following feed instead of Home
    hideAppPrompts: true,       // "Open in app" banners, App Store links, Safari's Smart App Banner
  };
  const WORDS = {
    sponsored: ['Sponsored', 'Sponsorisé', 'Commandité', 'Publicité'],
    // an ad's own call-to-action button, in case the label text differs from the list above
    cta: ['Shop now', 'Learn more', 'Install now', 'Sign up', 'Book now', 'Get offer', 'Download', 'Order now',
          'Acheter', 'En savoir plus', 'Installer', 'S’inscrire', "S'inscrire", 'Réserver', 'Télécharger', 'Commander'],
    partnership: ['Paid partnership', 'Partenariat rémunéré'],
    suggested: ['Suggested for you', 'Suggestions pour vous', 'Suggested posts', 'Publications suggérées', 'Suggested reels', 'Reels suggérés'],
    app: ['Open app', 'Use app', 'Use the app', 'Open Instagram', 'Get app', 'Get the app', 'Switch to the app',
          'Ouvrir l’application', "Ouvrir l'application", 'Utiliser l’application', "Utiliser l'application",
          'Télécharger l’application', "Télécharger l'application", 'Obtenir l’application'],
  };
  const SITE_VERSION = '14';
  const DEBUG = false; // true = status strip at the bottom + event log in <html data-focus-log>, for bug hunting

  // Debug: a log of what the script sees and does, readable from a screenshot or from Web Inspector
  const logs = [];
  let strip = null, hiddenCount = 0;
  const describe = (el) => {
    if (!(el instanceof Element)) return String(el && el.nodeName);
    const a = el.closest('a[href]'); const b = el.closest('button, [role="button"]');
    return [el.tagName.toLowerCase(), el.getAttribute('aria-label') || el.getAttribute('role') || '',
      a ? 'a:' + a.getAttribute('href').slice(0, 28) : '', b ? 'btn:' + (b.getAttribute('aria-label') || b.textContent.trim()).slice(0, 18) : '',
      el.closest('article') ? 'in-article' : '', el.closest('video') || el.querySelector?.('video') ? 'video' : ''].filter(Boolean).join(' ');
  };
  const log = (kind, detail) => {
    if (!DEBUG) return;
    const line = `${new Date().toTimeString().slice(3, 8)} ${kind} ${detail}`;
    logs.push(line); if (logs.length > 40) logs.shift();
    if (document.documentElement) document.documentElement.dataset.focusLog = JSON.stringify(logs);
    if (!strip && document.body) {
      strip = document.createElement('div');
      strip.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,.75);color:#9f9;font:10px/1.3 -apple-system,monospace;padding:2px 6px;pointer-events:none;white-space:pre-wrap;word-break:break-all';
      document.body.appendChild(strip);
    }
    if (strip) strip.textContent = `v${SITE_VERSION} ${locked ? 'LOCK' : 'free'} hidden:${hiddenCount} ${location.pathname.slice(0, 24)}\n` + logs.slice(-3).join('\n');
  };

  // At document-start the <html> element may not exist yet; wait for it instead of crashing
  const onRoot = (fn) => document.documentElement ? fn()
    : new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); fn(); } }).observe(document, { childList: true });

  // 1. Routing: Instagram is a single-page app, so this runs at start and on every URL change
  const isReelsFeed = (p) => /^\/reels\/?$/.test(p);
  const isReelPage = (p) => /^\/reels?\/(?!audio\/)[^/]+/.test(p); // /reels/audio/… is a sound page, not a reel
  // The Following-feed switch runs on the initial load only: Instagram may rewrite the URL afterwards
  // (dropping the query), and re-applying it from the watcher would reload the page forever.
  const route = (firstLoad = false) => {
    const p = location.pathname;
    if (CFG.hideReelsFeed && isReelsFeed(p)) { location.replace('/'); return; }
    if (CFG.hideExplore && p.startsWith('/explore')) { location.replace('/'); return; }
    if (firstLoad && CFG.followingFeed && p === '/' && !location.search.includes('variant=')) { location.replace('/?variant=following'); return; }
    recheckLock();
    log('route', p.slice(0, 30) + (firstLoad ? ' first' : ''));
  };
  let last = location.href;
  setInterval(() => { if (location.href !== last) { last = location.href; route(); } }, 300);

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
  const pinned = new Map(); // reel scroll box -> scrollTop to hold it at
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
    const apply = () => lockSwipe(CFG.singleReelOnly && (isReelPage(location.pathname) || (document.querySelector('video') !== null && overlayReel())));
    apply();
    recheckTimer = setTimeout(apply, 400); // once more after the overlay has laid out
  };
  // A reel that opens paused: Instagram calls play() after the data arrives, outside the tap that opened
  // it, and Safari refuses. Starting it ourselves from the same moment works for a muted video.
  // Only the reel on screen: the overlay preloads the next reels below it, equally fullscreen-sized, and
  // starting those too makes them audible once the sound is turned on.
  const onScreen = (v) => { const r = v.getBoundingClientRect(); return r.top < innerHeight / 2 && r.bottom > innerHeight / 2; };
  const nudgePlay = (v) => {
    if (!CFG.autoPlayReels) return;
    const tryPlay = () => { if (v.isConnected && v.paused && v.muted && isFullscreenVideo(v) && onScreen(v)) { v.play().then(() => log('play', 'started paused reel')).catch(() => {}); } };
    v.addEventListener('loadeddata', tryPlay, { once: true });
    setTimeout(tryPlay, 300); setTimeout(tryPlay, 1200);
  };
  const shouldBlock = (target) => {
    if (!(target instanceof Element)) return false;
    for (let n = target; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (pinned.has(n)) return true; // reached the pinned reel box without crossing another scroller
      const s = getComputedStyle(n);
      if (/auto|scroll/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 10) return false; // e.g. the comments sheet
    }
    return false; // not inside a reel box at all
  };
  const onStart = (e) => { startY = e.touches[0]?.clientY ?? null; blocking = shouldBlock(e.target); };
  const onMove = (e) => { if (blocking) stop(e); };
  const onEnd = (e) => {
    const y = e.changedTouches[0]?.clientY;
    const swipe = blocking && startY !== null && y !== undefined && Math.abs(y - startY) > 20;
    if (swipe) stop(e);
    log('touchend', (swipe ? 'SWALLOWED(swipe) ' : blocking ? 'tap-in-reel ' : 'tap ') + describe(e.target));
    startY = null; blocking = false;
  };
  const onWheel = (e) => { if (shouldBlock(e.target)) stop(e); };
  const handlers = [['touchstart', onStart], ['touchmove', onMove], ['touchend', onEnd], ['touchcancel', onEnd], ['wheel', onWheel]];
  const holdScroll = (e) => { const top = pinned.get(e.target); if (top !== undefined && e.target.scrollTop !== top) e.target.scrollTop = top; };
  const pin = () => {
    for (const el of [...pinned.keys()]) if (!el.isConnected) { el.removeEventListener('scroll', holdScroll); pinned.delete(el); }
    for (const v of document.querySelectorAll('video')) {
      const box = reelBoxOf(v);
      if (box && !pinned.has(box)) { pinned.set(box, box.scrollTop); box.addEventListener('scroll', holdScroll, { passive: true }); }
    }
  };
  const unpin = () => { for (const el of pinned.keys()) el.removeEventListener('scroll', holdScroll); pinned.clear(); };
  const lockSwipe = (on) => {
    if (on === locked) return;
    locked = on;
    log('lock', on ? 'ON' : 'off');
    for (const [t, h] of handlers) document[on ? 'addEventListener' : 'removeEventListener'](t, h, { capture: true, passive: false });
    clearInterval(pinTimer);
    if (on) { pin(); pinTimer = setInterval(pin, 500); } else unpin();
  };

  // 3. Links: matched by href, so Instagram's class-name churn doesn't break them
  const css = [];
  if (CFG.hideReelsFeed) css.push('a[href="/reels/"]{display:none!important}'); // exact: single-reel links stay
  if (CFG.hideExplore) css.push('a[href^="/explore"]{display:none!important}');
  if (CFG.hideAppPrompts) css.push('a[href^="instagram://"],a[href*="apps.apple.com"],a[href^="itms-apps"]{display:none!important}');
  onRoot(() => {
    const style = document.createElement('style');
    style.textContent = css.join('\n');
    document.documentElement.appendChild(style);
    document.documentElement.dataset.focusVersion = SITE_VERSION;
  });

  // 4. Content: labels matched by exact visible text (EN + FR). Only nodes Instagram adds are examined
  // (incremental, via the mutation records), never the whole page again, and only leaf elements are read:
  // on Instagram every wrapper div has a single child, so reading text on wrappers would re-read the
  // whole page hundreds of times. A label hides its post (closest <article>). "Suggested for you" inside a
  // post marks a recommended post (kept unless hideSuggestedPosts); outside a post, in the home feed, it
  // is the accounts carousel, where the largest wrapper holding no post is hidden. Anywhere else a stray
  // label hides nothing, so a page can never go blank.
  const LEAF = 'span, h2, h3, h4, div, button, a';
  const sponsoredWords = [...(CFG.hideSponsored ? WORDS.sponsored : []), ...(CFG.hidePaidPartnership ? WORDS.partnership : [])];
  const hide = (node, why) => {
    if (!node || node === document.body || node === document.documentElement || node.style.display === 'none') return;
    node.style.display = 'none'; hiddenCount++;
    log('hide', (why || '') + ' ' + node.tagName.toLowerCase() + ' h=' + node.clientHeight);
  };
  const carouselOf = (el) => {
    if (location.pathname !== '/') return null;
    let node = el, best = el;
    while (node.parentElement && node.parentElement !== document.body && !/^(MAIN|SECTION)$/.test(node.parentElement.tagName)) {
      node = node.parentElement;
      if (node.querySelector('article')) break;
      best = node;
    }
    return best;
  };
  const check = (el) => {
    if (el.childElementCount !== 0) return;
    const t = el.textContent.trim();
    if (!t || t.length > 40) return;
    const post = el.closest('article');
    if (sponsoredWords.some((w) => t.startsWith(w))) hide(post, 'ad:' + t.slice(0, 12)); // "Sponsored · 2h"
    else if (CFG.hideSponsored && post && WORDS.cta.includes(t) && el.closest('a, button, [role="button"]')) hide(post, 'cta:' + t.slice(0, 12));
    else if (WORDS.suggested.includes(t)) {
      if (post) { if (CFG.hideSuggestedPosts) hide(post, 'suggested-post'); }
      else if (CFG.hideSuggestedAccounts) hide(carouselOf(el), 'suggested-accounts');
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
  const flush = () => { flushTimer = null; for (const n of pending) scan(n); pending.clear(); };
  const onMutations = (muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') { const p = m.target.parentElement; if (p) pending.add(p); continue; }
      if (m.type === 'attributes') { if (CFG.hideAppPrompts && isBannerMeta(m.target)) m.target.remove(); continue; }
      let videoChange = false;
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        // Safari reads the Smart App Banner tag the moment Instagram re-inserts it, so remove it right here
        if (CFG.hideAppPrompts && isBannerMeta(n)) { n.remove(); continue; }
        scan(n); // right away: a post hidden before the feed measures it never makes the feed jump
        const vids = n.tagName === 'VIDEO' ? [n] : [...n.querySelectorAll('video')];
        if (vids.length) { videoChange = true; for (const v of vids) nudgePlay(v); }
      }
      for (const n of m.removedNodes) if (n.nodeType === 1 && (n.tagName === 'VIDEO' || n.querySelector?.('video'))) videoChange = true;
      if (videoChange) recheckLock();
    }
    if (pending.size && !flushTimer) flushTimer = setTimeout(flush, 100);
  };
  // every tap, logged when debugging (capture phase, so it is seen even if Instagram stops propagation)
  if (DEBUG) onRoot(() => document.addEventListener('click', (e) => log('click', describe(e.target)), true));
  onRoot(() => new MutationObserver(onMutations).observe(document.documentElement,
    { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['name'] }));
  const initial = () => { scan(document.documentElement); if (CFG.hideAppPrompts) document.querySelector('meta[name="apple-itunes-app"]')?.remove(); route(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initial); else initial();
  onRoot(() => route(true));
})();

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
    hideReelsFeed: true,       // the Reels tab and the endless /reels/ feed
    singleReelOnly: true,      // a reel someone sends you still opens, but swiping to the next one is blocked
    hideExplore: true,         // Explore / search tab + /explore/ pages
    hideSponsored: true,       // ads in the feed and stories tray
    hidePaidPartnership: false, // creators' "Paid partnership" posts (not Instagram ads)
    hideSuggested: true,       // "Suggested for you" posts and account carousels
    followingFeed: true,       // open the Following feed instead of the algorithmic one
    hideAppPrompts: true,      // "Open in app" banners, App Store links, Safari's Smart App Banner
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
  const SITE_VERSION = '9';

  // 1. Routing: Instagram is a single-page app, so this runs at start and on every URL change
  const isReelsFeed = (p) => /^\/reels\/?$/.test(p);
  const isSingleReel = (p) => /^\/reels?\/(?!audio\/)[^/]+/.test(p); // /reels/audio/… is a sound page, not a reel
  // The Following-feed switch runs on the initial load only: Instagram may rewrite the URL afterwards
  // (dropping the query), and re-applying it from the watcher would reload the page forever.
  const route = (firstLoad = false) => {
    const p = location.pathname;
    if (CFG.hideReelsFeed && isReelsFeed(p)) { location.replace('/'); return; }
    if (CFG.hideExplore && p.startsWith('/explore')) { location.replace('/'); return; }
    if (firstLoad && CFG.followingFeed && p === '/' && !location.search.includes('variant=')) { location.replace('/?variant=following'); return; }
    lockSwipe(CFG.singleReelOnly && (isSingleReel(p) || fullscreenVideo()));
  };
  let last = location.href;
  setInterval(() => {
    if (location.href !== last) { last = location.href; route(); }
    else if (CFG.singleReelOnly) lockSwipe(isSingleReel(location.pathname) || fullscreenVideo());
  }, 300);

  // 2. Swipe lock for reel pages. The reel feed's scroll container (an ancestor of the video, found by
  // walking up a dozen nodes, never by measuring the page) is pinned: its layout is left alone, so the
  // player is not re-created, but a vertical gesture that starts inside it is swallowed before Instagram
  // sees it (touch moves, wheel, and a touch that ended >20px from where it started, i.e. a swipe rather
  // than a tap), and any scroll it still performs is undone. Gestures that start inside another scrollable
  // area, such as the comments sheet, are left alone. The lock also engages on content: a video covering
  // most of the viewport is the reel viewer even when the URL did not change.
  const stop = (e) => { e.stopImmediatePropagation(); e.preventDefault(); };
  let locked = false, startY = null, blocking = false, pinTimer = null;
  const pinned = new Map(); // reel scroll container -> scrollTop to hold it at
  const inOtherScroller = (el) => { // nearest scrollable ancestor that is not a pinned reel container
    for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (pinned.has(n)) return false;
      const s = getComputedStyle(n);
      if (/auto|scroll/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 10) return true;
    }
    return false;
  };
  const onStart = (e) => {
    startY = e.touches[0]?.clientY ?? null;
    blocking = !(e.target instanceof Element && inOtherScroller(e.target));
  };
  const onMove = (e) => { if (blocking) stop(e); };
  const onEnd = (e) => {
    const y = e.changedTouches[0]?.clientY;
    if (blocking && startY !== null && y !== undefined && Math.abs(y - startY) > 20) stop(e);
    startY = null; blocking = false;
  };
  const onWheel = (e) => { if (!(e.target instanceof Element && inOtherScroller(e.target))) stop(e); };
  const handlers = [['touchstart', onStart], ['touchmove', onMove], ['touchend', onEnd], ['touchcancel', onEnd], ['wheel', onWheel]];
  const holdScroll = (e) => { const top = pinned.get(e.target); if (top !== undefined && e.target.scrollTop !== top) e.target.scrollTop = top; };
  const pin = () => {
    const cands = new Set([document.scrollingElement]);
    for (const v of document.querySelectorAll('video')) {
      for (let el = v.parentElement, i = 0; el && i < 25; el = el.parentElement, i++) cands.add(el);
    }
    for (const el of cands) {
      if (!el || pinned.has(el) || el.clientHeight < 300 || el.scrollHeight < el.clientHeight + 50) continue;
      if (el !== document.scrollingElement && !/auto|scroll/.test(getComputedStyle(el).overflowY)) continue;
      pinned.set(el, el.scrollTop);
      el.addEventListener('scroll', holdScroll, { passive: true });
    }
  };
  const unpin = () => { for (const el of pinned.keys()) el.removeEventListener('scroll', holdScroll); pinned.clear(); };
  const lockSwipe = (on) => {
    if (on === locked) return;
    locked = on;
    for (const [t, h] of handlers) document[on ? 'addEventListener' : 'removeEventListener'](t, h, { capture: true, passive: false });
    document.documentElement.style.overscrollBehavior = on ? 'none' : '';
    clearInterval(pinTimer);
    if (on) { pin(); pinTimer = setInterval(pin, 500); } else unpin();
  };
  const fullscreenVideo = () => [...document.querySelectorAll('video')].some((v) => {
    const r = v.getBoundingClientRect();
    return r.height >= innerHeight * 0.85 && r.width >= innerWidth * 0.6;
  });

  // 3. Links: matched by href, so Instagram's class-name churn doesn't break them
  const css = [];
  if (CFG.hideReelsFeed) css.push('a[href="/reels/"]{display:none!important}'); // exact: single-reel links stay
  if (CFG.hideExplore) css.push('a[href^="/explore"]{display:none!important}');
  if (CFG.hideAppPrompts) css.push('a[href^="instagram://"],a[href*="apps.apple.com"],a[href^="itms-apps"]{display:none!important}');
  // At document-start the <html> element may not exist yet; wait for it instead of crashing
  const onRoot = (fn) => document.documentElement ? fn()
    : new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); fn(); } }).observe(document, { childList: true });
  onRoot(() => {
    const style = document.createElement('style');
    style.textContent = css.join('\n');
    document.documentElement.appendChild(style);
    document.documentElement.dataset.focusVersion = SITE_VERSION;
  });

  // 4. Content: labels matched by exact visible text (EN + FR). Only nodes Instagram adds are examined
  // (incremental, via the mutation records), never the whole page again, and only leaf elements are read:
  // on Instagram every wrapper div has a single child, so reading text on wrappers would re-read the
  // whole page hundreds of times. A label hides its post (closest <article>) or, for carousels, the
  // largest wrapper that holds no post, so the feed container itself can never be hidden by mistake.
  const LEAF = 'span, h2, h3, h4, div, button, a';
  const sponsoredWords = [...(CFG.hideSponsored ? WORDS.sponsored : []), ...(CFG.hidePaidPartnership ? WORDS.partnership : [])];
  const hide = (node) => { if (node && node !== document.body && node !== document.documentElement) node.style.display = 'none'; };
  const blockOf = (el) => {
    const art = el.closest('article');
    if (art) return art;
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
    if (sponsoredWords.some((w) => t.startsWith(w))) hide(blockOf(el)); // "Sponsored · 2h"
    else if (CFG.hideSponsored && WORDS.cta.includes(t) && el.closest('article') && el.closest('a, button, [role="button"]')) hide(el.closest('article'));
    else if (CFG.hideSuggested && WORDS.suggested.includes(t)) hide(blockOf(el));
    else if (CFG.hideAppPrompts && WORDS.app.includes(t)) {
      hide(el.closest('[role="dialog"], [role="banner"], header') || el.closest('button, a, [role="button"]') || el);
    }
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
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        // Safari reads the Smart App Banner tag the moment Instagram re-inserts it, so remove it right here
        if (CFG.hideAppPrompts && isBannerMeta(n)) { n.remove(); continue; }
        pending.add(n);
      }
    }
    if (pending.size && !flushTimer) flushTimer = setTimeout(flush, 100);
  };
  onRoot(() => new MutationObserver(onMutations).observe(document.documentElement,
    { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['name'] }));
  const initial = () => { scan(document.documentElement); if (CFG.hideAppPrompts) document.querySelector('meta[name="apple-itunes-app"]')?.remove(); route(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initial); else initial();
  route(true);
})();

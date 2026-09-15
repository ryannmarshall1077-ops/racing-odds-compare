// Persistent content script (declared in manifest.json — one entry per
// BetMaker tenant domain, all pointing at this same file) that watches
// for a BetMaker-tenant page's own front-end updating Win odds, and
// pushes fresh values to background.js the moment they change. Serves
// every tenant in js/betmaker/api.js's own BETMAKER_TENANTS (ReadyBet,
// RealBookie, BaggyBet, BetYouCan, Playwest, KnuckleBet, MarantelliBet,
// CrownBet, Swiftbet, PonyBet, BetAus, BetLocal, BetEstate) through one
// shared file rather than 13 near-duplicate watchers, since all of them
// share the exact same DOM structure — confirmed live on each one
// individually, including KnuckleBet specifically despite its visibly
// different (Vite-based, vs the Next.js-style bundles every other
// tenant uses) frontend build: 15 ".gs-runner-name-label" elements
// found on a real KnuckleBet race page, same as every other tenant.
//
// OKEbet is the same underlying platform too, but already shipped with
// its own dedicated okebetWatcher.js before this shared module existed
// — left untouched rather than folded in here, so this file is only
// ever loaded on the OTHER tenants' own domains.
//
// This same file is injected on several different hostnames (see
// manifest.json's own separate match-pattern entries for each tenant
// domain, all naming this one file) — it has no site-specific strings
// of its own, so it resolves which tenant it's actually running on,
// and thus which bookieId to tag its own messages with, purely from
// location.hostname at the moment it runs. IMPORTANT: this map must be
// kept in sync with BETMAKER_TENANTS (js/betmaker/api.js) by hand — a
// tenant added there without also being added here silently no-ops on
// that domain (falls through the `if (!bookieId) return` guard below)
// instead of throwing, which is exactly the bug the second BetMaker
// batch shipped with: their own race tab opened onto the correct race
// perfectly (background.js's own generic BETMAKER_TENANTS loop already
// covered URL-building), but no odds ever reached the popup's own
// table, because this map still only listed the first 7 tenants — a
// user report ("loading tabs and correct race but not displaying
// odds") is exactly what a missing entry here looks like from the
// outside.
(() => {
  const HOSTNAME_TO_BOOKIE_ID = {
    "readybet.com.au": "readybet",
    "realbookie.com.au": "realbookie",
    "baggybet.com": "baggybet",
    "betyoucan.au": "betyoucan",
    "playwestbet.com": "playwest",
    "knucklebet.com.au": "knucklebet",
    "marantellibet.com": "marantellibet",
    "crownbet.com.au": "crownbet",
    "swiftbet.com.au": "swiftbet",
    "ponybet.com.au": "ponybet",
    "betaus.com.au": "betaus",
    "betlocal.com.au": "betlocal",
    "betestate.com.au": "betestate",
  };

  const hostname = location.hostname.replace(/^www\./, "");
  const bookieId = HOSTNAME_TO_BOOKIE_ID[hostname];
  if (!bookieId) return; // shouldn't happen given manifest.json's own match patterns, but no tenant to tag as otherwise

  // Identical DOM-scraping logic to okebetWatcher.js — see that file's
  // own comment for the full "gs-runner-name-label" / 2-button-ancestor
  // / "Closed" badge discovery story, all independently re-confirmed
  // live for this shared platform's other tenants too.
  function scrapeRunners() {
    const runners = [];
    for (const label of document.querySelectorAll(".gs-runner-name-label")) {
      let row = null;
      let cur = label;
      for (let i = 0; i < 12 && cur; i++) {
        if (cur.querySelectorAll("button").length === 2) {
          row = cur;
          break;
        }
        cur = cur.parentElement;
      }
      if (!row) continue;

      const name = label.textContent.trim().replace(/\(\d+\)$/, "").trim();
      const winButton = row.querySelectorAll("button")[0];
      const price = parseFloat(winButton?.querySelector("span")?.textContent.trim());

      if (name && !Number.isNaN(price)) runners.push({ name, price });
    }
    return runners;
  }

  function scrapeMarketClosed() {
    const hasClosedBadge = [...document.querySelectorAll("*")].some(
      (el) => el.textContent.trim() === "Closed" && el.children.length === 0
    );
    return hasClosedBadge ? true : undefined;
  }

  let lastSentSignature = null;
  let everSentRealPrices = false;

  function sendUpdateIfChanged() {
    const marketClosed = scrapeMarketClosed();
    const runners = marketClosed && everSentRealPrices ? [] : scrapeRunners();
    if (runners.length > 0) everSentRealPrices = true;
    if (runners.length === 0 && marketClosed === undefined) return;

    const signature = JSON.stringify({ runners, marketClosed });
    if (signature === lastSentSignature) return;
    lastSentSignature = signature;

    try {
      chrome.runtime.sendMessage({
        type: "BETMAKER_ODDS_UPDATED",
        bookieId,
        odds: {
          runners,
          ...(marketClosed !== undefined && { marketClosed }),
          scrapedAt: Date.now(),
          url: location.href,
        },
      });
    } catch {
      // Extension context invalidated (e.g. the extension was reloaded
      // while this tab stayed open) — the observer will try again on the
      // next mutation; nothing to do about this one.
    }
  }

  const DEBOUNCE_MS = 50;
  const MAX_WAIT_MS = 150;
  let debounceTimer = null;
  let pendingSince = null;

  function scheduleUpdate() {
    const now = Date.now();
    if (pendingSince === null) pendingSince = now;

    clearTimeout(debounceTimer);

    if (now - pendingSince >= MAX_WAIT_MS) {
      pendingSince = null;
      sendUpdateIfChanged();
      return;
    }

    debounceTimer = setTimeout(() => {
      pendingSince = null;
      sendUpdateIfChanged();
    }, DEBOUNCE_MS);
  }

  new MutationObserver(scheduleUpdate).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  scheduleUpdate(); // initial snapshot once the page has rendered
})();

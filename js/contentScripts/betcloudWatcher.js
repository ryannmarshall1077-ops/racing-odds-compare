// Persistent content script (declared in manifest.json — one entry per
// BetCloud tenant domain, all pointing at this same file) that watches
// for a BetCloud-tenant page's own front-end updating Win odds, and
// pushes fresh values to background.js the moment they change. Serves
// every tenant in bookies.js's own "betcloud" BOOKIE_TIERS group
// (Bet777, BetGalaxy, BetProfessor, ChromaBet, GoldenBet888, JuicyBet,
// JungleBet, QuestBet, TitanBet, WellBet, EpicOdds) through one shared
// file rather than 11 near-duplicate watchers — confirmed live to share
// identical DOM structure (Chakra UI, the same `data-cy` test-hook
// attributes) and a shared race-id database (the exact same
// venueId/raceId resolves to the same real race on every tenant
// checked) — but NOT shared pricing: the same real race's Win price
// genuinely differs slightly between tenants (confirmed live, e.g.
// Bet777 19.00 vs BetGalaxy 19.50 for the same runner), so this is
// architecturally like the BetMaker platform (js/betmaker/api.js), not
// the fully-identical-pricing Amused/Black Stream platform
// (js/amused/api.js).
//
// DOM-scraped, not a live feed call — see betcloud.js's own comment
// for why: the real API (`api.<tenant>.com.au/punter/...`) sends a
// proprietary `x-bc-attn` attestation header this project deliberately
// does not attempt to replicate.
(() => {
  const HOSTNAME_TO_BOOKIE_ID = {
    "bet777.com.au": "bet777",
    "betgalaxy.com.au": "betgalaxy",
    "betprofessor.com.au": "betprofessor",
    "chromabet.com.au": "chromabet",
    "goldenbet888.com.au": "goldenbet888",
    "juicybet.com.au": "juicybet",
    "junglebet.com.au": "junglebet",
    "questbet.com.au": "questbet",
    "titanbet.com.au": "titanbet",
    "wellbet.com.au": "wellbet",
    "epicodds.com.au": "epicodds",
  };

  const hostname = location.hostname.replace(/^www\./, "");
  const bookieId = HOSTNAME_TO_BOOKIE_ID[hostname];
  if (!bookieId) return; // shouldn't happen given manifest.json's own match patterns, but no tenant to tag as otherwise

  // Identical scraping logic to betcloud.js — see that file's own
  // comment for the full "data-cy" / favourite-badge discovery story.
  function scrapeRunners() {
    const runners = [];
    for (const row of document.querySelectorAll('[data-cy="raceRunnerListItem"]')) {
      const name = row.querySelector('[data-cy="displayName"]')?.textContent.trim();
      const winBtn = row.querySelector('[data-cy="selectWin"]');
      const priceEl = winBtn?.querySelector(".btn-span > p");
      const price = priceEl ? parseFloat(priceEl.textContent.trim()) : NaN;
      if (name && !Number.isNaN(price)) runners.push({ name, price });
    }
    return runners;
  }

  // Confirmed live: a resulted race carries a standalone "RESULTED"
  // badge — absent on a still-open race. Unlike BetDeluxe/Amused's own
  // pages, BetCloud keeps showing each runner's own final Win price
  // even once resulted rather than blanking the button out — but this
  // watcher still reports an empty runners array once closed (same
  // freeze convention every other watcher here already follows,
  // relying on applyBookieOdds' own last-known-price freeze in
  // background.js rather than trusting a resulted page's own display).
  function scrapeMarketClosed() {
    const hasResultedBadge = [...document.querySelectorAll("*")].some(
      (el) => el.children.length === 0 && el.textContent.trim().toUpperCase() === "RESULTED"
    );
    return hasResultedBadge ? true : undefined;
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
        type: "BETCLOUD_ODDS_UPDATED",
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
      // while this tab stayed open) — the observer will try again on
      // the next mutation; nothing to do about this one.
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

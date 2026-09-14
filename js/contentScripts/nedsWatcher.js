// Persistent content script (declared in manifest.json, auto-injected on
// every Neds race page load/navigation) that watches for Neds' own
// front-end updating Fixed Odds Win prices, and pushes fresh values to
// background.js the moment they change — same approach as
// sportsbetWatcher.js/tabWatcher.js/ladbrokesWatcher.js.
//
// Deliberately a near-verbatim clone of ladbrokesWatcher.js, not a
// coincidence: confirmed live that Neds runs on the exact same
// underlying platform as Ladbrokes — identical data-testid attributes on
// every element this scrapes (runner-row/runner-name/price-button/
// price-button-racing/race-card-header-countdown), right down to the
// same "final" text on a resulted race's countdown. See js/neds/api.js's
// own comment for the same finding on the GraphQL side. Kept as its own
// file rather than shared, matching every other bookie's own watcher —
// if Neds' platform ever diverges from Ladbrokes' down the line, there's
// nothing shared to accidentally break for both at once.
(() => {
  function scrapeRunners() {
    const rows = document.querySelectorAll('[data-testid="runner-row"]');
    const runners = [];

    for (const row of rows) {
      // Scratched runners aren't rendered as a row at all (confirmed
      // live, same as Ladbrokes) — no scratched-row filter needed here.
      const nameEl = row.querySelector('[data-testid="runner-name"]');
      // Fixed Win is always the first price-button column (confirmed
      // live, same column order as Ladbrokes) — the nested
      // price-button-racing, not the outer price-button itself, since
      // the favourite runner's own price-button also holds a "FAV"
      // badge <div> as a sibling of the actual price (see
      // ladbrokesWatcher.js's own comment for the full story — the
      // exact same markup quirk, confirmed live here too).
      const priceEl = row
        .querySelectorAll('[data-testid="price-button"]')[0]
        ?.querySelector('[data-testid="price-button-racing"]');

      const name = nameEl?.textContent.trim();
      const price = parseFloat(priceEl?.textContent.trim());

      if (name && !Number.isNaN(price)) {
        runners.push({ name, price });
      }
    }

    return runners;
  }

  // Whether Neds itself has actually closed betting on this race — the
  // true "gone in-play" signal (Betfair's own status is unusable for
  // this — see sportsbetWatcher.js's own comment). Confirmed directly
  // against real race pages: [data-testid="race-card-header-countdown"]
  // holds a live duration while open, and switches to "final" once
  // resulted — identical behaviour to Ladbrokes.
  const DURATION_PATTERN = /^-?\d+m?\s*\d*s?$/;
  function scrapeMarketClosed() {
    const el = document.querySelector('[data-testid="race-card-header-countdown"]');
    const text = el?.textContent?.trim();
    return text && !DURATION_PATTERN.test(text) ? true : undefined;
  }

  let lastSentSignature = null;
  // See sportsbetWatcher.js's/ladbrokesWatcher.js's own copy of this
  // flag for the full reasoning: without it, a page loaded straight onto
  // an already-resulted race (never seen live) would freeze on an EMPTY
  // runners array forever instead of ever capturing the real closing
  // price.
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
        type: "NEDS_ODDS_UPDATED",
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

  // Same debounce-with-max-wait reasoning as sportsbetWatcher.js/
  // tabWatcher.js/ladbrokesWatcher.js.
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

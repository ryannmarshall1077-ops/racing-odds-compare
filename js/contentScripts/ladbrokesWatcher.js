// Persistent content script (declared in manifest.json, auto-injected on
// every Ladbrokes race page load/navigation) that watches for Ladbrokes'
// own front-end updating Fixed Odds Win prices, and pushes fresh values
// to background.js the moment they change — same approach as
// sportsbetWatcher.js/tabWatcher.js. Selectors match ladbrokes.js's (see
// its comment for why this is DOM scraping, not an internal API).
//
// v1 limitation, deliberate: unlike Sportsbet (a public NextEvents feed)
// or TAB (venue codes learned from its meetings pages), Ladbrokes has no
// way found yet to build a race's URL ahead of time — every race page
// lives at an opaque per-race GUID
// (/racing/<venue-slug>/<guid>) with no derivable pattern, and the
// overview page's own race-number grid has no real <a href> at all (pure
// client-side Vue routing, confirmed live). So there's no ladbrokesUrl
// for popup.js's openRaceTabs to auto-open yet — same starting point
// Sportsbet and TAB both had before their own auto-matching existed (see
// README). For now this only helps once the user already has a matching
// Ladbrokes race page open in some tab; matching by runner name (see
// applyBookieOdds, background.js) does the rest.
(() => {
  function scrapeRunners() {
    const rows = document.querySelectorAll('[data-testid="runner-row"]');
    const runners = [];

    for (const row of rows) {
      // Scratched runners aren't rendered as a row at all on Ladbrokes
      // (confirmed live: a field missing 4 of its original runners had
      // exactly as many runner-row elements as remained, no placeholder
      // rows for the scratched ones) — unlike TAB, no scratched-row
      // filter is needed here.
      const nameEl = row.querySelector('[data-testid="runner-name"]');
      // 4-5 price columns per row (Fixed Win, Fixed Place, Starting
      // Price, Mid Tote Win, sometimes Best Tote/SP), always in that
      // order — Fixed Win is index 0. Confirmed live across every
      // runner in several real races; no per-column testid to key off
      // instead. The nested price-button-racing (not the outer
      // price-button itself) — user-reported/live-confirmed the
      // favourite runner's own price was missing entirely: its
      // price-button also holds a "FAV" badge <div> as a sibling of
      // the actual price <button>, so the OUTER element's own
      // textContent reads "FAV2.90" (parseFloat of that is NaN, price
      // dropped) while every non-favourite runner's plain price text
      // parsed fine. price-button-racing is the inner element that
      // holds only the number, on every runner, favourite or not.
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

  // Whether Ladbrokes itself has actually closed betting on this race —
  // the true "gone in-play" signal per the user's own explicit direction
  // (Betfair can and does stay tradeable well past the real jump, so its
  // own status is unusable for this). Confirmed directly against real
  // race pages: [data-testid="race-card-header-countdown"] holds a live
  // duration ("20m") while open, and switches to a status word once
  // betting closes — "final" confirmed on an already-resulted race
  // (rendered as "Final" via a CSS capitalize class, so the raw text
  // itself is lowercase). Checking "isn't a duration" instead of
  // allow-listing specific wording covers that and anything phrased
  // differently (e.g. an interim result), same reasoning as
  // sportsbetWatcher.js/tabWatcher.js's own version of this check.
  const DURATION_PATTERN = /^-?\d+m?\s*\d*s?$/;
  function scrapeMarketClosed() {
    const el = document.querySelector('[data-testid="race-card-header-countdown"]');
    const text = el?.textContent?.trim();
    return text && !DURATION_PATTERN.test(text) ? true : undefined;
  }

  let lastSentSignature = null;

  function sendUpdateIfChanged() {
    const marketClosed = scrapeMarketClosed();
    // Same reasoning as sportsbetWatcher.js: stop scraping prices the
    // moment betting closes rather than risk feeding stale/misaligned
    // in-play numbers into the comparison table.
    const runners = marketClosed ? [] : scrapeRunners();
    if (runners.length === 0 && marketClosed === undefined) return;

    const signature = JSON.stringify({ runners, marketClosed });
    if (signature === lastSentSignature) return;
    lastSentSignature = signature;

    try {
      chrome.runtime.sendMessage({
        type: "LADBROKES_ODDS_UPDATED",
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
  // tabWatcher.js — a busy race page mutates almost continuously (flucs,
  // countdowns), so a pure debounce could go a long time without ever
  // firing.
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

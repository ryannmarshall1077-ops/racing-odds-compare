// Persistent content script (declared in manifest.json, auto-injected on
// every BetRight race page load/navigation) that polls BetRight's own
// public REST feed (js/betright/api.js has the full discovery story) for
// this exact race's live runner prices, and pushes fresh values to
// background.js the moment they change — same "poll the real feed
// directly instead of scraping the DOM" approach unibetWatcher.js/
// palmerbetWatcher.js/betdeluxeWatcher.js already use.
(() => {
  // /racing/<venue-slug>/<raceNumber>/<eventId>/win — the exact same
  // eventId segment buildBetRightRaceUrl (js/betright/api.js) put in the
  // URL to begin with. Re-read on every poll tick (not cached once at
  // load) so this keeps following the right race if the user navigates
  // to a different one from within the same still-open tab, without
  // needing its own separate navigation listener.
  function currentEventId() {
    return location.pathname.match(/^\/racing\/[^/]+\/\d+\/(\d+)/)?.[1] || null;
  }

  async function fetchEvent(eventId) {
    const response = await fetch(`https://next-api.betright.com.au/Racing/Event?eventId=${eventId}`);
    if (!response.ok) throw new Error(`BetRight Event error: HTTP ${response.status}`);
    return response.json();
  }

  // Scratched runners carry scratched: true (confirmed live) with a
  // meaningless 0 WIN price — skipped outright, same "no reliable
  // number to show" convention every other bookie's own scraper already
  // follows.
  function extractRunners(event) {
    const runners = [];
    for (const outcome of event.outcomes || []) {
      if (outcome.scratched) continue;
      const win = outcome.fixedPrices?.find((p) => p.marketTypeCode === "WIN");
      if (win?.price != null && win.price > 0) {
        runners.push({ name: outcome.outcomeName, price: win.price });
      }
    }
    return runners;
  }

  const POLL_MS = 3000;
  let lastSentSignature = null;
  // See sportsbetWatcher.js's own copy of this flag for the full
  // reasoning: without it, a page loaded straight onto an already-
  // resulted race (never seen live) would freeze on an EMPTY runners
  // array forever instead of ever capturing the real closing price.
  let everSentRealPrices = false;

  async function poll() {
    const eventId = currentEventId();
    if (!eventId) return; // not actually on a race's own URL shape

    let event;
    try {
      event = await fetchEvent(eventId);
    } catch {
      return; // transient hiccup — the next tick tries again
    }
    if (!event) return;

    // Confirmed live against a genuinely resulted race (Wellington R1,
    // winner "Fearn Trick"): isOpenForBetting is true while open, false
    // once resulted — a plain boolean, no enum-value guesswork needed.
    const marketClosed = !event.isOpenForBetting;
    const runners = marketClosed && everSentRealPrices ? [] : extractRunners(event);
    if (runners.length > 0) everSentRealPrices = true;

    const signature = JSON.stringify({ runners, marketClosed });
    if (signature === lastSentSignature) return;
    lastSentSignature = signature;

    try {
      chrome.runtime.sendMessage({
        type: "BETRIGHT_ODDS_UPDATED",
        odds: { runners, marketClosed, scrapedAt: Date.now(), url: location.href },
      });
    } catch {
      // Extension context invalidated (e.g. the extension was reloaded
      // while this tab stayed open) — the next tick will try again.
    }
  }

  poll(); // initial snapshot as soon as this script runs
  setInterval(poll, POLL_MS);
})();

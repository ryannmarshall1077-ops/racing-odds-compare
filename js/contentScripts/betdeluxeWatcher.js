// Persistent content script (declared in manifest.json, auto-injected on
// every BetDeluxe race page load/navigation) that polls BetDeluxe's own
// public REST feed (js/betdeluxe/api.js has the full discovery story)
// for this exact race's live runner prices, and pushes fresh values to
// background.js the moment they change — same "poll the real feed
// directly instead of scraping the DOM" approach unibetWatcher.js/
// palmerbetWatcher.js already use, for the same reason: a clean
// structured feed with nothing worth scraping a DOM for.
(() => {
  // /racing/<Sport>/<Country>/<Venue>/<meetId>/<raceNumber>/<raceId> — the
  // exact same meetId/raceId segments buildBetDeluxeRaceUrl (js/betdeluxe/
  // api.js) put in the URL to begin with. Re-read on every poll tick (not
  // cached once at load) so this keeps following the right race if the
  // user clicks a different race number from within the same still-open
  // tab (BetDeluxe's own race-number tab strip does a client-side route
  // change, not a full reload), without needing its own separate
  // navigation listener.
  function currentRaceLocation() {
    const match = location.pathname.match(/^\/racing\/[^/]+\/[^/]+\/[^/]+\/(\d+)\/\d+\/(\d+)/);
    if (!match) return null;
    return { meetId: match[1], raceId: match[2] };
  }

  async function fetchRace(meetId, raceId) {
    const response = await fetch(`https://api.blackstream.com.au/api/racing/v2/meetings/${meetId}/races/${raceId}/racecard`);
    if (!response.ok) throw new Error(`BetDeluxe racecard error: HTTP ${response.status}`);
    const { data } = await response.json();
    return data?.race || null;
  }

  // Scratched runners carry isScratched: true (confirmed live against a
  // real scratching) with a meaningless trailing 0 in their own
  // winPrices array — skipped outright, same "no reliable number to
  // show" convention every other bookie's own scraper already follows.
  // The CURRENT fixed win price is the LAST element of winPrices
  // (confirmed live against the page's own displayed price — the array
  // is a short flucs history, oldest first).
  function extractRunners(race) {
    const runners = [];
    for (const runner of race.runners || []) {
      if (runner.isScratched) continue;
      const prices = runner.winPrices;
      const price = prices?.[prices.length - 1];
      if (price != null && price > 0) runners.push({ name: runner.runnerName, price });
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
    const loc = currentRaceLocation();
    if (!loc) return; // not actually on a race's own URL shape

    let race;
    try {
      race = await fetchRace(loc.meetId, loc.raceId);
    } catch {
      return; // transient hiccup — the next tick tries again
    }
    if (!race) return;

    // Confirmed live: race.status is 1 while a race is open, 5 once
    // resulted (a genuinely resulted Wodonga race, cross-checked against
    // this same race's own isOpenForBetting: false). Treated permissively
    // (anything other than 1) rather than allow-listing just 5, in case
    // an abandoned/suspended race uses a third value never seen.
    const marketClosed = race.status !== 1;
    const runners = marketClosed && everSentRealPrices ? [] : extractRunners(race);
    if (runners.length > 0) everSentRealPrices = true;

    const signature = JSON.stringify({ runners, marketClosed });
    if (signature === lastSentSignature) return;
    lastSentSignature = signature;

    try {
      chrome.runtime.sendMessage({
        type: "BETDELUXE_ODDS_UPDATED",
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

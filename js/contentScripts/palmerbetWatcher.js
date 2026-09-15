// Persistent content script (declared in manifest.json, auto-injected on
// every Palmerbet race page load/navigation) that polls Palmerbet's own
// public REST feed (js/palmerbet/api.js has the full discovery story) for
// this exact race's live runner prices, and pushes fresh values to
// background.js the moment they change — same "poll the real feed
// directly instead of scraping the DOM" approach unibetWatcher.js uses,
// for the same reason: Palmerbet already hands this content script a
// clean, structured JSON feed for the exact same data a DOM scrape would
// otherwise have to reconstruct.
//
// Two separate calls are needed per poll, not one — confirmed live: the
// race-detail endpoint (runners, isScratched, the race's own real
// status) doesn't carry any price at all, and the market endpoint (the
// live Fixed price per runner) doesn't carry isScratched — so a runner's
// full picture only exists by combining both, matched on runnerNumber.
(() => {
  const FIXTURE_URL = "https://fixture.palmerbet.online/fixtures/racing";
  const POLL_MS = 3000;

  // /racing/<sport>/<dd-mm-yyyy>/<venue>/<raceNumber> — the exact same
  // segments buildPalmerbetRaceUrl (js/palmerbet/api.js) put in the URL
  // to begin with. Re-read on every poll tick (not cached once at load)
  // so this keeps following the right race if the user navigates to a
  // different one from within the same still-open tab (Palmerbet's own
  // race-number tab strip does a client-side route change, not a full
  // reload), without needing its own separate navigation listener.
  const RACE_TYPE_FROM_SEGMENT = { horse: "HorseRacing", greyhound: "GreyhoundRacing", harness: "HarnessRacing" };

  function currentRaceLocation() {
    const match = location.pathname.match(
      /^\/racing\/([a-z]+)\/(\d{2})-(\d{2})-(\d{4})\/([^/]+)\/(\d+)/
    );
    if (!match) return null;
    const [, sportSegment, dd, mm, yyyy, venue, raceNumber] = match;
    const raceType = RACE_TYPE_FROM_SEGMENT[sportSegment];
    if (!raceType) return null;
    return { raceType, dateIso: `${yyyy}-${mm}-${dd}`, venue: decodeURIComponent(venue), raceNumber };
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Palmerbet fetch error: HTTP ${response.status}`);
    return response.json();
  }

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
      const { race: fetchedRace } = await fetchJson(
        `${FIXTURE_URL}/${loc.dateIso}/${loc.raceType}/${encodeURIComponent(loc.venue)}/${loc.raceNumber}?channel=website`
      );
      race = fetchedRace;
    } catch {
      return; // transient hiccup — the next tick tries again
    }
    if (!race) return;

    // Confirmed live against a genuinely resulted race (Hamilton R1,
    // winner "High Falls" — the same real race cross-checked against
    // every other bookie throughout this whole project): race.status is
    // "Open" while live, "Final" once resulted. Unlike Unibet's own
    // event.status (never actually observed changing live), this is a
    // verified enum transition, not an inferred one — still treated
    // permissively (anything other than "Open") rather than allow-
    // listing just "Final", in case an abandoned/suspended race uses a
    // third value never seen.
    const marketClosed = race.status !== "Open";

    let runners = [];
    if (!(marketClosed && everSentRealPrices)) {
      const winMarket = (race.markets || []).find((m) => /Win$/.test(m.type));
      if (winMarket) {
        try {
          const { market } = await fetchJson(
            `${FIXTURE_URL}/${loc.raceType}/markets/${winMarket.id}?channel=website`
          );
          const scratchedNumbers = new Set(
            (race.runners || []).filter((r) => r.isScratched).map((r) => r.number)
          );
          for (const outcome of market.outcomes || []) {
            if (outcome.status !== "Active" || scratchedNumbers.has(outcome.runnerNumber)) continue;
            const fixed = outcome.prices?.find((p) => p.name === "Fixed")?.priceSnapshot?.current;
            if (fixed != null) runners.push({ name: outcome.title, price: fixed });
          }
        } catch {
          // Race detail came through fine but the market call itself
          // hiccuped — leaves runners empty for this one tick rather
          // than sending a stale marketClosed with no prices to match;
          // the next tick tries again.
          return;
        }
      }
    }
    if (runners.length > 0) everSentRealPrices = true;

    const signature = JSON.stringify({ runners, marketClosed });
    if (signature === lastSentSignature) return;
    lastSentSignature = signature;

    try {
      chrome.runtime.sendMessage({
        type: "PALMERBET_ODDS_UPDATED",
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

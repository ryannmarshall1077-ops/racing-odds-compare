// Persistent content script (declared in manifest.json — one entry per
// Amused/Blackstream tenant domain, all pointing at this same file)
// that polls Black Stream's own public REST feed (js/amused/api.js has
// the full discovery story) for this exact race's live runner prices,
// and pushes fresh values to background.js the moment they change.
// Serves every tenant in js/amused/api.js's own AMUSED_TENANTS
// (BetNation, BigBet, Surge, Noisy, PulseBet, BetJet, MightyBet,
// BetExpress, YesBet) through one shared file rather than 9 near-
// duplicate watchers — content-identical to betdeluxeWatcher.js (same
// backend, confirmed live to return byte-identical prices regardless
// of which tenant's own domain the request comes from), except for
// resolving which bookieId to tag its own messages with.
//
// BetDeluxe itself already has its own dedicated betdeluxeWatcher.js —
// left untouched rather than folded into this shared file, so this one
// is only ever loaded on the 9 OTHER tenants' own domains.
(() => {
  const HOSTNAME_TO_BOOKIE_ID = {
    "betnation.com.au": "betnation",
    "bigbet.com.au": "bigbet",
    "surge.com.au": "surge",
    "noisy.com.au": "noisy",
    "pulsebet.com.au": "pulsebet",
    "betjet.com.au": "betjet",
    "mightybet.com.au": "mightybet",
    "betexpress.com.au": "betexpress",
    "yesbet.com.au": "yesbet",
  };

  const hostname = location.hostname.replace(/^www\./, "");
  const bookieId = HOSTNAME_TO_BOOKIE_ID[hostname];
  if (!bookieId) return; // shouldn't happen given manifest.json's own match patterns, but no tenant to tag as otherwise

  // Identical logic to betdeluxeWatcher.js — see that file's own
  // comment for the full discovery story (scratched runners/
  // race.status/winPrices-array shape), all independently re-confirmed
  // live against this same backend from a different tenant's own
  // domain before this shipped.
  function currentRaceLocation() {
    const match = location.pathname.match(/^\/racing\/[^/]+\/[^/]+\/[^/]+\/(\d+)\/\d+\/(\d+)/);
    if (!match) return null;
    return { meetId: match[1], raceId: match[2] };
  }

  async function fetchRace(meetId, raceId) {
    const response = await fetch(`https://api.blackstream.com.au/api/racing/v2/meetings/${meetId}/races/${raceId}/racecard`);
    if (!response.ok) throw new Error(`Black Stream racecard error: HTTP ${response.status}`);
    const { data } = await response.json();
    return data?.race || null;
  }

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

    const marketClosed = race.status !== 1;
    const runners = marketClosed && everSentRealPrices ? [] : extractRunners(race);
    if (runners.length > 0) everSentRealPrices = true;

    const signature = JSON.stringify({ runners, marketClosed });
    if (signature === lastSentSignature) return;
    lastSentSignature = signature;

    try {
      chrome.runtime.sendMessage({
        type: "AMUSED_ODDS_UPDATED",
        bookieId,
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

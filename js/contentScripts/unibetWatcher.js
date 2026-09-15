// Persistent content script (declared in manifest.json, auto-injected on
// every Unibet race page load/navigation) that polls Unibet's own public
// GraphQL feed (js/unibet/api.js has the full discovery story) for this
// exact race's live runner prices, and pushes fresh values to
// background.js the moment they change.
//
// A genuinely different shape from every other bookie's own watcher here
// — Unibet's race page is a hash-routed SPA (#/event/<eventKey>) with no
// stable, easily-scraped DOM structure of its own worth relying on, but
// it already hands this content script a clean, structured JSON feed for
// the exact same data a DOM scrape would otherwise have to reconstruct
// (runner name, Fixed Win price, Scratched status) — polled directly via
// fetch() on an interval instead of a MutationObserver watching for DOM
// changes, since there's no live-updating DOM to watch here at all until
// this script's own poll re-renders it.
(() => {
  const GRAPHQL_URL = "https://rsa.unibet.com.au/api/v1/graphql";
  const EVENT_QUERY_HASH = "fd256aba334b359ae57e55a4eddf6d1ad8f4559a5d13b08dc924ccaa5bc51b38";
  const POLL_MS = 3000;

  // #/event/<eventKey> — the exact same eventKey buildUnibetRaceUrl
  // (js/unibet/api.js) put in the URL to begin with. Re-read on every
  // poll tick (not cached once at load) so this keeps following the
  // right race if the user clicks a different one from within the same
  // still-open SPA tab, without needing its own separate hash-change
  // listener.
  function currentEventKey() {
    return location.hash.match(/^#\/event\/([^/?#]+)/)?.[1] || null;
  }

  async function fetchEvent(eventKey) {
    const variables = JSON.stringify({ clientCountryCode: "AU", eventKey, fetchTRC: false });
    const extensions = JSON.stringify({
      persistedQuery: { version: 1, sha256Hash: EVENT_QUERY_HASH },
    });
    const url =
      `${GRAPHQL_URL}?operationName=EventQuery&variables=${encodeURIComponent(variables)}` +
      `&extensions=${encodeURIComponent(extensions)}`;

    const response = await fetch(url, {
      headers: { "apollo-require-preflight": "true", "x-apollo-operation-name": "EventQuery" },
    });
    if (!response.ok) throw new Error(`Unibet EventQuery error: HTTP ${response.status}`);

    const { data, errors } = await response.json();
    if (errors?.length) throw new Error(`Unibet EventQuery error: ${errors[0].message}`);
    return data?.viewer?.event || null;
  }

  // Scratched runners carry competitor.status "Scratched" (confirmed
  // live against several real races with real scratchings) rather than
  // "Starter" — skipped outright, same "no reliable number to show"
  // convention every other bookie's own scraper already follows for a
  // runner it can't quote. A runner's own FixedWin entry (not the
  // top-level competitor.price, which is always null on this feed) is
  // the real quoted price.
  function extractRunners(event) {
    const runners = [];
    for (const competitor of event.competitors || []) {
      if (competitor.status === "Scratched") continue;
      const fixedWin = competitor.prices?.find((p) => p.betType === "FixedWin");
      if (fixedWin?.price != null) {
        runners.push({ name: competitor.name, price: fixedWin.price });
      }
    }
    return runners;
  }

  let lastSentSignature = null;
  // See sportsbetWatcher.js's own copy of this flag for the full
  // reasoning: without it, a page loaded straight onto an already-
  // resulted race (never seen live) would freeze on an EMPTY runners
  // array forever instead of ever capturing the real closing price.
  let everSentRealPrices = false;

  async function poll() {
    const eventKey = currentEventKey();
    if (!eventKey) return; // not actually on a race's own #/event/ route

    let event;
    try {
      event = await fetchEvent(eventKey);
    } catch {
      // A transient network hiccup or an eventKey the feed doesn't (yet)
      // recognise — the next tick tries again; nothing to send this time.
      return;
    }
    if (!event) return;

    // Unibet's own event.status enum wasn't seen reach anything other
    // than "Open" while this was being built (every race checked live
    // was still hours from jumping) — treated permissively as "anything
    // that isn't literally Open means betting's no longer live" rather
    // than allow-listing specific closed-state values never actually
    // observed, same defensive-but-unverified posture PointsBet's own
    // market-closed check originally needed before it could be narrowed
    // down against a real resulted race.
    const marketClosed = event.status !== "Open";
    const runners = marketClosed && everSentRealPrices ? [] : extractRunners(event);
    if (runners.length > 0) everSentRealPrices = true;

    const signature = JSON.stringify({ runners, marketClosed });
    if (signature === lastSentSignature) return;
    lastSentSignature = signature;

    try {
      chrome.runtime.sendMessage({
        type: "UNIBET_ODDS_UPDATED",
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

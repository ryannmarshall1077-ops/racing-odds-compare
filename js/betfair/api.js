// Thin wrapper around the Betfair Sports API-NG betting endpoints.
// Docs: https://docs.developer.betfair.com/display/1smk3cen4v3lu3yomq5qye0ni/Betting+Type+Definitions

async function betfairApiCall(appKey, sessionToken, method, params) {
  const response = await fetch(
    `https://api.betfair.com/exchange/betting/rest/v1.0/${method}/`,
    {
      method: "POST",
      headers: {
        "X-Application": appKey,
        "X-Authentication": sessionToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(params),
    }
  );

  const data = await response.json();

  if (!response.ok || data.faultstring) {
    const code = data.detail?.APINGException?.errorCode || data.faultstring;
    throw new Error(`Betfair API error (${method}): ${code || response.status}`);
  }

  return data;
}

// Event type IDs aren't guaranteed stable across regions, so look names up
// rather than hardcoding numbers. Takes multiple names in one call (a
// single listEventTypes response already contains all of them — no reason
// to round-trip once per sport) and returns a Map from name -> id. Throws
// if any requested name isn't found, so a typo fails loudly rather than
// silently querying the wrong (or no) sport.
async function findEventTypeIds(appKey, sessionToken, eventTypeNames) {
  const results = await betfairApiCall(appKey, sessionToken, "listEventTypes", {
    filter: {},
  });

  const byName = new Map(results.map((r) => [r.eventType.name, r.eventType.id]));
  const missing = eventTypeNames.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`Betfair event type(s) not found: ${missing.join(", ")}`);
  }

  return new Map(eventTypeNames.map((name) => [name, byName.get(name)]));
}

// eventTypeIds is an array — Betfair's filter already accepts multiple, so
// e.g. horse + greyhound racing's soonest-starting markets can be found in
// one call (sort + maxResults apply across the combined set) instead of
// querying each sport separately and merging client-side.
//
// `to` is optional — an ISO timestamp bounding how far forward to look
// (e.g. end of today), for callers that want "every race up to some
// point" rather than just "the next N regardless of how far out that
// reaches". Omitted, this is unbounded going forward — the single
// soonest-race lookup (refreshRaceInner, maxResults 1) wants that: late
// at night with nothing left today, it should still find tomorrow's
// first race rather than coming back empty.
async function listWinMarkets(appKey, sessionToken, eventTypeIds, maxResults = 1, to) {
  return betfairApiCall(appKey, sessionToken, "listMarketCatalogue", {
    filter: {
      eventTypeIds,
      marketCountries: ["AU"],
      marketTypeCodes: ["WIN"],
      // Excludes markets that have already jumped — listMarketCatalogue
      // otherwise keeps returning an in-play/just-closed race until it's
      // fully settled, well after it's no longer useful to show.
      marketStartTime: { from: new Date().toISOString(), ...(to && { to }) },
    },
    // EVENT_TYPE lets callers tell which sport a market belongs to
    // (market.eventType.name) without having to separately remember which
    // eventTypeId they asked for — needed once queries span more than one
    // sport, since listMarketsByIds (below) doesn't take an eventTypeId at
    // all and would otherwise have no way to know.
    marketProjection: ["RUNNER_DESCRIPTION", "EVENT", "EVENT_TYPE", "MARKET_START_TIME"],
    sort: "FIRST_TO_START",
    maxResults,
  });
}

async function listMarketsByIds(appKey, sessionToken, marketIds) {
  return betfairApiCall(appKey, sessionToken, "listMarketCatalogue", {
    filter: { marketIds },
    marketProjection: ["RUNNER_DESCRIPTION", "EVENT", "EVENT_TYPE", "MARKET_START_TIME"],
    maxResults: marketIds.length,
  });
}

async function getMarketBook(appKey, sessionToken, marketIds) {
  return betfairApiCall(appKey, sessionToken, "listMarketBook", {
    marketIds,
    priceProjection: { priceData: ["EX_BEST_OFFERS"] },
  });
}

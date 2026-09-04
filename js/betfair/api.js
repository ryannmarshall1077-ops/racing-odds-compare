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

// Event type IDs aren't guaranteed stable across regions, so look "Horse
// Racing" up by name rather than hardcoding a number.
async function findEventTypeId(appKey, sessionToken, eventTypeName) {
  const results = await betfairApiCall(appKey, sessionToken, "listEventTypes", {
    filter: {},
  });

  const match = results.find((r) => r.eventType.name === eventTypeName);
  if (!match) {
    throw new Error(`Betfair event type "${eventTypeName}" not found`);
  }
  return match.eventType.id;
}

async function listWinMarkets(appKey, sessionToken, eventTypeId, maxResults = 1) {
  return betfairApiCall(appKey, sessionToken, "listMarketCatalogue", {
    filter: {
      eventTypeIds: [eventTypeId],
      marketCountries: ["AU"],
      marketTypeCodes: ["WIN"],
      // Excludes markets that have already jumped — listMarketCatalogue
      // otherwise keeps returning an in-play/just-closed race until it's
      // fully settled, well after it's no longer useful to show.
      marketStartTime: { from: new Date().toISOString() },
    },
    marketProjection: ["RUNNER_DESCRIPTION", "EVENT", "MARKET_START_TIME"],
    sort: "FIRST_TO_START",
    maxResults,
  });
}

async function getMarketBook(appKey, sessionToken, marketIds) {
  return betfairApiCall(appKey, sessionToken, "listMarketBook", {
    marketIds,
    priceProjection: { priceData: ["EX_BEST_OFFERS"] },
  });
}

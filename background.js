importScripts("js/betfair/auth.js", "js/betfair/api.js");

chrome.runtime.onInstalled.addListener(() => {
  console.log("RaceOdds installed");
});

// Fetches the next upcoming AU horse racing WIN market and its current
// Betfair prices. The bookmaker column is a placeholder markup on the
// Betfair price until a real bookmaker source is wired in (see README).
async function refreshRace() {
  const stored = await chrome.storage.local.get([
    "betfairAppKey",
    "betfairSessionToken",
  ]);

  if (!stored.betfairAppKey || !stored.betfairSessionToken) {
    throw new Error("Not connected to Betfair yet — set this up in Options.");
  }

  const { betfairAppKey: appKey, betfairSessionToken: sessionToken } = stored;

  const eventTypeId = await findEventTypeId(appKey, sessionToken, "Horse Racing");
  const markets = await listWinMarkets(appKey, sessionToken, eventTypeId, 1);

  if (markets.length === 0) {
    throw new Error("No upcoming AU horse racing WIN markets found right now.");
  }

  const market = markets[0];
  const [book] = await getMarketBook(appKey, sessionToken, [market.marketId]);
  const runnerNames = new Map(
    market.runners.map((r) => [r.selectionId, r.runnerName])
  );

  const runners = book.runners
    .filter((r) => r.status === "ACTIVE")
    .map((r) => {
      const betfairPrice = r.ex?.availableToBack?.[0]?.price ?? null;
      return {
        name: runnerNames.get(r.selectionId) || `Runner ${r.selectionId}`,
        betfair: betfairPrice,
        bookmaker: betfairPrice ? Number((betfairPrice * 1.08).toFixed(2)) : null,
      };
    })
    .filter((r) => r.betfair !== null);

  const race = {
    race: `${market.event.venue || market.event.name} — ${market.marketName}`,
    runners,
    source: "live-betfair",
    fetchedAt: Date.now(),
  };

  await chrome.storage.local.set({ liveRace: race });
  return race;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "REFRESH_RACE") {
    refreshRace()
      .then((race) => sendResponse({ ok: true, race }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep the message channel open for the async response
  }
});

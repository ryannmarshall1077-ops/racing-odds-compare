importScripts("js/betfair/auth.js", "js/betfair/api.js", "js/sportsbet/api.js");

const AUTO_REFRESH_ALARM = "refreshRace";
const BOOKMAKER_ODDS_MAX_AGE_MS = 10 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
  console.log("RaceOdds installed");
});

// Service workers restart often; re-registering an existing alarm by name is
// a no-op, so it's safe (and necessary) to call this on every worker startup
// rather than only from onInstalled.
async function ensureAutoRefreshAlarm() {
  const existing = await chrome.alarms.get(AUTO_REFRESH_ALARM);
  if (!existing) {
    // 1 minute is the floor Chrome allows for alarms, and also roughly
    // matches how often a Delayed Betfair key's data actually changes.
    chrome.alarms.create(AUTO_REFRESH_ALARM, { periodInMinutes: 1 });
  }
}
ensureAutoRefreshAlarm();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_REFRESH_ALARM) {
    refreshRace().catch((err) => console.warn("Auto-refresh skipped:", err.message));
  }
});

function normalizeName(name) {
  return name.replace(/^\d+\.\s*/, "").trim().toLowerCase();
}

// Fetches the next upcoming AU horse racing WIN market and its current
// Betfair prices. Re-applies the most recent Sportsbet scan (if still
// reasonably fresh) so periodic auto-refresh doesn't wipe out a manual scan
// by reverting the bookmaker column back to the placeholder markup.
async function refreshRace() {
  const stored = await chrome.storage.local.get([
    "betfairAppKey",
    "betfairSessionToken",
    "bookmakerOdds",
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

  let bookmakerByName = null;
  if (
    stored.bookmakerOdds &&
    Date.now() - stored.bookmakerOdds.scrapedAt < BOOKMAKER_ODDS_MAX_AGE_MS
  ) {
    bookmakerByName = new Map(
      stored.bookmakerOdds.runners.map((r) => [normalizeName(r.name), r.price])
    );
  }

  let bookmakerMatched = 0;
  const runners = book.runners
    .filter((r) => r.status === "ACTIVE")
    .map((r) => {
      const name = runnerNames.get(r.selectionId) || `Runner ${r.selectionId}`;
      const betfairPrice = r.ex?.availableToBack?.[0]?.price ?? null;
      const scannedPrice = bookmakerByName?.get(normalizeName(name));

      if (scannedPrice !== undefined) bookmakerMatched++;

      return {
        name,
        betfair: betfairPrice,
        bookmaker:
          scannedPrice !== undefined
            ? scannedPrice
            : betfairPrice
            ? Number((betfairPrice * 1.08).toFixed(2))
            : null,
      };
    })
    .filter((r) => r.betfair !== null);

  const race = {
    race: `${market.event.venue || market.event.name} — ${market.marketName}`,
    runners,
    source: "live-betfair",
    bookmakerSource: bookmakerMatched > 0 ? "live-sportsbet" : "placeholder",
    fetchedAt: Date.now(),
  };

  await chrome.storage.local.set({ liveRace: race });
  return race;
}

function normalizeVenue(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").trim();
}

// Lists upcoming AU races with a direct link to that exact race on both
// Betfair (built from our own marketId — always exact) and Sportsbet (built
// by matching venue name + race number + start time against Sportsbet's own
// NextEvents feed — falls back to no link if nothing matches closely enough).
async function listUpcomingRaces() {
  const stored = await chrome.storage.local.get([
    "betfairAppKey",
    "betfairSessionToken",
  ]);

  if (!stored.betfairAppKey || !stored.betfairSessionToken) {
    throw new Error("Not connected to Betfair yet — set this up in Options.");
  }

  const { betfairAppKey: appKey, betfairSessionToken: sessionToken } = stored;

  const eventTypeId = await findEventTypeId(appKey, sessionToken, "Horse Racing");
  const [markets, sportsbetEvents] = await Promise.all([
    listWinMarkets(appKey, sessionToken, eventTypeId, 15),
    fetchSportsbetNextEvents(),
  ]);

  const races = markets
    .map((market) => {
      const raceNumberMatch = market.marketName.match(/^R(\d+)/);
      const raceNumber = raceNumberMatch ? Number(raceNumberMatch[1]) : null;
      const track = market.event.venue || market.event.name;
      const startTimeMs = new Date(market.marketStartTime).getTime();

      const sbMatch = sportsbetEvents.find(
        (e) =>
          normalizeVenue(e.competitionName) === normalizeVenue(track) &&
          e.raceNumber === raceNumber &&
          Math.abs(e.startTime * 1000 - startTimeMs) < 5 * 60 * 1000
      );

      return {
        track,
        raceNumber,
        startTime: market.marketStartTime,
        betfairUrl: `https://www.betfair.com.au/exchange/plus/horse-racing/market/${market.marketId}`,
        sportsbetUrl: sbMatch ? buildSportsbetRaceUrl(sbMatch) : null,
      };
    })
    .filter((r) => r.raceNumber !== null);

  await chrome.storage.local.set({ upcomingRaces: races });
  return races;
}

// Scrapes Win odds off the given tab's currently displayed Sportsbet race
// page. The tab must already be showing a Sportsbet racing page.
async function scrapeBookmakerTab(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    files: ["js/contentScripts/sportsbet.js"],
  });

  if (!result || result.runners.length === 0) {
    throw new Error(
      "No runners found on that tab — make sure it's a Sportsbet racing page with the market open."
    );
  }

  await chrome.storage.local.set({ bookmakerOdds: result });
  return result;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "REFRESH_RACE") {
    refreshRace()
      .then((race) => sendResponse({ ok: true, race }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep the message channel open for the async response
  }

  if (message.type === "SCRAPE_BOOKMAKER") {
    scrapeBookmakerTab(message.tabId)
      .then((odds) => sendResponse({ ok: true, odds }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "LIST_UPCOMING_RACES") {
    listUpcomingRaces()
      .then((races) => sendResponse({ ok: true, races }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

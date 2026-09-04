importScripts("js/betfair/auth.js", "js/betfair/api.js", "js/sportsbet/api.js");

const AUTO_REFRESH_ALARM = "refreshRace";
const BOOKMAKER_ODDS_MAX_AGE_MS = 10 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
  console.log("RaceOdds installed");
});

// No default_popup is set in the manifest, so clicking the toolbar icon
// fires this instead — opens the UI as a full tab (reusing one if it's
// already open) rather than a popup that closes as soon as focus moves to
// one of the race tabs it opens.
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("popup.html");
  const [existing] = await chrome.tabs.query({ url });

  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
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

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== AUTO_REFRESH_ALARM) return;

  // Re-scrape the tracked Sportsbet tab (the one this race's "Upcoming
  // Races" click opened/reused) before refreshing Betfair, so refreshRace()
  // picks up fresh bookmaker prices instead of one aging up to 10 minutes.
  // Best-effort: a missing/closed tab or a page that isn't a priced race
  // right now shouldn't block the Betfair side from refreshing.
  const { sportsbetTabId } = await chrome.storage.local.get(["sportsbetTabId"]);
  if (sportsbetTabId) {
    try {
      await scrapeBookmakerTab(sportsbetTabId);
    } catch (err) {
      console.warn("Auto-scan of Sportsbet tab skipped:", err.message);
    }
  }

  refreshRace().catch((err) => console.warn("Auto-refresh skipped:", err.message));
});

function normalizeName(name) {
  // Sportsbet's runner name markup splits the barrier/handicap suffix into
  // a separate span starting with "&nbsp;" (U+00A0), not a regular space —
  // collapsing all whitespace to plain spaces first means "(fr1)" etc. line
  // up correctly whether the separator is a normal space or a non-breaking
  // one (this is what silently broke namesMatch's " " check before).
  return name
    .replace(/^\d+\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Sportsbet sometimes appends extra info after the core name — a country
// code, a handicap distance, "(ft)" for front-marker — that Betfair's plain
// runner name doesn't include, e.g. Betfair "itz trixton time" vs
// Sportsbet "itz trixton time nz (10m)". Treat one normalized name being a
// whole-word prefix of the other as a match, not just exact equality.
function namesMatch(a, b) {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length > 0 && longer.startsWith(shorter + " ");
}

function findBookmakerPrice(runnerName, bookmakerRunners) {
  const normalized = normalizeName(runnerName);
  const match = bookmakerRunners.find((r) => namesMatch(normalized, normalizeName(r.name)));
  return match?.price;
}

// Fetches the current Betfair prices for a race and re-renders the popup's
// comparison table with them. If `marketId` is given, that becomes (and is
// persisted as) the selected race; otherwise it follows whatever race was
// last selected, falling back to "next upcoming race" if nothing has been
// selected yet. This means a manual refresh click and the auto-refresh
// alarm both keep following whichever race the user last clicked, instead
// of silently jumping back to "next race" on every tick.
// Also re-applies the most recent Sportsbet scan (if still reasonably
// fresh) so a refresh doesn't wipe out a manual scan by reverting the
// bookmaker column back to the placeholder markup.
async function refreshRace(marketId) {
  const stored = await chrome.storage.local.get([
    "betfairAppKey",
    "betfairSessionToken",
    "bookmakerOdds",
    "selectedMarketId",
    "liveRace",
  ]);

  if (!stored.betfairAppKey || !stored.betfairSessionToken) {
    throw new Error("Not connected to Betfair yet — set this up in Options.");
  }

  const { betfairAppKey: appKey, betfairSessionToken: sessionToken } = stored;
  let targetMarketId = marketId || stored.selectedMarketId;

  if (marketId) {
    await chrome.storage.local.set({ selectedMarketId: marketId });
  }

  let markets = [];
  let selectionExpired = false;

  if (targetMarketId) {
    markets = await listMarketsByIds(appKey, sessionToken, [targetMarketId]);
    if (markets.length === 0) {
      // The selected race has jumped/closed and dropped out of Betfair's
      // catalogue — rather than getting stuck forever re-throwing this on
      // every refresh, clear the dead selection and fall through to "next
      // upcoming race" below, same as if nothing had ever been selected.
      selectionExpired = true;
      targetMarketId = null;
      await chrome.storage.local.set({ selectedMarketId: null });
    }
  }

  if (!targetMarketId) {
    const eventTypeId = await findEventTypeId(appKey, sessionToken, "Horse Racing");
    markets = await listWinMarkets(appKey, sessionToken, eventTypeId, 1);
    if (markets.length === 0) {
      throw new Error("No upcoming AU horse racing WIN markets found right now.");
    }
  }

  const market = markets[0];
  const [book] = await getMarketBook(appKey, sessionToken, [market.marketId]);
  const runnerNames = new Map(
    market.runners.map((r) => [r.selectionId, r.runnerName])
  );

  const recentBookmakerRunners =
    stored.bookmakerOdds &&
    Date.now() - stored.bookmakerOdds.scrapedAt < BOOKMAKER_ODDS_MAX_AGE_MS
      ? stored.bookmakerOdds.runners
      : null;

  // betfairWatcher.js keeps liveRace.runners[].betfair current in near
  // real-time by reading Betfair's own page directly — genuinely fresher
  // than this REST call, which (on a Delayed key) can lag up to 180s. If
  // the watcher has updated within the last ~90s (comfortably longer than
  // the 1-minute alarm interval that runs this function), trust its prices
  // instead of clobbering them with this call's own older snapshot every
  // single tick. Falls back to this call's own price when the watcher
  // hasn't supplied anything recent (tab closed, not attached yet, etc.).
  const domPricesAreFresh =
    stored.liveRace?.betfairPricedAt &&
    Date.now() - stored.liveRace.betfairPricedAt < 90 * 1000;
  const domPriceBySelectionId = domPricesAreFresh
    ? new Map(stored.liveRace.runners.map((r) => [r.selectionId, r.betfair]))
    : null;

  let bookmakerMatched = 0;
  const runners = book.runners
    .filter((r) => r.status === "ACTIVE")
    .map((r) => {
      const name = runnerNames.get(r.selectionId) || `Runner ${r.selectionId}`;
      // Lay price, not Back — the relevant comparison for matched betting
      // is "does the bookmaker's price beat what it costs to lay this off
      // on Betfair", not the Betfair back price.
      const restBetfairPrice = r.ex?.availableToLay?.[0]?.price ?? null;
      const betfairPrice = domPriceBySelectionId?.has(String(r.selectionId))
        ? domPriceBySelectionId.get(String(r.selectionId))
        : restBetfairPrice;
      const scannedPrice = recentBookmakerRunners
        ? findBookmakerPrice(name, recentBookmakerRunners)
        : undefined;

      if (scannedPrice !== undefined) bookmakerMatched++;

      return {
        name,
        selectionId: String(r.selectionId),
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

  // Diagnostic: when we have a recent Sportsbet scan but it matched none of
  // this race's runners, log both name lists side by side so a mismatch
  // (spelling, punctuation, etc.) is visible instead of just "0 matched".
  if (recentBookmakerRunners && bookmakerMatched === 0) {
    console.warn(
      "Sportsbet scan found runners, but none matched this Betfair race by name.",
      "\nBetfair (normalized):",
      runners.map((r) => normalizeName(r.name)),
      "\nSportsbet (normalized):",
      recentBookmakerRunners.map((r) => normalizeName(r.name))
    );
  }

  const race = {
    race: `${market.event.venue || market.event.name} — ${market.marketName}`,
    runners,
    source: "live-betfair",
    bookmakerSource: bookmakerMatched > 0 ? "live-sportsbet" : "placeholder",
    fetchedAt: Date.now(),
    ...(selectionExpired && {
      systemNote: "Your selected race has finished — showing the next upcoming race instead.",
    }),
  };

  // This fetch may have taken a while (Betfair API latency varies), during
  // which a newer race could have been selected. If so, don't overwrite it
  // with this now-stale result — the newer request's own write wins.
  if (targetMarketId) {
    const { selectedMarketId: currentSelection } = await chrome.storage.local.get([
      "selectedMarketId",
    ]);
    if (currentSelection !== targetMarketId) {
      throw new Error("A different race was selected before this one finished loading.");
    }
  }

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
        marketId: market.marketId,
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
  let result;
  try {
    [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      files: ["js/contentScripts/sportsbet.js"],
    });
  } catch (err) {
    if (err.message.includes("No tab with id")) {
      // The tab this id pointed to no longer exists — closed by the user,
      // or Chrome restarted and reassigned ids (tab ids don't survive a
      // browser restart). Clear it so future attempts don't keep silently
      // retrying a dead reference forever.
      const { sportsbetTabId } = await chrome.storage.local.get(["sportsbetTabId"]);
      if (sportsbetTabId === tabId) {
        await chrome.storage.local.set({ sportsbetTabId: null });
      }
      throw new Error(
        "That Sportsbet tab is no longer open — click a race in Upcoming Races to open a fresh one."
      );
    }
    throw err;
  }

  if (!result || result.runners.length === 0) {
    throw new Error(
      "No runners found on that tab — make sure it's a Sportsbet racing page with the market open."
    );
  }

  await chrome.storage.local.set({ bookmakerOdds: result });
  return result;
}

// Called whenever the Sportsbet DOM watcher (sportsbetWatcher.js) detects a
// real odds change on the page and pushes it here unsolicited. Stores the
// raw scrape (refreshRace()'s periodic Betfair polling re-applies this too)
// and, if a race is already loaded, merges the new prices into it
// immediately by runner name — this is what makes the bookmaker column
// update at the same time Sportsbet's own page does, rather than waiting
// for the next scheduled refresh.
async function applyBookmakerOdds(odds) {
  await chrome.storage.local.set({ bookmakerOdds: odds });

  const { liveRace } = await chrome.storage.local.get(["liveRace"]);
  if (!liveRace || liveRace.source !== "live-betfair") return;

  let matched = 0;
  const runners = liveRace.runners.map((runner) => {
    const price = findBookmakerPrice(runner.name, odds.runners);
    if (price !== undefined) {
      matched++;
      return { ...runner, bookmaker: price };
    }
    return runner;
  });

  if (matched === 0) return; // this update doesn't concern the loaded race

  await chrome.storage.local.set({
    liveRace: { ...liveRace, runners, bookmakerSource: "live-sportsbet" },
  });
}

// Called whenever betfairWatcher.js detects a real Lay price change and
// pushes it here unsolicited. Matches by Betfair's own selection id (exact,
// no fuzzy comparison needed unlike the Sportsbet side) and updates the
// loaded race immediately — this is what makes Betfair prices update at
// the same time Betfair's own page does, instead of waiting up to a minute
// for the next chrome.alarms tick.
async function applyBetfairOdds(odds) {
  const { liveRace } = await chrome.storage.local.get(["liveRace"]);
  if (!liveRace || liveRace.source !== "live-betfair") return;

  const priceBySelectionId = new Map(odds.runners.map((r) => [r.selectionId, r.price]));

  let matched = 0;
  const runners = liveRace.runners.map((runner) => {
    const price = priceBySelectionId.get(runner.selectionId);
    if (price !== undefined) {
      matched++;
      return { ...runner, betfair: price };
    }
    return runner;
  });

  if (matched === 0) return; // this update doesn't concern the loaded race

  await chrome.storage.local.set({
    liveRace: { ...liveRace, runners, fetchedAt: Date.now(), betfairPricedAt: Date.now() },
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "BETFAIR_ODDS_UPDATED") {
    applyBetfairOdds(message.odds).catch((err) =>
      console.warn("Failed to apply live Betfair update:", err.message)
    );
    return; // fire-and-forget — the content script isn't awaiting a reply
  }

  if (message.type === "BOOKMAKER_ODDS_UPDATED") {
    applyBookmakerOdds(message.odds).catch((err) =>
      console.warn("Failed to apply live Sportsbet update:", err.message)
    );
    return; // fire-and-forget — the content script isn't awaiting a reply
  }

  if (message.type === "REFRESH_RACE") {
    refreshRace(message.marketId)
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

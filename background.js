importScripts(
  "js/betfair/auth.js",
  "js/betfair/api.js",
  "js/sportsbet/api.js",
  "settings.js",
  "bookies.js"
);

const AUTO_REFRESH_ALARM = "refreshRace";
const BOOKMAKER_ODDS_MAX_AGE_MS = 10 * 60 * 1000;

// Racing sports this extension supports, and how each maps to Betfair's
// event-type name / exchange URL path segment. Betfair doesn't split
// harness ("trots") out from gallops — both come through its "Horse
// Racing" event type — but Sportsbet's own feed does distinguish them
// (js/sportsbet/api.js), so a Betfair "Horse Racing" market can legitimately
// match a Sportsbet event of either type; sportsbetTypes lists which.
const RACING_SPORTS = [
  {
    id: "horse",
    label: "Horse Racing",
    betfairEventType: "Horse Racing",
    betfairUrlSegment: "horse-racing",
    sportsbetTypes: ["horse", "harness"],
  },
  {
    id: "greyhound",
    label: "Greyhound Racing",
    betfairEventType: "Greyhound Racing",
    betfairUrlSegment: "greyhound-racing",
    sportsbetTypes: ["greyhound"],
  },
];

// market must have been fetched with EVENT_TYPE in its marketProjection
// (both listWinMarkets and listMarketsByIds request it) — falls back to
// the first entry (horse) if Betfair ever returns an event type name that
// doesn't match any of the above, rather than leaving sport undefined.
function sportForMarket(market) {
  return (
    RACING_SPORTS.find((s) => s.betfairEventType === market.eventType?.name) || RACING_SPORTS[0]
  );
}

// Extends the shared id/label pairs from bookies.js with what only
// background.js needs — each bookie's own scraper script and where its
// tracked-tab id lives in storage. TAB has no public race-list API like
// Sportsbet's (js/sportsbet/api.js), so its URLs are instead built from
// codes learned by tabMeetings.js (see tabRaceUrlFromCodes below), simply
// absent for a race until a code for that venue's been seen.
const BOOKIE_EXTRAS = {
  sportsbet: { scraperFile: "js/contentScripts/sportsbet.js", tabIdKey: "sportsbetTabId" },
  tab: { scraperFile: "js/contentScripts/tab.js", tabIdKey: "tabTabId" },
};
const BOOKIES = Object.fromEntries(
  BOOKIE_LIST.map((b) => [b.id, { ...b, ...BOOKIE_EXTRAS[b.id] }])
);
const RACE_TYPE_TO_TAB_CODE = { horse: "R", harness: "H", greyhound: "G" };

// Builds a direct TAB race URL from an already-loaded venue-codes table
// (see TAB_VENUE_CODES_LEARNED below) — null if this venue/sport combo
// hasn't been seen on a TAB meetings page yet. Keyed by (normalized venue,
// sport) since a single venue can host more than one sport (on different
// days), each under its own TAB code. Synchronous and takes the table as a
// parameter (rather than reading storage itself) so callers building a
// whole race list can fetch it once instead of once per race.
function tabRaceUrlFromCodes(tabVenueCodes, track, sport, raceNumber, startTimeIso) {
  const key = `${normalizeVenue(track)}|${sport}`;
  const learned = tabVenueCodes[key];
  if (!learned) return null;

  const date = startTimeIso.slice(0, 10); // YYYY-MM-DD, matches TAB's own URL date segment
  const raceTypeCode = RACE_TYPE_TO_TAB_CODE[sport];
  return `https://www.tab.com.au/racing/${date}/${learned.slug}/${learned.code}/${raceTypeCode}/${raceNumber}`;
}

// Merges freshly-learned TAB venue codes (from tabMeetings.js) into the
// persisted table — upserts by (venue, sport), so a later, possibly
// corrected sighting of the same venue always wins over an older one.
async function learnTabVenueCodes(entries) {
  const { tabVenueCodes = {} } = await chrome.storage.local.get(["tabVenueCodes"]);
  const next = { ...tabVenueCodes };

  for (const { venueName, sport, slug, code } of entries) {
    const key = `${normalizeVenue(venueName)}|${sport}`;
    next[key] = { slug, code, learnedAt: Date.now() };
  }

  await chrome.storage.local.set({ tabVenueCodes: next });
}

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

  // Other Behaviour and Functionality > "Automatically refresh odds every
  // minute" — the alarm itself stays registered either way (Chrome's
  // per-extension alarm budget isn't worth churning on and off), this just
  // skips doing anything on each tick when the user's turned it off.
  const { autoRefresh } = await loadSettings();
  if (!autoRefresh) return;

  // Re-scrape each tracked bookmaker tab (the ones this race's "Upcoming
  // Races" click opened/reused) before refreshing Betfair, so refreshRace()
  // picks up fresh bookmaker prices instead of ones aging up to 10 minutes.
  // Best-effort: a missing/closed tab or a page that isn't a priced race
  // right now shouldn't block the Betfair side from refreshing, or any
  // other bookmaker's own scan.
  const tabIdKeys = Object.values(BOOKIES).map((b) => b.tabIdKey);
  const trackedTabIds = await chrome.storage.local.get(tabIdKeys);
  for (const bookie of Object.values(BOOKIES)) {
    const tabId = trackedTabIds[bookie.tabIdKey];
    if (!tabId) continue;
    try {
      await scrapeBookieTab(bookie.id, tabId);
    } catch (err) {
      console.warn(`Auto-scan of ${bookie.label} tab skipped:`, err.message);
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
  //
  // Apostrophes are stripped outright (not just normalized to one style) —
  // Betfair and Sportsbet don't consistently agree on whether a possessive
  // name even HAS one at all, e.g. a real case: Sportsbet "Georgia's My
  // Mum" vs Betfair "Georgias My Mum". Since that's a genuine
  // presence/absence difference, not just straight vs curly ', no amount of
  // quote-character normalization would have matched them — the character
  // has to go entirely. A silent match failure here doesn't error, it just
  // falls back to the synthetic betfair×1.08 placeholder price, which is
  // what actually happened and is what surfaced this.
  return name
    .replace(/^\d+\.\s*/, "")
    .replace(/['’‘`]/g, "")
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
async function refreshRaceInner(marketId) {
  // Credentials live in sync storage (survive a full reinstall); everything
  // else stays local (device-specific or too large/transient to sync).
  const [creds, stored] = await Promise.all([
    chrome.storage.sync.get(["betfairAppKey", "betfairSessionToken"]),
    chrome.storage.local.get([
      "bookmakerOdds",
      "selectedMarketId",
      "liveRace",
    ]),
  ]);

  if (!creds.betfairAppKey || !creds.betfairSessionToken) {
    throw new Error("Not connected to Betfair yet — set this up in Options.");
  }

  const { betfairAppKey: appKey, betfairSessionToken: sessionToken } = creds;
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
    const eventTypeIds = await findEventTypeIds(
      appKey,
      sessionToken,
      RACING_SPORTS.map((s) => s.betfairEventType)
    );
    // FIRST_TO_START + maxResults 1 across the combined event type ids
    // finds the single soonest race across every supported sport in one
    // call — no need to query each sport separately and merge by hand.
    markets = await listWinMarkets(appKey, sessionToken, [...eventTypeIds.values()], 1);
    if (markets.length === 0) {
      throw new Error("No upcoming AU racing WIN markets found right now.");
    }
  }

  const market = markets[0];
  const sport = sportForMarket(market);
  const [book] = await getMarketBook(appKey, sessionToken, [market.marketId]);
  const runnerNames = new Map(
    market.runners.map((r) => [r.selectionId, r.runnerName])
  );

  // stored.bookmakerOdds is keyed by bookie id: { sportsbet: {runners,
  // scrapedAt}, tab: {...} } — each bookie's own cache aged out
  // independently, same MAX_AGE for all of them for now.
  const recentBookieRunners = {};
  for (const bookieId of Object.keys(BOOKIES)) {
    const cached = stored.bookmakerOdds?.[bookieId];
    recentBookieRunners[bookieId] =
      cached && Date.now() - cached.scrapedAt < BOOKMAKER_ODDS_MAX_AGE_MS ? cached.runners : null;
  }

  // betfairWatcher.js keeps a runner's betfair price current in near
  // real-time by reading Betfair's own page directly — genuinely fresher
  // than this REST call, which (on a Delayed key) can lag up to 180s. But
  // the watcher can only update runners it can actually read off the page
  // right now — a suspended runner (common in-play, near jump) renders
  // without the normal price button at all, so it's silently absent from
  // that update. Freshness is therefore tracked per runner, not for the
  // whole race at once: trusting it race-wide would let one runner's
  // successful update "protect" every other runner's price — including
  // ones the watcher never actually touched — from this call's correction.
  const existingRunnerById = new Map(
    (stored.liveRace?.runners || []).map((r) => [r.selectionId, r])
  );

  // Once a race settles, Betfair marks every runner WINNER or LOSER (never
  // ACTIVE again) and the REST call stops returning fresh prices for any
  // of them — filtering to ACTIVE-only would empty the whole table out
  // right when we want to keep showing it with the result. REMOVED
  // (scratched) runners are kept too, purely so the UI can render them as
  // placeholder rows (a full-field view) — nothing below computes a real
  // price for one, and the final filter explicitly keeps them anyway.
  const bookmakerMatched = Object.fromEntries(Object.keys(BOOKIES).map((id) => [id, 0]));
  const runners = book.runners
    .map((r) => {
      const name = runnerNames.get(r.selectionId) || `Runner ${r.selectionId}`;
      const selectionId = String(r.selectionId);
      const existingRunner = existingRunnerById.get(selectionId);
      const domIsFresh =
        existingRunner?.betfairPricedAt &&
        Date.now() - existingRunner.betfairPricedAt < 90 * 1000;

      // Lay price, not Back — the relevant comparison for matched betting
      // is "does the bookmaker's price beat what it costs to lay this off
      // on Betfair", not the Betfair back price.
      const restBetfairPrice = r.ex?.availableToLay?.[0]?.price ?? null;
      const restBetfairLiquidity = r.ex?.availableToLay?.[0]?.size ?? null;
      // Falls back to the last known price when this fetch got nothing —
      // most commonly a settled runner (no more prices at all), but also
      // covers a plain transient gap in the REST response. Without this,
      // a runner with a momentary null here would previously vanish
      // entirely (the old filter below dropped anything betfair===null).
      const betfairPrice = domIsFresh
        ? existingRunner.betfair
        : restBetfairPrice ?? existingRunner?.betfair ?? null;
      // Liquidity travels with price under the same freshness flag — both
      // come from whichever source (DOM watcher or this REST call) actually
      // supplied betfairPrice, so they're never mismatched between sources.
      const betfairLiquidity = domIsFresh
        ? existingRunner.betfairLiquidity ?? null
        : restBetfairLiquidity ?? (restBetfairPrice === null ? existingRunner?.betfairLiquidity ?? null : null);
      // One price per bookie, keyed by id — Sportsbet keeps its historical
      // placeholder fallback (betfair×1.08) so its column was never empty
      // before the first real scan; a newer bookie just shows nothing
      // (null -> "—" in the UI) until its own first real scrape/watch
      // update arrives, rather than inventing a second synthetic guess.
      const bookmakers = {};
      for (const bookieId of Object.keys(BOOKIES)) {
        const recent = recentBookieRunners[bookieId];
        const scannedPrice = recent ? findBookmakerPrice(name, recent) : undefined;
        if (scannedPrice !== undefined) bookmakerMatched[bookieId]++;

        bookmakers[bookieId] =
          scannedPrice !== undefined
            ? scannedPrice
            : bookieId === "sportsbet" && betfairPrice
            ? Number((betfairPrice * 1.08).toFixed(2))
            : null;
      }

      return {
        name,
        selectionId,
        betfair: betfairPrice,
        betfairLiquidity,
        // ACTIVE pre-race, WINNER/LOSER once settled — lets the UI show
        // the result and highlight the winning row without needing a
        // separate settlement check of its own.
        result: r.status,
        ...(domIsFresh && { betfairPricedAt: existingRunner.betfairPricedAt }),
        bookmakers,
      };
    })
    .filter((r) => r.betfair !== null || r.result === "REMOVED");

  const winner = runners.find((r) => r.result === "WINNER")?.name ?? null;

  // Diagnostic: when we have a recent scan for a bookie but it matched none
  // of this race's runners, log both name lists side by side so a mismatch
  // (spelling, punctuation, etc.) is visible instead of just "0 matched".
  for (const bookieId of Object.keys(BOOKIES)) {
    const recent = recentBookieRunners[bookieId];
    if (recent && bookmakerMatched[bookieId] === 0) {
      console.warn(
        `${BOOKIES[bookieId].label} scan found runners, but none matched this Betfair race by name.`,
        "\nBetfair (normalized):",
        runners.map((r) => normalizeName(r.name)),
        `\n${BOOKIES[bookieId].label} (normalized):`,
        recent.map((r) => normalizeName(r.name))
      );
    }
  }

  const track = market.event.venue || market.event.name;
  const race = {
    race: `${track} — ${market.marketName}`,
    track,
    marketId: market.marketId,
    startTime: market.marketStartTime,
    sport: sport.id,
    sportLabel: sport.label,
    runners,
    winner,
    source: "live-betfair",
    bookmakerSources: Object.fromEntries(
      Object.keys(BOOKIES).map((id) => [id, bookmakerMatched[id] > 0 ? "live" : "placeholder"])
    ),
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
async function listUpcomingRacesInner() {
  const stored = await chrome.storage.sync.get([
    "betfairAppKey",
    "betfairSessionToken",
  ]);

  if (!stored.betfairAppKey || !stored.betfairSessionToken) {
    throw new Error("Not connected to Betfair yet — set this up in Options.");
  }

  const { betfairAppKey: appKey, betfairSessionToken: sessionToken } = stored;

  const eventTypeIds = await findEventTypeIds(
    appKey,
    sessionToken,
    RACING_SPORTS.map((s) => s.betfairEventType)
  );
  const [markets, sportsbetEvents, { tabVenueCodes = {} }] = await Promise.all([
    // 20, not 15 — now split across every supported sport instead of just
    // horse racing, so the same-ish count needs a bit more headroom to
    // still show a reasonable spread of both.
    listWinMarkets(appKey, sessionToken, [...eventTypeIds.values()], 20),
    fetchSportsbetNextEvents(),
    chrome.storage.local.get(["tabVenueCodes"]),
  ]);

  const races = markets
    .map((market) => {
      const raceNumberMatch = market.marketName.match(/^R(\d+)/);
      const raceNumber = raceNumberMatch ? Number(raceNumberMatch[1]) : null;
      const track = market.event.venue || market.event.name;
      const startTimeMs = new Date(market.marketStartTime).getTime();
      const sport = sportForMarket(market);

      // Filtered by sportsbetTypes first — without it, a horse (or
      // harness) meeting and a greyhound meeting that happen to share a
      // track name and start time could cross-match.
      const sbMatch = sportsbetEvents.find(
        (e) =>
          sport.sportsbetTypes.includes(e.type) &&
          normalizeVenue(e.competitionName) === normalizeVenue(track) &&
          e.raceNumber === raceNumber &&
          Math.abs(e.startTime * 1000 - startTimeMs) < 5 * 60 * 1000
      );

      // Betfair itself doesn't distinguish harness from gallops (both are
      // its single "Horse Racing" event type — see RACING_SPORTS), but
      // Sportsbet's own feed does, so a matched sbMatch's type is the only
      // signal available for that split. No match means no signal either
      // way, so it defaults to "horse" (the far more common case) rather
      // than leaving it unset — a race with no Sportsbet match already
      // shows the "!" warning marker, so this default doesn't hide
      // anything the UI wasn't already flagging as uncertain.
      const raceType = sport.id === "horse" && sbMatch?.type === "harness" ? "harness" : sport.id;

      return {
        track,
        raceNumber,
        sport: sport.id,
        raceType,
        startTime: market.marketStartTime,
        marketId: market.marketId,
        betfairUrl: `https://www.betfair.com.au/exchange/plus/${sport.betfairUrlSegment}/market/${market.marketId}`,
        sportsbetUrl: sbMatch ? buildSportsbetRaceUrl(sbMatch) : null,
        // null until tabMeetings.js has learned this venue/sport's TAB
        // code — no "!" warning marker for this one, unlike Sportsbet,
        // since not knowing yet is the expected steady state for most
        // tracks rather than something to flag as wrong.
        tabUrl: tabRaceUrlFromCodes(tabVenueCodes, track, sport.id, raceNumber, market.marketStartTime),
      };
    })
    .filter((r) => r.raceNumber !== null);

  await chrome.storage.local.set({ upcomingRaces: races });
  return races;
}

// Betfair session tokens expire — previously that surfaced as
// INVALID_SESSION_INFORMATION and required going back into Options to log
// in again by hand. Since the app key/username/password entered there are
// already stored, this re-logs in automatically with those and retries the
// call once, instead of ever bothering the user. Only falls through to a
// real error if those stored credentials are missing (never set up) or
// themselves no longer work (e.g. password changed on Betfair's side) —
// that genuinely does need a human back in Options.
async function withSessionRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!err.message.includes("INVALID_SESSION_INFORMATION")) throw err;

    const { betfairAppKey, betfairUsername, betfairPassword } = await chrome.storage.sync.get([
      "betfairAppKey",
      "betfairUsername",
      "betfairPassword",
    ]);

    if (!betfairAppKey || !betfairUsername || !betfairPassword) throw err;

    const sessionToken = await betfairLogin(betfairAppKey, betfairUsername, betfairPassword);
    await chrome.storage.sync.set({
      betfairSessionToken: sessionToken,
      betfairSessionTokenAt: Date.now(),
    });

    return await fn(); // retry once with the fresh token
  }
}

async function refreshRace(marketId) {
  return withSessionRetry(() => refreshRaceInner(marketId));
}

async function listUpcomingRaces() {
  return withSessionRetry(listUpcomingRacesInner);
}

// Scrapes Win odds off the given tab's currently displayed bookmaker race
// page. The tab must already be showing that bookie's own racing page.
async function scrapeBookieTab(bookieId, tabId) {
  const bookie = BOOKIES[bookieId];
  let result;
  try {
    [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      files: [bookie.scraperFile],
    });
  } catch (err) {
    if (err.message.includes("No tab with id")) {
      // The tab this id pointed to no longer exists — closed by the user,
      // or Chrome restarted and reassigned ids (tab ids don't survive a
      // browser restart). Clear it so future attempts don't keep silently
      // retrying a dead reference forever.
      const stored = await chrome.storage.local.get([bookie.tabIdKey]);
      if (stored[bookie.tabIdKey] === tabId) {
        await chrome.storage.local.set({ [bookie.tabIdKey]: null });
      }
      throw new Error(
        `That ${bookie.label} tab is no longer open — click a race in Upcoming Races to open a fresh one.`
      );
    }
    throw err;
  }

  if (!result || result.runners.length === 0) {
    throw new Error(
      `No runners found on that tab — make sure it's a ${bookie.label} racing page with the market open.`
    );
  }

  const { bookmakerOdds = {} } = await chrome.storage.local.get(["bookmakerOdds"]);
  await chrome.storage.local.set({
    bookmakerOdds: { ...bookmakerOdds, [bookieId]: result },
  });
  return result;
}

// Called whenever a bookmaker's own DOM watcher (sportsbetWatcher.js,
// tabWatcher.js, ...) detects a real odds change on the page and pushes it
// here unsolicited. Stores the raw scrape under that bookie's own key
// (refreshRace()'s periodic Betfair polling re-applies this too) and, if a
// race is already loaded, merges the new prices into it immediately by
// runner name — this is what makes a bookmaker's column update at the same
// time its own page does, rather than waiting for the next scheduled
// refresh.
async function applyBookieOdds(bookieId, odds) {
  const { bookmakerOdds = {} } = await chrome.storage.local.get(["bookmakerOdds"]);
  await chrome.storage.local.set({
    bookmakerOdds: { ...bookmakerOdds, [bookieId]: odds },
  });

  const { liveRace } = await chrome.storage.local.get(["liveRace"]);
  if (!liveRace || liveRace.source !== "live-betfair") return;

  let matched = 0;
  const runners = liveRace.runners.map((runner) => {
    const price = findBookmakerPrice(runner.name, odds.runners);
    if (price !== undefined) {
      matched++;
      return { ...runner, bookmakers: { ...runner.bookmakers, [bookieId]: price } };
    }
    return runner;
  });

  if (matched === 0) return; // this update doesn't concern the loaded race

  await chrome.storage.local.set({
    liveRace: {
      ...liveRace,
      runners,
      bookmakerSources: { ...liveRace.bookmakerSources, [bookieId]: "live" },
    },
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

  const bySelectionId = new Map(odds.runners.map((r) => [r.selectionId, r]));

  // Stamped per runner, not race-wide — a suspended runner (common
  // in-play) has no readable price on the page at all, so it's simply
  // absent from `odds.runners` this time. Only the runners actually
  // present here get a fresh timestamp; everyone else keeps whatever
  // betfairPricedAt (possibly none, possibly old) they already had, so
  // refreshRace() correctly falls back to the REST price (and REST
  // liquidity) for exactly the runners this update didn't touch, instead
  // of every runner in the race.
  let matched = 0;
  const runners = liveRace.runners.map((runner) => {
    const fresh = bySelectionId.get(runner.selectionId);
    if (fresh?.price !== undefined) {
      matched++;
      return {
        ...runner,
        betfair: fresh.price,
        betfairLiquidity: fresh.liquidity ?? null,
        betfairPricedAt: Date.now(),
      };
    }
    return runner;
  });

  if (matched === 0) return; // this update doesn't concern the loaded race

  await chrome.storage.local.set({
    liveRace: { ...liveRace, runners, fetchedAt: Date.now() },
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
    applyBookieOdds("sportsbet", message.odds).catch((err) =>
      console.warn("Failed to apply live Sportsbet update:", err.message)
    );
    return; // fire-and-forget — the content script isn't awaiting a reply
  }

  if (message.type === "TAB_ODDS_UPDATED") {
    applyBookieOdds("tab", message.odds).catch((err) =>
      console.warn("Failed to apply live TAB update:", err.message)
    );
    return; // fire-and-forget — the content script isn't awaiting a reply
  }

  if (message.type === "TAB_VENUE_CODES_LEARNED") {
    learnTabVenueCodes(message.entries).catch((err) =>
      console.warn("Failed to store learned TAB venue codes:", err.message)
    );
    return; // fire-and-forget — the content script isn't awaiting a reply
  }

  if (message.type === "REFRESH_RACE") {
    refreshRace(message.marketId)
      .then((race) => sendResponse({ ok: true, race }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep the message channel open for the async response
  }

  if (message.type === "LIST_UPCOMING_RACES") {
    listUpcomingRaces()
      .then((races) => sendResponse({ ok: true, races }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

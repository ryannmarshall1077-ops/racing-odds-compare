importScripts(
  "js/betfair/auth.js",
  "js/betfair/api.js",
  "js/sportsbet/api.js",
  "settings.js",
  "bookies.js"
);

const AUTO_REFRESH_ALARM = "refreshRace";
const BOOKMAKER_ODDS_MAX_AGE_MS = 10 * 60 * 1000;

// How long to keep trying a pending race that hasn't shown a result yet
// (checkPendingResults) — covers an abandoned/void market that never
// actually settles, so pendingResultChecks doesn't grow forever.
const RESULT_CHECK_MAX_AGE_MS = 20 * 60 * 1000;

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
// absent for a race until a code for that venue's been seen. Ladbrokes
// has neither a public feed nor a learnable code scheme (every race
// lives at an opaque per-race GUID with no derivable pattern, and the
// overview page's race grid has no real link to scrape one from at all
// — confirmed live) — its own URL field is never populated at all yet
// (see ladbrokesWatcher.js), so scrapeBookieTab's periodic re-scan for
// it currently never actually runs (nothing ever sets ladbrokesTabId).
// Kept wired up the same as the other two anyway, ready for whenever a
// way to populate ladbrokesUrl is found.
const BOOKIE_EXTRAS = {
  sportsbet: { scraperFile: "js/contentScripts/sportsbet.js", tabIdKey: "sportsbetTabId" },
  tab: { scraperFile: "js/contentScripts/tab.js", tabIdKey: "tabTabId" },
  ladbrokes: { scraperFile: "js/contentScripts/ladbrokes.js", tabIdKey: "ladbrokesTabId" },
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

// TAB has no public race-list API — the only way a venue's TAB code gets
// learned at all is tabMeetings.js actually seeing it on a real meetings
// page (see learnTabVenueCodes above). That used to mean nothing got
// learned until the user happened to visit one by hand — user asked for
// this to just work without manually clicking through every sport's
// meetings page. This automates that same visit: opens each sport's
// meetings page in a background tab (active: false, doesn't steal
// focus — you may notice it briefly appear and disappear in your tab
// strip), gives tabMeetings.js a few seconds to report what it finds,
// then closes it again. Date-gated (once per day, not once per tick) so
// this doesn't repeatedly reopen tabs for no reason — checked every
// alarm tick regardless, so it still runs today even if the very first
// attempt (extension startup, or whenever this next ships) happened to
// fail (e.g. no network yet).
const TAB_MEETINGS_LEARN_DELAY_MS = 6000;

async function visitTabMeetingsPage(raceTypeCode) {
  const tab = await chrome.tabs.create({
    url: `https://www.tab.com.au/racing/meetings/today/${raceTypeCode}`,
    active: false,
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, TAB_MEETINGS_LEARN_DELAY_MS));
  } finally {
    // Already closed by the user in the meantime, e.g. — harmless either way.
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function ensureTabVenueCodesLearnedToday() {
  const today = new Date().toISOString().slice(0, 10);
  const { tabVenueCodesLearnedDate } = await chrome.storage.local.get([
    "tabVenueCodesLearnedDate",
  ]);
  if (tabVenueCodesLearnedDate === today) return;

  // Sequential, not parallel — no need to have all 3 open at once, and
  // it keeps this a predictable, one-at-a-time visit rather than a
  // sudden burst of tabs.
  for (const raceTypeCode of Object.values(RACE_TYPE_TO_TAB_CODE)) {
    try {
      await visitTabMeetingsPage(raceTypeCode);
    } catch (err) {
      console.warn(`Learning TAB venue codes for "${raceTypeCode}" skipped:`, err.message);
    }
  }

  await chrome.storage.local.set({ tabVenueCodesLearnedDate: today });
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

// Runs once immediately at service-worker startup too, not just on the
// next alarm tick (up to a minute away) — so TAB venue codes start being
// learned as soon as possible after a reload rather than waiting.
ensureTabVenueCodesLearnedToday().catch((err) =>
  console.warn("Learning TAB venue codes skipped:", err.message)
);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== AUTO_REFRESH_ALARM) return;

  // Deliberately not gated by "Automatically refresh odds every minute"
  // below — this is a once-a-day, unrelated maintenance task (learning
  // static venue-code data, not refreshing live odds), so turning that
  // setting off shouldn't stop it.
  ensureTabVenueCodesLearnedToday().catch((err) =>
    console.warn("Learning TAB venue codes skipped:", err.message)
  );

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

  // Keeps pendingResultChecks fed even if the user never manually
  // refreshes Upcoming Races, and checks anything already due for a real
  // result (feeds the sidebar's own marketStatus — see
  // listUpcomingRacesInner). Runs every tick regardless of what's
  // selected — unlike refreshRace() above, this isn't about the one
  // loaded race.
  listUpcomingRaces().catch((err) =>
    console.warn("Background upcoming-races refresh skipped:", err.message)
  );
  checkPendingResults().catch((err) => console.warn("Pending-results check skipped:", err.message));
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
  //
  // Periods get the exact same treatment, for the same reason — confirmed
  // live: Sportsbet/TAB both list "Dr. Tanya" (with a period) for a
  // runner Betfair's own catalogue calls plain "Dr Tanya". Stripped after
  // the box-number-prefix replace above (which still needs its own
  // literal period to match "1. ") rather than before, so the two don't
  // interfere with each other.
  return name
    .replace(/^\d+\.\s*/, "")
    .replace(/['’‘`]/g, "")
    .replace(/\./g, "")
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

// Called only when the selected market has already dropped out of
// listMarketCatalogue (refreshRaceInner's own catalogue call came back
// empty) — a last attempt at the real result via listMarketBook before
// giving up on the selection entirely. Returns the updated race (built
// from `previousRace`, the last known-good liveRace for this exact
// market — its own track/runners/prices/etc. are all still valid, only
// each runner's result and the market's own status need refreshing)
// with a resolved winner, or null if listMarketBook has nothing either
// (genuinely gone, not just resulted — the caller falls back to "next
// upcoming race" in that case).
async function settledRaceFromBook(appKey, sessionToken, marketId, previousRace) {
  const [book] = await getMarketBook(appKey, sessionToken, [marketId]);
  const winnerRunner = book?.runners?.find((r) => r.status === "WINNER");

  // Diagnostic: user-reported the winner still doesn't show even after
  // this function was added — and checkPendingResultsInner (a
  // completely separate code path to listMarketBook for the same
  // market) also has no winner for this race, so the common dependency
  // worth actually confirming is
  // whether listMarketBook itself still has anything for this exact
  // marketId once catalogue's already dropped it — not necessarily
  // true just because it's true while a market's still IN catalogue
  // (the only case this was actually verified against before).
  if (!winnerRunner) {
    console.warn(
      `settledRaceFromBook: no WINNER for market ${marketId} after catalogue dropped it.`,
      "book:",
      book,
      "runner statuses:",
      book?.runners?.map((r) => ({ selectionId: r.selectionId, status: r.status }))
    );
    return null;
  }

  const bookStatusById = new Map(book.runners.map((r) => [String(r.selectionId), r.status]));
  const nameById = new Map(previousRace.runners.map((r) => [r.selectionId, r.name]));

  return {
    ...previousRace,
    runners: previousRace.runners.map((r) => {
      const freshStatus = bookStatusById.get(r.selectionId);
      return freshStatus ? { ...r, result: freshStatus } : r;
    }),
    winner: nameById.get(String(winnerRunner.selectionId)) ?? String(winnerRunner.selectionId),
    marketStatus: book.status,
    fetchedAt: Date.now(),
  };
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
      // The selected race has dropped out of Betfair's catalogue — but
      // listMarketBook (the actual result) persists noticeably longer
      // than catalogue does, same asymmetry checkPendingResultsInner
      // already relies on. Check there before giving up on this
      // selection: user-reported
      // Betfair's own page already showed "Closed" with a named winner
      // while this popup, unable to find the market in catalogue, was
      // silently switching to the next race before ever trying to
      // fetch that result. Only really "expired" (genuinely gone, not
      // just resulted) if this comes back empty too.
      const winnerRace =
        stored.liveRace?.marketId === targetMarketId
          ? await settledRaceFromBook(appKey, sessionToken, targetMarketId, stored.liveRace)
          : null;
      if (winnerRace) {
        await chrome.storage.local.set({ liveRace: winnerRace });
        return winnerRace;
      }

      // Genuinely gone (or the popup was never showing this race in the
      // first place, e.g. after a reinstall) — rather than getting stuck
      // forever re-throwing this on every refresh, clear the dead
      // selection and fall through to "next upcoming race" below, same
      // as if nothing had ever been selected.
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
      throw new Error("No upcoming AU/NZ racing WIN markets found right now.");
    }
  }

  const market = markets[0];
  const sport = sportForMarket(market);
  const [book] = await getMarketBook(appKey, sessionToken, [market.marketId]);
  const runnerNames = new Map(
    market.runners.map((r) => [r.selectionId, r.runnerName])
  );

  // Run 2nd/Run 2nd 3rd modes' own EV needs Pr(place) from the event's
  // separate PLACE market — same selectionIds, different market/price
  // entirely. Betfair's own PLACE markets pay 2/3/4 places depending on
  // field size (numberOfWinners) — only 2 and 3 are usable here, and
  // popup.js's own promoPlaceProb needs to know which:
  //   numberOfWinners === 3 ("Top 3 Finish"): Pr(place)−Pr(win) IS
  //     Pr(2nd or 3rd) combined — exactly what Run 2nd 3rd needs
  //     directly. Run 2nd can't use this figure as its own Pr(2nd)
  //     outright (it's 2nd-or-3rd, not 2nd alone), and there's no real
  //     data to split it with — popup.js's own promoPlaceProb leaves
  //     Run 2nd null in this case rather than falling back to a
  //     theoretical model (an earlier version used the Harville place-
  //     probability model here, both as the 2nd:3rd split and as a
  //     no-place-market fallback; real market data was user-verified to
  //     disagree with Harville's estimate by roughly 2x for an actual
  //     runner in a small field, so Harville was dropped entirely).
  //   numberOfWinners === 2 ("Top 2 Finish"): Pr(place)−Pr(win) IS
  //     Pr(2nd) alone this time (only two placings exist at all, so
  //     "placed but didn't win" only ever means 2nd) — usable by Run
  //     2nd directly, real data. Run 2nd 3rd has no 3rd-place
  //     information at all in this case, so stays null.
  //   Anything else (4, or no place market at all): left null:
  //     numberOfWinners 4 doesn't correspond to either promo's own
  //     definition, and there's nothing to isolate at all without a
  //     market. Best-effort throughout — a missing/failed place-market
  //     lookup shouldn't block the rest of the refresh, same reasoning
  //     as the bookmaker scan fallbacks elsewhere in this function.
  let placeBookRunners = null;
  let placeMarketWinners = null;
  try {
    const [placeMarket] = await listPlaceMarket(appKey, sessionToken, market.event.id);
    if (placeMarket) {
      const [placeBook] = await getMarketBook(appKey, sessionToken, [placeMarket.marketId]);
      if (placeBook?.numberOfWinners === 2 || placeBook?.numberOfWinners === 3) {
        placeBookRunners = new Map(placeBook.runners.map((r) => [String(r.selectionId), r]));
        placeMarketWinners = placeBook.numberOfWinners;
      }
    }
  } catch (err) {
    console.warn("Place market lookup skipped:", err.message);
  }

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

  // The race's actual "gone in-play" trigger (see popup.js's isRaceInPlay/
  // isShowingStatusWord) — the bookmaker (Sportsbet/TAB) actually closing
  // its own market, not Betfair's own book.status below (Betfair itself
  // commonly stays tradeable well past the real jump). Set by
  // applyBookieOdds() from sportsbetWatcher.js/tabWatcher.js's live DOM
  // scrape, carried forward sticky once true (storage.local.set would
  // otherwise silently erase it on this REST refresh's next write). Hoisted
  // up here (rather than declared down near the race object, where an
  // earlier version of this had it) so the runner-freeze logic just below
  // can use the exact same signal the race-level "IN PLAY" state already
  // does — one flag, not two copies that could disagree.
  const bookieMarketClosedConfirmed =
    stored.liveRace?.marketId === market.marketId && stored.liveRace?.bookieMarketClosed === true;

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
      //
      // Frozen once the race has actually jumped (bookieMarketClosedConfirmed)
      // — user-requested: Betfair's own in-play price/liquidity swings
      // wildly once trading resumes in-running and no longer reflects the
      // pre-jump "closing" line, so this just keeps whatever was last
      // known the moment the market closed rather than letting it drift
      // afterward. Every cycle after that first frozen one carries the
      // same frozen value forward unchanged, since existingRunner.betfair
      // IS that frozen value by then.
      const betfairPrice = bookieMarketClosedConfirmed
        ? existingRunner?.betfair ?? null
        : domIsFresh
        ? existingRunner.betfair
        : restBetfairPrice ?? existingRunner?.betfair ?? null;
      // Liquidity travels with price under the same freshness flag (and the
      // same freeze) — both come from whichever source (DOM watcher or this
      // REST call) actually supplied betfairPrice, so they're never
      // mismatched between sources, and never mismatched between "frozen"
      // and "still live" either.
      const betfairLiquidity = bookieMarketClosedConfirmed
        ? existingRunner?.betfairLiquidity ?? null
        : domIsFresh
        ? existingRunner.betfairLiquidity ?? null
        : restBetfairLiquidity ?? (restBetfairPrice === null ? existingRunner?.betfairLiquidity ?? null : null);

      // Back price — display only (Edge%/Lay $/Liability all deliberately
      // keep using the Lay price above, since that's still the actual
      // matched-betting comparison). Same DOM-first-then-REST pattern as
      // Lay above, now that betfairWatcher.js's Back-cell selector is
      // actually verified (see betfairWatcher.js) rather than guessed.
      //
      // A previous attempt guessed ".first-back-cell" (inferred from the
      // Lay selector's own naming) and shipped a stale/wrong Back price
      // for a volatile runner. Dropping DOM trust entirely "fixed" the
      // symptom but not the real problem: real Betfair REST data (this
      // extension uses a free Delayed application key) can itself lag up
      // to ~180s behind the live market — confirmed here by a diagnostic
      // showing REST kept returning a genuinely different, non-null price
      // every refresh, not nothing. The live DOM watcher is what actually
      // keeps Lay accurate in practice despite that same REST lag; Back
      // needs that same near-real-time source, not less of it — just the
      // *correct* selector this time (.last-back-cell, confirmed directly
      // against a live, logged-in market page).
      const backDomIsFresh =
        existingRunner?.betfairBackPricedAt &&
        Date.now() - existingRunner.betfairBackPricedAt < 90 * 1000;
      const restBetfairBackPrice = r.ex?.availableToBack?.[0]?.price ?? null;
      const restBetfairBackLiquidity = r.ex?.availableToBack?.[0]?.size ?? null;
      // Same freeze as the Lay price/liquidity above, once jumped.
      const betfairBack = bookieMarketClosedConfirmed
        ? existingRunner?.betfairBack ?? null
        : backDomIsFresh
        ? existingRunner.betfairBack
        : restBetfairBackPrice ?? existingRunner?.betfairBack ?? null;
      const betfairBackLiquidity = bookieMarketClosedConfirmed
        ? existingRunner?.betfairBackLiquidity ?? null
        : backDomIsFresh
        ? existingRunner.betfairBackLiquidity ?? null
        : restBetfairBackLiquidity ??
          (restBetfairBackPrice === null ? existingRunner?.betfairBackLiquidity ?? null : null);

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

      // Pr(place) for Run 2nd/Run 2nd 3rd modes' own EV — REST-only (no
      // DOM watcher for this, unlike the WIN market's own Lay price
      // above); a place-market price doesn't need anywhere near the
      // same freshness for this purpose. null whenever the place
      // market wasn't found/didn't pay 2 or 3 places (placeBookRunners
      // itself null in that case — see this function's own comment for
      // why 4 isn't usable either), or this specific runner isn't in it
      // (e.g. scratched after the place market's own snapshot). See
      // race.placeMarketWinners (also set above) and popup.js's own
      // promoPlaceProb for what this actually means per mode.
      const placeBetfair = placeBookRunners?.get(selectionId)?.ex?.availableToLay?.[0]?.price ?? null;

      return {
        name,
        selectionId,
        betfair: betfairPrice,
        betfairLiquidity,
        betfairBack,
        betfairBackLiquidity,
        placeBetfair,
        // ACTIVE pre-race, WINNER/LOSER once settled — lets the UI show
        // the result and highlight the winning row without needing a
        // separate settlement check of its own. Sticky once WINNER,
        // same reasoning as marketStatus's own alreadyConfirmedNonOpen —
        // confirmed live that REST can keep reporting a stale pre-result
        // status for a long while after betfairWatcher.js's own DOM
        // scrape (applyBetfairOdds's winnerName handling) has already
        // marked this runner WINNER; a plain REST-wins-always assignment
        // here would silently erase that the next time this runs.
        result: existingRunner?.result === "WINNER" ? "WINNER" : r.status,
        ...(domIsFresh && { betfairPricedAt: existingRunner.betfairPricedAt }),
        ...(backDomIsFresh && { betfairBackPricedAt: existingRunner.betfairBackPricedAt }),
        // Real per-horse silks (applyBetfairOdds/betfairWatcher.js) —
        // this whole runner object is rebuilt from scratch every REST
        // cycle (nothing here spreads ...existingRunner), so without
        // this a silk applyBetfairOdds already found would get silently
        // wiped the next time this function runs. Nothing re-scrapes it
        // via REST, so once known it just carries forward unchanged.
        ...(existingRunner?.silkUrl && { silkUrl: existingRunner.silkUrl }),
        bookmakers,
      };
    })
    .filter((r) => r.betfair !== null || r.result === "REMOVED");

  const winner = runners.find((r) => r.result === "WINNER")?.name ?? null;

  // Diagnostic: user-reported Betfair's own page already showed
  // "Closed"/a named winner while this extension still showed "IN
  // PLAY" with no winner tag — but the previous, conditional version
  // of this (only logging when book.status wasn't "OPEN") never fired
  // even once on a reproduction that otherwise proved this exact
  // function DID run for this exact race (a different, unrelated
  // diagnostic a few lines below fired using this same race's own
  // runners). That means the condition itself was hiding the one case
  // actually worth seeing — logging unconditionally instead, every
  // single refresh of the selected race, so nothing is filtered out
  // this time regardless of what book.status/winner turn out to be.
  console.warn(
    `refreshRaceInner winner check for market ${market.marketId}: book.status=${book.status}, winner=${winner}. Runner statuses:`,
    book.runners.map((r) => ({ selectionId: r.selectionId, status: r.status }))
  );

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
  // Same extraction listUpcomingRacesInner already uses for its own
  // raceNumber field — duplicated rather than shared since the two loop
  // over differently-shaped market objects, but it's the same one-line
  // regex against the same marketName format either way.
  const raceNumberMatch = market.marketName.match(/^R(\d+)/);
  const raceNumber = raceNumberMatch ? Number(raceNumberMatch[1]) : null;

  // REST's totalMatched genuinely is present, but only refreshes on the
  // ~60s chrome.alarms poll below — too slow near jump time, when matched
  // volume can multiply within a couple of minutes (confirmed: extension
  // showed $138 while Betfair's own page already read AUD 1,705 for the
  // same market seconds later). betfairWatcher.js now scrapes the page's
  // own "Matched: AUD X" text in near real-time instead, so prefer that
  // when it's recent enough, same pattern as betfairPricedAt for prices.
  const totalMatchedIsFresh =
    stored.liveRace?.totalMatchedUpdatedAt &&
    Date.now() - stored.liveRace.totalMatchedUpdatedAt < 90 * 1000;

  // Same idea for marketStatus, via betfairWatcher.js's own
  // scrapeMarketStatusLabel() — REST's book.status can sit on a stale
  // "OPEN" for most of the ~60s poll interval right when a market goes
  // in-play, leaving the popup's countdown looking stuck instead of
  // switching to "Jumped" (user-reported: confirmed live against a
  // real market Betfair's own page already showed "Suspended" on).
  //
  // Deliberately NOT a freshness/expiry window like totalMatchedIsFresh
  // above — that pattern is wrong here. A market only ever moves
  // OPEN -> SUSPENDED -> CLOSED, never back (and even a genuine brief
  // in-running OPEN flicker shouldn't make the countdown un-"Jump"), so
  // once EITHER source has confirmed this exact market is non-OPEN,
  // that's permanent for as long as it stays selected — expiring it
  // after 90s of DOM silence (nothing left to scrape once the label
  // text stops changing) meant it fell straight back to REST's own
  // stale "OPEN", undoing the fix and reproducing the exact bug this
  // was meant to close (user-reported: "Jumped" showed briefly, then
  // reverted to counting down again). Matched by marketId only, so
  // switching to a different race doesn't inherit the old one's
  // confirmed status.
  const alreadyConfirmedNonOpen =
    stored.liveRace?.marketId === market.marketId &&
    stored.liveRace?.marketStatus &&
    stored.liveRace.marketStatus !== "OPEN";

  // bookieMarketClosedConfirmed itself is hoisted above, next to
  // existingRunnerById — the runner price-freeze logic needs it earlier
  // in this function than this race object does, and there's no reason
  // for the two to be two separate copies of the same check.

  const race = {
    race: `${track} — ${market.marketName}`,
    track,
    raceNumber,
    marketId: market.marketId,
    startTime: market.marketStartTime,
    sport: sport.id,
    sportLabel: sport.label,
    runners,
    winner,
    // How many places the event's own PLACE market actually pays (2 or
    // 3), or null if there wasn't one usable — see this same function's
    // own placeBookRunners comment for what each runner's placeBetfair
    // means depending on this. Race-level (one place market per event,
    // shared by every runner), unlike placeBetfair itself which is
    // per-runner.
    placeMarketWinners,
    // OPEN/SUSPENDED/CLOSED — Betfair's own status. Display-only now (see
    // bookieMarketClosed below for what actually drives "IN PLAY");
    // kept around in case Betfair's own status is ever worth showing
    // alongside the bookmaker-driven one.
    marketStatus: alreadyConfirmedNonOpen ? stored.liveRace.marketStatus : book.status,
    ...(bookieMarketClosedConfirmed && { bookieMarketClosed: true }),
    // Total AUD matched on this market so far — same figure Betfair's
    // own market page shows as "Matched: AUD X" (confirmed directly
    // against a live market page before shipping). Display only.
    totalMatched: totalMatchedIsFresh ? stored.liveRace.totalMatched : (book.totalMatched ?? null),
    ...(totalMatchedIsFresh && { totalMatchedUpdatedAt: stored.liveRace.totalMatchedUpdatedAt }),
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

// Lists upcoming AU/NZ races with a direct link to that exact race on both
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
  const [markets, sportsbetEvents, { tabVenueCodes = {} }, { pendingResultChecks = [] }, { liveRace }] =
    await Promise.all([
      // 20, not 15 — now split across every supported sport instead of just
      // horse racing, so the same-ish count needs a bit more headroom to
      // still show a reasonable spread of both.
      listWinMarkets(appKey, sessionToken, [...eventTypeIds.values()], 20),
      fetchSportsbetNextEvents(),
      chrome.storage.local.get(["tabVenueCodes"]),
      chrome.storage.local.get(["pendingResultChecks"]),
      chrome.storage.local.get(["liveRace"]),
    ]);

  // checkPendingResults stamps a real OPEN/SUSPENDED/CLOSED market status
  // onto a pending race once its scheduled start time has passed and it's
  // been checked — carried over here so the sidebar can tell "past its
  // scheduled time but genuinely still OPEN, a late jump" apart from
  // "actually gone", instead of assuming the schedule itself is accurate.
  // A race not yet in this map (too new to have been checked yet) simply
  // has no marketStatus, same as before this existed.
  const marketStatusByMarketId = new Map(
    pendingResultChecks.filter((r) => r.marketStatus).map((r) => [r.marketId, r.marketStatus])
  );

  // pendingResultChecks is REST-only, checked in batch (checkPendingResultsInner)
  // — the exact same lag totalMatched/marketStatus had for the main panel
  // before betfairWatcher.js started scraping the page live. liveRace
  // (refreshRaceInner) already carries that fresher, DOM-confirmed status
  // for whichever one race is currently selected — layering it in here too
  // means the sidebar row for that same race stops disagreeing with its
  // own top-bar countdown (user-reported: the top bar correctly said
  // "Jumped", the sidebar row for the identical race still counted down).
  if (liveRace?.marketId && liveRace.marketStatus) {
    marketStatusByMarketId.set(liveRace.marketId, liveRace.marketStatus);
  }

  // bookieMarketClosed (see refreshRaceInner) is what actually drives a
  // race card's own "IN PLAY" now, not marketStatus above. It has no
  // REST equivalent at all — nothing exposes a bookmaker's own market
  // status via API, only sportsbetWatcher.js/tabWatcher.js's live DOM
  // scrape of whichever ONE tab is actually open — so only the
  // currently-selected race (liveRace) can ever carry it. Every other
  // row simply has none, same inherent limitation pendingResultChecks
  // already had for any race without a live tab open.
  const bookieMarketClosedMarketId =
    liveRace?.marketId && liveRace.bookieMarketClosed === true ? liveRace.marketId : null;

  // Same inherent limitation again — whether ANY bookie has gone "live"
  // for this race (liveRace.bookmakerSources) only ever exists for the
  // currently-selected race, so only its own sidebar row can carry this.
  // Threaded through so that row's own countdown stops trusting
  // Betfair's own status as a fallback the instant a live tab is
  // actually open and confirming the market's still tradeable — see
  // popup.js's isBetfairMarketClosed for why that fallback needs
  // scoping at all.
  const hasLiveBookieMarketId =
    liveRace?.marketId && Object.values(liveRace.bookmakerSources || {}).includes("live")
      ? liveRace.marketId
      : null;

  // Same idea again for the winner itself (see applyBetfairOdds's own
  // winnerName handling) — lets the sidebar's own countdown switch
  // straight to "RESULTED" for the selected race the instant the top
  // bar does, instead of only via checkPendingResultsInner's separate,
  // REST-only result check (which has its own real lag on a Delayed
  // key — see the winner-detection fix this was built alongside). Same
  // inherent limitation as bookieMarketClosed above:
  // only the currently-selected race can ever carry this here.
  const winnerByMarketId =
    liveRace?.marketId && liveRace.winner ? new Map([[liveRace.marketId, liveRace.winner]]) : new Map();

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
      //
      // namesMatch (not ===) for the venue itself — same whole-word-prefix
      // treatment already used for runner names, needed here for the same
      // reason: Sportsbet calls a track by a longer name than Betfair's
      // plain one for the exact same venue. Confirmed live with NZ's own
      // Cambridge: Betfair lists it as plain "Cambridge", Sportsbet as
      // "Cambridge Synthetic" (its all-weather track) — an exact match
      // never had a chance, this venue simply never matched at all.
      const sbMatch = sportsbetEvents.find(
        (e) =>
          sport.sportsbetTypes.includes(e.type) &&
          namesMatch(normalizeVenue(e.competitionName), normalizeVenue(track)) &&
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
        // "AU"/"NZ" — Betfair's own EVENT projection already returns
        // this on every market (same one listWinMarkets already asks
        // for), no extra API cost. Lets the sidebar's own country
        // toggle (popup.js) filter Today's list without needing a
        // second field just for that.
        country: market.event.countryCode,
        startTime: market.marketStartTime,
        marketId: market.marketId,
        marketStatus: marketStatusByMarketId.get(market.marketId) ?? null,
        bookieMarketClosed: market.marketId === bookieMarketClosedMarketId,
        hasLiveBookie: market.marketId === hasLiveBookieMarketId,
        winner: winnerByMarketId.get(market.marketId) ?? null,
        betfairUrl: `https://www.betfair.com.au/exchange/plus/${sport.betfairUrlSegment}/market/${market.marketId}`,
        sportsbetUrl: sbMatch ? buildSportsbetRaceUrl(sbMatch) : null,
        // null until tabMeetings.js has learned this venue/sport's TAB
        // code — no "!" warning marker for this one, unlike Sportsbet,
        // since not knowing yet is the expected steady state for most
        // tracks rather than something to flag as wrong.
        //
        // raceType, not sport.id — tabMeetings.js learns codes keyed by
        // TAB's own R/H/G scheme (harness genuinely stored under
        // "harness"), but sport.id is always "horse" for anything under
        // Betfair's single "Horse Racing" event type, never "harness".
        // Passing sport.id here meant harness venues' codes, learned
        // correctly, were never found by a lookup that only ever
        // searched under "horse" — user-reported as "TAB doesn't
        // auto-load harness races".
        tabUrl: tabRaceUrlFromCodes(tabVenueCodes, track, raceType, raceNumber, market.marketStartTime),
        // No ladbrokesUrl field at all yet — see BOOKIE_EXTRAS' own
        // comment for why. openRaceTabs (popup.js) already treats a
        // missing bookie URL field as "nothing to open for this one",
        // same as it would treat an explicit null, so leaving the key
        // out entirely here needs no special-casing there.
      };
    })
    .filter((r) => r.raceNumber !== null);

  await chrome.storage.local.set({ upcomingRaces: races });
  await seedPendingResultChecks(races);
  return races;
}

// Every race currently "upcoming" (per listWinMarkets' own start-time
// filter, hasn't jumped yet) becomes a candidate to check for a real
// result later, once its start time has passed — see checkPendingResults.
// Merged in rather than replaced, so a race that's already pending from
// an earlier fetch isn't lost just because this particular ~20-race
// window doesn't happen to include it again.
async function seedPendingResultChecks(races) {
  const { pendingResultChecks = [] } = await chrome.storage.local.get(["pendingResultChecks"]);
  const known = new Set(pendingResultChecks.map((r) => r.marketId));
  const additions = races
    .filter((r) => !known.has(r.marketId))
    .map((r) => ({
      marketId: r.marketId,
      track: r.track,
      raceNumber: r.raceNumber,
      sport: r.sport,
      raceType: r.raceType,
      startTime: r.startTime,
    }));

  if (additions.length > 0) {
    await chrome.storage.local.set({
      pendingResultChecks: [...pendingResultChecks, ...additions],
    });
  }
}

// Checks every pending race whose start time has already passed for a
// real result (a runner marked WINNER) — Betfair's own listMarketBook
// keeps returning a market for a while after it closes (the same
// mechanism the winner banner already relies on for whichever race is
// currently selected), so this works the same way for any other race
// too. Once a race is confirmed settled it's simply dropped from
// pendingResultChecks — the only thing this feeds now is the sidebar's
// own marketStatus (see listUpcomingRacesInner). Gives up on a pending
// race (drops it, unresolved) once its start time is more than
// RESULT_CHECK_MAX_AGE_MS in the past, covering an abandoned/void
// market that never actually settles.
async function checkPendingResultsInner() {
  const { betfairAppKey: appKey, betfairSessionToken: sessionToken } = await chrome.storage.sync.get([
    "betfairAppKey",
    "betfairSessionToken",
  ]);
  if (!appKey || !sessionToken) return; // not connected yet — nothing to check

  const { pendingResultChecks = [] } = await chrome.storage.local.get(["pendingResultChecks"]);
  if (pendingResultChecks.length === 0) return;

  const now = Date.now();
  const due = pendingResultChecks.filter((r) => now >= new Date(r.startTime).getTime());
  const notYetDue = pendingResultChecks.filter((r) => now < new Date(r.startTime).getTime());
  if (due.length === 0) return;

  const books = await getMarketBook(appKey, sessionToken, due.map((r) => r.marketId));
  const bookByMarketId = new Map(books.map((b) => [b.marketId, b]));

  const stillPending = [];
  for (const race of due) {
    const book = bookByMarketId.get(race.marketId);
    const hasWinner = book?.runners?.some((r) => r.status === "WINNER");
    if (hasWinner) continue; // settled — drop it, nothing further to track

    if (now - new Date(race.startTime).getTime() < RESULT_CHECK_MAX_AGE_MS) {
      // Not settled yet — retry next tick. Carries the market's actual
      // OPEN/SUSPENDED/CLOSED status along (see listUpcomingRacesInner,
      // which merges this onto the matching upcoming race), so the
      // sidebar can tell "past its scheduled time but genuinely still
      // OPEN — a late jump" apart from "actually gone". Sticky once
      // non-OPEN, same reasoning as refreshRaceInner's
      // alreadyConfirmedNonOpen — status only ever moves forward, so a
      // later tick reporting OPEN again (a brief in-running flicker, or
      // REST lag going the other way this time) shouldn't undo an
      // already-confirmed "Jumped".
      stillPending.push({
        ...race,
        marketStatus: race.marketStatus && race.marketStatus !== "OPEN" ? race.marketStatus : book?.status,
      });
    } // else: given up on — dropped silently rather than checked forever
  }

  await chrome.storage.local.set({
    pendingResultChecks: [...notYetDue, ...stillPending],
  });
}

async function checkPendingResults() {
  return withSessionRetry(checkPendingResultsInner);
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
  // Once betting's closed, sportsbetWatcher.js deliberately stops
  // scraping runner prices at all (its own market having gone in-play —
  // see its own comment) and sends an empty runners array here just to
  // still carry marketClosed through. Skip caching that as the "most
  // recent scan": refreshRaceInner's own REST-refresh fallback
  // (recentBookieRunners) reads this same cache, and an empty runners
  // list there would make it find no price for anyone and fall back to
  // the synthetic betfair×1.08 placeholder (or null) on its very next
  // ~60s tick — silently replacing a real frozen price with a made-up
  // one, undoing the whole point of freezing it in the first place.
  if (!(odds.marketClosed === true && odds.runners.length === 0)) {
    await chrome.storage.local.set({
      bookmakerOdds: { ...bookmakerOdds, [bookieId]: odds },
    });
  }

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

  // marketClosed (sportsbetWatcher.js/tabWatcher.js's own scrapeMarketClosed())
  // — the race timer's actual "gone in-play" trigger now (see popup.js's
  // isRaceInPlay). Betfair itself deliberately plays no part in this any
  // more — user-reported it stays tradeable well past the real jump, so
  // its own status was never a reliable signal for this. Checked
  // separately from `matched` so it isn't dropped by the bail-out below.
  // `matched` is always 0 once marketClosed is true for Sportsbet
  // specifically (it deliberately sends `runners: []` from that point
  // on, rather than risk feeding misaligned in-play prices into the
  // comparison table — see sportsbetWatcher.js's own comment), so this
  // bypass is what lets the marketClosed flag itself still get written.
  const hasMarketClosed = odds.marketClosed === true;
  if (matched === 0 && !hasMarketClosed) return; // this update doesn't concern the loaded race

  await chrome.storage.local.set({
    liveRace: {
      ...liveRace,
      runners,
      bookmakerSources: { ...liveRace.bookmakerSources, [bookieId]: "live" },
      // Sticky, same reasoning as marketStatus's own alreadyConfirmedNonOpen
      // — betting closing is one-way, so this must never be re-derived
      // back to falsy by a later refresh that doesn't happen to touch it.
      ...(hasMarketClosed && { bookieMarketClosed: true }),
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
      // Back side is optional — only present when betfairWatcher.js's
      // (now verified — see betfairWatcher.js) Back-cell selector actually
      // matched. Absent, this runner's Back price/liquidity is simply left
      // as whatever it already was, so refreshRace()'s REST call is free
      // to keep supplying it instead.
      return {
        ...runner,
        betfair: fresh.price,
        betfairLiquidity: fresh.liquidity ?? null,
        betfairPricedAt: Date.now(),
        ...(fresh.backPrice !== undefined && {
          betfairBack: fresh.backPrice,
          betfairBackLiquidity: fresh.backLiquidity ?? null,
          betfairBackPricedAt: Date.now(),
        }),
        // Real per-horse silks (betfairWatcher.js's own scrapeSilks) —
        // sticky once known, same reasoning as everything else here:
        // silks don't change mid-race, so a later update that happened
        // not to carry one (nothing forces every scrape to re-read it)
        // should never erase an already-known one.
        ...(fresh.silkUrl !== undefined && { silkUrl: fresh.silkUrl }),
      };
    }
    return runner;
  });

  // totalMatched (betfairWatcher.js's scrapeTotalMatched()) is race-wide,
  // not per-runner, so it can arrive on an update that touched no runner
  // price at all (e.g. only the matched-volume text changed) — checked
  // separately from `matched` so that update isn't dropped by the bail-out
  // below.
  const hasTotalMatched = typeof odds.totalMatched === "number";
  // statusLabel (scrapeMarketStatusLabel()) is the same story — the
  // ladder itself typically has no runner cells at all once suspended,
  // so `matched` alone would be 0 exactly when this matters most.
  const hasStatusLabel = typeof odds.statusLabel === "string";

  // winnerName (scrapeWinnerName()) — matched by normalizeName against
  // this race's own runner names, since the DOM's plain name ("Paua Of
  // Queens") lacks the box-number prefix Betfair's catalogue runnerName
  // (and so this race's own stored name) carries ("1. Paua Of Queens").
  // Confirmed live: REST kept reporting book.status=OPEN/winner=null
  // minutes after Betfair's own page already showed "Closed" with this
  // exact name — same class of Delayed-key lag as marketStatus/
  // totalMatched, just longer-lasting than either. No fuzzy namesMatch
  // needed (unlike bookmaker-name matching) — both sides are Betfair's
  // own name for the same runner, just with/without the prefix.
  const winnerRunner =
    typeof odds.winnerName === "string"
      ? runners.find((r) => normalizeName(r.name) === normalizeName(odds.winnerName))
      : undefined;
  const runnersWithWinner = winnerRunner
    ? runners.map((r) => (r === winnerRunner ? { ...r, result: "WINNER" } : r))
    : runners;

  if (matched === 0 && !hasTotalMatched && !hasStatusLabel && !winnerRunner) return; // this update doesn't concern the loaded race

  await chrome.storage.local.set({
    liveRace: {
      ...liveRace,
      runners: runnersWithWinner,
      ...(winnerRunner && { winner: winnerRunner.name }),
      // Stamped so refreshRaceInner() knows this is fresher than whatever
      // REST's own totalMatched says on its next ~60s poll, same idea as
      // betfairPricedAt for prices.
      ...(hasTotalMatched && {
        totalMatched: odds.totalMatched,
        totalMatchedUpdatedAt: Date.now(),
      }),
      // Same idea again for marketStatus — a market can go OPEN ->
      // Suspended right at the jump, and REST's own status can sit
      // stale for most of the ~60s poll interval, leaving the popup's
      // countdown looking stuck instead of switching to "Jumped".
      // Uppercased only to match REST's own OPEN/SUSPENDED/CLOSED
      // casing for anything else that reads marketStatus — the exact
      // wording doesn't matter to formatCountdown's own check, just
      // that it isn't "OPEN". No updatedAt/expiry here — see
      // refreshRaceInner's alreadyConfirmedNonOpen: this must stick,
      // not fall back to a stale REST "OPEN" once the DOM stops
      // sending updates (nothing left to send once the label settles).
      ...(hasStatusLabel && {
        marketStatus: odds.statusLabel.toUpperCase(),
      }),
      fetchedAt: Date.now(),
    },
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

  if (message.type === "LADBROKES_ODDS_UPDATED") {
    applyBookieOdds("ladbrokes", message.odds).catch((err) =>
      console.warn("Failed to apply live Ladbrokes update:", err.message)
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

// Small inline icon (currentColor, inherits .winner-tag's own green) for
// the "Winner" tag on a settled runner's row — replaces a plain trophy
// emoji, same flat single-colour treatment as the rest of the header
// icons (see applyTheme's own THEME_ICON_MOON/SUN).
const WINNER_ICON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"/></svg>';

// Commission-adjusted edge, generalized for a partial hedge (0-100% of a
// full lay). At hedge=1 this is exactly the standard QL% formula
// (100 × [B(1-c) - (L-c)] / (L-c)); at hedge=0 commission drops out
// entirely, leaving the plain (B-L)/L ratio — since a bet you never lay
// off never touches Betfair, so no commission applies. Values in between
// scale commission's effect by the hedge fraction. Verified against a
// real matched-betting tool's output at both endpoints for the same
// runner/prices: hedge=1 and hedge=0 each matched its QL% column exactly.
// See commission.js for the Betfair Market Base Rate table `commission`
// pulls from.
function edgePercent(betfair, bookmaker, commission, hedge) {
  const c = commission * hedge;
  return ((bookmaker * (1 - c)) / (betfair - c) - 1) * 100;
}

// Betfair lay stake required to hedge a back bet, adjusted for commission
// (the naive stake×backOdds/layOdds ignores that Betfair takes a cut of
// the lay side's winnings, understating the true required stake). Hedge
// scales this linearly — unlike edgePercent's partial-hedge treatment,
// this is a literal stake amount: laying half the position means staking
// half of the full hedge amount, no more complex interpolation needed.
// Verified against real HorsePower output for stake=$50: back=15/lay=14
// -> $53.88, back=7/lay=7 -> $50.58, back=17/lay=22 -> $38.78 (all exact).
function layStake(stake, betfair, bookmaker, commission, hedge) {
  const fullHedge = (stake * bookmaker) / (betfair - commission);
  return fullHedge * hedge;
}

// Bonus Mode: a stake-not-returned (SNR) free/bonus bet only pays out the
// winnings (backOdds - 1), not the stake itself, so its hedge stake uses
// (bookmaker - 1) instead of bookmaker. Hedge scales linearly, same
// reasoning as layStake — laying half the position means staking half.
function layStakeBonus(bonusValue, betfair, bookmaker, commission, hedge) {
  const fullHedge = (bonusValue * (bookmaker - 1)) / (betfair - commission);
  return fullHedge * hedge;
}

// Retention % — what fraction of a bonus bet's face value converts into
// guaranteed real cash after hedging. Directly derived from
// layStakeBonus's full-hedge stake: a full hedge makes win/lose profit
// identical, and the lose-case profit for a free bet is simply the lay
// stake's return net of commission (nothing real was risked on the back
// side to begin with) — so guaranteedProfit = fullHedgeStake × (1-c), and
// Retention% = 100 × guaranteedProfit / bonusValue, which simplifies to
// the form below. Partial hedge scales commission's effect the same way
// edgePercent does.
function bonusRetentionPercent(betfair, bookmaker, commission, hedge) {
  const c = commission * hedge;
  return (100 * (bookmaker - 1) * (1 - c)) / (betfair - c);
}

// Qualifying loss/gain (QL) — the signed dollar result of the
// qualifying bet behind Run 2nd/Run 2nd 3rd modes' own EV below, at a
// given Hedge %. Constant regardless of whether the runner wins or
// finishes anywhere else: a Betfair win-market lay only ever pays out
// on win vs. not-win, so it can't tell 2nd from last — the bonus modes'
// promo trigger is a completely separate thing bolted on top (see
// promoEVPercent). At 0% hedge this is just the qualifying bet's own
// unhedged result; at 100% it's the fully commission-adjusted hedge
// result; in between, a straight linear blend of the two — an explicit
// approximation (not an exact partial-hedge derivation), same as the
// formula this was built from (see the "Racing Edge & EV Formulas" doc
// in this repo).
function qlNoHedge(stake, bestPrice, layOdds) {
  return stake * (bestPrice / layOdds - 1);
}
function qlFullHedge(stake, bestPrice, layOdds, commission) {
  return stake * ((bestPrice * (1 - commission)) / (layOdds - commission) - 1);
}
function qualifyingLoss(stake, bestPrice, layOdds, commission, hedge) {
  return (1 - hedge) * qlNoHedge(stake, bestPrice, layOdds) + hedge * qlFullHedge(stake, bestPrice, layOdds, commission);
}

// Run 2nd / Run 2nd 3rd modes: EV of the qualifying bet (QL, constant
// regardless of finishing position — see qualifyingLoss above) plus a
// bonus bet awarded only on the promo's own trigger placing(s). Total
// EV is simply QL + Pr(trigger) × refund — placeProb is Pr(2nd) for Run
// 2nd, Pr(2nd or 3rd) for Run 2nd 3rd; callers (metricPercent/
// bookieMetricPercent, via promoPlaceProb) pass in whichever already
// applies, each from its own source (see promoPlaceProb's own
// comment). Refund's bonus cap defaults to the stake itself ("commonly
// C = S" per the formula doc) — same convention Bonus Mode already
// uses for its own bonus-bet size. null placeProb (no reliable source
// for this runner — see promoPlaceProb) returns null right back, same
// "no reliable number to show" convention bookieMetricPercent already
// uses for a missing bookmaker price. Expressed as a % of stake (like
// Edge%/Ret%), not a raw dollar figure, so it slots into the exact
// same column/threshold/sorting infrastructure those two already use.
function promoEVPercent(betfair, bookmaker, commission, hedge, stake, retention, placeProb) {
  if (placeProb == null) return null;

  const ql = qualifyingLoss(stake, bookmaker, betfair, commission, hedge);
  const refund = stake * (retention / 100);
  const ev = ql + placeProb * refund;

  return (ev / stake) * 100;
}

// User-specified rule of thumb, used only when the real place market
// pays 3 (not 2) — see run2ndWinEVPercent below: in a balanced field,
// finishing 2nd is always slightly more likely than 3rd, so the
// combined "2nd or 3rd" probability gap a Top 3 market implies is split
// 55/45 in 2nd's favour rather than treated as an even 50/50 split.
const TOP3_SECOND_PLACE_SHARE = 0.55;

// Run 2nd You Win mode — user-specified formula (a standard "3 outcome"
// promo-value calculator, not this file's own hedge-blended QL
// approach): the raw, UNHEDGED expected value of taking the bookmaker
// bet at face value, weighting its three real outcomes (win, 2nd,
// anything else) by their own true probabilities. No Betfair lay at
// all — commission/hedge don't enter into this, unlike every other
// mode here.
//
// True probabilities are estimated the standard "no-vig" way (1 over
// the fair price), sourced from Betfair's own markets rather than the
// bookmaker's own (vigged) price — same convention this file already
// uses elsewhere (e.g. Harville's own raw 1/layOdds):
//
//   P(win)  = 1 / betfair       — Betfair's own WIN lay price.
//   P(topK) = 1 / placeBetfair  — Betfair's own PLACE lay price, where
//             K is whatever the real place market actually pays
//             (currentRace.placeMarketWinners — 2 or 3; anything else,
//             including no place market at all, leaves this whole mode
//             uncomputable).
//
// K = 2 (a real "Top 2 Finish" market): P(topK) already isolates
// win-or-2nd directly, so P(2nd) = P(top2) - P(win), no adjustment
// needed.
//
// K = 3 (a real "Top 3 Finish" market, the common case for a bigger
// field): P(topK) - P(win) is the COMBINED "2nd or 3rd" probability,
// not P(2nd) alone — split it via TOP3_SECOND_PLACE_SHARE (55/45)
// rather than leaving the whole mode uncomputable, since a real Top 2
// market genuinely doesn't exist for most bigger AU/NZ fields.
//
// Either way, P(lose) is then whatever's left over once win and 2nd
// are both accounted for (1 - P(win) - P(2nd)) — 3rd-or-worse when
// K=3, since the promo doesn't pay on 3rd even though the market itself
// prices top 3 together.
//
// Payout per outcome: the promo pays 2nd exactly like a win (full
// price), so profitWin = profit2nd = stake × (bookmaker - 1); a loss is
// just -stake.
//
//   EV = P(win)×profitWin + P(2nd)×profit2nd - P(lose)×stake
//
// null whenever there's no real 2- or 3-place market to source P(topK)
// from, or this runner's own placeBetfair/betfair is missing — same "no
// reliable number to show" convention used everywhere else here.
function run2ndWinEVPercent(betfair, bookmaker, stake, placeBetfair) {
  const winners = currentRace?.placeMarketWinners;
  if ((winners !== 2 && winners !== 3) || placeBetfair == null || betfair == null) return null;

  const pWin = 1 / betfair;
  const pTopK = 1 / placeBetfair;
  const p2ndOr3rdGap = pTopK - pWin;
  const p2nd = winners === 2 ? p2ndOr3rdGap : p2ndOr3rdGap * TOP3_SECOND_PLACE_SHARE;
  const pLose = 1 - pWin - p2nd;

  const profitWinOr2nd = stake * (bookmaker - 1);

  const ev = pWin * profitWinOr2nd + p2nd * profitWinOr2nd - pLose * stake;

  return (ev / stake) * 100;
}

// Settings > Bookie — user-clarified this now means ONLY "which
// bookmakers are available to search/select" (the Daily Planner's own
// Bookmaker(s) field, the sidebar's Bookie Spotlight, and opening a
// bookie's own race tab), NOT "which bookie columns show in the odds
// table" any more — that's now driven entirely by which bookies are
// actually planned or spotlighted for the loaded race (see
// raceDisplayedBookieIds, computed fresh per race in renderRace).
// bookies.js's BOOKIE_LIST stays the full, unfiltered set;
// background.js keeps scraping/tracking every one of them regardless,
// so re-enabling one here (or planning/spotlighting a disabled one
// that was already selected before) picks its odds straight back up
// with no fresh scan needed.
function visibleBookies() {
  return BOOKIE_LIST.filter((b) => currentSettings.enabledBookies.includes(b.id));
}

function noteFor(race) {
  const systemNotePart = race.systemNote ? `${race.systemNote} ` : "";

  const betfairPart =
    race.source === "live-betfair"
      ? `Betfair: live${
          race.fetchedAt ? ` (updated ${new Date(race.fetchedAt).toLocaleTimeString()})` : ""
        }.`
      : "Showing mock data — live odds not yet connected.";

  if (race.source !== "live-betfair") return systemNotePart + betfairPart;

  const bookmakerPart = visibleBookies()
    .map(
      (b) =>
        ` ${b.label}: ${
          race.bookmakerSources?.[b.id] === "live" ? "live." : "placeholder markup (not yet scanned)."
        }`
    )
    .join("");

  return systemNotePart + betfairPart + bookmakerPart;
}

// The highest price across every bookmaker actually shown as a column
// right now (displayedBookieIds — planner/spotlight picks for this
// race, NOT every enabled bookie any more) for this runner, and which
// bookie(s) it came from (more than one if tied) — that price is what
// Edge%/Ret%/Lay $/Liability get computed against, so the table always
// reflects the best real opportunity actually on screen, never a
// bookmaker whose own column isn't even displayed. The raw per-bookie
// price columns still show every DISPLAYED bookmaker's own number
// alongside it (with the winning one(s) highlighted), so nothing about
// the comparison itself is hidden among what's actually shown — this
// just picks what feeds the metric, and what the dedicated Best Price
// column displays.
function bestBookmakerPrices(runner, displayedBookieIds) {
  let price = null;
  for (const bookie of BOOKIE_LIST) {
    if (!displayedBookieIds.has(bookie.id)) continue;
    const p = runner.bookmakers?.[bookie.id];
    if (p != null && (price === null || p > price)) price = p;
  }
  if (price === null) return { price: null, bookieIds: [] };

  const bookieIds = BOOKIE_LIST.filter(
    (b) => displayedBookieIds.has(b.id) && runner.bookmakers?.[b.id] === price
  ).map((b) => b.id);
  return { price, bookieIds };
}

let currentRace = null;

// Tracks the loaded race's own in-play state across renders (auto-refresh/
// live updates call renderRace repeatedly for the same race, not just
// once) so the flash-on-suspend effect (see renderRace's own comment)
// fires exactly once — the moment it flips from not-in-play to in-play —
// instead of on every re-render for as long as the race stays in play.
// Reset whenever a different race's marketId loads, so switching races
// never spuriously flashes just because the new one happens to already
// be in play.
let lastRenderedMarketId = null;
let lastRenderedInPlay = false;

// True for as long as the currently loaded race is in play (see
// renderRace) — read by formatMetric to blank every Edge%/Ret%/EV%
// figure on screen while it's set, since a suspended bookmaker market's
// prices are no longer tradeable and a figure computed against them
// would be misleading. Independent of Settings > Display's own
// metricDisplay ("off" is a persistent user choice; this is a temporary,
// race-driven state that reverts the moment the market's no longer
// suspended).
let metricsSuspended = false;

// This race's own Harville place-probability model (computeHarvilleModel,
// promoPlaceProb — Run 2nd/Run 2nd 3rd modes) — rebuilt fresh every
// renderRace rather than only when the race first loads, same reasoning
// as metricsSuspended above: the model depends on live prices
// (normalizedWinProbs) and the real place market's own live
// placeBetfair, both of which keep changing on every odds update.
let currentHarvilleModel = null;

// "number" (by runner number, ascending) or "edge" (by edge %, lowest to
// highest first, best value on top). Persists across re-renders of the
// same popup session so auto-refresh/live updates don't keep resetting it
// back to the default.
let sortMode = "edge";

// 0-100, how much of the recommended lay to factor into Edge% — 100 = full
// lay (standard QL%), 0 = back bet only (no commission). Persists across
// re-renders for the same reason sortMode does.
let hedgePercent = 100;

// Back stake used to compute the Lay $ column. Persists the same way.
let stakeAmount = 50;

// "mug" (standard Win back+lay), "bonus" (SNR free/bonus bet
// retention), "run2nd" (qualifying bet + a bonus bet only if 2nd),
// "run2nd3rd" (same, but 2nd or 3rd) — see promoEVPercent for these two
// — or "run2ndwin" (same 2nd-place trigger as run2nd, but the bookmaker
// pays out the FULL win price as real cash instead of a bonus-bet
// refund — see run2ndWinEVPercent). Determines both which formula the
// Lay $ and metric columns use, and what the metric column is even
// called (Edge/Ret%/EV%). Persists the same way as the other controls.
let currentMode = "mug";

// Which race types show up in the Upcoming Races list — "horse", "harness",
// "greyhound". All on by default (unfiltered, matching pre-filter
// behavior). Persists the same way as the other controls; filtering
// happens client-side against the last-fetched list (see latestRaces)
// rather than re-querying background.js, so toggling is instant.
let selectedRaceTypes = new Set(["horse", "harness", "greyhound"]);

// "AU"/"NZ" — same on/off toggle pattern as selectedRaceTypes above,
// applied together in renderFilteredRacesList's own matchesFilter.
// Both on by default. race.country comes straight from Betfair's own
// EVENT projection (listUpcomingRacesInner, background.js) — every
// race this extension ever lists is already AU or NZ (listWinMarkets'
// own marketCountries filter), so there's no third value to account
// for here.
let selectedCountries = new Set(["AU", "NZ"]);
let latestRaces = [];

// Free-text filter over the Upcoming Races list, matched against track
// name — combined with the Race Types toggles and (like them) applied
// client-side against the last-fetched list rather than re-querying
// background.js on every keystroke.
let trackSearchQuery = "";

// Which race's marketId is currently loaded into the main table — purely
// for highlighting that race's row in the sidebar list (renderRacesList),
// kept in sync both on a manual click and whenever a race object with its
// own marketId gets rendered (e.g. on startup, before the list has even
// loaded yet).
let selectedMarketId = null;

// Populated once loadSettings() resolves (see the bottom of this file) —
// starts at DEFAULT_SETTINGS so anything reading it before then (tab
// opening, countdown rendering) still gets sane values rather than
// undefined. Unlike the per-session controls above (sortMode, stakeAmount,
// etc. — which the Settings page's Default* fields only seed the INITIAL
// value of), currentSettings is read live by openRaceTabs/renderRacesList
// on every use, since pin/focus/countdown-visibility are meant to apply
// consistently for the whole session, not just at startup.
let currentSettings = DEFAULT_SETTINGS;

// Settings opens as an in-page modal (popup.html) rather than navigating
// to a separate options.html tab — options.js manages every field inside
// it exactly as it already did on the standalone options page (same ids,
// unmodified), so this is purely about where that UI is shown, not how it
// works. Right-click "Options" on the toolbar icon still opens the
// standalone page too.
const settingsModal = document.getElementById("settings-modal");

document.getElementById("settings-btn").addEventListener("click", () => {
  settingsModal.hidden = false;
});

// Settings changed via the modal go straight to chrome.storage.sync
// (options.js's own auto-save) — this re-reads them into the live session
// the moment the modal closes, so e.g. toggling "Show liquidity" is
// visible immediately without needing a manual reload. Deliberately only
// the *display* settings (see applyDisplaySettings) — Default Mode/Sort/
// Stake/Hedge/Race Types stay session-only once already loaded, same as
// changing them live in the popup never overwrites the Settings page's
// own Default* fields either.
function closeSettingsModal() {
  settingsModal.hidden = true;
  loadSettings().then(applyDisplaySettings);
}

document.getElementById("settings-close-btn").addEventListener("click", closeSettingsModal);
document.getElementById("settings-done-btn").addEventListener("click", closeSettingsModal);

// Clicking the dimmed backdrop closes it too, standard modal UX — but not
// clicks that started inside the panel and merely bubbled up to it (e.g. a
// drag-select that ends outside).
settingsModal.addEventListener("mousedown", (event) => {
  if (event.target === settingsModal) closeSettingsModal();
});

for (const tabBtn of document.querySelectorAll(".modal-tab-btn")) {
  tabBtn.addEventListener("click", () => {
    for (const btn of document.querySelectorAll(".modal-tab-btn")) {
      btn.classList.toggle("active", btn === tabBtn);
    }
    for (const panel of document.querySelectorAll(".modal-tab-panel")) {
      panel.hidden = panel.dataset.tab !== tabBtn.dataset.tab;
    }
  });
}

// --- Daily Planner -----------------------------------------------------
//
// User-requested: plan ahead of time which of today's races you're
// running a promo on, on which bookmaker(s), and under which promo
// type — instead of figuring that out race by race as you get to it.
// Every field is a plain typeable text input with a <datalist> behind
// it for suggestions (user-requested — a native <select> needed a
// click to even see its options; typing is faster once you already
// know what you want). A saved entry highlights that race's own
// sidebar card (raceCardHtml's own plannerEntriesForMarketId lookup)
// and, once the race is actually loaded, highlights every bookmaker
// column you picked in the odds table and switches the mode tab to
// match (renderRace).
let dailyPlannerEntries = [];

// A separate working copy, only edited while the modal is open — Save is
// what actually commits it to dailyPlannerEntries/storage. Closing via
// the × or the backdrop instead just discards whatever was added,
// removed, or changed since it was opened.
let plannerDraftEntries = [];

// Every committed entry for one race — plural, since a single race can
// now be planned against more than one bookmaker at once (each still
// its own entry, sharing the same marketId; see the Save handler).
function plannerEntriesForMarketId(marketId) {
  if (!marketId) return [];
  return dailyPlannerEntries.filter((e) => e.marketId === marketId);
}

// The single source of truth for "which bookmakers actually belong to
// this race" — the union of whatever's planned against it (Daily
// Planner) and whatever's currently picked in the sidebar's Bookie
// Spotlight. renderRace's own column visibility AND openRaceTabs' own
// tab-opening both call this same function now, rather than each
// computing their own copy — user-reported bug, found from exactly
// that drifting apart: a race planned against Sportsbet only still
// opened Sportsbet+TAB+Ladbrokes tabs, because openRaceTabs was
// checking only the Spotlight's own picks and never looked at the
// Planner at all. Settings > Bookie deliberately has no say here
// either way — see visibleBookies()'s own comment.
function raceDisplayedBookieIds(race) {
  return new Set([...plannerEntriesForMarketId(race?.marketId).map((e) => e.bookieId), ...spotlightBookieIds]);
}

// User-requested: deselecting a bookmaker (removing its chip from the
// Bookie Spotlight, or a Daily Planner Save that no longer plans it
// against the loaded race) should close its own currently-open tab
// automatically, not just stop opening new ones for it going forward
// — even if that tab had already been open from before the
// deselection. Uses the exact same raceDisplayedBookieIds openRaceTabs
// itself opens tabs for, so "still needed" can never disagree between
// the two: a bookmaker still planned for this race or still
// spotlighted is always left alone, regardless of which one of those
// changed just now. Safe to call broadly any time either changes —
// every bookie still needed is simply skipped.
async function closeUnneededBookieTabs(race) {
  if (!race) return;
  const neededIds = raceDisplayedBookieIds(race);
  for (const bookie of BOOKIE_LIST) {
    if (neededIds.has(bookie.id)) continue;
    const tabIdKey = `${bookie.id}TabId`;
    const stored = await chrome.storage.local.get([tabIdKey]);
    const tabId = stored[tabIdKey];
    if (!tabId) continue;
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // Already closed by the user in the meantime — nothing to do.
    }
    await chrome.storage.local.remove([tabIdKey]);
  }
}

// Loaded once at startup — this callback runs well after the rest of
// this script has finished defining everything below (renderFilteredRacesList
// included), same as chrome.storage.local.get(["liveRace"], ...) further
// down already relies on for the exact same reason, so referencing it
// here before its own declaration is safe.
chrome.storage.local.get(["dailyPlanner"], (stored) => {
  dailyPlannerEntries = stored.dailyPlanner || [];
  renderFilteredRacesList(); // picks up each row's own sidebar highlight, in case the list already rendered first
});

const plannerModal = document.getElementById("planner-modal");
const plannerBodyEl = document.getElementById("planner-body");
const plannerStatusEl = document.getElementById("planner-status");
const plannerCourseDatalistEl = document.getElementById("planner-course-options");
const plannerPromoDatalistEl = document.getElementById("planner-promo-options");

// Promotion's datalist never changes (PLANNER_PROMO_MODES is static,
// loaded from bookies.js before this script runs) — filled once,
// rather than rebuilt on every render the way Course's own needs to be
// further down. Bookmaker has no datalist at all any more — it's its
// own search-and-select picker (plannerBookieCellHtml), not a typed
// value with suggestions.
plannerPromoDatalistEl.innerHTML = PLANNER_PROMO_MODES.map((m) => `<option value="${m.label}"></option>`).join("");

// Every distinct track currently in the sidebar's own list, still in
// jump-time order (latestRaces already comes sorted that way —
// listWinMarkets' own FIRST_TO_START) rather than alphabetical, so a
// track's soonest race is a sensible "just picked this course" default.
function plannerCourseOptions() {
  const seen = new Set();
  const tracks = [];
  for (const race of latestRaces) {
    if (!seen.has(race.track)) {
      seen.add(race.track);
      tracks.push(race.track);
    }
  }
  return tracks;
}

// Course's own datalist DOES change (depends on latestRaces) — rebuilt
// every time the table renders; cheap enough not to bother diffing.
function refreshPlannerCourseDatalist() {
  plannerCourseDatalistEl.innerHTML = plannerCourseOptions()
    .map((track) => `<option value="${track}"></option>`)
    .join("");
}

function plannerRacesForTrack(track) {
  return latestRaces.filter((r) => r.track === track);
}

// Exact, case-insensitive match against today's actual course names —
// same tradeoff a plain <select> already had (you could only ever pick
// a real option), just typed instead of clicked; free text that
// doesn't match anything real simply doesn't resolve to a course yet.
function plannerMatchTrack(text) {
  const trimmed = (text || "").trim().toLowerCase();
  if (trimmed === "") return null;
  return plannerCourseOptions().find((t) => t.toLowerCase() === trimmed) || null;
}

// Single value, matched the same way — only Run 2nd/Run 2nd 3rd are
// ever valid here (PLANNER_PROMO_MODES, bookies.js).
function plannerMatchPromoId(text) {
  const trimmed = (text || "").trim().toLowerCase();
  if (trimmed === "") return null;
  return PLANNER_PROMO_MODES.find((m) => m.label.toLowerCase() === trimmed)?.id || null;
}

// R6 3:32 pm — same 12-hour formatting raceCardHtml's own time already
// uses, just without the track name (the Course column right next to it
// already says that).
function plannerRaceLabel(race) {
  const time = race.startTime
    ? new Date(race.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
    : "";
  return `R${race.raceNumber ?? "?"}${time ? ` ${time}` : ""}`;
}

// "1-5" (inclusive), "3" (single), or a comma-separated mix of either
// ("1-3,5,7-8") — user-requested: type a range instead of picking one
// race at a time. Returns a Set of race numbers, or null if any
// comma-separated chunk doesn't parse (the whole input is treated as
// invalid then, rather than silently keeping just the parts that did).
function parseRaceRangeList(text) {
  const numbers = new Set();
  for (const part of text.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
    const singleMatch = trimmed.match(/^(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (end < start) return null;
      for (let n = start; n <= end; n++) numbers.add(n);
    } else if (singleMatch) {
      numbers.add(Number(singleMatch[1]));
    } else {
      return null;
    }
  }
  return numbers.size > 0 ? numbers : null;
}

// The inverse of parseRaceRangeList — collapses a set of race numbers
// back into the same syntax it accepts (contiguous runs become
// "start-end", singles stay bare, comma-separated, ascending). Only
// used when the modal reopens, turning the committed per-race entries
// (see openPlannerModal) back into one draft row's worth of range text
// — so an already-planned "1-5" still shows as "1-5" when you come back
// to edit it, not a flat "1,2,3,4,5".
function formatRaceRangeList(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const parts = [];
  let start = null;
  let prev = null;
  for (const n of sorted) {
    if (start === null) {
      start = n;
    } else if (n !== prev + 1) {
      parts.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = n;
    }
    prev = n;
  }
  if (start !== null) parts.push(start === prev ? `${start}` : `${start}-${prev}`);
  return parts.join(",");
}

// Which of that course's actual races a typed range currently resolves
// to — shared by the live preview below and the Save handler further
// down, so what you see before saving is exactly what gets saved.
// Takes the raw typed course text (not an already-resolved track name)
// so every caller resolves it the same way, via plannerMatchTrack.
function plannerMatchedRaces(courseText, rangeText) {
  const track = plannerMatchTrack(courseText);
  const numbers = rangeText ? parseRaceRangeList(rangeText) : null;
  if (!track || !numbers) return [];
  return plannerRacesForTrack(track)
    .filter((r) => numbers.has(r.raceNumber))
    .sort((a, b) => a.raceNumber - b.raceNumber);
}

// The bookmaker's own logo (same icon/asset the odds table header and
// Best Price badges already use — bookies.js's BOOKIE_LIST.logo) as a
// small, clickable-to-remove chip — not the text label, and sitting
// inside the same box as the search input itself (plannerBookieCellHtml),
// not stacked above it, per user request. The name is still reachable
// via this chip's own title attribute on hover.
function plannerBookieChipHtml(bookieId) {
  const bookie = BOOKIE_LIST.find((b) => b.id === bookieId);
  const label = bookie?.label || bookieId;
  return `<button type="button" class="planner-bookie-chip" data-bookie="${bookieId}" title="${label} — click to remove">${
    bookie?.logo ? `<img class="bookie-logo" src="${bookie.logo}" alt="${label}" />` : label
  }</button>`;
}

// Every bookmaker not already selected for this row, filtered by
// whatever's currently typed in the search box — a case-insensitive
// substring match (not an exact one, unlike Course/Promotion) since
// this is a browse-and-pick list, not a single typed value.
function plannerBookieSuggestions(searchText, selectedIds) {
  const query = (searchText || "").trim().toLowerCase();
  // visibleBookies() (not the raw BOOKIE_LIST) — user-requested: a
  // bookmaker disabled in Settings > Bookie shouldn't be pickable here
  // either, same as it's already hidden from the odds table itself.
  return visibleBookies().filter((b) => !selectedIds.includes(b.id) && b.label.toLowerCase().includes(query));
}

function plannerBookieSuggestionsHtml(searchText, selectedIds) {
  return plannerBookieSuggestions(searchText, selectedIds)
    .map((b) => `<button type="button" class="planner-bookie-suggestion" data-bookie="${b.id}">${b.label}</button>`)
    .join("");
}

// The whole Bookmaker(s) cell: one bordered box that looks like a
// single text input but actually contains the logo chips already
// picked *and* the search input side by side (not a separate chips
// row stacked above it, per user request) — clicking into any part of
// the box focuses the same search field. Its own (initially empty/
// hidden) suggestions dropdown floats below. User-requested
// interaction: type to search, click a suggestion to add its logo
// into the box, then keep typing to add another — see the
// "mousedown" handler further down for why picking a suggestion
// doesn't blur the search box.
function plannerBookieCellHtml(entry) {
  return `
    <div class="planner-bookie-cell">
      <div class="planner-bookie-box">
        ${entry.bookieIds.map(plannerBookieChipHtml).join("")}
        <input type="text" class="planner-bookie-search" placeholder="Search bookmaker..." autocomplete="off" />
      </div>
      <div class="planner-bookie-suggestions" hidden></div>
    </div>
  `;
}

// Rebuilds one row's Bookmaker(s) cell after its selection changes —
// scoped to just that cell (not a full renderPlannerTable(), which
// would rebuild every row and drop whatever else had focus) — then
// refocuses the search box with the given text and reopens its
// dropdown, so picking one bookmaker keeps the same "type, pick, type
// the next one" flow going without having to click back into the
// field.
function refreshPlannerBookieCell(cellEl, entry, searchText) {
  cellEl.innerHTML = plannerBookieCellHtml(entry);
  const searchInput = cellEl.querySelector(".planner-bookie-search");
  searchInput.value = searchText;
  searchInput.focus();
  const suggestionsEl = cellEl.querySelector(".planner-bookie-suggestions");
  suggestionsEl.innerHTML = plannerBookieSuggestionsHtml(searchText, entry.bookieIds);
  suggestionsEl.hidden = suggestionsEl.innerHTML === "";
}

function plannerRowHtml(entry, index) {
  const escape = (s) => (s || "").replace(/"/g, "&quot;");

  return `
    <tr data-index="${index}">
      <td><input type="text" class="planner-course-input" list="planner-course-options" placeholder="Course" value="${escape(
        entry.courseText
      )}" /></td>
      <td><input type="text" class="planner-race-range-input" placeholder="e.g. 1-5" value="${escape(
        entry.raceRangeText
      )}" /></td>
      <td class="planner-bookie-td">${plannerBookieCellHtml(entry)}</td>
      <td><input type="text" class="planner-promo-input" list="planner-promo-options" placeholder="Run 2nd 3rd" value="${escape(
        entry.promoText
      )}" /></td>
      <td><button type="button" class="planner-row-remove-btn" title="Remove">&times;</button></td>
    </tr>
  `;
}

function renderPlannerTable() {
  refreshPlannerCourseDatalist();
  if (plannerDraftEntries.length === 0) {
    plannerBodyEl.innerHTML =
      '<tr><td colspan="5" id="planner-empty-row">No races planned yet — click "+ Add row" to start.</td></tr>';
    return;
  }
  plannerBodyEl.innerHTML = plannerDraftEntries.map((entry, index) => plannerRowHtml(entry, index)).join("");
}

function plannerDefaultEntry() {
  const track = plannerCourseOptions()[0] || null;
  const firstRace = track ? plannerRacesForTrack(track)[0] : null;
  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    courseText: track || "",
    raceRangeText: firstRace ? String(firstRace.raceNumber) : "",
    bookieIds: [BOOKIE_LIST[0].id],
    promoText: PLANNER_PROMO_MODES[0].label,
  };
}

function openPlannerModal() {
  // The committed list (dailyPlannerEntries) is flat, one entry per
  // (race, bookmaker) pair — reconstructing draft rows is the inverse
  // of what Save does further down, in two passes: first, group by
  // (track, raceNumber, promoType) to see which bookmakers were
  // actually planned together for each individual race; then group
  // races that share the exact same (track, promoType, bookmaker set)
  // into one draft row, with those race numbers collapsed back into
  // range text (formatRaceRangeList). A plan saved as "1-5" on
  // "Sportsbet, TAB" therefore still shows as one such row when
  // reopened, not ten separate ones.
  const perRace = new Map();
  for (const entry of dailyPlannerEntries) {
    const key = [entry.track, entry.raceNumber, entry.promoType].join("|");
    if (!perRace.has(key)) {
      perRace.set(key, {
        track: entry.track,
        raceNumber: entry.raceNumber,
        promoType: entry.promoType,
        bookieIds: new Set(),
      });
    }
    perRace.get(key).bookieIds.add(entry.bookieId);
  }

  const rowGroups = new Map();
  for (const { track, raceNumber, promoType, bookieIds } of perRace.values()) {
    const bookieKey = [...bookieIds].sort().join(",");
    const key = [track, promoType, bookieKey].join("|");
    if (!rowGroups.has(key)) {
      rowGroups.set(key, { track, promoType, bookieIds: [...bookieIds], raceNumbers: new Set() });
    }
    rowGroups.get(key).raceNumbers.add(raceNumber);
  }

  plannerDraftEntries = [...rowGroups.values()].map((g) => ({
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    courseText: g.track || "",
    raceRangeText: formatRaceRangeList(g.raceNumbers),
    bookieIds: g.bookieIds,
    promoText: PLANNER_PROMO_MODES.find((m) => m.id === g.promoType)?.label || g.promoType,
  }));

  plannerStatusEl.textContent = "";
  renderPlannerTable();
  plannerModal.hidden = false;
}

function closePlannerModal() {
  plannerModal.hidden = true;
}

document.getElementById("planner-btn").addEventListener("click", openPlannerModal);
document.getElementById("planner-close-btn").addEventListener("click", closePlannerModal);

// Same "click the dimmed backdrop closes it" UX as settings-modal above.
plannerModal.addEventListener("mousedown", (event) => {
  if (event.target === plannerModal) closePlannerModal();
});

document.getElementById("planner-add-row-btn").addEventListener("click", () => {
  plannerDraftEntries.push(plannerDefaultEntry());
  renderPlannerTable();
});

document.getElementById("planner-clear-btn").addEventListener("click", () => {
  plannerDraftEntries = [];
  renderPlannerTable();
});

// Delegated on the table body (bound once — matching bindRaceCardClicks'
// own reasoning further down) rather than one listener per row/button,
// since renderPlannerTable rebuilds the whole tbody on every add/remove.
// Handles both "remove this whole row" and "remove one bookmaker chip"
// — two different buttons, same delegation.
plannerBodyEl.addEventListener("click", (event) => {
  const removeRowBtn = event.target.closest(".planner-row-remove-btn");
  if (removeRowBtn) {
    const index = Number(removeRowBtn.closest("tr").dataset.index);
    plannerDraftEntries.splice(index, 1);
    renderPlannerTable();
    return;
  }

  const chip = event.target.closest(".planner-bookie-chip");
  if (chip) {
    const row = chip.closest("tr");
    const cellEl = chip.closest(".planner-bookie-cell");
    const entry = plannerDraftEntries[Number(row.dataset.index)];
    if (!entry) return;
    entry.bookieIds = entry.bookieIds.filter((id) => id !== chip.dataset.bookie);
    refreshPlannerBookieCell(cellEl, entry, "");
    return;
  }

  // Clicking the box's own empty space (not a chip, not the search
  // input itself) still focuses the search field — otherwise the box
  // reads as one clickable input but most of it wouldn't actually be.
  if (event.target.classList.contains("planner-bookie-box")) {
    event.target.querySelector(".planner-bookie-search")?.focus();
  }
});

// mousedown, not click — fires before the search box would blur, so
// event.preventDefault() here keeps focus right where it was instead
// of briefly moving it to this button. That's what makes the "search
// Sportsbet, pick it, keep typing TAB" flow work as one continuous
// motion rather than needing to click back into the field each time.
plannerBodyEl.addEventListener("mousedown", (event) => {
  const suggestionBtn = event.target.closest(".planner-bookie-suggestion");
  if (!suggestionBtn) return;
  event.preventDefault();
  const row = suggestionBtn.closest("tr");
  const cellEl = suggestionBtn.closest(".planner-bookie-cell");
  const entry = plannerDraftEntries[Number(row.dataset.index)];
  if (!entry) return;
  entry.bookieIds.push(suggestionBtn.dataset.bookie);
  refreshPlannerBookieCell(cellEl, entry, "");
});

// Course/Races/Promotion stay plain text — live on every keystroke via
// one delegated "input" listener, updating just this row's own state
// (never the whole table, which would drop focus/cursor position
// mid-type). The Bookmaker(s) search box's own typing just re-filters
// its dropdown; it doesn't touch entry state until a suggestion is
// actually picked (see the "mousedown" listener above).
plannerBodyEl.addEventListener("input", (event) => {
  const row = event.target.closest("tr");
  if (!row) return;
  const entry = plannerDraftEntries[Number(row.dataset.index)];
  if (!entry) return;

  if (event.target.classList.contains("planner-course-input")) {
    entry.courseText = event.target.value;
  } else if (event.target.classList.contains("planner-race-range-input")) {
    entry.raceRangeText = event.target.value;
  } else if (event.target.classList.contains("planner-promo-input")) {
    entry.promoText = event.target.value;
  } else if (event.target.classList.contains("planner-bookie-search")) {
    const suggestionsEl = row.querySelector(".planner-bookie-suggestions");
    suggestionsEl.innerHTML = plannerBookieSuggestionsHtml(event.target.value, entry.bookieIds);
    suggestionsEl.hidden = suggestionsEl.innerHTML === "";
  }
});

// focusin/focusout (not focus/blur) so this can be delegated on the
// table body at all — plain focus/blur don't bubble.
plannerBodyEl.addEventListener("focusin", (event) => {
  if (!event.target.classList.contains("planner-bookie-search")) return;
  const row = event.target.closest("tr");
  const entry = plannerDraftEntries[Number(row.dataset.index)];
  if (!entry) return;
  const suggestionsEl = row.querySelector(".planner-bookie-suggestions");
  suggestionsEl.innerHTML = plannerBookieSuggestionsHtml(event.target.value, entry.bookieIds);
  suggestionsEl.hidden = suggestionsEl.innerHTML === "";
});

// Delayed, not immediate — the "mousedown" listener above needs its
// own chance to fire and add the bookmaker first; a plain blur/
// focusout has already resolved by the time a "click" would, which is
// exactly the race condition mousedown avoids.
plannerBodyEl.addEventListener(
  "focusout",
  (event) => {
    if (!event.target.classList.contains("planner-bookie-search")) return;
    const suggestionsEl = event.target.closest("td")?.querySelector(".planner-bookie-suggestions");
    if (!suggestionsEl) return;
    setTimeout(() => {
      suggestionsEl.hidden = true;
    }, 150);
  },
  true
);

// Enter picks the top visible suggestion — a small nicety for typing a
// full/unique name and hitting Enter instead of reaching for the
// mouse; no need for full keyboard-nav (arrow keys, etc.) given there
// are only ever 3 bookmakers to choose from.
plannerBodyEl.addEventListener("keydown", (event) => {
  if (!event.target.classList.contains("planner-bookie-search") || event.key !== "Enter") return;
  event.preventDefault();
  const row = event.target.closest("tr");
  const cellEl = event.target.closest(".planner-bookie-cell");
  const entry = plannerDraftEntries[Number(row.dataset.index)];
  if (!entry) return;
  const top = plannerBookieSuggestions(event.target.value, entry.bookieIds)[0];
  if (!top) return;
  entry.bookieIds.push(top.id);
  refreshPlannerBookieCell(cellEl, entry, "");
});

document.getElementById("planner-save-btn").addEventListener("click", () => {
  // Each draft row (a course + a typed range of race numbers + one or
  // more selected bookmakers + one promo type) expands into one
  // committed entry per (race, bookmaker) pair — plannerMatchedRaces/
  // plannerMatchPromoId are the exact same lookups already used while
  // the row was being edited.
  const expanded = [];
  const problems = [];
  for (const entry of plannerDraftEntries) {
    if (!entry.courseText && !entry.raceRangeText && entry.bookieIds.length === 0) continue; // a genuinely empty/unstarted row

    const matches = plannerMatchedRaces(entry.courseText, entry.raceRangeText);
    const promoType = plannerMatchPromoId(entry.promoText);
    const label = `${entry.courseText || "?"} ${entry.raceRangeText || "?"}`;

    if (matches.length === 0) {
      problems.push(`${label}: no matching races`);
      continue;
    }
    if (entry.bookieIds.length === 0) {
      problems.push(`${label}: no bookmaker selected`);
      continue;
    }
    if (!promoType) {
      problems.push(`${label}: no valid promotion`);
      continue;
    }
    for (const race of matches) {
      for (const bookieId of entry.bookieIds) {
        expanded.push({
          id: `plan-${race.marketId}-${bookieId}`,
          marketId: race.marketId,
          track: race.track,
          raceNumber: race.raceNumber,
          startTime: race.startTime,
          sport: race.sport,
          bookieId,
          promoType,
        });
      }
    }
  }

  // De-duped by (marketId, bookieId) — two draft rows that both plan
  // the same race on the same bookmaker (e.g. overlapping ranges) would
  // otherwise create two conflicting entries for that exact pair; the
  // later row wins.
  const byKey = new Map();
  for (const e of expanded) byKey.set([e.marketId, e.bookieId].join("|"), e);
  dailyPlannerEntries = [...byKey.values()];
  chrome.storage.local.set({ dailyPlanner: dailyPlannerEntries });

  renderFilteredRacesList(); // sidebar highlights need to reflect the new/removed entries right away

  // If the race currently loaded into the main table is itself one of
  // the saved entries, apply its planned mode/highlight immediately too
  // — otherwise this would wait for the next time this exact race
  // happens to get (re)loaded, which renderRace's own isNewMarket check
  // wouldn't fire again for a race that's already the one on screen.
  // Same reasoning for its tabs: a bookmaker just planned against it
  // should open its tab right away, not wait for a re-selection, and
  // one just un-planned (row edited/removed, no longer covered by the
  // Bookie Spotlight either) should close automatically — user-
  // requested for the Spotlight's own deselection, applied here too
  // since a Save can change what this exact race needs just as
  // directly.
  if (currentRace) {
    const entries = plannerEntriesForMarketId(currentRace.marketId);
    if (entries.length > 0) setMode(entries[0].promoType);
    renderRace(currentRace);
    openRaceTabs(currentRace);
    closeUnneededBookieTabs(currentRace);
  }

  plannerStatusEl.textContent = problems.length ? `Saved, but: ${problems.join("; ")}` : "Saved.";
  setTimeout(closePlannerModal, problems.length ? 2200 : 500);
});

function parseRunnerNumber(name) {
  const match = name.match(/^(\d+)\./);
  return match ? Number(match[1]) : Infinity;
}

// The real Australian saddlecloth/barrier colour-by-number convention
// (user-provided reference screenshot: 1 red, 2 black/white check, 3
// white, 4 blue, 5 orange, 6 green, 7 black, 8 pink) — not our own
// invented palette. 9-12 continue the same real convention (emerald,
// purple, grey, brown); cycling past 12 is rare enough in AU racing
// not to need its own real-world answer. Each entry gives its own text
// colour too (white doesn't work on white or the check pattern the
// way it does on every saturated colour here), and `checkered: true`
// switches #2 to a checkerboard background instead of a flat one —
// see runnerNumberHtml.
const RUNNER_NUMBER_COLORS = [
  { bg: "#d5211b", text: "#ffffff" }, // 1 red
  { bg: "#ffffff", text: "#111111", checkered: true }, // 2 black/white check
  { bg: "#ffffff", text: "#111111", border: true }, // 3 white
  { bg: "#1a56c4", text: "#ffffff" }, // 4 blue
  { bg: "#f2860d", text: "#ffffff" }, // 5 orange
  { bg: "#1a8a3c", text: "#ffffff" }, // 6 green
  { bg: "#111111", text: "#ffffff" }, // 7 black
  { bg: "#e0177f", text: "#ffffff" }, // 8 pink
  { bg: "#0e8f7a", text: "#ffffff" }, // 9 emerald
  { bg: "#7b3fa0", text: "#ffffff" }, // 10 purple
  { bg: "#8a8f98", text: "#ffffff" }, // 11 grey
  { bg: "#8a5a2b", text: "#ffffff" }, // 12 brown
];

// Splits "N. Horse Name" into a number badge (below) and the bare name
// text — the badge now carries the number, so it's no longer repeated in
// the name itself the way it always used to be. Runners without a
// leading "N." (shouldn't happen in real data, but mock/test data
// doesn't always bother) get no badge at all rather than a misleading
// one, and the full original string as their label.
//
// Two different badges depending on what's actually known about this
// runner:
//   - silkUrl present (betfairWatcher.js's own scrapeSilks, background.js
//     — horse/harness only, see that function's own comment for why
//     greyhounds never have one) — this horse's own real silks thumbnail,
//     the same image Betfair itself shows, with the number put back as
//     plain text in front of the name (matching a reference screenshot:
//     icon, then "N. Name" as one line) rather than repeated a second
//     time on the image itself.
//   - otherwise — the existing flat AU saddlecloth-colour-by-number
//     convention (RUNNER_NUMBER_COLORS), unchanged. This is still the
//     right fallback for greyhounds (which don't have real "silks" at
//     all — dogs don't wear jockey colours) and for a horse/harness
//     runner whose silk hasn't been scraped yet (nothing to show until
//     the tracked Betfair tab actually renders one).
function runnerNumberHtml(runner) {
  const match = runner.name.match(/^(\d+)\.\s*(.*)$/);
  if (!match) return { html: "", label: runner.name };
  const number = Number(match[1]);
  const name = match[2];

  if (runner.silkUrl) {
    return {
      html: `<img class="runner-silk" src="${runner.silkUrl}" alt="" title="Silks" />`,
      label: `${number}. ${name}`,
    };
  }

  const swatch = RUNNER_NUMBER_COLORS[(number - 1) % RUNNER_NUMBER_COLORS.length];
  const classes = ["runner-number", swatch.checkered && "runner-number-check", swatch.border && "runner-number-bordered"]
    .filter(Boolean)
    .join(" ");
  const style = swatch.checkered
    ? `color:${swatch.text}`
    : `background:${swatch.bg};color:${swatch.text}`;
  return {
    html: `<span class="${classes}" style="${style}">${number}</span>`,
    label: name,
  };
}

// --- Run 2nd / Run 2nd 3rd modes: Harville place-probability model ---
//
// User-requested full replacement of the previous "real Betfair
// place-market data only, no theoretical model" approach (a prior
// version's own comment explained dropping Harville entirely because
// raw Harville disagreed with real market data by ~2x for an actual
// runner — the model below is a deliberate, carefully re-derived
// return to Harville, not that same attempt again unchanged). Always
// produces a Pr(2nd)/Pr(3rd) for every priced, non-scratched runner —
// including a genuine 3rd-place estimate even for a race whose real
// place market only pays 2 (previously an unconditional null, "no
// reliable number to show") — by calibrating itself against whatever
// real place-market data this race actually has, rather than trusting
// raw Harville outright the way the dropped version did.
//
// Step 1 — fair win probabilities, normalized to sum to 100% across the
// whole priced field. Deliberately NOT the same convention Mug mode's
// own Edge%/edgePercent uses elsewhere in this file (raw 1/LayOdds,
// left un-normalized — confirmed against a real tool's own output, see
// edgePercent's own comment) — Harville's sequential-elimination
// derivation assumes a field that actually sums to 100% at each
// elimination step, so this one specific model needs the normalized
// version even though the rest of the file deliberately doesn't.
function normalizedWinProbs(runners) {
  const raw = runners.map((r) => 1 / r.betfair);
  const total = raw.reduce((sum, p) => sum + p, 0);
  return raw.map((p) => p / total);
}

// Step 2 — the power adjustment: raises every runner's normalized win
// probability to the power lambda, then re-normalizes back to 100%.
// lambda < 1 flattens the field (narrows the gap between favourites and
// longshots) for every step below that models "who else already took
// an earlier placing" — the standard correction for Harville's own
// well-documented bias toward overestimating a favourite's placing
// chances. lambda = 1 is a no-op — plain, unadjusted Harville.
function powerAdjust(pNormalized, lambda) {
  const raised = pNormalized.map((p) => Math.pow(p, lambda));
  const total = raised.reduce((sum, p) => sum + p, 0);
  return raised.map((p) => p / total);
}

// Harville's own sequential-elimination formulas — Pr(i finishes
// exactly 2nd) and Pr(i finishes exactly 3rd), both from the same
// adjusted field pAdj. O(n²) for 2nd, O(n³) for 3rd — trivial for a
// racing field (n ≤ ~24).
function harvillePlaceProbs(pAdj) {
  const n = pAdj.length;
  const p2 = new Array(n).fill(0);
  const p3 = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      p2[i] += pAdj[j] * (pAdj[i] / (1 - pAdj[j]));

      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        const remAfterJ = 1 - pAdj[j];
        const remAfterJK = 1 - pAdj[j] - pAdj[k];
        p3[i] += pAdj[j] * (pAdj[k] / remAfterJ) * (pAdj[i] / remAfterJK);
      }
    }
  }
  return { p2, p3 };
}

// Step 4 — fits lambda by minimizing the sum of squared errors between
// this model's own Top-K-per-runner prediction (pAdj[i] + p2[i][+p3[i]])
// and the real market's own per-runner Top-K probability (realTargets;
// a null entry — no real number for that runner — is skipped in the
// sum, never treated as a zero-error match). topK is 2 or 3, matching
// whichever real place market this race actually has (computeHarville
// ModelBelow's own placeMarketWinners branch). Ternary search over a
// wide bounded range: SSE(λ) is a smooth, single-dipped curve here (one
// "sharpness" dial), so this converges tightly in a few dozen cheap
// iterations — no external solver/library needed for a problem this
// well-behaved.
function fitHarvilleLambda(pNormalized, realTargets, topK) {
  function sse(lambda) {
    const pAdj = powerAdjust(pNormalized, lambda);
    const { p2, p3 } = harvillePlaceProbs(pAdj);
    let total = 0;
    for (let i = 0; i < pAdj.length; i++) {
      if (realTargets[i] == null) continue;
      const modelTopK = topK === 2 ? pAdj[i] + p2[i] : pAdj[i] + p2[i] + p3[i];
      total += (modelTopK - realTargets[i]) ** 2;
    }
    return total;
  }

  // hi capped at MAX_HARVILLE_LAMBDA, not 1.5 — user-requested: don't
  // prioritize favourites as much, dampen the spread. A fitted lambda
  // above 1 SHARPENS the favourite/longshot gap (the opposite of what
  // this whole power-adjustment exists for), and real races have
  // genuinely fit there (1.02-1.15, confirmed live) — nothing before
  // this stopped the search from landing above 1 if that's what best
  // matched the real place data. Capping the search range itself,
  // rather than clamping the result afterward, means the cap is baked
  // into what "best fit" even means here — the model will never credit
  // a favourite more than the no-data fallback (DEFAULT_HARVILLE_LAMBDA)
  // already does.
  let lo = 0.3;
  let hi = MAX_HARVILLE_LAMBDA;
  for (let iter = 0; iter < 60; iter++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (sse(m1) < sse(m2)) hi = m2;
    else lo = m1;
  }
  return (lo + hi) / 2;
}

// The ceiling fitHarvilleLambda's own search is capped at (see its
// comment above) — same value as DEFAULT_HARVILLE_LAMBDA below, so
// calibration can only ever match-or-beat that baseline's own
// flattening, never fall back toward raw Harville's sharper,
// favourite-crediting shape.
const MAX_HARVILLE_LAMBDA = 0.85;

// No real place-market data to calibrate against at all (place market
// missing entirely, placeMarketWinners neither 2 nor 3, or every
// runner's own placeBetfair happens to be null) — this stands in for a
// fitted lambda instead of skipping the power adjustment outright
// (lambda = 1, i.e. raw unadjusted Harville): the middle of the
// literature's own commonly-cited correction range (0.8-0.95) is still
// a better prior than trusting raw Harville's own confirmed
// favourite-overestimation bias with no correction at all.
const DEFAULT_HARVILLE_LAMBDA = 0.85;

// How far a real place market's own implied-probability sum is allowed
// to fall short of `winners` before it's rejected as a calibration
// target entirely (see computeHarvilleModel's own comment for the live
// case — 0.97 against an expected ~3 — that motivated this). 0.5 means
// "at least half of what a coherent market would sum to" — generous
// enough to tolerate real overround/thin-but-usable markets, tight
// enough to reject one this far gone.
const COHERENCE_TOLERANCE = 0.5;

// User-requested deliberate conservative bias on every Pr(2nd)/Pr(3rd)
// this model produces (see computeHarvilleModel's own comment on where
// this gets applied and why) — a flat haircut, not a fix for any one
// specific cause of overestimation. 0.7 = shows 70% of whatever the raw
// (already lambda-adjusted) model computed. Lower = more conservative;
// this is the one constant to change if a real-world comparison still
// runs too high — or too low — in practice.
const CONSERVATISM_FACTOR = 0.7;

// Ties every step above together for one whole race — called once per
// render (renderRace), not per runner: builds the adjusted field once,
// fits lambda against whatever real place-market data this race
// actually has, then returns every priced, non-scratched runner's own
// Pr(2nd)/Pr(3rd)/the fitted lambda itself, keyed by selectionId so
// promoPlaceProb can just look its own runner up rather than
// recomputing the whole field on every call (this is O(n²)-O(n³) work,
// wasteful to repeat once per runner per render the way the old
// per-runner placeBetfair lookup could afford to). Returns null (nothing
// to compute at all) for a field too small for "3rd place" to even mean
// anything, or with no priced runners left.
function computeHarvilleModel(race) {
  const runners = (race?.runners || []).filter(
    (r) => r.result !== "REMOVED" && r.betfair != null
  );
  if (runners.length < 3) return null;

  const pNormalized = normalizedWinProbs(runners);

  // realTargets, kept in the same order as `runners`/pNormalized —
  // from whichever real place market this race has. placeMarketWinners
  // 2 means placeBetfair already IS Pr(top 2) per runner directly; 3
  // means it's Pr(top 3) instead — either way it's now purely a
  // calibration target for lambda, not the final answer itself the way
  // it used to be (see this whole section's own opening comment).
  const winners = race.placeMarketWinners;
  const realTargets = runners.map((r) => (r.placeBetfair != null ? 1 / r.placeBetfair : null));

  // Real per-runner Top-K implied probabilities should sum to roughly
  // K across the whole field — one runner "wins" each of the K paid
  // places, the exact same conservation Harville's own model enforces
  // by construction (Model Top-K always sums to exactly K). User-caught
  // live: a lower-tier greyhound race's own Top-3 PLACE market (far
  // less traded than the WIN market — Betfair place markets commonly
  // are) summed to 0.97, not ~3 — its own "best available to lay" price
  // sitting on a stale/token order rather than real consensus, not a
  // market efficiency problem calibration can fix by trusting it
  // harder. Fitting lambda to that dragged it to 0.41 (far outside the
  // literature's own 0.8-0.95 range) and inflated every runner's own
  // modeled Top-3 chance 3-9x past what the real market implied.
  // COHERENCE_TOLERANCE rejects a market this far off outright — a
  // deficit this large isn't "a bit of overround" worth rescaling for,
  // there's no real signal left in it to calibrate against at all.
  const sumRealTargets = realTargets.reduce((sum, p) => sum + (p ?? 0), 0);
  const hasRealData =
    (winners === 2 || winners === 3) &&
    realTargets.some((p) => p != null) &&
    sumRealTargets >= winners * COHERENCE_TOLERANCE;

  const lambda = hasRealData
    ? fitHarvilleLambda(pNormalized, realTargets, winners)
    : DEFAULT_HARVILLE_LAMBDA;

  const pAdj = powerAdjust(pNormalized, lambda);
  const { p2, p3 } = harvillePlaceProbs(pAdj);

  // User-requested deliberate conservative bias: a missed opportunity
  // (the model understating a real edge) costs nothing; an inflated
  // one (the model overstating it) costs real money on a bet that
  // wasn't actually +EV. User-reported the model's own Pr(2nd)/Pr(3rd)
  // still coming out well above a reference tool's for a race's own
  // favourite even with a coherent real place market and a sane lambda
  // — not something COHERENCE_TOLERANCE catches (that's specifically
  // for an incoherent market, not this). Rather than chase every
  // possible source of a Harville-vs-real-world gap (the exact
  // rabbit hole that made a prior version drop Harville entirely —
  // see this whole section's own opening comment), every runner's
  // own Pr(2nd)/Pr(3rd) gets a flat haircut here instead: a
  // deliberate, transparent lower bound rather than a best-guess
  // central estimate. CONSERVATISM_FACTOR is one constant — ask to
  // tune it (lower = more conservative) if the gap to a reference
  // tool is still too wide, or too narrow, in practice.
  const p2Shaded = p2.map((p) => p * CONSERVATISM_FACTOR);
  const p3Shaded = p3.map((p) => p * CONSERVATISM_FACTOR);

  // Keyed by selectionId, same as every other per-runner lookup already
  // in this file (betfair price merging, silks, ...) — this depends on
  // it being a real, unique value the same way those already do.
  // Caught live in the harness: mock-data.js's own runners all had
  // selectionId: null before it was fixed there, which collapsed every
  // runner into this one shared map entry — a mock-data gap, not
  // something real Betfair data ever does.
  const model = new Map();
  runners.forEach((r, i) => model.set(r.selectionId, { p2: p2Shaded[i], p3: p3Shaded[i], lambda }));
  return model;
}

// Looked up from currentHarvilleModel (renderRace builds it fresh for
// the loaded race — see that function's own comment) rather than
// recomputed here. null for a runner the model above excluded (a
// missing win price, or a field too small to model at all) — same "no
// reliable number to show" convention a missing bookmaker price
// already uses elsewhere.
function promoPlaceProb(runner) {
  const entry = currentHarvilleModel?.get(runner.selectionId);
  if (!entry) return null;
  return currentMode === "run2nd3rd" ? entry.p2 + entry.p3 : entry.p2;
}

// Mode-dispatching wrappers so the rest of the file doesn't need to know
// which formula is active — sorting, rendering, and the column header all
// go through these.
function metricPercent(runner, commission, hedge, displayedBookieIds) {
  const price = bestBookmakerPrices(runner, displayedBookieIds).price ?? 0;
  if (currentMode === "run2nd" || currentMode === "run2nd3rd") {
    return promoEVPercent(
      runner.betfair,
      price,
      commission,
      hedge,
      stakeAmount,
      currentSettings.defaultRetention,
      promoPlaceProb(runner)
    );
  }
  if (currentMode === "run2ndwin") {
    return run2ndWinEVPercent(runner.betfair, price, stakeAmount, runner.placeBetfair);
  }
  return currentMode === "bonus"
    ? bonusRetentionPercent(runner.betfair, price, commission, hedge)
    : edgePercent(runner.betfair, price, commission, hedge);
}

// Same Edge%/Ret% formula as metricPercent, but against one specific
// bookmaker's own price rather than always the best across all of them —
// this is what's now shown underneath each bookie's own price cell
// (see bookieCellHtml), instead of a single dedicated Edge column that
// only ever reflected the best bookmaker. null when that bookie has no
// price for this runner yet, so the cell can render "—" instead of a
// misleading 0%/-100%.
function bookieMetricPercent(runner, price, commission, hedge) {
  if (price == null) return null;
  if (currentMode === "run2nd" || currentMode === "run2nd3rd") {
    return promoEVPercent(
      runner.betfair,
      price,
      commission,
      hedge,
      stakeAmount,
      currentSettings.defaultRetention,
      promoPlaceProb(runner)
    );
  }
  if (currentMode === "run2ndwin") {
    return run2ndWinEVPercent(runner.betfair, price, stakeAmount, runner.placeBetfair);
  }
  return currentMode === "bonus"
    ? bonusRetentionPercent(runner.betfair, price, commission, hedge)
    : edgePercent(runner.betfair, price, commission, hedge);
}

// Run 2nd You Win has no lay/hedge at all in its own model (see
// run2ndWinEVPercent) — null here, not a plain layStake figure that
// would misleadingly imply a Betfair lay is actually part of this
// mode's strategy. Rendered as "—" the same way every other missing
// number already is (renderRace's own row-building, and liabilityFor
// right below).
function rowLayDollars(runner, commission, hedge, displayedBookieIds) {
  const price = bestBookmakerPrices(runner, displayedBookieIds).price ?? 0;
  if (currentMode === "run2ndwin") return null;
  return currentMode === "bonus"
    ? layStakeBonus(stakeAmount, runner.betfair, price, commission, hedge)
    : layStake(stakeAmount, runner.betfair, price, commission, hedge);
}

function sortedRunners(race, commission, hedge, displayedBookieIds) {
  // Scratched runners (Betfair status REMOVED) are rendered separately, as
  // placeholder rows at the end of the table (see renderRace) — they have
  // no price to sort or compute a metric from, so they're excluded here
  // rather than sorting alongside real contenders.
  const runners = race.runners.filter((r) => r.result !== "REMOVED");

  if (sortMode === "edge") {
    // metricPercent can be null now (Run 2nd/Run 2nd 3rd mode, no
    // reliable placeProb for this runner — see promoPlaceProb; either
    // no current Betfair price at all, or, for Run 2nd 3rd, no place
    // market found/it didn't pay exactly 3 places) — previously always
    // a real number for every runner, so this sort never needed a null
    // case before. Sorts to the bottom, same "no reliable number to
    // show" treatment as everywhere else this can happen.
    runners.sort((a, b) => {
      const bMetric = metricPercent(b, commission, hedge, displayedBookieIds);
      const aMetric = metricPercent(a, commission, hedge, displayedBookieIds);
      if (bMetric == null && aMetric == null) return 0;
      if (bMetric == null) return -1;
      if (aMetric == null) return 1;
      return bMetric - aMetric;
    });
  } else {
    runners.sort((a, b) => parseRunnerNumber(a.name) - parseRunnerNumber(b.name));
  }

  return runners;
}

// Betfair liquidity available at the best (nearest) Lay price — how much
// could actually be matched there right now before the price moves to the
// next level. Same concept and display style as HorsePower's Liquidity
// column (whole dollars, no decimals). Genuinely absent for a runner whose
// price came from a REST fetch that returned no size at all, or whose Lay
// cell on Betfair's own page had no readable size label — shown as "—"
// rather than "$0" or "$NaN", since $0 would misleadingly imply a real,
// confirmed-zero reading rather than "unknown".
function formatLiquidity(liquidity) {
  return liquidity === null || liquidity === undefined || Number.isNaN(liquidity)
    ? "—"
    : `$${Math.round(liquidity)}`;
}

// One half of a Back/Lay box: the price on top, its own liquidity figure
// stacked beneath it (hidden via the hide-liquidity body class when
// Settings > Show liquidity is off) — instead of liquidity living in its
// own separate column.
//
// Liquidity disappears entirely once the race is in-play (metricsSuspended
// — user request, alongside the price freeze itself): the frozen price
// is still meaningful as the closing line, but a frozen liquidity figure
// is just a stale number from the moment trading stopped, not real
// available depth any more. Same "gone, not shown as a dash" treatment
// as every other Edge%/Ret%/EV% figure metricsSuspended already blanks.
function priceCellInner(price, liquidity) {
  if (price == null) return `<span class="cell-price">—</span>`;
  const liquidityHtml = metricsSuspended
    ? ""
    : `<span class="cell-liquidity">${formatLiquidity(liquidity)}</span>`;
  return `<span class="cell-price">${price.toFixed(2)}</span>${liquidityHtml}`;
}

// Betfair Back and Lay grouped into a single box, side by side — matching
// how Betfair's own market view presents them, rather than as two
// disconnected table columns. Lay (right, pink/magenta) is still what
// Edge%/Lay $/Liability are actually computed from; Back (left, blue) is
// display only.
function backLayCellHtml(backPrice, backLiquidity, layPrice, layLiquidity) {
  return `<span class="backlay-box">
    <span class="bl-cell bl-back">${priceCellInner(backPrice, backLiquidity)}</span>
    <span class="bl-cell bl-lay">${priceCellInner(layPrice, layLiquidity)}</span>
  </span>`;
}

// Which of the Settings > EV Colours and Thresholds per-band keys applies
// to the current Mode — Run 2nd 3rd/Run 2nd/Run 2nd You Win share "promo"
// (one threshold set, not three) since none of them has a verified EV
// formula yet to actually tell them apart by.
function edgeThresholdKey(mode) {
  if (mode === "bonus") return "bonus";
  if (mode === "run2nd3rd" || mode === "run2nd" || mode === "run2ndwin") return "promo";
  return "mug";
}

// The highest configured colour tier whose threshold this Edge%/Ret%
// value meets or exceeds (tiers are ascending, so later/greener bands
// override earlier ones once reached) — null if it's below every tier's
// threshold, in which case the caller falls back to the existing plain
// green/red-by-sign styling instead of a configured colour.
function edgeTierColor(metric, mode) {
  const key = edgeThresholdKey(mode);
  const bands = currentSettings.edgeColorBands || DEFAULT_SETTINGS.edgeColorBands;
  let color = null;
  for (const band of bands) {
    if (metric >= band.thresholds[key]) color = band.color;
  }
  return color;
}

// Renders one Edge%/Ret% value's class + inline colour — always a
// configured colour, never a hardcoded one, so every case (including
// "below every tier") is user-editable via Settings > EV Colours and
// Thresholds rather than baked in. A matched tier wins first; otherwise
// edgeBelowThresholdColor (defaults to the same red already used
// elsewhere for "bad"). Previously a below-every-tier value split on
// sign — negative fell back to plain red, positive got no colour at all
// — because Bonus's tiers commonly start well above 0 (default lowest
// threshold: 50%), so a real 42% Ret% (below every tier, but positive)
// rendered with no colour while a genuinely bad negative Mug Edge% still
// went red. Both cases are just "didn't clear the lowest tier" now, one
// single configured colour either way.
// #rgb/#rrggbb -> "r, g, b" for building an rgba() string — needed
// because the EV tier colours are arbitrary user-configured hex
// (Settings > EV Colours), not one of this file's own fixed CSS
// variables, so there's no existing token to reuse the way every other
// rgba() tint in popup.css does. Malformed input (a mid-edit hex field)
// falls back to a neutral grey rather than producing an invalid rgba().
function hexToRgb(hex) {
  const clean = (hex || "").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = Number.parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(n)) return "128, 128, 128";
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function edgeMetricHtml(metric) {
  // metricsSuspended (a race in play — see renderRace) already blanks
  // the text via formatMetric; treating the metric as absent here too
  // keeps the new cell-background tint from being the only thing left
  // showing a colour with no figure to justify it.
  if (metric == null || metricsSuspended) return { className: "", styleAttr: "", bg: "transparent" };
  const color =
    edgeTierColor(metric, currentMode) ??
    currentSettings.edgeBelowThresholdColor ??
    DEFAULT_SETTINGS.edgeBelowThresholdColor;
  // A full, bolder cell-background tint of the same colour (not just
  // coloured text) — matches the denser, more saturated feel of a
  // reference terminal the user pointed at, using our own EV tier
  // colours rather than adopting that reference's own palette. 0.2
  // (not the original 0.14) reads as an actual shaded box rather than
  // a faint wash — user-reported wanting the Best Price cell to look
  // like "green text and a shaded green box", which this same tint
  // also drives.
  return { className: "edge-tier", styleAttr: ` style="color:${color}"`, bg: `rgba(${hexToRgb(color)}, 0.2)` };
}

// Settings > Display: the same Edge%/Ret%/EV% figure (whichever Mode is
// active) as-is ("percent"), converted to a dollar amount — stake ×
// (that %/100), not a different calculation ("dollar") — or hidden
// entirely ("off", cells show just the price above it). Shared by every
// cell that shows this figure so they never drift apart on formatting.
function formatMetric(metric) {
  if (metricsSuspended || currentSettings.metricDisplay === "off") return "";
  if (metric == null) return "—";
  if (currentSettings.metricDisplay === "dollar") {
    const dollars = stakeAmount * (metric / 100);
    return `${dollars >= 0 ? "+" : "-"}$${Math.abs(dollars).toFixed(2)}`;
  }
  return `${metric >= 0 ? "+" : ""}${metric.toFixed(1)}%`;
}

// A bookmaker's own price cell: the price on top, that bookie's own Edge%/
// Ret% (bookieMetricPercent, against this specific price rather than
// always the best one) stacked beneath it — replaces the old dedicated
// Edge column, same stacked-cell treatment as Back/Lay's liquidity. No
// sub-line at all (not even an empty one) once Settings > Display is
// set to "Off".
function bookieCellHtml(price, metric) {
  if (price == null) return "—";
  const { className, styleAttr } = edgeMetricHtml(metric);
  const metricText = formatMetric(metric);
  const subHtml = metricText ? `<span class="cell-sub ${className}"${styleAttr}>${metricText}</span>` : "";
  return `<span class="stacked-cell"><span class="cell-price">${price.toFixed(2)}</span>${subHtml}</span>`;
}

// The Best Price cell: price + Edge%/Ret% (metricPercent — the same
// formula, against this same best price) stacked on the left, colour-coded
// by its EV tier (or plain green/red-by-sign, below every tier), with the
// winning bookie's badge(s) vertically centered on the right — a wider
// "card row" layout rather than the plain stacked-cell treatment every
// other column uses, since this is the headline column. Same "Off" ->
// no sub-line at all treatment as bookieCellHtml above.
function bestPriceCellHtml(price, badgesHtml, metric) {
  if (price == null) return "—";
  const { className, styleAttr } = edgeMetricHtml(metric);
  const metricText = formatMetric(metric);
  const subHtml = metricText
    ? `<span class="best-price-edge ${className}"${styleAttr}>${metricText}</span>`
    : "";
  return `<span class="best-price-cell"><span class="best-price-text"><span class="best-price-value ${className}"${styleAttr}>${price.toFixed(
    2
  )}</span>${subHtml}</span><span class="best-price-badges">${badgesHtml}</span></span>`;
}

// What you'd owe if the lay bet loses (the backed selection wins) — the
// standard exchange lay-liability formula, stake × (odds - 1). Normally
// always computable from data already on the row (no "genuinely absent"
// case), since it's derived from our own Lay $, not scraped — except
// Run 2nd You Win, whose own model has no lay at all (rowLayDollars
// returns null for it), so there's genuinely nothing to owe a figure
// for here either.
function liabilityFor(layDollars, betfairOdds) {
  if (layDollars == null) return null;
  return layDollars * (betfairOdds - 1);
}

// Market overround for one price column (e.g. Betfair's Lay price, or one
// bookmaker's) — the sum of implied probabilities (1/price) across every
// runner that actually has a price there, expressed as a percentage.
// Always computed from the race's full field (race.runners), not whatever
// Max results/Max liability has left displayed, since overround is a
// property of the whole market, not of a filtered subset of it.
function marketPercentFor(runners, priceGetter) {
  let sum = 0;
  let any = false;
  for (const runner of runners) {
    const price = priceGetter(runner);
    if (price != null && price > 0) {
      sum += 1 / price;
      any = true;
    }
  }
  return any ? sum * 100 : null;
}

function formatMarketPct(pct) {
  return pct === null ? "—" : `${pct.toFixed(1)}%`;
}

// The race-info bar's Comms badge — commission as a whole percentage
// (e.g. 0.08 -> "8%"), only falling back to one decimal place when a
// commission discount actually leaves a fractional point (e.g. "7.5%")
// rather than always showing a redundant ".0".
function formatPercentWhole(fraction) {
  const pct = fraction * 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

// The race-info bar's "Matched: $X" badge — total AUD matched on this
// market so far, same figure Betfair's own market page shows as
// "Matched: AUD X" (confirmed directly against a live market page).
// Whole dollars with a thousands separator once it's large enough to
// need one — Betfair's own display doesn't bother with cents either.
function formatMatched(amount) {
  return amount == null ? "—" : `$${Math.round(amount).toLocaleString()}`;
}

// The race-info bar's "Jumps at H:MM am/pm" — local time, 12-hour, no
// seconds. User-requested switch from the previous plain 24-hour
// digits. Hand-rolled rather than toLocaleTimeString() so the am/pm
// casing and lack of a leading zero on the hour are guaranteed
// (locale-dependent otherwise) and match raceCardHtml's own sidebar
// time formatting exactly.
function formatJumpTime(startTimeIso) {
  if (!startTimeIso) return "—";
  const d = new Date(startTimeIso);
  const hours24 = d.getHours();
  const hours12 = hours24 % 12 || 12;
  const suffix = hours24 < 12 ? "am" : "pm";
  return `${hours12}:${String(d.getMinutes()).padStart(2, "0")} ${suffix}`;
}

// One-shot highlight flash on #main-panel (CSS animation, see popup.css)
// for the moment a race goes in-play — removing then re-adding the class
// (rather than just adding it, in case a caller ever needs to re-trigger
// before the previous flash finished) forces the browser to restart the
// animation from its own 0% keyframe instead of a no-op re-add being
// ignored. The timeout only needs to match the CSS animation's own
// duration closely enough to clean up the class name; it doesn't drive
// the animation itself.
function flashMainPanel() {
  const panel = document.getElementById("main-panel");
  panel.classList.remove("flash-in-play");
  void panel.offsetWidth; // force reflow so the removal above actually takes effect before re-adding
  panel.classList.add("flash-in-play");
  setTimeout(() => panel.classList.remove("flash-in-play"), 1000);
}

function renderRace(race) {
  currentRace = race;
  if (race.marketId) selectedMarketId = race.marketId;

  // Whether a real bookie tab has ever gone live for this specific race
  // — see isBetfairMarketClosed's own comment for why this is what
  // keeps its fallback scoped to only the races that genuinely have no
  // better signal, instead of overriding this one's own confirmed
  // "still open" scrape the moment Betfair routinely (and only
  // temporarily) suspends its own market right at its scheduled start.
  const hasLiveBookie = Object.values(race.bookmakerSources || {}).some((s) => s === "live");

  // The exact same "is the countdown currently showing IN PLAY/
  // RESULTED" check tickCountdowns/formatCountdown use — calling
  // isShowingStatusWord directly here (not a hand-rolled second copy of
  // its rule) so this can never drift out of sync with what the
  // countdown itself displays. An earlier version re-derived this
  // inline from just bookieMarketClosed/marketStatus and dropped
  // isShowingStatusWord's own isPastJumpTime gate entirely — user-
  // reported: every Edge%/EV% figure vanishing minutes before the jump
  // (a benign, temporary Betfair status blip unrelated to actually
  // being in-play, since nothing was gating on the jump time at all).
  // Reused here to (a) blank every Edge%/Ret%/EV% figure for as long as
  // it's true (metricsSuspended, read by formatMetric — a suspended
  // bookmaker market's prices are no longer tradeable) and (b) flash
  // the panel once, exactly on the moment it flips from false to true
  // *while already viewing this same race* — switching Mode/Stake/
  // Hedge or an ordinary auto-refresh while already in play doesn't
  // keep re-triggering it. isNewMarket (a different race loading —
  // marketId change) skips the flash outright regardless of that new
  // race's own in-play state — user-reported: opening a race that
  // happened to already be in play flashed immediately, since nothing
  // actually just transitioned, that's simply the race's existing
  // state; an earlier version reset lastRenderedInPlay to false first
  // and then treated that as a transition, flashing exactly backwards
  // from what its own comment claimed.
  const raceInPlay = isShowingStatusWord(
    race.startTime,
    race.bookieMarketClosed ? "true" : "",
    race.winner ? "true" : "",
    race.marketStatus,
    hasLiveBookie ? "true" : ""
  );
  const isNewMarket = race.marketId !== lastRenderedMarketId;
  if (raceInPlay && !lastRenderedInPlay && !isNewMarket) flashMainPanel();
  lastRenderedMarketId = race.marketId;
  lastRenderedInPlay = raceInPlay;
  metricsSuspended = raceInPlay;
  currentHarvilleModel = computeHarvilleModel(race);

  // Daily Planner — user-requested pairing: loading a race you planned a
  // promo on switches the mode tab to match (only on an actual race
  // change, not every re-render triggered by Stake/Hedge/Mode itself —
  // otherwise picking a different mode by hand on a planned race would
  // just get immediately overridden back).
  const plannerEntries = plannerEntriesForMarketId(race.marketId);
  if (plannerEntries.length > 0 && isNewMarket && currentMode !== plannerEntries[0].promoType) {
    setMode(plannerEntries[0].promoType);
  }
  // Which bookie columns actually show at all, for this specific race
  // (raceDisplayedBookieIds — also what openRaceTabs now opens tabs
  // for, so the two can never drift apart again) — user-clarified this
  // is now the ONLY thing that controls it, not Settings > Bookie
  // (which just gates what's searchable/selectable in the first
  // place): a bookmaker's column appears if and only if it's been
  // planned against this exact race or picked in the sidebar's own
  // Bookie Spotlight — no automatic "every enabled bookie" column any
  // more, and no separate highlight treatment either (this directly
  // toggles `hidden` below and in bookieCells/the footer/scratched
  // rows, rather than adding a CSS class on top of an already-shown
  // column).
  const displayedBookieIds = raceDisplayedBookieIds(race);
  for (const th of document.querySelectorAll("#odds-table thead th[data-bookie]")) {
    th.hidden = !displayedBookieIds.has(th.dataset.bookie);
  }

  // Race Result / Display > Betfair commission discount — percentage
  // points off whatever the track/sport would otherwise charge, floored
  // at 0% so a discount larger than the base rate can't go negative.
  const baseCommission = commissionForTrack(race.track, race.sport);
  const commission = Math.max(0, baseCommission - currentSettings.commissionDiscount / 100);
  const hedge = hedgePercent / 100;

  // Compact race-info bar: track + race number + single-letter sport code
  // (RACE_TYPE_CODE, bookies.js — same R/H/G scheme TAB's own race URLs
  // use), a live-connection dot, the commission this race is actually
  // being charged, and jump time/countdown underneath.
  const raceCode = RACE_TYPE_CODE[race.sport] || "";
  const raceLabel = race.raceNumber != null ? ` R${race.raceNumber}` : "";
  document.getElementById("race-subtitle").textContent =
    `${race.track || race.race}${raceLabel}${raceCode ? ` (${raceCode})` : ""}`;

  // Same "green=open, red=closed" market-status meaning as the sidebar's
  // own dot (raceCardHtml) rather than a separate "live Betfair
  // connection" signal — reuses raceInPlay (computed just above from the
  // exact same isShowingStatusWord call the sidebar dot uses) so the two
  // dots can never disagree, and tickCountdowns() keeps this one fresh
  // every second instead of only whenever renderRace happens to run.
  const raceLiveDotEl = document.getElementById("race-live-dot");
  raceLiveDotEl.classList.toggle("closed", raceInPlay);
  raceLiveDotEl.title = raceInPlay ? "Market closed" : "Market open";

  document.getElementById("race-comms-value").textContent = formatPercentWhole(commission);

  document.getElementById("race-matched-value").textContent = formatMatched(race.totalMatched);

  document.getElementById("race-jump-time").textContent = formatJumpTime(race.startTime);

  renderTrackRacesRow(race);

  const tbody = document.getElementById("odds-body");
  tbody.innerHTML = "";

  let rows = sortedRunners(race, commission, hedge, displayedBookieIds).map((runner) => {
    const layDollars = rowLayDollars(runner, commission, hedge, displayedBookieIds);
    const liability = liabilityFor(layDollars, runner.betfair);
    return { runner, layDollars, liability };
  });

  // Max liability filters displayed rows entirely (not just a visual
  // flag), per the Settings page's own description of the setting. A
  // null liability (Run 2nd You Win's own model has no lay at all — see
  // liabilityFor) is left in rather than filtered out either way: there's
  // genuinely no number to compare against the threshold, not a real
  // zero.
  if (currentSettings.maxLiability !== null) {
    rows = rows.filter((r) => r.liability == null || r.liability <= currentSettings.maxLiability);
  }
  if (currentSettings.maxResults !== null) {
    rows = rows.slice(0, currentSettings.maxResults);
  }

  // Two independent comparisons, matching a reference terminal's own
  // pair of settings ("Highlight best bookie per runner" / "Highlight
  // best runner per bookie") rather than the single row-only outline
  // this used to be: row-wise (which bookie is best FOR THIS RUNNER —
  // a green tint) and column-wise (which runner is best FOR THIS
  // BOOKIE, across the whole race — an amber outline). The row
  // comparison reuses the existing bestBookmakerPrices price-based
  // check (equivalent to comparing EV directly — every mode's formula
  // is monotonic in the bookmaker price for a fixed runner, so "best
  // price" and "best EV" never disagree within one row). The column
  // comparison needs its own pass over every row first, since it has
  // to know every runner's figure for a given bookie before any one
  // row can be judged against it.
  const bestBookieMetricByBookie = new Map();
  for (const b of BOOKIE_LIST) {
    let best = null;
    for (const { runner } of rows) {
      const price = runner.bookmakers?.[b.id];
      if (price == null) continue;
      const metric = bookieMetricPercent(runner, price, commission, hedge);
      if (metric != null && (best === null || metric > best)) best = metric;
    }
    bestBookieMetricByBookie.set(b.id, best);
  }

  for (const { runner, layDollars, liability } of rows) {
    const row = document.createElement("tr");
    if (runner.result === "WINNER") row.className = "winner-row";

    const { price: bestPrice, bookieIds: bestBookieIds } = bestBookmakerPrices(runner, displayedBookieIds);
    const bestPriceBadges = bestBookieIds
      .map((id) => {
        const bookie = BOOKIE_LIST.find((b) => b.id === id);
        return `<span class="bookie-badge" title="${bookie.label}"><img class="bookie-logo" src="${bookie.logo}" alt="${bookie.label}" /></span>`;
      })
      .join(" ");
    const bestMetric = metricPercent(runner, commission, hedge, displayedBookieIds);
    // Every bookie's own cell is always generated here, even one not
    // currently displayed — hidden via its own `hidden` attribute
    // instead of being left out, so the header/body/footer column count
    // never drifts apart (see displayedBookieIds above for what
    // actually decides that now).
    const bookieCells = BOOKIE_LIST.map((b) => {
      const price = runner.bookmakers?.[b.id];
      const bookieMetric = bookieMetricPercent(runner, price, commission, hedge);
      const hiddenAttr = displayedBookieIds.has(b.id) ? "" : " hidden";
      // Row-wise ("best bookie per runner") — a strong green tint,
      // overriding this cell's own EV-tier tint outright rather than
      // layering both (green already means "good" on its own). Column-
      // wise ("best runner per bookie") — an independent amber outline,
      // never fighting the tint since a box-shadow paints on top of
      // whatever background is already there; can coincide with the
      // green tint above for the same cell (both conditions are just
      // independently true), same as the reference this matches.
      // Settings > Colours — each highlight is independently toggle-
      // able (matching a reference terminal's own two separate
      // settings), so a disabled one is never even computed as true.
      const rowBest =
        currentSettings.highlightBestBookiePerRunner && bestBookieIds.includes(b.id);
      const colBest =
        currentSettings.highlightBestRunnerPerBookie &&
        price != null &&
        bookieMetric != null &&
        bookieMetric === bestBookieMetricByBookie.get(b.id);
      const cellClass = `col-bookie${rowBest ? " row-best" : ""}${colBest ? " col-best" : ""}`;
      const bg = rowBest ? "rgba(61, 220, 151, 0.22)" : edgeMetricHtml(price == null ? null : bookieMetric).bg;
      return `<td class="${cellClass}"${hiddenAttr} style="background:${bg}">${bookieCellHtml(price, bookieMetric)}</td>`;
    }).join("");

    // Betfair settling the market and marking a runner WINNER (see
    // refreshRaceInner/applyBetfairOdds, background.js) is what drives
    // this — shown right on that runner's own row (a separate banner
    // above the table used to duplicate this, removed per request as
    // redundant once this tag existed).
    const winnerTag =
      runner.result === "WINNER"
        ? ` <em class="winner-tag">${WINNER_ICON} Winner</em>`
        : "";

    const bestPriceMetric = bestPrice != null ? bestMetric : null;
    const bestPriceBg = edgeMetricHtml(bestPriceMetric).bg;
    // Matches the same tint-based "shaded box" treatment a bookie's
    // own cell gets (edgeMetricHtml's own EV-tier colour), not a
    // separate border — user-reported an earlier accent-outline
    // version of this highlight didn't match. Only overrides
    // .col-best-price's own subtle default tint (popup.css) when
    // there's an actual metric-driven colour to show — otherwise the
    // style attribute is left off entirely so that class-level
    // fallback still applies, same as before this cell had a
    // per-metric tint at all.
    const bestPriceBgAttr = bestPriceBg !== "transparent" ? ` style="background:${bestPriceBg}"` : "";
    const { html: runnerNumberBadge, label: runnerLabel } = runnerNumberHtml(runner);

    row.innerHTML = `
      <td>${runnerNumberBadge}${runnerLabel}${winnerTag}</td>
      <td class="col-best-price"${bestPriceBgAttr}>${bestPriceCellHtml(bestPrice, bestPriceBadges, bestPriceMetric)}</td>
      <td class="col-backlay">${backLayCellHtml(
        runner.betfairBack,
        runner.betfairBackLiquidity,
        runner.betfair,
        runner.betfairLiquidity
      )}</td>
      ${bookieCells}
      <td class="lay-dollars" title="Click to copy">${layDollars == null ? "—" : layDollars.toFixed(2)}</td>
      <td class="col-liability">${liability == null ? "—" : liability.toFixed(2)}</td>
    `;

    tbody.appendChild(row);
  }

  // Scratched runners (Betfair status REMOVED) render as placeholder rows
  // at the end, in box-number order — a full-field view instead of just
  // silently having fewer rows than the race actually has runners.
  // showScratchedRunners (Settings > Display) lets that be turned off.
  const scratchedRunners = currentSettings.showScratchedRunners
    ? race.runners
        .filter((r) => r.result === "REMOVED")
        .sort((a, b) => parseRunnerNumber(a.name) - parseRunnerNumber(b.name))
    : [];

  for (const runner of scratchedRunners) {
    const row = document.createElement("tr");
    row.className = "scratched-row";
    row.innerHTML = `
      <td>${runner.name} <em class="scratched-tag">Scratched</em></td>
      <td class="col-best-price">—</td>
      <td class="col-backlay">${backLayCellHtml(null, null, null, null)}</td>
      ${BOOKIE_LIST.map((b) => `<td${displayedBookieIds.has(b.id) ? "" : " hidden"}>—</td>`).join("")}
      <td>—</td>
      <td class="col-liability">—</td>
    `;
    tbody.appendChild(row);
  }

  // Market % footer — overround per price column, from the race's full
  // field regardless of any display filtering above.
  const marketCells = [
    "<td>Market %</td>",
    `<td class="col-best-price"></td>`,
    `<td class="col-backlay"><span class="backlay-box"><span class="bl-cell bl-back">${formatMarketPct(
      marketPercentFor(race.runners, (r) => r.betfairBack)
    )}</span><span class="bl-cell bl-lay">${formatMarketPct(
      marketPercentFor(race.runners, (r) => r.betfair)
    )}</span></span></td>`,
    ...BOOKIE_LIST.map(
      (b) =>
        `<td${displayedBookieIds.has(b.id) ? "" : " hidden"}>${formatMarketPct(
          marketPercentFor(race.runners, (r) => r.bookmakers?.[b.id])
        )}</td>`
    ),
    "<td></td>",
    `<td class="col-liability"></td>`,
  ];
  document.getElementById("odds-foot").innerHTML = `<tr>${marketCells.join("")}</tr>`;

  const countdownMainEl = document.getElementById("race-countdown-main");
  countdownMainEl.dataset.start = race.startTime || "";
  countdownMainEl.dataset.bookieMarketClosed = race.bookieMarketClosed ? "true" : "";
  countdownMainEl.dataset.hasWinner = race.winner ? "true" : "";
  countdownMainEl.dataset.marketStatus = race.marketStatus || "";
  countdownMainEl.dataset.hasLiveBookie = hasLiveBookie ? "true" : "";

  document.getElementById("data-source-note").textContent = noteFor(race);
}

const sortToggleBtn = document.getElementById("sort-toggle-btn");

function setSortMode(mode) {
  sortMode = mode;
  sortToggleBtn.textContent = mode === "number" ? "Sort: Number" : "Sort: Edge";
  if (currentRace) renderRace(currentRace);
}

sortToggleBtn.addEventListener("click", (event) => {
  event.stopPropagation(); // clicking the button shouldn't also trigger anything on the <th> itself
  setSortMode(sortMode === "number" ? "edge" : "number");
});
sortToggleBtn.textContent = sortMode === "number" ? "Sort: Number" : "Sort: Edge";

const hedgeInput = document.getElementById("hedge-input");

hedgeInput.addEventListener("input", () => {
  const value = Number(hedgeInput.value);
  if (Number.isNaN(value)) return; // mid-edit (e.g. field momentarily empty) — wait for a valid number
  hedgePercent = Math.min(100, Math.max(0, value));
  if (currentRace) renderRace(currentRace);
});

const stakeInput = document.getElementById("stake-input");

stakeInput.addEventListener("input", () => {
  const value = Number(stakeInput.value);
  if (Number.isNaN(value)) return; // mid-edit — wait for a valid number
  stakeAmount = Math.max(0, value);
  if (currentRace) renderRace(currentRace);
});

// Segmented pill buttons (a reference terminal's own Win/Place/Bonus/
// Promo tab treatment) instead of the plain <select> this used to be —
// setMode is the one place that actually changes currentMode, so
// Settings > Display's own defaultMode seeding (further down) and this
// click handler both go through it rather than each keeping their own
// copy of "set currentMode, sync the active button, re-render."
const modeTabsEl = document.getElementById("mode-tabs");

function setMode(mode) {
  currentMode = mode;
  for (const btn of modeTabsEl.querySelectorAll(".mode-tab-btn")) {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  }
}

modeTabsEl.addEventListener("click", (event) => {
  const btn = event.target.closest(".mode-tab-btn");
  if (!btn) return;
  setMode(btn.dataset.mode);
  if (currentRace) renderRace(currentRace);
});

// Delegated on the (stable) tbody rather than attached per-row, so this
// keeps working across re-renders without needing to be re-bound every
// time renderRace rebuilds the rows.
document.getElementById("odds-body").addEventListener("click", async (event) => {
  const cell = event.target.closest(".lay-dollars");
  if (!cell) return;

  try {
    await navigator.clipboard.writeText(cell.textContent.trim());
    const original = cell.textContent;
    cell.textContent = "Copied!";
    setTimeout(() => {
      cell.textContent = original;
    }, 700);
  } catch (err) {
    console.warn("Couldn't copy to clipboard:", err.message);
  }
});

const refreshBtn = document.getElementById("refresh-btn");
const noteEl = document.getElementById("data-source-note");

// Two calls can be in flight at once if the user clicks races quickly, and
// Betfair's response times aren't guaranteed to come back in request order
// — so an earlier click can resolve after a later one and clobber it with
// stale data. This token makes each call only apply its result if it's
// still the most recent one requested; anything older is silently dropped.
let latestRaceRequestId = 0;

// marketId is optional — omitting it tells background.js to keep following
// whatever race was last selected (falling back to "next race" if nothing
// has been selected yet), which is what the plain Refresh button wants.
function loadRaceIntoTable(marketId) {
  const requestId = ++latestRaceRequestId;

  refreshBtn.disabled = true;
  refreshBtn.textContent = "Loading...";

  chrome.runtime.sendMessage({ type: "REFRESH_RACE", marketId }, (response) => {
    if (requestId !== latestRaceRequestId) return; // superseded by a newer request

    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh live odds";

    if (!response) {
      noteEl.textContent = "No response from background worker.";
      return;
    }

    if (!response.ok) {
      noteEl.textContent = response.error;
      return;
    }

    renderRace(response.race);
  });
}

refreshBtn.addEventListener("click", () => loadRaceIntoTable());

// Reflects auto-refresh (background.js's alarm) while the popup happens to
// be open, instead of only updating on the next manual click.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.liveRace) {
    const race = changes.liveRace.newValue;
    renderRace(race);

    // Keep the sidebar's own cached copy of this same race in sync at the
    // same time, instead of leaving it to catch up on the next
    // loadUpcomingRaces() poll (~60s away, see the setInterval further
    // down) — bookieMarketClosed/winner both land here instantly
    // (applyBetfairOdds/applyBookieOdds write them the moment the DOM
    // scrape detects them), so without this the top bar could say
    // "IN PLAY"/"RESULTED" up to a minute before the identical race's
    // sidebar row did, despite it being the exact same signal (user-
    // reported: wanted both to flip together).
    if (race?.marketId) {
      const cached = latestRaces.find((r) => r.marketId === race.marketId);
      // hasLiveBookie mirrors listUpcomingRacesInner's own
      // hasLiveBookieMarketId (background.js) — same instant-sync
      // reasoning as bookieMarketClosed/marketStatus/winner below, so
      // the sidebar row for this race stops trusting Betfair's own
      // routine early-suspend the same moment the top bar does, not up
      // to a minute later on the next loadUpcomingRaces() poll.
      const hasLiveBookie = Object.values(race.bookmakerSources || {}).includes("live");
      if (
        cached &&
        (cached.bookieMarketClosed !== race.bookieMarketClosed ||
          cached.marketStatus !== race.marketStatus ||
          cached.winner !== race.winner ||
          cached.hasLiveBookie !== hasLiveBookie)
      ) {
        cached.bookieMarketClosed = race.bookieMarketClosed;
        cached.marketStatus = race.marketStatus;
        cached.winner = race.winner;
        cached.hasLiveBookie = hasLiveBookie;
        renderFilteredRacesList();
      }
    }
  }
});

chrome.storage.local.get(["liveRace"], (stored) => {
  renderRace(stored.liveRace || MOCK_RACE);
});

const racesListEl = document.getElementById("races-list");

// Navigates the given tab to a new URL in place if it still exists, or
// opens a fresh tab if it doesn't. Either way returns the tab id to
// remember for next time. `active` only ever explicitly sets true on the
// update path (never force-defocuses an existing tab the user might be
// looking at for unrelated reasons) — Tab and Window management's "Switch
// focus to the race tabs" setting is the only thing that requests true;
// left off (the default), tabs stay wherever they already were.
async function openOrNavigateTab(tabId, url, { pinned = false, active = false } = {}) {
  if (tabId) {
    try {
      await chrome.tabs.update(tabId, { url, pinned, ...(active && { active: true }) });
      return tabId;
    } catch {
      // Closed by the user since we last used it — fall through to creating
      // a new one below.
    }
  }

  const tab = await chrome.tabs.create({ url, active, pinned });
  return tab.id;
}

// The Betfair/bookmaker tab ids are tracked in storage (not a plain
// variable) since the popup's JS state is thrown away every time it closes,
// but the tabs it opened live on. Reusing the same tabs — navigating them
// in place — instead of closing and recreating avoids the flicker of old
// tabs disappearing and new ones appearing.
//
// Each bookie's tab id lives under `${bookieId}TabId` and its race URL
// under `race[${bookieId}Url]` (e.g. sportsbetTabId/sportsbetUrl,
// tabTabId/tabUrl) — same naming convention background.js's BOOKIES uses,
// so adding a bookie here needs no new field-by-field wiring, just an
// entry in bookies.js. A bookie with no URL for this race (most commonly
// TAB, before its venue code has been learned — see tabMeetings.js) is
// simply left untouched, same as Sportsbet already was when unmatched.
//
// User-requested: no bookmaker tab opens automatically at all unless
// that bookmaker actually belongs to this race — planned against it
// via the Daily Planner, or currently picked in the sidebar's own
// Bookie Search Bar (raceDisplayedBookieIds, the exact same set
// renderRace uses to decide column visibility — user-reported bug,
// found from these two drifting apart: a race planned against
// Sportsbet only still opened Sportsbet+TAB+Ladbrokes tabs, because
// this used to check only the Spotlight's own picks and never looked
// at the Planner at all). Settings > Bookie has no say in this either
// way — it only gates what's searchable/selectable in the first
// place, same as it no longer decides Race Table column visibility.
// The Betfair tab itself is unaffected — it's the exchange this whole
// comparison is against, not one of the bookmakers being compared, so
// it keeps opening for every race regardless.
//
// Focus behavior is Settings-driven (Tab and Window management >
// focusRaceTabsOnOpen): by default every race tab opens/reuses in the
// background and this extension tab's own focus is explicitly re-asserted
// afterward (the prior, unconditional behavior); with the setting on, the
// Betfair tab becomes active instead and this tab's focus is left alone,
// so the race tabs actually end up frontmost as the setting implies — just
// skipping the refocus step wouldn't have been enough on its own, since
// new tabs are still created inactive either way.
async function openRaceTabs(race) {
  const displayedBookieIds = raceDisplayedBookieIds(race);
  const bookiesToOpen = BOOKIE_LIST.filter((b) => displayedBookieIds.has(b.id));
  const tabIdKeys = bookiesToOpen.map((b) => `${b.id}TabId`);
  const stored = await chrome.storage.local.get(["betfairTabId", ...tabIdKeys]);

  const betfairTabId = await openOrNavigateTab(stored.betfairTabId, race.betfairUrl, {
    pinned: currentSettings.pinRaceTabs,
    active: currentSettings.focusRaceTabsOnOpen,
  });

  const updates = { betfairTabId };
  for (const bookie of bookiesToOpen) {
    const urlKey = `${bookie.id}Url`;
    const tabIdKey = `${bookie.id}TabId`;
    let url = race[urlKey];

    // TAB specifically: a missing URL here just means tabMeetings.js
    // hasn't seen this venue/sport combo on a real TAB meetings page yet
    // (see tabRaceUrlFromCodes, background.js) — normally resolved by
    // once-a-day background visit, but user-reported TAB's tab then
    // just sits there untouched below, indistinguishable from "TAB is
    // broken." Learn it right now instead of waiting for that (a ~6s
    // delay only the first time a given venue/sport is opened — see
    // ensureTabUrlForRace, background.js — instant on every later click
    // once it's known).
    if (!url && bookie.id === "tab") {
      url = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "ENSURE_TAB_URL",
            track: race.track,
            raceType: race.raceType,
            raceNumber: race.raceNumber,
            startTime: race.startTime,
          },
          (response) => resolve(response?.tabUrl || null)
        );
      });
    }

    updates[tabIdKey] = url
      ? await openOrNavigateTab(stored[tabIdKey], url, {
          pinned: currentSettings.pinRaceTabs,
        })
      : stored[tabIdKey];
  }

  await chrome.storage.local.set(updates);

  if (!currentSettings.focusRaceTabsOnOpen) {
    const ownTab = await chrome.tabs.getCurrent();
    if (ownTab) {
      await chrome.tabs.update(ownTab.id, { active: true });
    }
  }
}

// One race-list row (Today) — a card matching a reference screenshot: a
// coloured sport-letter badge (RACE_TYPE_CODE, bookies.js — same R/H/G
// scheme the race-info bar's own title and TAB's race URLs already use),
// a live-status dot, the race itself, and a right-aligned countdown to
// its jump.
function raceCardHtml(race) {
  const code = RACE_TYPE_CODE[race.raceType] || RACE_TYPE_CODE[race.sport] || "?";
  const selected = race.marketId === selectedMarketId ? " selected" : "";
  const plannerEntries = plannerEntriesForMarketId(race.marketId);
  const planned = plannerEntries.length > 0 ? " planned" : "";

  // hour12 explicit (not left to the browser's own locale default) so
  // this can never silently drift from formatJumpTime's own guaranteed
  // 12-hour am/pm format above.
  const time = new Date(race.startTime).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const timeHtml = currentSettings.showCountdowns
    ? `<span class="race-countdown" data-start="${race.startTime}" data-bookie-market-closed="${
        race.bookieMarketClosed ? "true" : ""
      }" data-has-winner="${race.winner ? "true" : ""}" data-market-status="${
        race.marketStatus || ""
      }" data-has-live-bookie="${race.hasLiveBookie ? "true" : ""}"></span>`
    : "";

  // The dot's own real meaning (user-clarified): green means the
  // bookmaker market's still open, red means it's closed (in-play or
  // resulted) — not just decorative. The exact same "gone in-play"
  // check this race's own countdown already shows IN PLAY/RESULTED
  // for (isShowingStatusWord), so the dot and the countdown word can
  // never disagree with each other.
  const marketClosed = isShowingStatusWord(
    race.startTime,
    race.bookieMarketClosed ? "true" : "",
    race.winner ? "true" : "",
    race.marketStatus,
    race.hasLiveBookie ? "true" : ""
  );

  // No icon/emoji on the card itself (user-requested — the left-border
  // accent, .race-card.planned, is the only visual signal now) — what's
  // actually planned lives on the <li>'s own title attribute instead,
  // so hovering the row still tells you. Plural: lists every planned
  // bookmaker/promo pair for this race, not just one.
  const plannerTitle = plannerEntries
    .map((e) => {
      const bookieLabel = BOOKIE_LIST.find((b) => b.id === e.bookieId)?.label || e.bookieId;
      const promoLabel = PROMO_MODES.find((m) => m.id === e.promoType)?.label || e.promoType;
      return `${bookieLabel} – ${promoLabel}`;
    })
    .join(", ");
  const titleAttr = plannerTitle ? ` title="Planned: ${plannerTitle.replace(/"/g, "&quot;")}"` : "";

  return `
    <li class="race-card sport-${race.raceType}${selected}${planned}" data-market-id="${race.marketId}"${titleAttr}>
      <span class="race-sport-badge">${code}</span>
      <span class="race-card-body">
        <span class="race-card-title-row">
          <span class="race-live-dot${marketClosed ? " closed" : ""}" title="${
    marketClosed ? "Market closed" : "Market open"
  }"></span>
          <span class="race-card-title">R${race.raceNumber} ${race.track}</span>
        </span>
        <span class="race-card-sub">${time}${
    race.country ? `<span class="race-country">${race.country}</span>` : ""
  }${
    race.sportsbetUrl === null
      ? '<span class="race-warn" title="No matching Sportsbet race found">!</span>'
      : ""
  }</span>
      </span>
      <span class="race-card-time">${timeHtml}</span>
    </li>
  `;
}

// Delegated on the stable <ul> rather than one listener per <li> (bound
// once, at setup, below — NOT inside renderRacesList, since that
// rebuilds innerHTML on every refresh and re-adding a delegated listener
// each time would fire it that many times over per click). Looks the
// clicked race up fresh from latestRaces rather than closing over a
// snapshot, so it never goes stale across re-renders.
function bindRaceCardClicks(listEl) {
  listEl.addEventListener("click", (event) => {
    const card = event.target.closest(".race-card");
    if (!card) return;
    const race = latestRaces.find((r) => r.marketId === card.dataset.marketId);
    if (race) selectRace(race);
  });
}
bindRaceCardClicks(racesListEl);

function renderRacesList(races) {
  if (races.length === 0) {
    racesListEl.innerHTML = '<li class="races-status">No upcoming races found.</li>';
    return;
  }

  racesListEl.innerHTML = races.map((race) => raceCardHtml(race)).join("");
}

// Shared by the sidebar's race list and the race-number pills under the
// jump-time line — opens/reuses this race's Betfair/bookmaker tabs, loads
// it into the main table, and re-renders both places a "currently
// selected" highlight can show so neither one is left pointing at the
// race that was previously loaded.
function selectRace(race) {
  selectedMarketId = race.marketId;
  openRaceTabs(race);
  loadRaceIntoTable(race.marketId);
  renderFilteredRacesList();
}

// Quick race-number pills for jumping between other races at the same
// track as the one currently loaded — sits right under the jump-time
// line. Only ever shows races actually present in latestRaces (plus the
// currently-loaded race itself, in case it's fallen out of that list —
// e.g. mock data, or a race background.js already swapped out because
// its own selection expired): Betfair's API drops a race entirely once
// it jumps (see loadUpcomingRaces/background.js), so there's no reliable
// way to know a track's full R1..R10 range in advance, and a disabled
// placeholder pill for a race we have no real data for isn't something
// to fake.
function renderTrackRacesRow(race) {
  const rowEl = document.getElementById("track-races-row");

  if (!race?.track) {
    rowEl.innerHTML = "";
    return;
  }

  const trackRaces = latestRaces.filter((r) => r.track === race.track && r.sport === race.sport);
  if (!trackRaces.some((r) => r.marketId === race.marketId) && race.raceNumber != null) {
    trackRaces.push(race);
  }
  trackRaces.sort((a, b) => (a.raceNumber ?? 0) - (b.raceNumber ?? 0));

  rowEl.innerHTML = trackRaces
    .map(
      (r) =>
        `<button class="race-pill${
          r.marketId === race.marketId ? " active" : ""
        }" data-market-id="${r.marketId}">R${r.raceNumber}</button>`
    )
    .join("");

  for (const btn of rowEl.querySelectorAll(".race-pill")) {
    btn.addEventListener("click", () => {
      const target =
        latestRaces.find((r) => r.marketId === btn.dataset.marketId) ||
        (currentRace?.marketId === btn.dataset.marketId ? currentRace : null);
      if (target) selectRace(target);
    });
  }
}

// Used by formatCountdown below — "Xh Ym" once past an hour, else
// "Xm Ys" (always 2-digit seconds), no sign of its own.
function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

// bookieMarketClosed (sportsbetWatcher.js/tabWatcher.js's live DOM scrape
// of whichever bookie tab is open, applied via background.js's
// applyBookieOdds) is the primary "gone in-play" trigger — not Betfair's
// own status by itself. User-reported/explicit direction: Betfair itself
// commonly stays tradeable well past the real jump, so its own status
// was never a reliable signal for the ONE race that actually has a
// bookie tab open. betfairMarketStatus (below) is a fallback for every
// OTHER race in the sidebar list, which never has a tab open at all —
// user-reported those just counting down past zero forever with no way
// to show "IN PLAY" until a winner eventually appears. Betfair's own
// OPEN/SUSPENDED/CLOSED status (checkPendingResultsInner, background.js
// — already fetched there for the winner check, no new API cost) is a
// rougher, sometimes-later signal than bookieMarketClosed, but it's real
// data instead of nothing: once it's no longer "OPEN", betting there has
// genuinely stopped.
//
// hasLiveBookie (below) is what keeps that fallback scoped to ONLY those
// tab-less races — user-reported/live-confirmed that Betfair routinely
// suspends its own market right at its scheduled start time even when
// the real jump is running late (a live Sportsbet tab's own clock still
// counting down, e.g. "-13s", well past our own scheduled startTime),
// so isBetfairMarketClosed used unconditionally would flip the loaded
// race to "IN PLAY" — and metricsSuspended's figures blank along with
// it — while the bookmaker market it's actually being compared against
// is still genuinely open. true whenever any bookie has ever gone
// "live" for this race (race.bookmakerSources, background.js) — i.e.
// there's a real DOM scrape actively confirming the state, so
// bookieMarketClosed alone (still false/absent) is trusted outright and
// Betfair's own routine early-suspend is ignored entirely for that one
// race. Every other sidebar row never has a live bookie tab at all
// (background.js's own comment on bookieMarketClosedMarketId — only the
// currently-selected race can ever carry one), so hasLiveBookie is
// always false there and the fallback still applies exactly as before.
// The displayed clock itself is untouched by any of this — still just
// Betfair's own scheduled startTime counting down, then on into
// negative, same as always; only what triggers the switch to "IN PLAY"
// changed.
// Exported as its own check (not just inlined in formatCountdown) so
// the race-info bar's "in" prefix (only makes sense before a duration,
// not in front of the word "IN PLAY") can key off the exact same rule
// instead of a second copy of it drifting out of sync.
// "true" (string), not a boolean, for bookieMarketClosed/hasWinner/
// hasLiveBookie below — every real caller sources these from DOM
// dataset attributes (renderRace/raceCardHtml both write
// race.bookieMarketClosed/race.winner/hasLiveBookie through a `?
// "true" : ""` ternary), and dataset values are always strings.
// betfairMarketStatus is instead whatever raw string race.marketStatus
// already is ("OPEN"/"SUSPENDED"/"CLOSED"/"" for unknown) — no ternary
// needed, "OPEN" and "" both mean "not closed yet" so both fall through
// the same way.
function isPastJumpTime(startTimeIso) {
  return new Date(startTimeIso).getTime() - Date.now() <= 0;
}

function isBetfairMarketClosed(betfairMarketStatus, hasLiveBookie) {
  return !hasLiveBookie && Boolean(betfairMarketStatus) && betfairMarketStatus !== "OPEN";
}

// Whether the countdown is currently showing a status word ("IN PLAY"/
// "RESULTED") rather than a duration — exported as its own check (not
// just inlined in formatCountdown) so the race-info bar's "in" prefix
// (only makes sense before a duration) can key off the exact same rule
// instead of a second copy of it drifting out of sync.
function isShowingStatusWord(startTimeIso, bookieMarketClosed, hasWinner, betfairMarketStatus, hasLiveBookie) {
  return (
    isPastJumpTime(startTimeIso) &&
    (hasWinner === "true" ||
      bookieMarketClosed === "true" ||
      isBetfairMarketClosed(betfairMarketStatus, hasLiveBookie === "true"))
  );
}

function formatCountdown(startTimeIso, bookieMarketClosed, hasWinner, betfairMarketStatus, hasLiveBookie) {
  const diffMs = new Date(startTimeIso).getTime() - Date.now();
  if (diffMs > 0) return formatDuration(Math.floor(diffMs / 1000));
  // RESULTED takes priority over IN PLAY — a winner being known means
  // the race is definitely done, regardless of what bookieMarketClosed/
  // betfairMarketStatus (which only track betting having closed, not
  // the actual result) say by this point.
  if (hasWinner === "true") return "RESULTED";
  if (
    isPastJumpTime(startTimeIso) &&
    (bookieMarketClosed === "true" || isBetfairMarketClosed(betfairMarketStatus, hasLiveBookie === "true"))
  )
    return "IN PLAY";
  return `-${formatDuration(Math.floor(-diffMs / 1000))}`;
}

// Ticks every second, independent of whenever the races list was last
// rendered — just re-reads whatever ".race-countdown" elements currently
// exist in the DOM, so it naturally keeps working across re-renders
// without needing its own cleanup/restart logic.
function tickCountdowns() {
  for (const el of document.querySelectorAll(".race-countdown")) {
    el.textContent = formatCountdown(
      el.dataset.start,
      el.dataset.bookieMarketClosed,
      el.dataset.hasWinner,
      el.dataset.marketStatus,
      el.dataset.hasLiveBookie
    );
  }

  const countdownMainEl = document.getElementById("race-countdown-main");
  countdownMainEl.textContent = countdownMainEl.dataset.start
    ? formatCountdown(
        countdownMainEl.dataset.start,
        countdownMainEl.dataset.bookieMarketClosed,
        countdownMainEl.dataset.hasWinner,
        countdownMainEl.dataset.marketStatus,
        countdownMainEl.dataset.hasLiveBookie
      )
    : "";
  // "Jumps at HH:MM · in -1m 02s" reads fine; "Jumps at HH:MM · in IN
  // PLAY"/"in RESULTED" doesn't — hide the "in" the same moment the
  // countdown itself switches to a status word.
  const showingStatusWord = Boolean(
    countdownMainEl.dataset.start &&
      isShowingStatusWord(
        countdownMainEl.dataset.start,
        countdownMainEl.dataset.bookieMarketClosed,
        countdownMainEl.dataset.hasWinner,
        countdownMainEl.dataset.marketStatus,
        countdownMainEl.dataset.hasLiveBookie
      )
  );
  document.getElementById("race-countdown-prefix").hidden = showingStatusWord;

  // Re-derive the race-info-bar dot every tick too (renderRace only sets
  // it once, when a race first loads/reloads) — same isShowingStatusWord
  // result as the line above, so this dot flips to red the instant the
  // countdown itself switches to IN PLAY/RESULTED, staying in step with
  // the sidebar list's own market-status dot instead of only updating on
  // the next full render.
  if (countdownMainEl.dataset.start) {
    const raceLiveDotEl = document.getElementById("race-live-dot");
    raceLiveDotEl.classList.toggle("closed", showingStatusWord);
    raceLiveDotEl.title = showingStatusWord ? "Market closed" : "Market open";
  }
}
tickCountdowns();
setInterval(tickCountdowns, 1000);

// No manual refresh button — this is the only entry point now (initial
// load + the periodic poll further down), so this needs to behave well
// called repeatedly on its own: only shows the
// "Loading..."/error placeholder on the very first call (latestRaces
// still empty), rather than blanking out an already-populated list (and
// flashing it back in a moment later) on every routine background poll.
function loadUpcomingRaces() {
  if (latestRaces.length === 0) {
    racesListEl.innerHTML = '<li class="races-status">Loading...</li>';
  }

  chrome.runtime.sendMessage({ type: "LIST_UPCOMING_RACES" }, (response) => {
    if (!response || !response.ok) {
      if (latestRaces.length === 0) {
        racesListEl.innerHTML = `<li class="races-status">${
          response ? response.error : "No response from background worker."
        }</li>`;
      }
      return;
    }

    latestRaces = response.races;
    renderFilteredRacesList();
    if (currentRace) renderTrackRacesRow(currentRace); // other races at this track may have just appeared/dropped off
  });
}

// Applies the Race Types toggles and the track search box to the
// last-fetched Today list without re-querying background.js — instant,
// and doesn't burn an extra Betfair call just to hide/show rows the
// extension already has.
function renderFilteredRacesList() {
  const query = trackSearchQuery.trim().toLowerCase();
  const matchesFilter = (race) =>
    selectedRaceTypes.has(race.raceType) &&
    // A race with no country at all (shouldn't happen for a real
    // Betfair market, but mock/placeholder data doesn't always set
    // one) is never filtered out by this — same "don't hide what we
    // don't actually know" reasoning the sportsbetUrl "!" marker uses,
    // rather than silently disappearing from Today for an unrelated
    // reason.
    (!race.country || selectedCountries.has(race.country)) &&
    (query === "" || race.track.toLowerCase().includes(query));

  renderRacesList(latestRaces.filter(matchesFilter));
}

// --- Bookie Spotlight (sidebar, above the track search box) -----------
//
// User-requested: search and pick one or more bookmakers to
// automatically highlight their own column in the main odds table for
// whatever race is loaded — reusing the exact same search-and-pick
// widget (chips of logos inside one box, mousedown-to-select so the
// search field never loses focus) the Daily Planner's own Bookmaker(s)
// field already uses, just standalone rather than tied to a saved
// plan entry. "if it's on" (only enabled bookmakers are ever offered)
// comes for free from plannerBookieSuggestions already filtering
// through visibleBookies().
let spotlightBookieIds = [];

const bookieSpotlightEl = document.getElementById("bookie-spotlight");
const bookieSpotlightBoxEl = document.getElementById("bookie-spotlight-box");
const bookieSpotlightSuggestionsEl = document.getElementById("bookie-spotlight-suggestions");

// Rebuilds the box's chips + a fresh search input, focuses that input
// with the given text, and reopens its suggestions dropdown to match —
// same "type, pick, keep typing the next one" flow as
// refreshPlannerBookieCell, just against spotlightBookieIds instead of
// one draft row's own bookieIds. Also re-renders the currently loaded
// race so its column shows/hides immediately.
function refreshBookieSpotlight(searchText) {
  bookieSpotlightBoxEl.innerHTML = `
    ${spotlightBookieIds.map(plannerBookieChipHtml).join("")}
    <input type="text" class="planner-bookie-search" id="bookie-spotlight-search" placeholder="Select bookmaker" autocomplete="off" />
  `;
  const searchInput = document.getElementById("bookie-spotlight-search");
  searchInput.value = searchText;
  searchInput.focus();
  bookieSpotlightSuggestionsEl.innerHTML = plannerBookieSuggestionsHtml(searchText, spotlightBookieIds);
  bookieSpotlightSuggestionsEl.hidden = bookieSpotlightSuggestionsEl.innerHTML === "";
  if (currentRace) {
    renderRace(currentRace);
    // Picking a bookmaker here is now the only thing that opens its
    // tab at all (openRaceTabs) — without this, a freshly-spotlighted
    // bookie wouldn't get its tab until the next time some race
    // happened to be (re)selected, well after picking it should
    // already show its own live tab.
    openRaceTabs(currentRace);
  }
}

refreshBookieSpotlight(""); // initial render — no chips yet, empty search box

bookieSpotlightEl.addEventListener("input", (event) => {
  if (!event.target.classList.contains("planner-bookie-search")) return;
  bookieSpotlightSuggestionsEl.innerHTML = plannerBookieSuggestionsHtml(event.target.value, spotlightBookieIds);
  bookieSpotlightSuggestionsEl.hidden = bookieSpotlightSuggestionsEl.innerHTML === "";
});

bookieSpotlightEl.addEventListener("focusin", (event) => {
  if (!event.target.classList.contains("planner-bookie-search")) return;
  bookieSpotlightSuggestionsEl.innerHTML = plannerBookieSuggestionsHtml(event.target.value, spotlightBookieIds);
  bookieSpotlightSuggestionsEl.hidden = bookieSpotlightSuggestionsEl.innerHTML === "";
});

// Delayed, not immediate — same reason as the planner's own version:
// the "mousedown" listener below needs its own chance to fire and add
// the bookmaker first.
bookieSpotlightEl.addEventListener(
  "focusout",
  (event) => {
    if (!event.target.classList.contains("planner-bookie-search")) return;
    setTimeout(() => {
      bookieSpotlightSuggestionsEl.hidden = true;
    }, 150);
  },
  true
);

// mousedown, not click — keeps focus on the search box instead of
// briefly moving it to this button, so picking one bookmaker and
// immediately typing the next stays one continuous motion.
bookieSpotlightEl.addEventListener("mousedown", (event) => {
  const suggestionBtn = event.target.closest(".planner-bookie-suggestion");
  if (!suggestionBtn) return;
  event.preventDefault();
  spotlightBookieIds.push(suggestionBtn.dataset.bookie);
  refreshBookieSpotlight("");
});

bookieSpotlightEl.addEventListener("click", (event) => {
  const chip = event.target.closest(".planner-bookie-chip");
  if (chip) {
    spotlightBookieIds = spotlightBookieIds.filter((id) => id !== chip.dataset.bookie);
    refreshBookieSpotlight("");
    // Deselecting here closes that bookmaker's own tab too, unless
    // it's still planned against the loaded race some other way.
    closeUnneededBookieTabs(currentRace);
    return;
  }
  if (event.target.id === "bookie-spotlight-box") {
    document.getElementById("bookie-spotlight-search")?.focus();
  }
});

// Enter picks the top visible suggestion — same nicety as the
// planner's own field.
bookieSpotlightEl.addEventListener("keydown", (event) => {
  if (!event.target.classList.contains("planner-bookie-search") || event.key !== "Enter") return;
  event.preventDefault();
  const top = plannerBookieSuggestions(event.target.value, spotlightBookieIds)[0];
  if (!top) return;
  spotlightBookieIds.push(top.id);
  refreshBookieSpotlight("");
});

const trackSearchInput = document.getElementById("track-search");
trackSearchInput.addEventListener("input", () => {
  trackSearchQuery = trackSearchInput.value;
  renderFilteredRacesList();
});

loadUpcomingRaces();

// Keeps the sidebar's Today list from going stale while the popup stays
// open. Without this, a race that's already gone in-play just sits in
// Today showing "IN PLAY" forever — its own countdown correctly detects
// that client-side, but nothing was actually re-fetching the list to
// drop it once Betfair's own upcoming-races feed does. Same ~1-minute
// cadence as background.js's own alarm-driven refresh (no point polling
// faster than the underlying data actually changes), and gated by the
// same Settings > Automatically refresh toggle every other auto-refresh
// in this extension already respects.
setInterval(() => {
  if (!currentSettings.autoRefresh) return;
  loadUpcomingRaces();
}, 60 * 1000);

for (const btn of document.querySelectorAll(".race-type-btn")) {
  btn.addEventListener("click", () => {
    const raceType = btn.dataset.raceType;
    if (selectedRaceTypes.has(raceType)) {
      selectedRaceTypes.delete(raceType);
    } else {
      selectedRaceTypes.add(raceType);
    }
    btn.classList.toggle("active", selectedRaceTypes.has(raceType));
    renderFilteredRacesList();
  });
}

for (const btn of document.querySelectorAll(".country-btn")) {
  btn.addEventListener("click", () => {
    const country = btn.dataset.country;
    if (selectedCountries.has(country)) {
      selectedCountries.delete(country);
    } else {
      selectedCountries.add(country);
    }
    btn.classList.toggle("active", selectedCountries.has(country));
    renderFilteredRacesList();
  });
}

// Light mode's own legible defaults for the two colours nothing else
// overrides at the :root level (popup.css's own [data-theme="light"]
// block handles every other variable) — --accent is set inline below
// instead, since an untouched accentColor needs to resolve differently
// per theme and a plain CSS override can't win against an inline style.
const THEME_DEFAULT_ACCENT = { dark: "#2f6feb", light: "#1f56c9" };

// Same "resolve differently per theme until the user actually picks
// one" treatment as THEME_DEFAULT_ACCENT above, for the Daily
// Planner's own highlight colour (Settings > Colours > Promo Colour —
// user-requested) — matches --lay-color's own existing per-theme
// values (popup.css) exactly, so nothing changes visually for anyone
// until they actually pick a different one.
const THEME_DEFAULT_PROMO_COLOR = { dark: "#ef6fb0", light: "#cf4691" };

const themeToggleBtn = document.getElementById("theme-toggle-btn");

// Just the toggle button's own icon/title + the data-theme attribute
// popup.css's light-mode block keys off — split out from
// applyDisplaySettings so the button reacts the instant it's clicked,
// without waiting on a settings round-trip first.
// Inline SVGs (currentColor, so they inherit #theme-toggle-btn's own
// color/hover rules exactly like the plain-text emoji they replaced) —
// a moon while in light mode (next click goes dark), a sun while in
// dark mode (next click goes light). Matches the flat, single-colour
// icon treatment the rest of the header now uses (see settings-btn/
// comms-badge/matched-badge) instead of a platform emoji glyph.
const THEME_ICON_MOON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>';
const THEME_ICON_SUN =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (theme === "light") {
    themeToggleBtn.innerHTML = THEME_ICON_MOON;
    themeToggleBtn.title = "Switch to dark mode";
  } else {
    themeToggleBtn.innerHTML = THEME_ICON_SUN;
    themeToggleBtn.title = "Switch to light mode";
  }
}

// The settings that apply live, for the whole session, every time they
// change — as opposed to Default Mode/Sort/Stake/Hedge/Race Types below,
// which only ever SEED the session once at startup (changing them later
// via the Settings modal deliberately doesn't retroactively overwrite
// whatever the user's already set live in this session, same reasoning as
// live changes never overwriting the Settings page's own Default* fields
// either). Called once at startup and again every time the Settings modal
// closes, so e.g. toggling "Show liquidity" takes effect immediately.
function applyDisplaySettings(settings) {
  currentSettings = settings;

  // Deliberately does NOT prune the Daily Planner's or the Bookie
  // Spotlight's own existing bookmaker picks against enabledBookies any
  // more — user-clarified Settings > Bookie now only gates what's
  // available to search/select going forward, not what's already been
  // selected. renderRace (below) is what actually decides which bookie
  // columns show, purely from those two picks — never from this
  // setting directly.

  applyTheme(settings.theme);
  // An untouched accentColor (still DEFAULT_SETTINGS' own dark-mode
  // value) resolves to the active theme's own default instead of
  // forcing dark mode's bright mint onto a light background where it'd
  // barely be legible as text. A colour the user actually picked in
  // Settings > Colours always applies literally, in either theme.
  const accentColor =
    settings.accentColor === DEFAULT_SETTINGS.accentColor
      ? THEME_DEFAULT_ACCENT[settings.theme] || THEME_DEFAULT_ACCENT.dark
      : settings.accentColor;
  document.documentElement.style.setProperty("--accent", accentColor);
  // Same treatment for the Daily Planner's own highlight colour
  // (Settings > Colours > Promo Colour) — --promo-color (popup.css),
  // read by .race-card.planned (the sidebar's own left-border accent on
  // a planned race — the bookie column itself is no longer highlighted
  // at all, user-requested, see renderRace's own displayedBookieIds).
  const promoColor =
    settings.promoColor === DEFAULT_SETTINGS.promoColor
      ? THEME_DEFAULT_PROMO_COLOR[settings.theme] || THEME_DEFAULT_PROMO_COLOR.dark
      : settings.promoColor;
  document.documentElement.style.setProperty("--promo-color", promoColor);
  document.body.classList.toggle("compact-rows", settings.compactRows);
  document.body.classList.toggle("hide-liquidity", !settings.showLiquidityColumn);
  document.body.classList.toggle("show-liability", settings.showLiabilityColumn);

  // Settings > Bookie no longer decides which bookie columns are
  // shown/hidden here (see renderRace's own displayedBookieIds) — this
  // just needs a re-render so any Bookmaker(s)/Bookie Spotlight fields
  // still open right now re-filter their own suggestions immediately.
  if (currentRace) renderRace(currentRace);
  if (latestRaces.length > 0) renderFilteredRacesList();
}

themeToggleBtn.addEventListener("click", () => {
  const nextTheme = currentSettings.theme === "light" ? "dark" : "light";
  saveSettings({ theme: nextTheme }).then(applyDisplaySettings);
});

// Applies the user's saved Settings-page defaults over the hardcoded
// fallbacks above. Runs concurrently with (not before) the liveRace/
// upcomingRaces loads already kicked off above — whichever finishes last
// naturally ends up correct either way: if this resolves first, the
// race/list loads below will already pick up the right currentMode/
// sortMode/etc. when they render; if it resolves after (settings is a
// second storage round-trip, so this is the more likely order), it
// re-renders whatever's already on screen rather than leaving it stuck on
// the hardcoded defaults.
loadSettings().then((settings) => {
  applyDisplaySettings(settings);

  setMode(settings.defaultMode);
  sortMode = settings.defaultSort;
  hedgePercent = settings.defaultHedge;
  stakeAmount = settings.defaultStake;
  selectedRaceTypes = new Set(settings.defaultRaceTypes);

  hedgeInput.value = hedgePercent;
  stakeInput.value = stakeAmount;
  sortToggleBtn.textContent = sortMode === "number" ? "Sort: Number" : "Sort: Edge";
  for (const btn of document.querySelectorAll(".race-type-btn")) {
    btn.classList.toggle("active", selectedRaceTypes.has(btn.dataset.raceType));
  }
});

// --- Interactive Tutorial -----------------------------------------------
//
// User-requested: a beginner walkthrough that highlights the real
// controls one at a time (not a page of text) — Race List, Bookie
// Search, Planner, Race Table, Hedge %, Race Timer, Bookmaker Tabs,
// Settings, in that order, with Back/Next/Skip/Finish and a step
// counter. Each step is just a target element to highlight (see
// .tutorial-highlight, popup.css) plus a short explanation; a couple
// of steps also need to open/close a modal to point at something
// inside it (onEnter/onExit below), same as clicking Planner/Settings
// themselves would.
const TUTORIAL_STEPS = [
  {
    title: "Upcoming Races",
    body: "Every race for the rest of today, soonest first. Click any race here to load it into the table on the right.",
    target: () => document.getElementById("races-list"),
  },
  {
    title: "Bookie Search Bar",
    body: "Type a bookmaker's name and click it to select it (or press Enter). Selected bookmakers get their own column in the table and their own tab opens automatically when you load a race — click a bookmaker's own logo here to deselect it again, which closes that tab too.",
    target: () => document.getElementById("bookie-spotlight"),
  },
  {
    title: "Daily Planner",
    body: "Plan ahead: pick a course, a race number or range (e.g. 1-5), one or more bookmakers, and a promotion type, then Save. Anything planned here shows up automatically — its own column, its own tab — the moment you load that race, on top of whatever's picked in the Bookie Search Bar.",
    target: () => document.querySelector("#planner-modal .modal-panel"),
    onEnter: () => openPlannerModal(),
    onExit: () => closePlannerModal(),
  },
  {
    title: "Race Table",
    body: "Best Price is the highest price across your selected bookmakers — that's what Edge%/Lay $/Liability are actually computed from. Back/Lay are Betfair's own exchange prices. Each bookmaker's own column shows its price with your Edge% underneath it.",
    target: () => document.getElementById("odds-table-wrapper"),
  },
  {
    title: "Hedge %",
    body: "100% fully hedges your bet on Betfair (locks in the result regardless of who wins). 0% means no lay bet at all — the full stake rides on the bookmaker side. Try changing it and watch Lay $ and Liability update live in the table.",
    target: () => document.getElementById("hedge-input"),
  },
  {
    title: "Race Timer",
    body: "Counts down to the jump. It switches to IN PLAY the moment the bookmaker's own market actually closes — not just when the scheduled jump time passes, since a race can start late — and to RESULTED once a winner is confirmed.",
    target: () => document.getElementById("race-countdown-main"),
  },
  {
    title: "Bookmaker Tabs",
    body: "Selecting a race only opens a tab for a bookmaker you've actually selected here or planned for that exact race — Betfair's own tab always opens too. Deselect a bookmaker and its tab closes automatically, even if it was already open.",
    target: () => document.getElementById("bookie-spotlight"),
  },
  {
    title: "Settings",
    body: "Turn bookmakers on or off for searching/selecting (this doesn't hide an already-selected one), set your own defaults for Mode/Stake/Hedge, and customise colours — including the Planner's own highlight colour.",
    target: () => document.querySelector("#settings-modal .modal-panel"),
    onEnter: () => {
      settingsModal.hidden = false;
    },
    onExit: () => closeSettingsModal(),
  },
];

let tutorialStepIndex = -1; // -1 = not currently running
let tutorialHighlightedEl = null;

const tutorialTooltipEl = document.getElementById("tutorial-tooltip");
const tutorialStepCounterEl = document.getElementById("tutorial-step-counter");
const tutorialTitleEl = document.getElementById("tutorial-tooltip-title");
const tutorialBodyEl = document.getElementById("tutorial-tooltip-body");
const tutorialBackBtn = document.getElementById("tutorial-back-btn");
const tutorialNextBtn = document.getElementById("tutorial-next-btn");
const tutorialSkipBtn = document.getElementById("tutorial-skip-btn");

function clearTutorialHighlight() {
  if (tutorialHighlightedEl) {
    tutorialHighlightedEl.classList.remove("tutorial-highlight");
    tutorialHighlightedEl = null;
  }
}

// Below the target if there's room, above it otherwise; clamped on
// both axes so it can never render partly off-screen regardless of
// where the target itself happens to sit (a tall sidebar list, a
// modal near the edge of the window, ...).
function positionTutorialTooltip(targetEl) {
  const rect = targetEl.getBoundingClientRect();
  const tooltipRect = tutorialTooltipEl.getBoundingClientRect();
  const margin = 12;

  let top = rect.bottom + margin;
  if (top + tooltipRect.height > window.innerHeight - margin) {
    top = rect.top - tooltipRect.height - margin;
  }
  top = Math.min(Math.max(top, margin), window.innerHeight - tooltipRect.height - margin);

  let left = rect.left;
  left = Math.min(Math.max(left, margin), window.innerWidth - tooltipRect.width - margin);

  tutorialTooltipEl.style.top = `${top}px`;
  tutorialTooltipEl.style.left = `${left}px`;
}

function renderTutorialStep() {
  clearTutorialHighlight();
  const step = TUTORIAL_STEPS[tutorialStepIndex];
  const target = step.target();
  if (target) {
    target.classList.add("tutorial-highlight");
    tutorialHighlightedEl = target;
    target.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // All synchronous, deliberately not deferred behind
  // requestAnimationFrame — an inactive/background tab can go a long
  // time (or forever) between animation frames, which left every one
  // of these stuck showing the PREVIOUS step's text/buttons until the
  // tab happened to regain focus (confirmed live testing this).
  tutorialStepCounterEl.textContent = `Step ${tutorialStepIndex + 1} of ${TUTORIAL_STEPS.length}`;
  tutorialTitleEl.textContent = step.title;
  tutorialBodyEl.textContent = step.body;
  tutorialBackBtn.hidden = tutorialStepIndex === 0;
  tutorialNextBtn.textContent = tutorialStepIndex === TUTORIAL_STEPS.length - 1 ? "Finish" : "Next";

  if (!target) return;
  // getBoundingClientRect() forces a synchronous layout, so this
  // already reflects a just-opened modal (onEnter, above) or the
  // target's settled position — no need to wait a frame for that.
  positionTutorialTooltip(target);
  // scrollIntoView's own smooth-scroll animation and a modal's CSS
  // transition (if it has one) both continue after this point though
  // — one more measurement shortly after catches the tooltip up to
  // wherever the target actually ends up, without needing a scroll/
  // transition-end listener for what's just a cosmetic settle.
  setTimeout(() => positionTutorialTooltip(target), 300);
}

function goToTutorialStep(index) {
  const outgoing = TUTORIAL_STEPS[tutorialStepIndex];
  if (outgoing?.onExit) outgoing.onExit();
  tutorialStepIndex = index;
  const incoming = TUTORIAL_STEPS[tutorialStepIndex];
  if (incoming.onEnter) incoming.onEnter();
  renderTutorialStep();
}

function startTutorial() {
  tutorialTooltipEl.hidden = false;
  goToTutorialStep(0);
}

function endTutorial() {
  const current = TUTORIAL_STEPS[tutorialStepIndex];
  if (current?.onExit) current.onExit();
  clearTutorialHighlight();
  tutorialTooltipEl.hidden = true;
  tutorialStepIndex = -1;
}

document.getElementById("tutorial-btn").addEventListener("click", startTutorial);
tutorialSkipBtn.addEventListener("click", endTutorial);
tutorialBackBtn.addEventListener("click", () => goToTutorialStep(tutorialStepIndex - 1));
tutorialNextBtn.addEventListener("click", () => {
  if (tutorialStepIndex === TUTORIAL_STEPS.length - 1) endTutorial();
  else goToTutorialStep(tutorialStepIndex + 1);
});

// Escape ends the tour early, same as Skip — checked against
// tutorialStepIndex (not just "is the tooltip visible") so this never
// fires while some unrelated modal the tour didn't open is the one
// actually being dismissed with Escape.
document.addEventListener("keydown", (event) => {
  if (tutorialStepIndex === -1 || event.key !== "Escape") return;
  endTutorial();
});

// Keeps the tooltip pinned to its target if the window itself resizes
// mid-tour (the target's own position within the page is handled by
// the scrollIntoView + re-measure in renderTutorialStep already).
window.addEventListener("resize", () => {
  if (tutorialStepIndex === -1) return;
  const target = TUTORIAL_STEPS[tutorialStepIndex].target();
  if (target) positionTutorialTooltip(target);
});

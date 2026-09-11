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

// Settings > Bookie — which bookmakers actually participate in the
// comparison right now (bookies.js's BOOKIE_LIST stays the full,
// unfiltered set; background.js keeps scraping/tracking every one of
// them regardless, so re-enabling one here picks its odds straight back
// up with no fresh scan needed). Used everywhere BOOKIE_LIST previously
// drove an actual calculation or behaviour (Best Price, this note,
// opening a bookie's own race tab) — NOT for the odds table's own
// column rendering, which always builds every bookie's cell (so header/
// body/footer stay aligned) and instead hides the disabled ones via
// their own `hidden` attribute (see bookieCells/applyDisplaySettings).
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

// The highest price across every bookmaker compared for this runner, and
// which bookie(s) it came from (more than one if tied) — that price is
// what Edge%/Ret%/Lay $/Liability get computed against, so the table
// always reflects the best real opportunity available, not just whichever
// bookmaker happens to be listed first. The raw per-bookie price columns
// still show every bookmaker's own number alongside it (with the winning
// one(s) highlighted), so nothing about the comparison itself is hidden —
// this just picks what feeds the metric, and what the dedicated Best
// Price column displays.
function bestBookmakerPrices(runner) {
  let price = null;
  for (const bookie of visibleBookies()) {
    const p = runner.bookmakers?.[bookie.id];
    if (p != null && (price === null || p > price)) price = p;
  }
  if (price === null) return { price: null, bookieIds: [] };

  const bookieIds = visibleBookies()
    .filter((b) => runner.bookmakers?.[b.id] === price)
    .map((b) => b.id);
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
// retention), "run2nd" (qualifying bet + a bonus bet only if 2nd), or
// "run2nd3rd" (same, but 2nd or 3rd) — see promoEVPercent for the
// latter two. Determines both which formula the Lay $ and metric
// columns use, and what the metric column is even called (Edge/Ret%/
// EV%). Persists the same way as the other controls.
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

// Splits "N. Horse Name" into the coloured number badge (below) and the
// bare name text — the badge now carries the number, so it's no longer
// repeated in the name itself the way it always used to be. Runners
// without a leading "N." (shouldn't happen in real data, but mock/test
// data doesn't always bother) get no badge at all rather than a
// misleading one, and the full original string as their label.
function runnerNumberHtml(name) {
  const match = name.match(/^(\d+)\.\s*(.*)$/);
  if (!match) return { html: "", label: name };
  const number = Number(match[1]);
  const swatch = RUNNER_NUMBER_COLORS[(number - 1) % RUNNER_NUMBER_COLORS.length];
  const classes = ["runner-number", swatch.checkered && "runner-number-check", swatch.border && "runner-number-bordered"]
    .filter(Boolean)
    .join(" ");
  const style = swatch.checkered
    ? `color:${swatch.text}`
    : `background:${swatch.bg};color:${swatch.text}`;
  return {
    html: `<span class="${classes}" style="${style}">${number}</span>`,
    label: match[2],
  };
}

// Pr(trigger placing) for whichever promo mode is active — real Betfair
// place-market data only, no theoretical model. Depends on how many
// places the event's separate PLACE market actually pays
// (currentRace.placeMarketWinners — see background.js's own comment for
// the full breakdown):
//
//   placeMarketWinners === 2 ("Top 2 Finish"): placeBetfair gives real
//   Pr(2nd) directly — only two placings exist at all, so "placed but
//   didn't win" only ever means 2nd. Run 2nd 3rd has no 3rd-place
//   information at all in this case, so stays null.
//
//   placeMarketWinners === 3 ("Top 3 Finish"): placeBetfair gives real
//   Pr(2nd or 3rd) combined — exactly what Run 2nd 3rd needs. Run 2nd
//   can't isolate its own Pr(2nd) from that combined figure (there's no
//   real data telling you the 2nd:3rd split), so it stays null rather
//   than falling back to a theoretical estimate — a prior version used
//   Harville's model here (and as the no-place-market fallback below),
//   but real market data was user-verified to disagree with Harville's
//   estimate by roughly 2x for an actual runner in a small field, so
//   Harville was dropped entirely rather than trusted as a fallback.
//
//   Anything else (placeMarketWinners 4, or no place market at all —
//   placeBetfair null): both modes stay null (same "no reliable number
//   to show" convention as a missing bookmaker price).
function promoPlaceProb(runner) {
  const winners = currentRace?.placeMarketWinners;
  if (runner.placeBetfair == null) return null;

  if (currentMode === "run2nd3rd") {
    return winners === 3 ? 1 / runner.placeBetfair - 1 / runner.betfair : null;
  }

  // run2nd
  return winners === 2 ? 1 / runner.placeBetfair - 1 / runner.betfair : null;
}

// Mode-dispatching wrappers so the rest of the file doesn't need to know
// which formula is active — sorting, rendering, and the column header all
// go through these.
function metricPercent(runner, commission, hedge) {
  const price = bestBookmakerPrices(runner).price ?? 0;
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
  return currentMode === "bonus"
    ? bonusRetentionPercent(runner.betfair, price, commission, hedge)
    : edgePercent(runner.betfair, price, commission, hedge);
}

function rowLayDollars(runner, commission, hedge) {
  const price = bestBookmakerPrices(runner).price ?? 0;
  return currentMode === "bonus"
    ? layStakeBonus(stakeAmount, runner.betfair, price, commission, hedge)
    : layStake(stakeAmount, runner.betfair, price, commission, hedge);
}

function sortedRunners(race, commission, hedge) {
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
      const bMetric = metricPercent(b, commission, hedge);
      const aMetric = metricPercent(a, commission, hedge);
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
function priceCellInner(price, liquidity) {
  if (price == null) return `<span class="cell-price">—</span>`;
  return `<span class="cell-price">${price.toFixed(
    2
  )}</span><span class="cell-liquidity">${formatLiquidity(liquidity)}</span>`;
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
// to the current Mode — Run 2nd 3rd/Run 2nd share "promo" (one threshold
// set, not two) since neither has a verified EV formula yet to actually
// tell them apart by.
function edgeThresholdKey(mode) {
  if (mode === "bonus") return "bonus";
  if (mode === "run2nd3rd" || mode === "run2nd") return "promo";
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

// CLV ("closing line value") — user-requested alongside freezing
// Betfair's own back/lay price and liquidity at jump (background.js's own
// comment has the full reasoning): once frozen, runner.betfair no longer
// drifts once the race is in-play, so the exact same edgePercent formula
// Best Price's own Edge%/Ret% already uses against it — bestMetric,
// computed once above in renderRace — becomes a genuine "value vs the
// closing line" figure instead of a live-fluctuating one. Deliberately a
// second, parallel set of helpers (not a reuse of edgeMetricHtml/
// formatMetric) rather than just letting metricsSuspended stop blanking
// those: this is the one figure that's actually MORE meaningful once
// raceInPlay is true, the opposite of every other Edge%/Ret%/EV% cell
// metricsSuspended still correctly blanks (a suspended market's own
// bookmaker prices aren't tradeable any more, but the frozen closing
// price they're being compared against here is the whole point).
function clvMetricHtml(metric) {
  if (metric == null) return { className: "", styleAttr: "", bg: "transparent" };
  const color =
    edgeTierColor(metric, currentMode) ??
    currentSettings.edgeBelowThresholdColor ??
    DEFAULT_SETTINGS.edgeBelowThresholdColor;
  return { className: "edge-tier", styleAttr: ` style="color:${color}"`, bg: `rgba(${hexToRgb(color)}, 0.2)` };
}

// Same percent/dollar/off formatting as formatMetric, minus the
// metricsSuspended blank (see clvMetricHtml's own comment for why).
function formatClvMetric(metric) {
  if (currentSettings.metricDisplay === "off") return "";
  if (metric == null) return "—";
  if (currentSettings.metricDisplay === "dollar") {
    const dollars = stakeAmount * (metric / 100);
    return `${dollars >= 0 ? "+" : "-"}$${Math.abs(dollars).toFixed(2)}`;
  }
  return `${metric >= 0 ? "+" : ""}${metric.toFixed(1)}%`;
}

// CLV only ever has a real value once raceInPlay (renderRace passes null
// beforehand) — before that, Best Price's own Edge% cell is already
// showing this exact figure live, so a second copy would just be a
// redundant, always-identical column rather than an actually "closing"
// one.
function clvCellHtml(metric) {
  if (metric == null) return "—";
  const { className, styleAttr } = clvMetricHtml(metric);
  const metricText = formatClvMetric(metric);
  return metricText ? `<span class="clv-value ${className}"${styleAttr}>${metricText}</span>` : "—";
}

// What you'd owe if the lay bet loses (the backed selection wins) — the
// standard exchange lay-liability formula, stake × (odds - 1). Unlike
// Liquidity this is always computable from data already on the row (no
// "genuinely absent" case), since it's derived from our own Lay $, not
// scraped.
function liabilityFor(layDollars, betfairOdds) {
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

  // The CLV column's own <th> is static markup (popup.html), never
  // regenerated the way the table body/footer are further down — same
  // reasoning as the per-bookie <th data-bookie> toggle in
  // applyDisplaySettings, just driven by raceInPlay here instead of a
  // Settings toggle. Pops the whole column into view only once there's
  // actually something in it (user-reported wanting it hidden rather
  // than sitting there empty the rest of the time), in lockstep with
  // every col-clv <td> below being given the same `hidden` attribute.
  const clvHeaderEl = document.querySelector("th.col-clv");
  if (clvHeaderEl) clvHeaderEl.hidden = !raceInPlay;

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

  let rows = sortedRunners(race, commission, hedge).map((runner) => {
    const layDollars = rowLayDollars(runner, commission, hedge);
    const liability = liabilityFor(layDollars, runner.betfair);
    return { runner, layDollars, liability };
  });

  // Max liability filters displayed rows entirely (not just a visual
  // flag), per the Settings page's own description of the setting.
  if (currentSettings.maxLiability !== null) {
    rows = rows.filter((r) => r.liability <= currentSettings.maxLiability);
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

    const { price: bestPrice, bookieIds: bestBookieIds } = bestBookmakerPrices(runner);
    const bestPriceBadges = bestBookieIds
      .map((id) => {
        const bookie = BOOKIE_LIST.find((b) => b.id === id);
        return `<span class="bookie-badge" title="${bookie.label}"><img class="bookie-logo" src="${bookie.logo}" alt="${bookie.label}" /></span>`;
      })
      .join(" ");
    const bestMetric = metricPercent(runner, commission, hedge);
    // Every bookie's own cell is always generated here, even a disabled
    // one — hidden via its own `hidden` attribute instead of being left
    // out, so the header/body/footer column count never drifts apart
    // (see visibleBookies()'s own comment for the full split).
    const bookieCells = BOOKIE_LIST.map((b) => {
      const price = runner.bookmakers?.[b.id];
      const bookieMetric = bookieMetricPercent(runner, price, commission, hedge);
      const hiddenAttr = currentSettings.enabledBookies.includes(b.id) ? "" : " hidden";
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
    const { html: runnerNumberBadge, label: runnerLabel } = runnerNumberHtml(runner.name);

    // CLV only once the race has actually jumped (raceInPlay, set above)
    // — see clvCellHtml's own comment for why it's null, not bestMetric,
    // before that. The whole column stays hidden (clvHiddenAttr, same
    // `hidden` pattern the per-bookie columns already use for their own
    // Settings toggle) until then too — user-reported wanting it to only
    // "pop up" once there's actually something to show, rather than
    // sitting there as an empty "—" column the rest of the time.
    const clvMetric = raceInPlay ? bestPriceMetric : null;
    const clvBg = clvMetricHtml(clvMetric).bg;
    const clvBgAttr = clvBg !== "transparent" ? ` style="background:${clvBg}"` : "";
    const clvHiddenAttr = raceInPlay ? "" : " hidden";

    row.innerHTML = `
      <td>${runnerNumberBadge}${runnerLabel}${winnerTag}</td>
      <td class="col-best-price"${bestPriceBgAttr}>${bestPriceCellHtml(bestPrice, bestPriceBadges, bestPriceMetric)}</td>
      <td class="col-backlay">${backLayCellHtml(
        runner.betfairBack,
        runner.betfairBackLiquidity,
        runner.betfair,
        runner.betfairLiquidity
      )}</td>
      <td class="col-clv"${clvHiddenAttr}${clvBgAttr}>${clvCellHtml(clvMetric)}</td>
      ${bookieCells}
      <td class="lay-dollars" title="Click to copy">${layDollars.toFixed(2)}</td>
      <td class="col-liability">${liability.toFixed(2)}</td>
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
      <td class="col-clv"${raceInPlay ? "" : " hidden"}>—</td>
      ${BOOKIE_LIST.map(
        (b) => `<td${currentSettings.enabledBookies.includes(b.id) ? "" : " hidden"}>—</td>`
      ).join("")}
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
    `<td class="col-clv"${raceInPlay ? "" : " hidden"}></td>`,
    ...BOOKIE_LIST.map(
      (b) =>
        `<td${currentSettings.enabledBookies.includes(b.id) ? "" : " hidden"}>${formatMarketPct(
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
// Settings > Bookie disabled ones are skipped entirely here too (see
// visibleBookies()) — no tab opened/updated for one at all, same as if
// it had no URL for this race.
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
  const tabIdKeys = visibleBookies().map((b) => `${b.id}TabId`);
  const stored = await chrome.storage.local.get(["betfairTabId", ...tabIdKeys]);

  const betfairTabId = await openOrNavigateTab(stored.betfairTabId, race.betfairUrl, {
    pinned: currentSettings.pinRaceTabs,
    active: currentSettings.focusRaceTabsOnOpen,
  });

  const updates = { betfairTabId };
  for (const bookie of visibleBookies()) {
    const urlKey = `${bookie.id}Url`;
    const tabIdKey = `${bookie.id}TabId`;
    updates[tabIdKey] = race[urlKey]
      ? await openOrNavigateTab(stored[tabIdKey], race[urlKey], {
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

  return `
    <li class="race-card sport-${race.raceType}${selected}" data-market-id="${race.marketId}">
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
  document.body.classList.toggle("compact-rows", settings.compactRows);
  document.body.classList.toggle("hide-liquidity", !settings.showLiquidityColumn);
  document.body.classList.toggle("show-liability", settings.showLiabilityColumn);

  // Settings > Bookie — the header row's own <th data-bookie="..."> is
  // static markup (popup.html), never regenerated the way each render
  // rebuilds the table body/footer (see bookieCells' own comment for
  // those), so it's the one place that needs updating here rather than
  // inline at render time.
  for (const th of document.querySelectorAll("[data-bookie]")) {
    th.hidden = !settings.enabledBookies.includes(th.dataset.bookie);
  }

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

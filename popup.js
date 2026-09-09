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

// Run 2nd 3rd mode: EV of the qualifying bet plus a bonus bet awarded
// only if the runner finishes 2nd or 3rd (not 1st, not worse than
// 3rd). User-provided formula:
//   EV = Pr(win) × QL
//      + Pr(2nd or 3rd) × (bonusValue × retention% − QL)
//      + Pr(worse than 3rd) × QL
// QL ("qualifying loss") is the same dollar figure Mug Mode's own
// Edge% already represents on this stake — user-confirmed: "QL is
// just the edge in mug mode". bonusValue is the bonus bet's face
// value — user-confirmed: the same as this stake, not a separate
// fixed amount, matching how Bonus Mode already reuses the Stake
// field as its own bonus-bet size.
// Pr(win)/Pr(place) are both this runner's own implied probability
// (1/Lay price) on the WIN and PLACE markets respectively; Pr(place)
// only exists at all when the place market genuinely pays exactly 3
// places (see background.js's own numberOfWinners check — a smaller
// field's Top 2 Finish market would make Pr(place)-Pr(win) mean
// Pr(2nd only), not Pr(2nd or 3rd), silently wrong for exactly the
// races this promo cares about most). null placeBetfair (that check
// failed, or this runner isn't in the place market at all) returns
// null right back — same "no reliable number to show" convention
// bookieMetricPercent already uses for a missing bookmaker price.
// Expressed as a % of stake (like Edge%/Ret%), not a raw dollar
// figure, so it slots into the exact same column/threshold/sorting
// infrastructure those two already use.
function run2nd3rdEVPercent(betfair, placeBetfair, bookmaker, commission, hedge, stake, retention) {
  if (placeBetfair == null) return null;

  const qualifyingLoss = stake * (edgePercent(betfair, bookmaker, commission, hedge) / 100);
  const bonusValue = stake * (retention / 100);

  const prWin = 1 / betfair;
  const prPlace = 1 / placeBetfair;
  const pr2ndOr3rd = prPlace - prWin;
  const prWorse = 1 - prPlace;

  const ev =
    prWin * qualifyingLoss + pr2ndOr3rd * (bonusValue - qualifyingLoss) + prWorse * qualifyingLoss;

  return (ev / stake) * 100;
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

  const bookmakerPart = BOOKIE_LIST.map(
    (b) =>
      ` ${b.label}: ${
        race.bookmakerSources?.[b.id] === "live" ? "live." : "placeholder markup (not yet scanned)."
      }`
  ).join("");

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
  for (const bookie of BOOKIE_LIST) {
    const p = runner.bookmakers?.[bookie.id];
    if (p != null && (price === null || p > price)) price = p;
  }
  if (price === null) return { price: null, bookieIds: [] };

  const bookieIds = BOOKIE_LIST.filter((b) => runner.bookmakers?.[b.id] === price).map(
    (b) => b.id
  );
  return { price, bookieIds };
}

let currentRace = null;

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

// "mug" (standard Win back+lay), "bonus" (SNR free/bonus bet retention),
// or "run2nd3rd" (qualifying bet + a bonus bet only if 2nd/3rd — see
// run2nd3rdEVPercent). Determines both which formula the Lay $ and
// metric columns use, and what the metric column is even called (Edge/
// Ret%/EV%). Persists the same way as the other controls. "run2nd" isn't
// wired up yet — its own formula hasn't been provided/verified.
let currentMode = "mug";

// Which race types show up in the Upcoming Races list — "horse", "harness",
// "greyhound". All on by default (unfiltered, matching pre-filter
// behavior). Persists the same way as the other controls; filtering
// happens client-side against the last-fetched list (see latestRaces)
// rather than re-querying background.js, so toggling is instant.
let selectedRaceTypes = new Set(["horse", "harness", "greyhound"]);
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

// Mode-dispatching wrappers so the rest of the file doesn't need to know
// which formula is active — sorting, rendering, and the column header all
// go through these.
function metricPercent(runner, commission, hedge) {
  const price = bestBookmakerPrices(runner).price ?? 0;
  if (currentMode === "run2nd3rd") {
    return run2nd3rdEVPercent(
      runner.betfair,
      runner.placeBetfair,
      price,
      commission,
      hedge,
      stakeAmount,
      currentSettings.defaultRetention
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
  if (currentMode === "run2nd3rd") {
    return run2nd3rdEVPercent(
      runner.betfair,
      runner.placeBetfair,
      price,
      commission,
      hedge,
      stakeAmount,
      currentSettings.defaultRetention
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
    // metricPercent can be null now (Run 2nd 3rd mode, no reliable
    // place-market data for this runner — see run2nd3rdEVPercent) —
    // previously always a real number for every runner, so this sort
    // never needed a null case before. Sorts to the bottom, same "no
    // reliable number to show" treatment as everywhere else this can
    // happen.
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
function edgeMetricHtml(metric) {
  if (metric == null) return { className: "", styleAttr: "" };
  const color =
    edgeTierColor(metric, currentMode) ??
    currentSettings.edgeBelowThresholdColor ??
    DEFAULT_SETTINGS.edgeBelowThresholdColor;
  return { className: "edge-tier", styleAttr: ` style="color:${color}"` };
}

// A bookmaker's own price cell: the price on top, that bookie's own Edge%/
// Ret% (bookieMetricPercent, against this specific price rather than
// always the best one) stacked beneath it — replaces the old dedicated
// Edge column, same stacked-cell treatment as Back/Lay's liquidity.
function bookieCellHtml(price, metric) {
  if (price == null) return "—";
  const { className, styleAttr } = edgeMetricHtml(metric);
  const metricText = metric == null ? "—" : `${metric >= 0 ? "+" : ""}${metric.toFixed(1)}%`;
  return `<span class="stacked-cell"><span class="cell-price">${price.toFixed(
    2
  )}</span><span class="cell-sub ${className}"${styleAttr}>${metricText}</span></span>`;
}

// The Best Price cell: price + Edge%/Ret% (metricPercent — the same
// formula, against this same best price) stacked on the left, colour-coded
// by its EV tier (or plain green/red-by-sign, below every tier), with the
// winning bookie's badge(s) vertically centered on the right — a wider
// "card row" layout rather than the plain stacked-cell treatment every
// other column uses, since this is the headline column.
function bestPriceCellHtml(price, badgesHtml, metric) {
  if (price == null) return "—";
  const { className, styleAttr } = edgeMetricHtml(metric);
  const metricText = metric == null ? "—" : `${metric >= 0 ? "+" : ""}${metric.toFixed(1)}%`;
  return `<span class="best-price-cell"><span class="best-price-text"><span class="best-price-value ${className}"${styleAttr}>${price.toFixed(
    2
  )}</span><span class="best-price-edge ${className}"${styleAttr}>${metricText}</span></span><span class="best-price-badges">${badgesHtml}</span></span>`;
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

// The race-info bar's "Jumps at HH:MM" — local time, 24-hour, no seconds.
// Deliberately not toLocaleTimeString() (which can insert AM/PM depending
// on the user's locale) — the reference bar this matches always shows
// plain 24-hour digits.
function formatJumpTime(startTimeIso) {
  if (!startTimeIso) return "—";
  const d = new Date(startTimeIso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function renderRace(race) {
  currentRace = race;
  if (race.marketId) selectedMarketId = race.marketId;

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

  document
    .getElementById("race-live-dot")
    .classList.toggle("live", race.source === "live-betfair");

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

  for (const { runner, layDollars, liability } of rows) {
    const row = document.createElement("tr");
    if (runner.result === "WINNER") row.className = "winner-row";

    const { price: bestPrice, bookieIds: bestBookieIds } = bestBookmakerPrices(runner);
    const bestPriceBadges = bestBookieIds
      .map((id) => {
        const bookie = BOOKIE_LIST.find((b) => b.id === id);
        return `<span class="bookie-badge">${bookie.label}</span>`;
      })
      .join(" ");
    const bestMetric = metricPercent(runner, commission, hedge);
    const bookieCells = BOOKIE_LIST.map((b) => {
      const price = runner.bookmakers?.[b.id];
      const bestClass = bestBookieIds.includes(b.id) ? " best-price" : "";
      const bookieMetric = bookieMetricPercent(runner, price, commission, hedge);
      return `<td class="col-bookie${bestClass}">${bookieCellHtml(price, bookieMetric)}</td>`;
    }).join("");

    // Betfair settling the market and marking a runner WINNER (see
    // refreshRaceInner/applyBetfairOdds, background.js) is what drives
    // this — shown right on that runner's own row (a separate banner
    // above the table used to duplicate this, removed per request as
    // redundant once this tag existed).
    const winnerTag =
      runner.result === "WINNER" ? ' <em class="winner-tag">&#127942; Winner</em>' : "";

    row.innerHTML = `
      <td>${runner.name}${winnerTag}</td>
      <td class="col-best-price">${bestPriceCellHtml(bestPrice, bestPriceBadges, bestPrice != null ? bestMetric : null)}</td>
      <td class="col-backlay">${backLayCellHtml(
        runner.betfairBack,
        runner.betfairBackLiquidity,
        runner.betfair,
        runner.betfairLiquidity
      )}</td>
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
      ${BOOKIE_LIST.map(() => "<td>—</td>").join("")}
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
        `<td>${formatMarketPct(marketPercentFor(race.runners, (r) => r.bookmakers?.[b.id]))}</td>`
    ),
    "<td></td>",
    `<td class="col-liability"></td>`,
  ];
  document.getElementById("odds-foot").innerHTML = `<tr>${marketCells.join("")}</tr>`;

  const countdownMainEl = document.getElementById("race-countdown-main");
  countdownMainEl.dataset.start = race.startTime || "";
  countdownMainEl.dataset.bookieMarketClosed = race.bookieMarketClosed ? "true" : "";
  countdownMainEl.dataset.hasWinner = race.winner ? "true" : "";

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

const modeSelect = document.getElementById("mode-select");

modeSelect.addEventListener("change", () => {
  currentMode = modeSelect.value;
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
      if (
        cached &&
        (cached.bookieMarketClosed !== race.bookieMarketClosed ||
          cached.marketStatus !== race.marketStatus ||
          cached.winner !== race.winner)
      ) {
        cached.bookieMarketClosed = race.bookieMarketClosed;
        cached.marketStatus = race.marketStatus;
        cached.winner = race.winner;
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
// Focus behavior is Settings-driven (Tab and Window management >
// focusRaceTabsOnOpen): by default every race tab opens/reuses in the
// background and this extension tab's own focus is explicitly re-asserted
// afterward (the prior, unconditional behavior); with the setting on, the
// Betfair tab becomes active instead and this tab's focus is left alone,
// so the race tabs actually end up frontmost as the setting implies — just
// skipping the refocus step wouldn't have been enough on its own, since
// new tabs are still created inactive either way.
async function openRaceTabs(race) {
  const tabIdKeys = BOOKIE_LIST.map((b) => `${b.id}TabId`);
  const stored = await chrome.storage.local.get(["betfairTabId", ...tabIdKeys]);

  const betfairTabId = await openOrNavigateTab(stored.betfairTabId, race.betfairUrl, {
    pinned: currentSettings.pinRaceTabs,
    active: currentSettings.focusRaceTabsOnOpen,
  });

  const updates = { betfairTabId };
  for (const bookie of BOOKIE_LIST) {
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

  const time = new Date(race.startTime).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const timeHtml = currentSettings.showCountdowns
    ? `<span class="race-countdown" data-start="${race.startTime}" data-bookie-market-closed="${
        race.bookieMarketClosed ? "true" : ""
      }" data-has-winner="${race.winner ? "true" : ""}"></span>`
    : "";

  return `
    <li class="race-card sport-${race.raceType}${selected}" data-market-id="${race.marketId}">
      <span class="race-sport-badge">${code}</span>
      <span class="race-card-body">
        <span class="race-card-title-row">
          <span class="race-live-dot"></span>
          <span class="race-card-title">R${race.raceNumber} ${race.track}</span>
        </span>
        <span class="race-card-sub">${time}${
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
// applyBookieOdds) is the actual "gone in-play" trigger — not Betfair's
// own status. User-reported/explicit direction: Betfair itself commonly
// stays tradeable well past the real jump, so it was never a reliable
// signal for this; the bookmaker actually closing its own market is. The
// displayed clock itself is untouched by this — still just Betfair's own
// scheduled startTime counting down, then on into negative, same as
// always; only what triggers the switch to "IN PLAY" changed.
// Exported as its own check (not just inlined in formatCountdown) so
// the race-info bar's "in" prefix (only makes sense before a duration,
// not in front of the word "IN PLAY") can key off the exact same rule
// instead of a second copy of it drifting out of sync.
// "true" (string), not a boolean, for both params below — every real
// caller sources these from DOM dataset attributes (renderRace/
// raceCardHtml both write race.bookieMarketClosed/race.winner through
// a `? "true" : ""` ternary), and dataset values are always strings.
function isPastJumpTime(startTimeIso) {
  return new Date(startTimeIso).getTime() - Date.now() <= 0;
}

// Whether the countdown is currently showing a status word ("IN PLAY"/
// "RESULTED") rather than a duration — exported as its own check (not
// just inlined in formatCountdown) so the race-info bar's "in" prefix
// (only makes sense before a duration) can key off the exact same rule
// instead of a second copy of it drifting out of sync.
function isShowingStatusWord(startTimeIso, bookieMarketClosed, hasWinner) {
  return isPastJumpTime(startTimeIso) && (hasWinner === "true" || bookieMarketClosed === "true");
}

function formatCountdown(startTimeIso, bookieMarketClosed, hasWinner) {
  const diffMs = new Date(startTimeIso).getTime() - Date.now();
  if (diffMs > 0) return formatDuration(Math.floor(diffMs / 1000));
  // RESULTED takes priority over IN PLAY — a winner being known means
  // the race is definitely done, regardless of what bookieMarketClosed
  // (which only tracks betting having closed, not the actual result)
  // says by this point.
  if (hasWinner === "true") return "RESULTED";
  if (isPastJumpTime(startTimeIso) && bookieMarketClosed === "true") return "IN PLAY";
  return `-${formatDuration(Math.floor(-diffMs / 1000))}`;
}

// Ticks every second, independent of whenever the races list was last
// rendered — just re-reads whatever ".race-countdown" elements currently
// exist in the DOM, so it naturally keeps working across re-renders
// without needing its own cleanup/restart logic.
function tickCountdowns() {
  for (const el of document.querySelectorAll(".race-countdown")) {
    el.textContent = formatCountdown(el.dataset.start, el.dataset.bookieMarketClosed, el.dataset.hasWinner);
  }

  const countdownMainEl = document.getElementById("race-countdown-main");
  countdownMainEl.textContent = countdownMainEl.dataset.start
    ? formatCountdown(
        countdownMainEl.dataset.start,
        countdownMainEl.dataset.bookieMarketClosed,
        countdownMainEl.dataset.hasWinner
      )
    : "";
  // "Jumps at HH:MM · in -1m 02s" reads fine; "Jumps at HH:MM · in IN
  // PLAY"/"in RESULTED" doesn't — hide the "in" the same moment the
  // countdown itself switches to a status word.
  document.getElementById("race-countdown-prefix").hidden = Boolean(
    countdownMainEl.dataset.start &&
      isShowingStatusWord(
        countdownMainEl.dataset.start,
        countdownMainEl.dataset.bookieMarketClosed,
        countdownMainEl.dataset.hasWinner
      )
  );
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
    selectedRaceTypes.has(race.raceType) && (query === "" || race.track.toLowerCase().includes(query));

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

// Light mode's own legible defaults for the two colours nothing else
// overrides at the :root level (popup.css's own [data-theme="light"]
// block handles every other variable) — --accent is set inline below
// instead, since an untouched accentColor needs to resolve differently
// per theme and a plain CSS override can't win against an inline style.
const THEME_DEFAULT_ACCENT = { dark: "#3ddc97", light: "#1f9d68" };

const themeToggleBtn = document.getElementById("theme-toggle-btn");

// Just the toggle button's own icon/title + the data-theme attribute
// popup.css's light-mode block keys off — split out from
// applyDisplaySettings so the button reacts the instant it's clicked,
// without waiting on a settings round-trip first.
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (theme === "light") {
    themeToggleBtn.textContent = "\u{1F319}"; // 🌙 — click to go dark
    themeToggleBtn.title = "Switch to dark mode";
  } else {
    themeToggleBtn.textContent = "\u{2600}\u{FE0F}"; // ☀️ — click to go light
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

  currentMode = settings.defaultMode;
  sortMode = settings.defaultSort;
  hedgePercent = settings.defaultHedge;
  stakeAmount = settings.defaultStake;
  selectedRaceTypes = new Set(settings.defaultRaceTypes);

  modeSelect.value = currentMode;
  hedgeInput.value = hedgePercent;
  stakeInput.value = stakeAmount;
  sortToggleBtn.textContent = sortMode === "number" ? "Sort: Number" : "Sort: Edge";
  for (const btn of document.querySelectorAll(".race-type-btn")) {
    btn.classList.toggle("active", selectedRaceTypes.has(btn.dataset.raceType));
  }
});

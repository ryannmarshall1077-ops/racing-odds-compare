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

function noteFor(race) {
  const systemNotePart = race.systemNote ? `${race.systemNote} ` : "";

  const betfairPart =
    race.source === "live-betfair"
      ? `Betfair: live${
          race.fetchedAt ? ` (updated ${new Date(race.fetchedAt).toLocaleTimeString()})` : ""
        }.`
      : "Showing mock data — live odds not yet connected.";

  if (race.source !== "live-betfair") return systemNotePart + betfairPart;

  const bookmakerPart =
    race.bookmakerSource === "live-sportsbet"
      ? " Bookmaker: live (Sportsbet)."
      : " Bookmaker: placeholder markup (not yet scanned).";

  return systemNotePart + betfairPart + bookmakerPart;
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

// "mug" (standard Win back+lay) or "bonus" (SNR free/bonus bet retention).
// Determines both which formula the Lay $ and metric columns use, and
// what the metric column is even called (Edge vs Ret%). Persists the same
// way as the other controls. "run2nd3rd"/"run2nd" aren't wired up yet —
// their formulas haven't been verified.
let currentMode = "mug";

// Which race types show up in the Upcoming Races list — "horse", "harness",
// "greyhound". All on by default (unfiltered, matching pre-filter
// behavior). Persists the same way as the other controls; filtering
// happens client-side against the last-fetched list (see latestRaces)
// rather than re-querying background.js, so toggling is instant.
let selectedRaceTypes = new Set(["horse", "harness", "greyhound"]);
let latestRaces = [];

// Populated once loadSettings() resolves (see the bottom of this file) —
// starts at DEFAULT_SETTINGS so anything reading it before then (tab
// opening, countdown rendering) still gets sane values rather than
// undefined. Unlike the per-session controls above (sortMode, stakeAmount,
// etc. — which the Settings page's Default* fields only seed the INITIAL
// value of), currentSettings is read live by openRaceTabs/renderRacesList
// on every use, since pin/focus/countdown-visibility are meant to apply
// consistently for the whole session, not just at startup.
let currentSettings = DEFAULT_SETTINGS;

document.getElementById("settings-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function parseRunnerNumber(name) {
  const match = name.match(/^(\d+)\./);
  return match ? Number(match[1]) : Infinity;
}

// Mode-dispatching wrappers so the rest of the file doesn't need to know
// which formula is active — sorting, rendering, and the column header all
// go through these.
function metricPercent(runner, commission, hedge) {
  return currentMode === "bonus"
    ? bonusRetentionPercent(runner.betfair, runner.bookmaker, commission, hedge)
    : edgePercent(runner.betfair, runner.bookmaker, commission, hedge);
}

function rowLayDollars(runner, commission, hedge) {
  return currentMode === "bonus"
    ? layStakeBonus(stakeAmount, runner.betfair, runner.bookmaker, commission, hedge)
    : layStake(stakeAmount, runner.betfair, runner.bookmaker, commission, hedge);
}

function sortedRunners(race, commission, hedge) {
  const runners = [...race.runners];

  if (sortMode === "edge") {
    runners.sort(
      (a, b) => metricPercent(b, commission, hedge) - metricPercent(a, commission, hedge)
    );
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

function renderRace(race) {
  currentRace = race;

  document.getElementById("race-subtitle").textContent =
    `${race.sportLabel || "Horse Racing"} — ${race.race}`;

  document.getElementById("metric-header").textContent =
    currentMode === "bonus" ? "Ret%" : "Edge";

  const tbody = document.getElementById("odds-body");
  tbody.innerHTML = "";

  const commission = commissionForTrack(race.track, race.sport);
  const hedge = hedgePercent / 100;

  for (const runner of sortedRunners(race, commission, hedge)) {
    const metric = metricPercent(runner, commission, hedge);
    const layDollars = rowLayDollars(runner, commission, hedge);
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${runner.name}</td>
      <td>${runner.bookmaker.toFixed(2)}</td>
      <td>${runner.betfair.toFixed(2)}</td>
      <td>${formatLiquidity(runner.betfairLiquidity)}</td>
      <td class="lay-dollars" title="Click to copy">${layDollars.toFixed(2)}</td>
      <td class="${metric >= 0 ? "edge-positive" : "edge-negative"}">
        ${metric >= 0 ? "+" : ""}${metric.toFixed(1)}%
      </td>
    `;

    tbody.appendChild(row);
  }

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

function mergeBookmakerOdds(race, bookmakerRunners) {
  let matched = 0;
  const runners = race.runners.map((runner) => {
    const price = findBookmakerPrice(runner.name, bookmakerRunners);
    if (price !== undefined) {
      matched++;
      return { ...runner, bookmaker: price };
    }
    return runner;
  });

  return {
    race: {
      ...race,
      runners,
      bookmakerSource: matched > 0 ? "live-sportsbet" : race.bookmakerSource,
    },
    matched,
  };
}

const refreshBtn = document.getElementById("refresh-btn");
const scanBtn = document.getElementById("scan-btn");
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

scanBtn.addEventListener("click", async () => {
  scanBtn.disabled = true;
  scanBtn.textContent = "Scanning...";

  try {
    if (!currentRace) {
      throw new Error("Click 'Refresh live odds' first to load a race.");
    }

    // Prefer the tab this race's Sportsbet link opened/reused, so scanning
    // works without needing that tab focused first — falls back to any
    // open Sportsbet tab if no race has been selected via Upcoming Races
    // yet, or if the tracked tab has gone stale (closed, or Chrome
    // restarted and reassigned tab ids — those don't survive a restart).
    // Deliberately NOT "the active tab": this extension is itself a full
    // tab (not a popup), so clicking this button from it would otherwise
    // make the fallback try to scrape the extension's own page.
    const { sportsbetTabId } = await chrome.storage.local.get(["sportsbetTabId"]);
    let response = sportsbetTabId
      ? await chrome.runtime.sendMessage({ type: "SCRAPE_BOOKMAKER", tabId: sportsbetTabId })
      : null;

    if (!response || (!response.ok && response.error.includes("no longer open"))) {
      const [tab] = await chrome.tabs.query({ url: "*://*.sportsbet.com.au/*" });
      if (!tab) {
        throw new Error("No Sportsbet tab found — click a race in Upcoming Races to open one.");
      }
      response = await chrome.runtime.sendMessage({ type: "SCRAPE_BOOKMAKER", tabId: tab.id });
    }

    if (!response.ok) throw new Error(response.error);

    const { race, matched } = mergeBookmakerOdds(currentRace, response.odds.runners);
    renderRace(race);

    if (matched === 0) {
      noteEl.textContent = "Scanned Sportsbet tab, but no runner names matched the current race.";
    }
  } catch (err) {
    noteEl.textContent = err.message;
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = "Scan Sportsbet tab for odds";
  }
});

// Reflects auto-refresh (background.js's alarm) while the popup happens to
// be open, instead of only updating on the next manual click.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.liveRace) {
    renderRace(changes.liveRace.newValue);
  }
});

chrome.storage.local.get(["liveRace"], (stored) => {
  renderRace(stored.liveRace || MOCK_RACE);
});

const racesListEl = document.getElementById("races-list");
const racesRefreshBtn = document.getElementById("races-refresh-btn");

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

// The Betfair/Sportsbet tab ids are tracked in storage (not a plain
// variable) since the popup's JS state is thrown away every time it closes,
// but the tabs it opened live on. Reusing the same two tabs — navigating
// them in place — instead of closing and recreating avoids the flicker of
// old tabs disappearing and new ones appearing.
//
// Focus behavior is Settings-driven (Tab and Window management >
// focusRaceTabsOnOpen): by default the race tabs open/reuse in the
// background and this extension tab's own focus is explicitly re-asserted
// afterward (its prior behavior, unconditionally); with the setting on,
// the Betfair tab becomes active instead and this tab's focus is left
// alone, so the race tabs actually end up frontmost as the setting implies
// — just skipping the refocus step wouldn't have been enough on its own,
// since new tabs are still created inactive either way.
async function openRaceTabs(race) {
  const stored = await chrome.storage.local.get(["betfairTabId", "sportsbetTabId"]);

  const betfairTabId = await openOrNavigateTab(stored.betfairTabId, race.betfairUrl, {
    pinned: currentSettings.pinRaceTabs,
    active: currentSettings.focusRaceTabsOnOpen,
  });
  const sportsbetTabId = race.sportsbetUrl
    ? await openOrNavigateTab(stored.sportsbetTabId, race.sportsbetUrl, {
        pinned: currentSettings.pinRaceTabs,
      })
    : stored.sportsbetTabId;

  await chrome.storage.local.set({ betfairTabId, sportsbetTabId });

  if (!currentSettings.focusRaceTabsOnOpen) {
    const ownTab = await chrome.tabs.getCurrent();
    if (ownTab) {
      await chrome.tabs.update(ownTab.id, { active: true });
    }
  }
}

// Now that the list mixes horse, harness and greyhound races, a track name
// and time alone don't always make the sport obvious at a glance (e.g. a
// venue that hosts more than one on different days) — a small emoji prefix
// is enough to disambiguate without needing a text label or extra styling.
function raceTypeEmoji(raceType) {
  if (raceType === "greyhound") return "🐕";
  if (raceType === "harness") return "🏇";
  return "🐎";
}

function renderRacesList(races) {
  racesListEl.innerHTML = "";

  if (races.length === 0) {
    racesListEl.innerHTML = '<li class="races-status">No upcoming races found.</li>';
    return;
  }

  for (const race of races) {
    const li = document.createElement("li");
    li.className = "race-row";

    const time = new Date(race.startTime).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

    li.innerHTML = `
      <span class="race-track">${raceTypeEmoji(race.raceType)} ${race.track} R${race.raceNumber}</span>
      <span>
        <span class="race-time">${time}</span>${
      currentSettings.showCountdowns
        ? `<span class="race-countdown" data-start="${race.startTime}"></span>`
        : ""
    }${race.sportsbetUrl ? "" : '<span class="race-warn" title="No matching Sportsbet race found">!</span>'}
      </span>
    `;

    li.addEventListener("click", () => {
      openRaceTabs(race);
      loadRaceIntoTable(race.marketId);
    });

    racesListEl.appendChild(li);
  }
}

function formatCountdown(startTimeIso) {
  const diffMs = new Date(startTimeIso).getTime() - Date.now();
  if (diffMs <= 0) return "Jumped";

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

// Ticks every second, independent of whenever the races list was last
// rendered — just re-reads whatever ".race-countdown" elements currently
// exist in the DOM, so it naturally keeps working across re-renders
// without needing its own cleanup/restart logic.
function tickCountdowns() {
  for (const el of document.querySelectorAll(".race-countdown")) {
    el.textContent = formatCountdown(el.dataset.start);
  }
}
tickCountdowns();
setInterval(tickCountdowns, 1000);

function loadUpcomingRaces() {
  racesListEl.innerHTML = '<li class="races-status">Loading...</li>';
  racesRefreshBtn.disabled = true;

  chrome.runtime.sendMessage({ type: "LIST_UPCOMING_RACES" }, (response) => {
    racesRefreshBtn.disabled = false;

    if (!response || !response.ok) {
      racesListEl.innerHTML = `<li class="races-status">${
        response ? response.error : "No response from background worker."
      }</li>`;
      return;
    }

    latestRaces = response.races;
    renderFilteredRacesList();
  });
}

// Applies the Race Types toggle bar to the last-fetched list without
// re-querying background.js — instant, and doesn't burn an extra Betfair
// call just to hide/show rows the extension already has.
function renderFilteredRacesList() {
  renderRacesList(latestRaces.filter((race) => selectedRaceTypes.has(race.raceType)));
}

racesRefreshBtn.addEventListener("click", loadUpcomingRaces);
loadUpcomingRaces();

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
  currentSettings = settings;

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

  document.documentElement.style.setProperty("--accent", settings.accentColor);
  document.body.classList.toggle("compact-rows", settings.compactRows);

  if (currentRace) renderRace(currentRace);
  if (latestRaces.length > 0) renderFilteredRacesList();
});

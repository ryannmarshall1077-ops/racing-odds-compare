function edgePercent(betfair, bookmaker) {
  return ((bookmaker - betfair) / betfair) * 100;
}

function normalizeName(name) {
  return name.replace(/^\d+\.\s*/, "").trim().toLowerCase();
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

function renderRace(race) {
  currentRace = race;

  document.getElementById("race-subtitle").textContent =
    `Horse Racing — ${race.race}`;

  const tbody = document.getElementById("odds-body");
  tbody.innerHTML = "";

  for (const runner of race.runners) {
    const edge = edgePercent(runner.betfair, runner.bookmaker);
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${runner.name}</td>
      <td>${runner.betfair.toFixed(2)}</td>
      <td>${runner.bookmaker.toFixed(2)}</td>
      <td class="${edge >= 0 ? "edge-positive" : "edge-negative"}">
        ${edge >= 0 ? "+" : ""}${edge.toFixed(1)}%
      </td>
    `;

    tbody.appendChild(row);
  }

  document.getElementById("data-source-note").textContent = noteFor(race);
}

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
    // works without needing that tab focused first — falls back to the
    // active tab if no race has been selected via Upcoming Races yet, or if
    // the tracked tab has gone stale (closed, or Chrome restarted and
    // reassigned tab ids — those don't survive a browser restart).
    const { sportsbetTabId } = await chrome.storage.local.get(["sportsbetTabId"]);
    let response = sportsbetTabId
      ? await chrome.runtime.sendMessage({ type: "SCRAPE_BOOKMAKER", tabId: sportsbetTabId })
      : null;

    if (!response || (!response.ok && response.error.includes("no longer open"))) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error("No active tab found.");
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
// opens a fresh (background — not stealing focus) tab if it doesn't. Either
// way returns the tab id to remember for next time.
async function openOrNavigateTab(tabId, url) {
  if (tabId) {
    try {
      await chrome.tabs.update(tabId, { url });
      return tabId;
    } catch {
      // Closed by the user since we last used it — fall through to creating
      // a new one below.
    }
  }

  const tab = await chrome.tabs.create({ url, active: false });
  return tab.id;
}

// The Betfair/Sportsbet tab ids are tracked in storage (not a plain
// variable) since the popup's JS state is thrown away every time it closes,
// but the tabs it opened live on. Reusing the same two tabs — navigating
// them in place — instead of closing and recreating avoids the flicker of
// old tabs disappearing and new ones appearing, and creating any new tab
// `active: false` stops it from stealing focus away from this extension
// tab. As a final safety net, this tab's own focus is explicitly
// re-asserted afterward.
async function openRaceTabs(race) {
  const stored = await chrome.storage.local.get(["betfairTabId", "sportsbetTabId"]);

  const betfairTabId = await openOrNavigateTab(stored.betfairTabId, race.betfairUrl);
  const sportsbetTabId = race.sportsbetUrl
    ? await openOrNavigateTab(stored.sportsbetTabId, race.sportsbetUrl)
    : stored.sportsbetTabId;

  await chrome.storage.local.set({ betfairTabId, sportsbetTabId });

  const ownTab = await chrome.tabs.getCurrent();
  if (ownTab) {
    await chrome.tabs.update(ownTab.id, { active: true });
  }
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
      <span class="race-track">${race.track} R${race.raceNumber}</span>
      <span>
        <span class="race-time">${time}</span>${
      race.sportsbetUrl ? "" : '<span class="race-warn" title="No matching Sportsbet race found">!</span>'
    }
      </span>
    `;

    li.addEventListener("click", () => {
      openRaceTabs(race);
      loadRaceIntoTable(race.marketId);
    });

    racesListEl.appendChild(li);
  }
}

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

    renderRacesList(response.races);
  });
}

racesRefreshBtn.addEventListener("click", loadUpcomingRaces);
loadUpcomingRaces();

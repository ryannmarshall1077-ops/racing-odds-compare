function edgePercent(betfair, bookmaker) {
  return ((bookmaker - betfair) / betfair) * 100;
}

function normalizeName(name) {
  return name.replace(/^\d+\.\s*/, "").trim().toLowerCase();
}

let currentRace = null;

function renderRace(race, { live } = {}) {
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

  document.getElementById("data-source-note").textContent = live
    ? "Betfair: live. Bookmaker: placeholder markup (not yet a real source)."
    : "Showing mock data — live odds not yet connected.";
}

function mergeBookmakerOdds(race, bookmakerRunners) {
  const bookmakerByName = new Map(
    bookmakerRunners.map((r) => [normalizeName(r.name), r.price])
  );

  let matched = 0;
  const runners = race.runners.map((runner) => {
    const price = bookmakerByName.get(normalizeName(runner.name));
    if (price !== undefined) {
      matched++;
      return { ...runner, bookmaker: price };
    }
    return runner;
  });

  return { race: { ...race, runners }, matched };
}

const refreshBtn = document.getElementById("refresh-btn");
const scanBtn = document.getElementById("scan-btn");
const noteEl = document.getElementById("data-source-note");

refreshBtn.addEventListener("click", () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";

  chrome.runtime.sendMessage({ type: "REFRESH_RACE" }, (response) => {
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

    renderRace(response.race, { live: true });
  });
});

scanBtn.addEventListener("click", async () => {
  scanBtn.disabled = true;
  scanBtn.textContent = "Scanning...";

  try {
    if (!currentRace) {
      throw new Error("Click 'Refresh live odds' first to load a race.");
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab found.");

    const response = await chrome.runtime.sendMessage({
      type: "SCRAPE_BOOKMAKER",
      tabId: tab.id,
    });

    if (!response.ok) throw new Error(response.error);

    const { race, matched } = mergeBookmakerOdds(currentRace, response.odds.runners);
    renderRace(race, { live: true });

    noteEl.textContent =
      matched > 0
        ? `Betfair: live. Bookmaker: live (Sportsbet, ${matched} runner${matched === 1 ? "" : "s"} matched).`
        : "Scanned Sportsbet tab, but no runner names matched the current race.";
  } catch (err) {
    noteEl.textContent = err.message;
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = "Scan Sportsbet tab for odds";
  }
});

chrome.storage.local.get(["liveRace"], (stored) => {
  if (stored.liveRace) {
    renderRace(stored.liveRace, { live: true });
  } else {
    renderRace(MOCK_RACE, { live: false });
  }
});

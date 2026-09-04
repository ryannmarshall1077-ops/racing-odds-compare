function edgePercent(betfair, bookmaker) {
  return ((bookmaker - betfair) / betfair) * 100;
}

function renderRace(race, { live } = {}) {
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

const refreshBtn = document.getElementById("refresh-btn");

refreshBtn.addEventListener("click", () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";

  chrome.runtime.sendMessage({ type: "REFRESH_RACE" }, (response) => {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh live odds";

    if (!response) {
      document.getElementById("data-source-note").textContent =
        "No response from background worker.";
      return;
    }

    if (!response.ok) {
      document.getElementById("data-source-note").textContent = response.error;
      return;
    }

    renderRace(response.race, { live: true });
  });
});

chrome.storage.local.get(["liveRace"], (stored) => {
  if (stored.liveRace) {
    renderRace(stored.liveRace, { live: true });
  } else {
    renderRace(MOCK_RACE, { live: false });
  }
});

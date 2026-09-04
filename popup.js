function edgePercent(betfair, bookmaker) {
  return ((bookmaker - betfair) / betfair) * 100;
}

function renderRace(race) {
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
}

renderRace(MOCK_RACE);

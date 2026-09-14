// Injected on demand via chrome.scripting.executeScript against the tracked
// Sportsbet tab, as part of background.js's scrapeBookmakerTab() — called
// once per auto-refresh cycle (chrome.alarms, ~60s) to keep the bookmaker
// column current between sportsbetWatcher.js's own live DOM-driven pushes.
// Targets Sportsbet's stable data-automation-id attributes rather than its
// auto-generated CSS class names, which change across deploys.
//
// Scoped to [data-automation-id="racecard-frame"] and paired by DOM
// containment rather than parallel-array index — same fix, same reasoning,
// as sportsbetWatcher.js's own scrapeRunners() (see its comments for the
// full story: an unscoped/index-paired query picks up a "Watchdog Tips"
// widget's duplicate name elements on any race, and a RESULTED race's
// "Final Results" placings panel on top of that, both reusing this exact
// "racecard-outcome-name" attribute). This one-shot scraper runs against
// whatever the tracked tab currently shows, live or already resulted (it
// has no marketClosed concept of its own — every call just reads the page
// as-is), so it needs the same robustness sportsbetWatcher.js needed for a
// race opened straight onto its resulted state.
(() => {
  function findAncestorPriceContainerId(el) {
    let cur = el;
    while (cur) {
      const id = cur.getAttribute && cur.getAttribute("data-automation-id");
      if (id && id.startsWith("racecard-outcome-") && id.endsWith("-price")) return id;
      cur = cur.parentElement;
    }
    return null;
  }

  function findAncestorRowId(el) {
    let cur = el;
    while (cur) {
      const id = cur.getAttribute && cur.getAttribute("data-automation-id");
      if (id && /^racecard-outcome-\d+$/.test(id)) return id;
      cur = cur.parentElement;
    }
    return null;
  }

  const priceEls = document.querySelectorAll(
    '[data-automation-id="racecard-frame"] [data-automation-id^="outcome-"][data-automation-id$="-odds-button-text"]'
  );

  // The race card shows both Win and Place price columns, and both kinds of
  // button share the exact same data-automation-id (keyed by runner only —
  // it doesn't distinguish which market). Each is wrapped in a container
  // carrying "racecard-outcome-<marketIndex>-L-price" though, and Win is
  // always the first/leftmost column, so whichever container the very
  // first price element belongs to is the Win column — keep only that one.
  const winContainerId = priceEls.length > 0 ? findAncestorPriceContainerId(priceEls[0]) : null;
  const winPriceEls = winContainerId
    ? [...priceEls].filter((el) => findAncestorPriceContainerId(el) === winContainerId)
    : [...priceEls];

  const runners = [];
  for (const priceEl of winPriceEls) {
    const rowId = findAncestorRowId(priceEl);
    const row = rowId ? priceEl.closest(`[data-automation-id="${rowId}"]`) : null;
    const nameEl = row?.querySelector('[data-automation-id="racecard-outcome-name"]');
    const name = nameEl?.textContent.trim();
    const price = parseFloat(priceEl.textContent.trim());
    if (name && !Number.isNaN(price)) {
      runners.push({ name, price });
    }
  }

  return { runners, scrapedAt: Date.now(), url: location.href };
})();

// Injected on demand via chrome.scripting.executeScript against the
// tracked PointsBet tab, as part of background.js's scrapeBookieTab() —
// called once per auto-refresh cycle to keep the PointsBet column
// current between pointsbetWatcher.js's own live DOM-driven pushes.
//
// Selectors verified against real live PointsBet race pages — see
// pointsbetWatcher.js's own comment for the full story on both the
// stable data-test="racingRunners<N>OutcomeRunnerWinOddsButton" hook and
// why the runner's own name is read from the start of its row's
// flattened text instead of a hashed CSS class.
(() => {
  const winButtons = document.querySelectorAll(
    '[data-test^="racingRunners"][data-test$="OutcomeRunnerWinOddsButton"]'
  );
  const runners = [];

  for (const btn of winButtons) {
    const row = btn.closest("li");
    const rowText = row?.textContent || "";
    const nameMatch = rowText.match(/^\s*\d+\.\s*(.+?)\s*\(/);
    const name = nameMatch ? nameMatch[1].trim() : null;
    const price = parseFloat(btn.textContent.trim());

    if (name && !Number.isNaN(price)) {
      runners.push({ name, price });
    }
  }

  return { runners, scrapedAt: Date.now(), url: location.href };
})();

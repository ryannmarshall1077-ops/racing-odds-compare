// Injected on demand via chrome.scripting.executeScript against the
// tracked OKEbet tab, as part of background.js's scrapeBookieTab() —
// called once per auto-refresh cycle to keep the OKEbet column current
// between okebetWatcher.js's own live DOM-driven pushes.
//
// Selectors verified against real live OKEbet race pages — see
// okebetWatcher.js's own comment for the full story on the
// "gs-runner-name-label" anchor and why the row itself is found by
// walking up to the nearest 2-button ancestor rather than any
// position- or utility-class-based selector.
(() => {
  const runners = [];

  for (const label of document.querySelectorAll(".gs-runner-name-label")) {
    let row = null;
    let cur = label;
    for (let i = 0; i < 12 && cur; i++) {
      if (cur.querySelectorAll("button").length === 2) {
        row = cur;
        break;
      }
      cur = cur.parentElement;
    }
    if (!row) continue;

    const name = label.textContent.trim().replace(/\(\d+\)$/, "").trim();
    const winButton = row.querySelectorAll("button")[0];
    const price = parseFloat(winButton?.querySelector("span")?.textContent.trim());

    if (name && !Number.isNaN(price)) runners.push({ name, price });
  }

  return { runners, scrapedAt: Date.now(), url: location.href };
})();

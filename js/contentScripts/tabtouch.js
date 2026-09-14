// Injected on demand via chrome.scripting.executeScript against the
// tracked TABtouch tab, as part of background.js's scrapeBookieTab() —
// called once per auto-refresh cycle to keep the TABtouch column
// current between tabtouchWatcher.js's own live DOM-driven pushes.
//
// Selectors verified against real live TABtouch race pages — see
// tabtouchWatcher.js's own comment for the full story on the "View:
// Field" switch, the td.acceptor/.dividend classes, and the favourite
// runner's own "Favourite2.75"-shaped price text.
(() => {
  function ensureFieldView() {
    const titleEl = document.querySelector(".faux-select.viewmode p.title");
    if (!titleEl || /Field/i.test(titleEl.textContent)) return;
    const dropdown = document.querySelector(".faux-select.viewmode a");
    dropdown?.click();
    const fieldOption = [...document.querySelectorAll(".faux-select.viewmode li, .faux-select.viewmode a")].find(
      (o) => o.textContent.trim() === "Field"
    );
    fieldOption?.click();
  }
  ensureFieldView();

  const nameCells = document.querySelectorAll("td.acceptor");
  const runners = [];

  for (const nameCell of nameCells) {
    const row = nameCell.closest("tr");
    if (/scratched/i.test(row?.textContent || "")) continue;

    const name = nameCell.textContent.trim();
    const priceEl = row?.querySelector(".fixed.win .dividend");
    const numberMatch = priceEl?.textContent.match(/\d+\.?\d*/);
    const price = numberMatch ? parseFloat(numberMatch[0]) : NaN;

    if (name && !Number.isNaN(price)) {
      runners.push({ name, price });
    }
  }

  return { runners, scrapedAt: Date.now(), url: location.href };
})();

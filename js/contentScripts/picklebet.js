// Injected on demand via chrome.scripting.executeScript against the
// tracked Picklebet tab, as part of background.js's scrapeBookieTab() —
// called once per auto-refresh cycle to keep the Picklebet column
// current between picklebetWatcher.js's own live DOM-driven pushes.
//
// Selectors verified against real live Picklebet race pages — see
// picklebetWatcher.js's own comment for the full story on the CSS-module
// class structure and why the Win price is found by its own label text
// rather than a fixed column position.
(() => {
  const rows = [...document.querySelectorAll('[class*="Competitor-module--competitor--"]')];
  const runners = [];

  for (const row of rows) {
    if (/scratched/i.test(row.textContent)) continue;

    const name = row.querySelector('[class*="Competitor-module--nameAndNumber--"]')?.textContent.trim();
    if (!name) continue;

    const winOutcome = [...row.querySelectorAll('[class*="Outcome-module--outcome--"]')].find(
      (o) => o.querySelector('[class*="Outcome-module--label--"]')?.textContent.trim() === "Win"
    );
    const priceText = winOutcome?.querySelector('[class*="Outcome-module--odds--"]')?.textContent.trim();
    const price = parseFloat(priceText);

    if (!Number.isNaN(price)) runners.push({ name, price });
  }

  return { runners, scrapedAt: Date.now(), url: location.href };
})();

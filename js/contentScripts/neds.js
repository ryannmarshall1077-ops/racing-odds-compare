// Injected on demand via chrome.scripting.executeScript against the
// tracked Neds tab, as part of background.js's scrapeBookieTab() —
// called once per auto-refresh cycle to keep the Neds column current
// between nedsWatcher.js's own live DOM-driven pushes.
//
// Selectors verified against real live Neds race pages — identical to
// ladbrokes.js's own (see its comment for the full story, including the
// favourite-runner "FAV" badge quirk): confirmed live that Neds runs on
// the exact same underlying platform as Ladbrokes, same data-testid
// attributes throughout.
(() => {
  const rows = document.querySelectorAll('[data-testid="runner-row"]');
  const runners = [];

  for (const row of rows) {
    const nameEl = row.querySelector('[data-testid="runner-name"]');
    const priceEl = row
      .querySelectorAll('[data-testid="price-button"]')[0]
      ?.querySelector('[data-testid="price-button-racing"]');

    const name = nameEl?.textContent.trim();
    const price = parseFloat(priceEl?.textContent.trim());

    if (name && !Number.isNaN(price)) {
      runners.push({ name, price });
    }
  }

  return { runners, scrapedAt: Date.now(), url: location.href };
})();

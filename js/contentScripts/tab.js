// Injected on demand via chrome.scripting.executeScript against the
// tracked TAB tab, as part of background.js's scrapeBookieTab() — called
// once per auto-refresh cycle to keep the TAB column current between
// tabWatcher.js's own live DOM-driven pushes.
//
// TAB's actual race data comes through session-obfuscated internal
// endpoints (randomized paths like /mMGa17/3nWsi/..., which looks like
// deliberate anti-scraping protection) — not something safe to depend on,
// unlike Sportsbet's genuinely public NextEvents API. So this reads the
// rendered page instead. Selectors verified against a real live TAB race
// page: runner rows carry a stable data-testid="runner-number-N", and the
// Fixed Odds Win price cell carries data-test-fixed-odds-win-price —
// Angular's own template-authored attributes survive their build process,
// unlike auto-generated class names.
(() => {
  const rows = document.querySelectorAll('[data-testid^="runner-number-"]');
  const runners = [];

  for (const row of rows) {
    if (row.classList.contains("scratched")) continue;

    const nameEl = row.querySelector(".runner-name");
    const priceCell = row.querySelector("[data-test-fixed-odds-win-price]");
    const priceEl = priceCell?.querySelector(".animate-odd");

    const name = nameEl?.textContent.trim();
    const price = parseFloat(priceEl?.textContent.trim());

    if (name && !Number.isNaN(price)) {
      runners.push({ name, price });
    }
  }

  return { runners, scrapedAt: Date.now(), url: location.href };
})();

// Injected on demand via chrome.scripting.executeScript against the
// tracked Ladbrokes tab, as part of background.js's scrapeBookieTab() —
// called once per auto-refresh cycle to keep the Ladbrokes column current
// between ladbrokesWatcher.js's own live DOM-driven pushes. Only ever
// actually runs once ladbrokesTabId is set, which (v1) only happens if
// popup.js's openRaceTabs opens one — it doesn't yet, since there's no
// ladbrokesUrl to open (see ladbrokesWatcher.js) — so this is currently
// unreachable in practice, kept here ready for when that changes rather
// than left unbuilt.
//
// Selectors verified against real live Ladbrokes race pages — runner
// rows carry data-testid="runner-row", the runner name
// data-testid="runner-name", and the Fixed Win price is the first of
// several same-named data-testid="price-button" elements per row (Fixed
// Win, Fixed Place, Starting Price, Mid Tote Win, sometimes Best Tote/
// SP, always in that order — no per-column testid to key off instead).
// The price text itself comes from the NESTED data-testid=
// "price-button-racing" element, not the outer price-button's own
// textContent — user-reported/live-confirmed the favourite runner's
// price was missing entirely: its price-button also holds a "FAV"
// badge <div> as a sibling of the actual price <button>, so the outer
// element's textContent reads "FAV2.90" (parseFloat of that is NaN)
// while every non-favourite runner's plain price text parsed fine.
// price-button-racing is the inner element holding only the number,
// on every runner, favourite or not (see ladbrokesWatcher.js's own
// copy of this same fix for the full story).
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

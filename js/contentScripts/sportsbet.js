// Injected on demand via chrome.scripting.executeScript against the active
// Sportsbet racing tab (see background.js's SCRAPE_BOOKMAKER handler).
// Targets Sportsbet's stable data-automation-id attributes rather than its
// auto-generated CSS class names, which change across deploys.
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

  const nameEls = document.querySelectorAll('[data-automation-id="racecard-outcome-name"]');
  const priceEls = document.querySelectorAll(
    '[data-automation-id^="outcome-"][data-automation-id$="-odds-button-text"]'
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
  const count = Math.min(nameEls.length, winPriceEls.length);

  for (let i = 0; i < count; i++) {
    const name = nameEls[i].textContent.trim();
    const price = parseFloat(winPriceEls[i].textContent.trim());
    if (name && !Number.isNaN(price)) {
      runners.push({ name, price });
    }
  }

  return { runners, scrapedAt: Date.now(), url: location.href };
})();

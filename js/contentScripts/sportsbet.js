// Injected on demand via chrome.scripting.executeScript against the active
// Sportsbet racing tab (see background.js's SCRAPE_BOOKMAKER handler).
// Targets Sportsbet's stable data-automation-id attributes rather than its
// auto-generated CSS class names, which change across deploys.
(() => {
  const nameEls = document.querySelectorAll('[data-automation-id="racecard-outcome-name"]');
  const priceEls = document.querySelectorAll(
    '[data-automation-id^="outcome-"][data-automation-id$="-odds-button-text"]'
  );

  const runners = [];
  const count = Math.min(nameEls.length, priceEls.length);

  for (let i = 0; i < count; i++) {
    const name = nameEls[i].textContent.trim();
    const price = parseFloat(priceEls[i].textContent.trim());
    if (name && !Number.isNaN(price)) {
      runners.push({ name, price });
    }
  }

  return { runners, scrapedAt: Date.now(), url: location.href };
})();

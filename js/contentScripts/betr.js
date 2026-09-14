// Injected on demand via chrome.scripting.executeScript against the
// tracked Betr tab, as part of background.js's scrapeBookieTab() —
// called once per auto-refresh cycle to keep the Betr column current
// between betrWatcher.js's own live DOM-driven pushes.
//
// Selectors verified against real live Betr race pages — see
// betrWatcher.js's own comment for the full story on the shared
// `.MuiCard-root`/name-span structure and why the price is found by
// scanning for a bare-number leaf rather than a single fixed selector
// (a live runner's price is a <button>, a resulted one's is a plain
// <div>).
(() => {
  const cards = [...document.querySelectorAll(".MuiCard-root")].filter((c) =>
    c.querySelector('div[style*="font-weight: 600"] > span')
  );
  const runners = [];

  for (const card of cards) {
    if (/deduction applied|scratched/i.test(card.textContent)) continue;

    const nameDiv = card.querySelector('div[style*="font-weight: 600"]');
    const nameSpans = nameDiv.querySelectorAll(":scope > span");
    const name = nameSpans[1]?.textContent.trim();

    const priceEls = [...card.querySelectorAll("button, div")].filter((el) => {
      if (nameDiv.contains(el)) return false;
      if (el.children.length > 0) return false;
      if (!/^\d+(\.\d+)?$/.test(el.textContent.trim())) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const price = parseFloat(priceEls[0]?.textContent);

    if (name && !Number.isNaN(price)) {
      runners.push({ name, price });
    }
  }

  return { runners, scrapedAt: Date.now(), url: location.href };
})();

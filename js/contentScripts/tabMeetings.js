// Persistent content script (declared in manifest.json), auto-injected on
// TAB's "Today's Racing" meetings pages (tab.com.au/racing/meetings/...).
// Learns the venue-name -> TAB's own 3-letter venue code mapping by
// reading the real race links already on the page.
//
// TAB has no public race-list API like Sportsbet's NextEvents (its actual
// data requests go through obfuscated, session-rotated paths — see
// tab.js's comment), so this is the only practical way to build direct
// TAB race URLs without hand-typing a lookup table for every AU track.
// Grows the mapping over time from whatever meetings pages the user
// actually visits; reports each batch to background.js to merge into the
// persisted table (chrome.storage.local's tabVenueCodes).
(() => {
  const RACE_TYPE_TO_SPORT = { R: "horse", G: "greyhound", H: "harness" };

  function scrapeVenueCodes() {
    const links = document.querySelectorAll('a[href*="/racing/"]');
    const entries = [];

    for (const link of links) {
      // e.g. https://www.tab.com.au/racing/2026-09-07/PERTH-UK/PHK/R/2
      const match = link.href.match(
        /\/racing\/\d{4}-\d{2}-\d{2}\/([A-Z0-9-]+)\/([A-Z0-9]{2,4})\/([RGH])\/\d+$/
      );
      if (!match) continue;

      const [, slug, code, raceTypeLetter] = match;
      const sport = RACE_TYPE_TO_SPORT[raceTypeLetter];
      if (!sport) continue;

      // The link's own text is closer to the real venue name than the URL
      // slug (e.g. "Perth Uk" vs "PERTH-UK") — strip the trailing
      // " (COUNTRY) - R<n><countdown>" (TAB's markup has no separator
      // before the countdown text, so it's concatenated straight onto the
      // race number). A venue whose link text doesn't match this shape
      // just doesn't get learned this pass — harmless, tried again next
      // time a meetings page is open.
      const rawText = link.textContent.replace(/\s+/g, " ").trim();
      const venueName = rawText.replace(/\s*\([A-Z]+\)\s*-\s*R\d+.*$/, "").trim();
      if (!venueName || venueName === rawText) continue;

      entries.push({ venueName, sport, slug, code });
    }

    return entries;
  }

  function reportVenueCodes() {
    const entries = scrapeVenueCodes();
    if (entries.length === 0) return;

    try {
      chrome.runtime.sendMessage({ type: "TAB_VENUE_CODES_LEARNED", entries });
    } catch {
      // Extension context invalidated — next mutation/load will retry.
    }
  }

  // A plain debounce (no MAX_WAIT_MS ceiling like the odds watchers use)
  // is enough here — this only needs to run once the meetings grid has
  // finished rendering, not track every subsequent tick of a live page.
  let debounceTimer = null;
  function scheduleReport() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(reportVenueCodes, 300);
  }

  new MutationObserver(scheduleReport).observe(document.body, {
    childList: true,
    subtree: true,
  });

  scheduleReport();
})();

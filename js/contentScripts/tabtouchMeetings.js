// Persistent content script (declared in manifest.json), auto-injected
// on TABtouch's "All Racing" hub page (tabtouch.com.au/racing/all).
// Learns the venue-name -> TABtouch's own venue code mapping by reading
// the real race links already on the page — same idea as
// tabMeetings.js's own approach for tab.com.au (a completely separate
// site/company: TABtouch is WA's own RWWA-run TAB, tab.com.au is
// Tabcorp's).
//
// TABtouch has no public race-list API found either (same starting
// point tab.com.au had), but its own "All Racing" hub is genuinely
// simpler to learn from than tab.com.au's meetings pages: ONE page
// already lists every meeting across every sport (horse/harness/
// greyhound) and country for today, each with a real <a href> straight
// to that meeting (confirmed live) — no separate page per sport needed
// the way tabRaceUrlFromCodes/visitTabMeetingsPage requires for
// tab.com.au. And unlike tab.com.au's own URLs (which encode a
// separate R/H/G race-type letter), TABtouch's own race URL is just
// /racing/<date>/<code>/<raceNumber> — the code alone is enough, no
// type segment to build at all.
(() => {
  // Confirmed live: each meeting row's own sport is a sibling <span>
  // carrying one of exactly 3 classes — race-type is the fixed part of
  // the class name, the varying part ("horse-black"/"trots-black"/
  // "dogs-black") is what actually distinguishes them.
  const RACE_TYPE_CLASS_TO_SPORT = { "horse-black": "horse", "trots-black": "harness", "dogs-black": "greyhound" };

  function scrapeVenueCodes() {
    const rows = document.querySelectorAll("#race-hub-races tbody tr");
    const entries = [];

    for (const row of rows) {
      // Each row has two <a class="meeting"> to the same meeting (a
      // short code + the full venue name, confirmed live) — the code is
      // in the href itself (/racing/<date>/<code>), the venue name is
      // this second link's own text (e.g. "Angle Park", "Bursa - TUR" —
      // kept as-is including a " - <COUNTRY>" suffix some overseas
      // meetings have; namesMatch's own whole-word-prefix rule already
      // handles a Betfair venue name being a prefix of this).
      const meetingLinks = row.querySelectorAll('a.meeting[href^="/racing/"]');
      if (meetingLinks.length < 2) continue;

      const hrefMatch = meetingLinks[0].getAttribute("href")?.match(/^\/racing\/\d{4}-\d{2}-\d{2}\/([a-z0-9]+)$/i);
      if (!hrefMatch) continue;
      const code = hrefMatch[1];
      const venueName = meetingLinks[1].textContent.trim();
      if (!venueName) continue;

      const raceTypeSpan = row.querySelector(".image-matrix.race-type");
      const raceTypeClass = [...(raceTypeSpan?.classList || [])].find((c) => RACE_TYPE_CLASS_TO_SPORT[c]);
      const sport = raceTypeClass ? RACE_TYPE_CLASS_TO_SPORT[raceTypeClass] : null;
      if (!sport) continue;

      entries.push({ venueName, sport, code });
    }

    return entries;
  }

  function reportVenueCodes() {
    const entries = scrapeVenueCodes();
    if (entries.length === 0) return;

    try {
      chrome.runtime.sendMessage({ type: "TABTOUCH_VENUE_CODES_LEARNED", entries });
    } catch {
      // Extension context invalidated — next mutation/load will retry.
    }
  }

  // Same plain-debounce reasoning as tabMeetings.js's own — this only
  // needs to run once the race-hub table has actually rendered, not
  // track every subsequent tick of a live page.
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

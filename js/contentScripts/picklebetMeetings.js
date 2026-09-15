// Picklebet has no public feed found (same starting point tab.com.au/
// TABtouch each started from) — venue/race ids are instead learned from
// real links on Picklebet's own pages. Genuinely two levels deep, unlike
// TAB/TABtouch's own single-hub-page learning: Picklebet's race URLs are
// pure opaque UUID pairs (meetingId + raceId, no cosmetic slug or
// derivable number-based path at all), and the "Today" list page only
// ever links to a MEETING (one UUID) — the second, per-race UUID only
// ever appears once you're actually on that meeting's own page. So this
// one script runs in two different modes depending on which of those two
// pages it's actually on (matched against both in manifest.json), rather
// than being two separate files the way tabtouchMeetings.js's single mode
// already is.
(() => {
  // Mode 1: the "Today" list page (/en-au/racing/betting/today/) — every
  // meeting for today, grouped under a sport heading ("Thoroughbred
  // Racing"/"Greyhound Racing"/"Harness Racing", confirmed live all
  // three exist as plain leaf text nodes). Meeting links and headings
  // aren't nested inside each other in any way that'd make "which
  // heading owns this link" a simple ancestor check — confirmed live —
  // so this walks every heading/link in real DOCUMENT ORDER instead and
  // just tracks whichever heading was most recently seen, same idea as
  // reading the page top-to-bottom by eye.
  const SPORT_FROM_HEADING = {
    "Thoroughbred Racing": "horse",
    "Greyhound Racing": "greyhound",
    "Harness Racing": "harness",
  };

  function docOrderCompare(a, b) {
    const rel = a.compareDocumentPosition(b);
    if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (rel & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  }

  function scrapeTodayMeetings() {
    const headingEls = [...document.querySelectorAll("h1,h2,h3,h4,div,span")].filter(
      (el) => SPORT_FROM_HEADING[el.textContent.trim()] && el.children.length === 0
    );
    const linkEls = [...document.querySelectorAll('a[href*="/betting/meeting/"]')];
    const nodes = [
      ...headingEls.map((el) => ({ kind: "heading", el })),
      ...linkEls.map((el) => ({ kind: "link", el })),
    ].sort((x, y) => docOrderCompare(x.el, y.el));

    const entries = [];
    let sport = null;
    for (const node of nodes) {
      if (node.kind === "heading") {
        sport = SPORT_FROM_HEADING[node.el.textContent.trim()];
        continue;
      }
      if (!sport) continue; // a meeting link seen before any heading — shouldn't happen, skip rather than guess

      const meetingId = node.el.getAttribute("href").match(/\/betting\/meeting\/([^/]+)/)?.[1];
      // Venue name sits as a trailing text node directly inside the same
      // element as the raceNumber ("R1") badge (confirmed live —
      // header.textContent is the concatenation "R1Wellington", not two
      // separate elements) — stripping the badge's own text out of that
      // concatenation is what's left.
      const header = node.el.querySelector('[class*="Row-module--header--"]');
      const raceNumberEl = header?.querySelector('[class*="Row-module--raceNumber--"]');
      const venueName = header && raceNumberEl ? header.textContent.replace(raceNumberEl.textContent, "").trim() : null;

      if (meetingId && venueName) entries.push({ venueName, sport, meetingId });
    }
    return entries;
  }

  // Mode 2: a specific meeting's own page
  // (/en-au/racing/betting/meeting/<meetingId>/) — every race in that
  // meeting already has a real <a href="/betting/race/<meetingId>/
  // <raceId>/..."> link right there in the page's own initial markup
  // (confirmed live), no need to click through each race number's own
  // tab first. meetingId is read back out of the URL itself (rather
  // than assumed from location.pathname, since a redirect could in
  // theory change it) so the caller can match this message against the
  // exact meeting it asked to learn.
  function scrapeMeetingRaces() {
    const raceLinks = [...document.querySelectorAll('a[href*="/betting/race/"]')];
    const races = [];
    for (const link of raceLinks) {
      const match = link.getAttribute("href").match(/\/betting\/race\/([^/]+)\/([^/]+)/);
      if (!match) continue;
      const [, meetingId, raceId] = match;
      const numberMatch = link.textContent.trim().match(/^R(\d+)/);
      if (!numberMatch) continue;
      races.push({ meetingId, raceId, number: Number(numberMatch[1]) });
    }
    return races;
  }

  function sendUpdate() {
    if (location.pathname.includes("/betting/meeting/")) {
      const races = scrapeMeetingRaces();
      if (races.length === 0) return;
      const meetingId = races[0].meetingId;
      try {
        chrome.runtime.sendMessage({
          type: "PICKLEBET_RACE_IDS_LEARNED",
          meetingId,
          races: races.map((r) => ({ number: r.number, raceId: r.raceId })),
        });
      } catch {
        // Extension context invalidated — nothing to do about this one.
      }
      return;
    }

    const entries = scrapeTodayMeetings();
    if (entries.length === 0) return;
    try {
      chrome.runtime.sendMessage({ type: "PICKLEBET_VENUE_CODES_LEARNED", entries });
    } catch {
      // Extension context invalidated — nothing to do about this one.
    }
  }

  // A single snapshot shortly after load is enough for either mode —
  // unlike a live odds watcher, this is static list/link data that
  // doesn't change once the page's own initial client-side render has
  // settled (confirmed live: both pages' relevant links are present
  // within a second or two of navigation, well before any prices start
  // moving). Retried a few times rather than just once, in case this
  // script's own document_idle injection still beat the SPA's first
  // client-side render by a beat.
  let attempts = 0;
  const RETRY_MS = 1000;
  const MAX_ATTEMPTS = 6;
  function attempt() {
    sendUpdate();
    attempts++;
    if (attempts < MAX_ATTEMPTS) setTimeout(attempt, RETRY_MS);
  }
  attempt();
})();

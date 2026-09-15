// Persistent content script (declared in manifest.json), auto-injected
// on Bet777's own /racing/* pages only — learns the
// (venue, sport, raceNumber) -> {venueId, raceId, meetingDate} mapping
// by reading the real race links already on the page, same "learn from
// real links, no public feed" idea tabMeetings.js/tabtouchMeetings.js/
// picklebetMeetings.js already use for TAB/TABtouch/Picklebet.
//
// Confirmed live that every BetCloud tenant (Bet777, BetGalaxy,
// BetProfessor, ChromaBet, GoldenBet888, JuicyBet, JungleBet, QuestBet,
// TitanBet, WellBet, EpicOdds) shares the exact same venueId/raceId for
// the same real race — so this only ever needs to run on ONE tenant's
// own pages (Bet777, picked arbitrarily as the "reference" the same
// way BetDeluxe became the Amused family's own reference) rather than
// on all 11 — background.js reuses whatever this learns to build every
// OTHER tenant's own URL too (just swapping the domain — see
// buildBetcloudRaceUrl, background.js).
//
// Runs on every /racing/* page, not just a single dedicated hub page
// (unlike tabtouchMeetings.js's own "All Racing" page) — Bet777's own
// "Next To Jump" listing (/racing/Next%20To%20Jump, what "/racing"
// itself redirects to) already carries ~99 upcoming race links in one
// visit, and a single race's own page still carries several "next to
// race" links alongside it — so this opportunistically learns from
// whichever one the tab (background-opened or the user's own) happens
// to be on, rather than depending on a single fixed page shape.
//
// Known limitation, same as tab.com.au/TABtouch/Picklebet's own "no
// public feed" bookies: this is a genuinely ROLLING "next" list, not a
// full day's schedule — a race well outside the current "next ~99"
// window (across every sport/country BetCloud lists) won't be learned
// until it gets closer to its own jump time. Acceptable for the same
// reason it already is for TAB et al: a once-daily background visit
// plus an on-demand visit the moment a race is actually clicked
// (ensureBetcloudUrlForRace, background.js) covers the common case.
(() => {
  function scrapeRaceCodes() {
    const entries = [];

    for (const a of document.querySelectorAll('a[href*="raceId="]')) {
      const href = a.getAttribute("href");
      if (!href) continue;

      // e.g. "/racing/Greyhounds/Bulli/R9?venueId=...&raceId=...&meetingDate=2026-09-15"
      const pathMatch = href.match(/^\/racing\/([^/?]+)\/([^/?]+)\/R(\d+)/);
      if (!pathMatch) continue;

      let params;
      try {
        params = new URL(href, location.origin).searchParams;
      } catch {
        continue;
      }
      const venueId = params.get("venueId");
      const raceId = params.get("raceId");
      const meetingDate = params.get("meetingDate");
      if (!venueId || !raceId || !meetingDate) continue;

      entries.push({
        sportSegment: decodeURIComponent(pathMatch[1]),
        venueSegment: decodeURIComponent(pathMatch[2]),
        raceNumber: Number(pathMatch[3]),
        venueId,
        raceId,
        meetingDate,
      });
    }

    return entries;
  }

  function reportRaceCodes() {
    const entries = scrapeRaceCodes();
    if (entries.length === 0) return;

    try {
      chrome.runtime.sendMessage({ type: "BETCLOUD_RACE_CODES_LEARNED", entries });
    } catch {
      // Extension context invalidated — next mutation/load will retry.
    }
  }

  // Same plain-debounce reasoning as tabMeetings.js/tabtouchMeetings.js's
  // own — this only needs to run once the page's own race links have
  // actually rendered, not track every subsequent tick of a live page.
  let debounceTimer = null;
  function scheduleReport() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(reportRaceCodes, 300);
  }

  new MutationObserver(scheduleReport).observe(document.body, {
    childList: true,
    subtree: true,
  });

  scheduleReport();
})();

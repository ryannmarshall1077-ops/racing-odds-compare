// Config + pure URL-builder for the "BetCloud" white-label platform
// family (Bet777, BetGalaxy, BetProfessor, ChromaBet, GoldenBet888,
// JuicyBet, JungleBet, QuestBet, TitanBet, WellBet, EpicOdds).
//
// Unlike every other <bookie>/api.js in this codebase, there's no fetch
// function here at all — BetCloud's real API
// (api.<tenant>.com.au/punter/...) sends a proprietary "x-bc-attn"
// attestation header on every request (discovered live while hooking
// XMLHttpRequest to find the real endpoint) that looks like a bot-
// detection/fraud-prevention signature. Reverse-engineering or
// replicating that token to call the API directly would be exactly the
// kind of anti-automation bypass this project deliberately avoids
// (same line drawn during the bet365 investigation) — so both the race
// LISTING and the live per-race PRICES are DOM-scraped instead (see
// js/contentScripts/betcloudMeetings.js and betcloudWatcher.js/
// betcloud.js), and this file only builds a URL from codes those
// content scripts already learned from a real page. The "learn codes
// from a page, then build a URL from them" chrome.storage/chrome.tabs
// logic itself lives directly in background.js instead (matching how
// TAB/TABtouch/Picklebet's own equivalent "no public feed" logic is
// already organized there, not split into a separate api.js).
//
// Confirmed live that every tenant shares the exact same venueId/raceId
// for the same real race (e.g. the same Albion Park R7 raceId resolves
// identically on Bet777 and BetGalaxy) but NOT the same price — each
// tenant's own Win price genuinely differs slightly, confirmed live —
// so this is architecturally like the BetMaker platform (js/betmaker/
// api.js), not the fully-identical-pricing Amused/Black Stream platform
// (js/amused/api.js).
const BETCLOUD_TENANTS = {
  bet777: { label: "Bet777", pageDomain: "bet777.com.au" },
  betgalaxy: { label: "BetGalaxy", pageDomain: "betgalaxy.com.au" },
  betprofessor: { label: "BetProfessor", pageDomain: "betprofessor.com.au" },
  chromabet: { label: "ChromaBet", pageDomain: "chromabet.com.au" },
  goldenbet888: { label: "GoldenBet888", pageDomain: "goldenbet888.com.au" },
  juicybet: { label: "JuicyBet", pageDomain: "juicybet.com.au" },
  junglebet: { label: "JungleBet", pageDomain: "junglebet.com.au" },
  questbet: { label: "QuestBet", pageDomain: "questbet.com.au" },
  titanbet: { label: "TitanBet", pageDomain: "titanbet.com.au" },
  wellbet: { label: "WellBet", pageDomain: "wellbet.com.au" },
  epicodds: { label: "EpicOdds", pageDomain: "epicodds.com.au" },
};

// betcloudRaceCodes is background.js's own learned-codes table (see
// learnBetcloudRaceCodes there) — keyed by (venue, sport, raceNumber)
// rather than just (venue, sport) like tabRaceUrlFromCodes/
// tabtouchRaceUrlFromCodes: BetCloud hands back a real raceId per race
// number directly (no separate per-race page visit needed the way
// Picklebet's own two-level lookup requires), so there's no reason not
// to key by the exact race being looked up. sportSegment/venueSegment
// are BetCloud's own real URL-segment text (exact casing/spacing, e.g.
// "Harness Racing", "Albion Park") carried through verbatim from
// whatever real link betcloudMeetings.js scraped them from.
function betcloudRaceUrlFromCodes(betcloudRaceCodes, tenantConfig, track, sport, raceNumber) {
  const key = `${normalizeVenue(track)}|${sport}|${raceNumber}`;
  const learned = betcloudRaceCodes[key];
  if (!learned) return null;

  return `https://${tenantConfig.pageDomain}/racing/${encodeURIComponent(
    learned.sportSegment
  )}/${encodeURIComponent(learned.venueSegment)}/R${raceNumber}?venueId=${learned.venueId}&raceId=${learned.raceId}&meetingDate=${learned.meetingDate}`;
}

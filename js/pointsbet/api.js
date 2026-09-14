// PointsBet's own public racing REST API — no auth required. Discovered
// by hooking window.fetch/XMLHttpRequest.prototype.open before loading a
// real racing page and watching what it actually called (confirmed live:
// the exact same URL, no session/cookies, returns identical data logged
// out). A single GET with no query params returns every meeting for
// today across every country/racing type — much simpler than Sportsbet's
// own NextEvents feed or Ladbrokes'/Neds' persisted-query GraphQL, and
// with no query-param/hash fragility to worry about at all.
const POINTSBET_MEETINGS_URL = "https://api.au.pointsbet.com/api/racing/v3/meetings";

// PointsBet's own numeric racingType, confirmed live against real
// meetings (Hamilton/Tamworth/Corowa = 1, Newcastle harness = 2,
// Ballarat/Shepparton/... AU greyhounds and Monmore Bags GBR = 4) —
// mapped straight to this codebase's own sport.id convention so
// nedsMatch-style matching against Betfair's own raceType can use a
// plain === check, same as ladbrokesEvents/nedsEvents' own `type`
// field already does. 3 (and anything else) is left unmapped — never
// observed, and an unknown type simply can't match any race rather than
// guessing.
const POINTSBET_RACING_TYPE = { 1: "horse", 2: "harness", 4: "greyhound" };

// The reverse mapping, for the URL builder below — confirmed live these
// are the literal path segment text PointsBet's own routing expects
// (case-sensitive, e.g. "/racing/Greyhound/AUS/Ballarat/race/115131990").
const POINTSBET_URL_SEGMENT = { horse: "Thoroughbred", harness: "Harness", greyhound: "Greyhound" };

async function fetchPointsBetNextEvents() {
  const response = await fetch(POINTSBET_MEETINGS_URL);
  if (!response.ok) {
    throw new Error(`PointsBet meetings error: HTTP ${response.status}`);
  }

  const groups = await response.json();

  // Flattened into the same {type, meetingName, raceNumber, startTimeMs,
  // id, countryCode} shape fetchLadbrokesNextEvents/fetchNedsNextEvents
  // already use — countryCode carried through too (needed by
  // buildPointsBetRaceUrl below, unlike the other two bookies' own URLs
  // which don't encode a country segment).
  const events = [];
  for (const group of groups) {
    for (const meeting of group.meetings || []) {
      const type = POINTSBET_RACING_TYPE[meeting.racingType];
      if (!type) continue;
      for (const race of meeting.races || []) {
        events.push({
          type,
          meetingName: meeting.venue,
          countryCode: meeting.countryCode,
          raceNumber: race.raceNumber,
          startTimeMs: new Date(race.advertisedStartDateTimeUtc).getTime(),
          id: race.raceId,
        });
      }
    }
  }
  return events;
}

// Builds a direct link to a specific race's page, e.g.
// https://pointsbet.com.au/racing/Greyhound/AUS/Ballarat/race/115131990
// Confirmed live for AUS (Thoroughbred/Harness/Greyhound) and a GBR
// greyhound race, each loading the correct race. Unlike Ladbrokes'/
// Neds' own cosmetic slug (their routing is entirely by id, confirmed
// live), this hasn't been verified to tolerate a wrong type/country/
// venue segment — built from the event's own real values throughout
// rather than risking a placeholder.
function buildPointsBetRaceUrl(event) {
  const segment = POINTSBET_URL_SEGMENT[event.type];
  return `https://pointsbet.com.au/racing/${segment}/${event.countryCode}/${encodeURIComponent(
    event.meetingName
  )}/race/${event.id}`;
}

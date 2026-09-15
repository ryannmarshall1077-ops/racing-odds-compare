// Palmerbet's own public racing REST API — no auth required, no
// persisted-query hash to keep in sync with a frontend release either
// (unlike Ladbrokes/Neds/Unibet's own GraphQL feeds) — plain readable
// paths, confirmed live: the exact same URLs, no session/cookies, return
// identical data logged out. Discovered by hooking window.fetch before
// clicking into a real race from the "Next To Jump" list.
const PALMERBET_FIXTURE_URL = "https://fixture.palmerbet.online/fixtures/racing";

// Palmerbet's own PascalCase raceType, confirmed live against real
// meetings — mapped straight to this codebase's own sport.id convention,
// same idea as PointsBet's own POINTSBET_RACING_TYPE. The reverse mapping
// (buildPalmerbetRaceUrl below) needs the real Palmerbet URL's own
// lowercase segment, confirmed live via a real "Racing > Horse" click:
// /racing/horse/<dateDMY>/<venue>/<raceNumber>.
const PALMERBET_RACE_TYPE = { HorseRacing: "horse", GreyhoundRacing: "greyhound", HarnessRacing: "harness" };
const PALMERBET_URL_SEGMENT = { horse: "horse", greyhound: "greyhound", harness: "harness" };

// dateIso: "YYYY-MM-DD" — one call per race type (unlike Unibet's own
// MeetingsByDateRange, this endpoint doesn't accept more than one
// raceType at a time — confirmed live, a combined raceTypes param on
// this particular endpoint was never tried against real behaviour, so
// three separate calls is the one confirmed-working shape). Returns
// EVERY meeting for that date/type globally, not just AU/NZ or just the
// next few — country filtering happens in the caller, same as every
// other bookie's own fetch{Bookie}NextEvents leaves that to
// listUpcomingRacesInner's own namesMatch/country-agnostic matching.
async function fetchPalmerbetNextEvents(dateIso) {
  const events = [];

  for (const [apiType, type] of Object.entries(PALMERBET_RACE_TYPE)) {
    const url = `${PALMERBET_FIXTURE_URL}/${dateIso}/${apiType}?channel=website`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Palmerbet fixtures error (${apiType}): HTTP ${response.status}`);
    }

    const { meetings } = await response.json();
    for (const meeting of meetings || []) {
      // AU/NZ only — confirmed live this endpoint returns every country's
      // meetings for the date/type with no filter of its own (26 meetings
      // for HorseRacing alone, from Chile to Japan). Every other bookie's
      // own fetch already narrows to what background.js can actually
      // match against Betfair's own AU/NZ-only race list, so this does
      // the same rather than pushing the filter downstream.
      if (meeting.country !== "AU" && meeting.country !== "NZ") continue;

      for (const race of meeting.races || []) {
        events.push({
          type,
          meetingName: meeting.venue.title,
          raceNumber: race.number,
          startTimeMs: new Date(race.startTime).getTime(),
          id: race.eventId,
          // Carried through verbatim (not re-derived from startTimeMs in
          // buildPalmerbetRaceUrl) — this IS the exact date segment
          // Palmerbet's own real URLs use for this race (confirmed live),
          // so reusing it outright avoids any UTC/local-date drift a
          // fresh new Date(startTimeMs) conversion could introduce for a
          // race sitting right on a UTC day boundary.
          dateIso,
        });
      }
    }
  }
  return events;
}

// Builds a direct link to a specific race's page, e.g.
// https://www.palmerbet.com/racing/harness/15-09-2026/Mohawk%20-%20Can/6
// The date segment is DD-MM-YYYY (Palmerbet's own real URL convention,
// confirmed live — NOT the ISO YYYY-MM-DD the fixture API itself takes;
// event.dateIso is that same ISO string, just reformatted here rather
// than re-derived from startTimeMs), and the venue segment is the
// venue's own real title, verbatim — no separate slug/code needed,
// confirmed live navigating straight to a fresh tab at this URL (not
// just clicking through from an already-loaded page) still loads the
// correct race.
function buildPalmerbetRaceUrl(event) {
  const [yyyy, mm, dd] = event.dateIso.split("-");
  const segment = PALMERBET_URL_SEGMENT[event.type];
  return `https://www.palmerbet.com/racing/${segment}/${dd}-${mm}-${yyyy}/${encodeURIComponent(
    event.meetingName
  )}/${event.raceNumber}`;
}

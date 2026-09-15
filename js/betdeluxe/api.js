// BetDeluxe's own public racing REST API — no auth required. Discovered
// by hooking window.fetch/XMLHttpRequest.prototype.open before clicking
// into a real race from the racing hub. BetDeluxe runs on "Blackstream"
// infrastructure (api.blackstream.com.au, not betdeluxe.com.au itself) —
// same "runs on someone else's white-label platform" shape Betr (BlueBet)
// and Betr's own sibling bookies already have here.
const BETDELUXE_SCHEDULE_URL = "https://api.blackstream.com.au/api/racing/v1/schedule";

// BetDeluxe's own lowercase-plural grouping keys, confirmed live —
// mapped straight to this codebase's own sport.id convention, same idea
// as PointsBet's own POINTSBET_RACING_TYPE. Named explicitly (not
// discovered via a generic Object.keys(data.data) walk) on purpose: a
// genuine live bug elsewhere in this codebase (js/betr/api.js) was
// exactly this — a defensive "is this key even an array" check that
// happened to also match an unrelated summary key once the upstream API
// changed shape, silently breaking everything downstream of it. Naming
// the 3 real keys explicitly means a 4th, unrelated key BetDeluxe adds
// later just gets ignored, never mistaken for a racing type.
const BETDELUXE_RACE_TYPE = { thoroughbred: "horse", greyhounds: "greyhound", trots: "harness" };

// The reverse mapping, for the URL builder below — confirmed live these
// are the literal path segment text BetDeluxe's own routing expects
// (case-sensitive, e.g. "/racing/Harness/AUS/Menangle/800628/3/11415984").
const BETDELUXE_URL_SEGMENT = { horse: "Thoroughbred", greyhound: "Greyhound", harness: "Harness" };

// startIso/endIso: a UTC window wide enough to cover "today" in every AU/NZ
// timezone — same reasoning fetchUnibetNextEvents already documents for
// its own identical parameter shape.
async function fetchBetDeluxeNextEvents(startIso, endIso) {
  const url = `${BETDELUXE_SCHEDULE_URL}?startDateTime=${encodeURIComponent(
    startIso
  )}&endDateTime=${encodeURIComponent(endIso)}&topfouroutcomes=true`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`BetDeluxe schedule error: HTTP ${response.status}`);
  }

  const { data } = await response.json();

  // Flattened into the same {type, meetingName, raceNumber, startTimeMs,
  // id, meetId} shape every other bookie's own fetch{Bookie}NextEvents
  // already uses — meetId carried through too (needed by
  // buildBetDeluxeRaceUrl below, unlike most other bookies' own URLs,
  // which don't encode a separate meeting id segment).
  const events = [];
  for (const [key, type] of Object.entries(BETDELUXE_RACE_TYPE)) {
    for (const meeting of data[key] || []) {
      // AU/NZ only — same reasoning fetchPalmerbetNextEvents already
      // documents: this endpoint returns every country's meetings for
      // the window with no filter of its own.
      if (meeting.countryCode !== "AUS" && meeting.countryCode !== "NZL") continue;

      for (const race of meeting.races || []) {
        events.push({
          type,
          meetingName: meeting.venue,
          meetId: meeting.meetId,
          raceNumber: race.raceNumber,
          startTimeMs: new Date(race.advertisedStartTime).getTime(),
          id: race.eventId,
        });
      }
    }
  }
  return events;
}

// Builds a direct link to a specific race's page, e.g.
// https://www.betdeluxe.com.au/racing/Harness/AUS/Menangle/800628/3/11415984
// The venue segment is the venue's own real name with spaces turned into
// hyphens (confirmed live: "Angle Park" -> "Angle-Park", case otherwise
// preserved) — no separate slug/code needed. countryCode isn't threaded
// through the matched event itself (every event here is already AU/NZ
// only, per the filter above) — hardcoded to "AUS" since NZ racing
// wasn't seen live on BetDeluxe at all while building this (empty
// countryCode set checked against a real full day's schedule); revisit
// if that turns out wrong for a real NZ race.
function buildBetDeluxeRaceUrl(event) {
  const segment = BETDELUXE_URL_SEGMENT[event.type];
  const venueSlug = event.meetingName.replace(/\s+/g, "-");
  return `https://www.betdeluxe.com.au/racing/${segment}/AUS/${venueSlug}/${event.meetId}/${event.raceNumber}/${event.id}`;
}

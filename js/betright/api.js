// BetRight's own public racing REST API — no auth required. Discovered
// by hooking window.fetch/XMLHttpRequest.prototype.open before clicking
// into a real race from the racing hub (a plain reload of the hub page
// itself never called it at all — only switching to the "Tomorrow" tab
// did, same "the initial view is server-rendered, a client fetch only
// fires on a later interaction" lesson already learned elsewhere here).
const BETRIGHT_GROUPED_RACE_CARD_URL = "https://next-api.betright.com.au/Racing/GroupedRaceCard";

// BetRight's own lowercase-plural grouping keys — confirmed live
// IDENTICAL to BetDeluxe's own (both "thoroughbred"/"trots"/"greyhounds",
// suggesting a shared platform heritage even though the two run on
// entirely separate API domains) — mapped straight to this codebase's
// own sport.id convention. Named explicitly, not walked generically, for
// the exact same reason BETDELUXE_RACE_TYPE's own comment explains: this
// response also carries an unrelated "multipleShortcutSummary" key
// alongside the 3 real ones, and a generic Array.isArray walk is exactly
// what silently broke on that same shape of key elsewhere in this
// codebase (js/betr/api.js) once the upstream API changed.
const BETRIGHT_RACE_TYPE = { thoroughbred: "horse", greyhounds: "greyhound", trots: "harness" };

// dateIso: "YYYY-MM-DD" — one call returns every meeting for that date
// across every country, same shape as Palmerbet's own per-date fixture
// calls (unlike BetDeluxe's own start/end window).
async function fetchBetRightNextEvents(dateIso) {
  const response = await fetch(`${BETRIGHT_GROUPED_RACE_CARD_URL}?raceDate=${dateIso}`);
  if (!response.ok) {
    throw new Error(`BetRight GroupedRaceCard error: HTTP ${response.status}`);
  }

  const data = await response.json();

  // Flattened into the same {type, meetingName, raceNumber, startTimeMs,
  // id} shape every other bookie's own fetch{Bookie}NextEvents already
  // uses.
  const events = [];
  for (const [key, type] of Object.entries(BETRIGHT_RACE_TYPE)) {
    for (const meeting of data[key] || []) {
      // AU/NZ only — same reasoning fetchPalmerbetNextEvents/
      // fetchBetDeluxeNextEvents already document: this endpoint returns
      // every country's meetings for the date with no filter of its own
      // (confirmed live: JPN/FRA/TUR/IRL/GBR/CAN/USA/CHL/ARG/BRA meetings
      // all present alongside AUS on the exact same real day checked).
      if (meeting.countryCode !== "AUS" && meeting.countryCode !== "NZL") continue;

      for (const race of meeting.races || []) {
        events.push({
          type,
          meetingName: meeting.venue,
          raceNumber: race.raceNumber,
          startTimeMs: new Date(race.advertisedStartTimeUtc).getTime(),
          id: race.eventId,
        });
      }
    }
  }
  return events;
}

function betRightSlug(venue) {
  return venue.toLowerCase().replace(/\s+/g, "-");
}

// Builds a direct link to a specific race's page, e.g.
// https://www.betright.com.au/racing/angle-park/1/62827634/win
// Confirmed live for both a single-word venue (Wodonga) and a multi-word
// one (Angle Park -> angle-park) — the slug is purely cosmetic (same
// "routing is entirely by id" shape Ladbrokes'/Neds' own URLs already
// have), but kept as the venue's own real name (lowercased, hyphenated)
// rather than a placeholder since it costs nothing and matches what a
// real BetRight link actually looks like.
function buildBetRightRaceUrl(event) {
  return `https://www.betright.com.au/racing/${betRightSlug(event.meetingName)}/${event.raceNumber}/${event.id}/win`;
}

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

// This endpoint genuinely rejects any startDateTime/endDateTime window
// wider than ~25-26 hours — confirmed live: a real user-reported bug
// traced back to exactly this. An earlier version of this function took
// a caller-supplied, deliberately-wide ±20h-around-now window (the same
// shape fetchUnibetNextEvents' own window still uses, which has no such
// limit) — that request came back HTTP 200 with `{"code":
// "ValidationError","data":[]}`, which this function didn't check for
// at all, so it silently returned zero events on every single call
// instead of ever throwing — meaning betdeluxeUrl stayed null for every
// race, indistinguishable from "just hasn't matched yet" rather than a
// real, permanent failure.
//
// Fixed by computing the exact same 24h window BetDeluxe's own frontend
// itself requests (confirmed live, byte-for-byte, while investigating
// the bug): AEST calendar-day midnight to the next midnight minus 1ms,
// converted to UTC — rather than accepting an arbitrary caller-supplied
// window at all, since ~24h is the one width actually confirmed to work.
// Fixed UTC+10 (AEST, not AEDT) — same "good enough" approximation
// RACING_SPORTS/endOfTodayUtc elsewhere in this codebase already makes
// rather than resolving daylight saving/which-AU-state precisely.
function betDeluxeTodayWindowUtc() {
  const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;
  const nowAest = new Date(Date.now() + AEST_OFFSET_MS);
  const startUtc = new Date(
    Date.UTC(nowAest.getUTCFullYear(), nowAest.getUTCMonth(), nowAest.getUTCDate()) - AEST_OFFSET_MS
  );
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { startIso: startUtc.toISOString(), endIso: endUtc.toISOString() };
}

async function fetchBetDeluxeNextEvents() {
  const { startIso, endIso } = betDeluxeTodayWindowUtc();
  const url = `${BETDELUXE_SCHEDULE_URL}?startDateTime=${encodeURIComponent(
    startIso
  )}&endDateTime=${encodeURIComponent(endIso)}&topfouroutcomes=true`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`BetDeluxe schedule error: HTTP ${response.status}`);
  }

  const { code, message, data } = await response.json();
  // Confirmed live: a rejected request (e.g. too-wide a window) still
  // comes back HTTP 200 with an empty `data` and this `code` set to
  // something other than "Success" instead of a non-2xx status — the
  // exact shape that let the bug above hide from the HTTP-status check
  // just above. Checked explicitly now so a future rejection for a
  // different reason surfaces as a real, logged error (caught by
  // listUpcomingRacesInner's own best-effort .catch) instead of quietly
  // returning zero events again.
  if (code !== "Success") {
    throw new Error(`BetDeluxe schedule error: ${code} — ${message}`);
  }

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

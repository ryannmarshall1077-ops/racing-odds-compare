// Betr's own public racing REST API — no auth required. Discovered by
// hooking window.fetch/XMLHttpRequest.prototype.open before loading a
// real racing page (reading network requests after the fact kept
// missing it — same lesson learned adding PointsBet). Betr turns out to
// run on "BlueBet" infrastructure (Betr is BlueBet's own brand) —
// web20-api.bluebet.com.au, not betr.com.au itself.
//
// GroupedRaceCard?DaysToRace=0 means "today" without needing to compute
// a date string client-side at all (unlike every other bookie's own
// feed here) — one call returns every meeting for today, grouped by
// racing type, each with its own races nested inside.
const BETR_RACECARD_URL = "https://web20-api.bluebet.com.au/GroupedRaceCard?DaysToRace=0";

// Betr's own numeric EventTypeId, confirmed live against real meetings
// (Wodonga/Tamworth thoroughbreds = 1, Shepparton harness = 2, Angle
// Park greyhounds = 3) — mapped to this codebase's own sport.id
// convention, same idea as PointsBet's own POINTSBET_RACING_TYPE.
const BETR_RACING_TYPE = { 1: "horse", 2: "harness", 3: "greyhound" };

async function fetchBetrNextEvents() {
  const response = await fetch(BETR_RACECARD_URL);
  if (!response.ok) {
    throw new Error(`Betr GroupedRaceCard error: HTTP ${response.status}`);
  }

  const groups = await response.json();

  // Top-level keys are "Thoroughbred"/"Greyhounds"/"Trots" plus a couple
  // of unrelated summary keys (MultipleShortcutSummary/FutureDays) —
  // Object.values + a defensive Array.isArray check skips those without
  // needing to name the 3 real ones explicitly. Each is an array of
  // meetings, each meeting an array of its own races (confirmed live:
  // GroupedRaceCard's own shape is [[race, race, ...], [race, ...], ...]
  // per racing type, not grouped by meeting name at the top level the
  // way Ladbrokes'/Neds' own feeds are) — MasterCategoryName carries the
  // "Australian Racing"/"Overseas Racing" split needed for the URL
  // builder below, per-race rather than per-meeting.
  const events = [];
  for (const group of Object.values(groups)) {
    if (!Array.isArray(group)) continue;
    for (const meeting of group) {
      for (const race of meeting) {
        const type = BETR_RACING_TYPE[race.EventTypeId];
        if (!type) continue;
        events.push({
          type,
          meetingName: race.Venue,
          masterCategoryName: race.MasterCategoryName,
          raceNumber: race.RaceNumber,
          startTimeMs: new Date(race.AdvertisedStartTime).getTime(),
          id: race.EventId,
        });
      }
    }
  }
  return events;
}

// Builds a direct link to a specific race's page, e.g.
// https://www.betr.com.au/racing/Australian-Racing/Wodonga/Race-1/92176673/win
// Confirmed live for an AUS thoroughbred race and a GBR/TUR overseas
// one — the region segment is MasterCategoryName's own text with
// spaces turned into hyphens ("Australian Racing" ->
// "Australian-Racing"), not hardcoded per country, since Betr's own
// feed already hands back exactly the right wording for both domestic
// and overseas meetings.
function buildBetrRaceUrl(event) {
  const region = event.masterCategoryName.replace(/\s+/g, "-");
  return `https://www.betr.com.au/racing/${region}/${encodeURIComponent(
    event.meetingName
  )}/Race-${event.raceNumber}/${event.id}/win`;
}

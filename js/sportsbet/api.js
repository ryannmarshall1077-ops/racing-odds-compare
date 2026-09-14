// Sportsbet's own public racing API — no auth required. Discovered by
// inspecting the network requests sportsbet.com.au's own frontend makes.
const SPORTSBET_SPORT_SLUG = {
  horse: "horse-racing",
  harness: "harness-racing",
  greyhound: "greyhound-racing",
};

// classId 1 = Aus/NZ horse racing, 3 = harness racing, 4 = greyhound
// racing — the three domestic codes this extension matches against
// (classId 2's "Horses - Asia"/"Horses - International" buckets are
// irrelevant here, same as HR_DOMESTIC/HA_DOMESTIC/GH_DOMESTIC below
// already excluded international meetings).
const SPORTSBET_DOMESTIC_CLASS_IDS = [1, 3, 4];

// This used to call Racing/NextEvents (racingFilters=..._DOMESTIC), a
// single flat feed of "the next N events across all of AU/NZ racing
// combined" — user-reported (and confirmed live against the real API):
// that feed hard-caps at exactly 120 events no matter what, verified by
// trying count/take/limit/pageSize overrides against it directly, all
// ignored. That cap was invisible while the sidebar itself only ever
// showed ~20 races, but broke down once it was widened to show every
// race for the rest of the day (listWinMarkets' own marketStartTimeTo,
// background.js): on a normal day AU+NZ domestic horse/harness/greyhound
// racing combined comfortably exceeds 120 races, so anything beyond the
// cap simply never appeared in the feed at all — no match possible, a
// permanent "!" warning, and no Sportsbet tab ever auto-opening for it.
//
// Racing/Competitions?classId=N&date=YYYY-MM-DD instead — confirmed live
// against the real API — returns every meeting (and every race in it)
// for that one racing code on that one day, with no such cap; each
// event carries the exact same fields (id/type/competitionName/
// raceNumber/startTime) the old feed did, so nothing downstream
// (buildSportsbetRaceUrl, the sbMatch lookup in listUpcomingRacesInner)
// needs to change, just fetched three ways (one per class id) and
// flattened back into one list.
async function fetchSportsbetCompetitions(classId, dateParam) {
  const response = await fetch(
    `https://www.sportsbet.com.au/apigw/sportsbook-racing/Sportsbook/Racing/Competitions?classId=${classId}&date=${dateParam}`
  );
  if (!response.ok) {
    throw new Error(`Sportsbet Competitions error (classId ${classId}): HTTP ${response.status}`);
  }
  return response.json();
}

// Sportsbet's own `date` param is evaluated against ITS server's local
// day, not UTC — confirmed live it's already keeping a wider window than
// AEST midnight would suggest, but rather than assume exactly which
// timezone it resolves to, today's AND tomorrow's UTC-based calendar
// date are both queried (same "good enough for the rest of today"
// approximation already used elsewhere, e.g. listUpcomingRacesInner's
// own endOfTodayUtc) and results de-duped by event id — so a late race
// that falls under Sportsbet's own "tomorrow" well before this
// extension's UTC-day cutoff reaches it is still covered, with nothing
// double-counted at the boundary either.
async function fetchSportsbetNextEvents() {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const dateParams = [today, tomorrow].map((d) => d.toISOString().slice(0, 10));

  const competitionLists = await Promise.all(
    SPORTSBET_DOMESTIC_CLASS_IDS.flatMap((classId) =>
      dateParams.map((dateParam) => fetchSportsbetCompetitions(classId, dateParam))
    )
  );

  const eventsById = new Map();
  for (const competitions of competitionLists) {
    for (const competition of competitions) {
      for (const event of competition.events || []) {
        eventsById.set(event.id, event);
      }
    }
  }
  return [...eventsById.values()];
}

function sportsbetSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Builds a direct link to a specific race's page, e.g.
// https://www.sportsbet.com.au/horse-racing/australia-nz/eagle-farm/race-1-10891795
// Verified against the real site — confirmed working for horse, harness and
// greyhound domestic races.
function buildSportsbetRaceUrl(event) {
  const sportSlug = SPORTSBET_SPORT_SLUG[event.type];
  if (!sportSlug) return null;
  return `https://www.sportsbet.com.au/${sportSlug}/australia-nz/${sportsbetSlug(
    event.competitionName
  )}/race-${event.raceNumber}-${event.id}`;
}

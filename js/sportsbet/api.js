// Sportsbet's own /racing-schedule page — NOT its NextEvents JSON API
// (used here previously). NextEvents hard-caps each racing category
// (HR_DOMESTIC, HA_DOMESTIC, GH_DOMESTIC, plus their _INTERNATIONAL
// counterparts) at exactly 40 events, sorted soonest-first — confirmed
// directly against a live request. On a normal AU racing day there are
// well over 40 greyhound races alone, so once this extension started
// loading every race today (not just the next 20), any race outside
// that ~40-item horizon got a false "no Sportsbet match" warning even
// though it was genuinely live and priced on Sportsbet's own site —
// user-reported after noticing this on a real Wagga race.
//
// /racing-schedule has no such cap: it's a full day's schedule (682
// events across 67 competitions in the same real check that found
// NextEvents' 40-per-category ceiling), just not exposed as a separate
// REST endpoint — it's embedded in the page's own server-rendered HTML
// as `window.__PRELOADED_STATE__`, so this fetches the page directly and
// parses that out, same "read a real page's own data" approach
// tabMeetings.js already uses for TAB's venue codes, just via a fetch
// here instead of a content script. Heavier than the old JSON call
// (~1.7MB of HTML vs a small JSON payload) but still just the one
// request, at the same ~1/minute cadence as before.
const SPORTSBET_RACING_SCHEDULE_URL = "https://www.sportsbet.com.au/racing-schedule";

const SPORTSBET_SPORT_SLUG = {
  horse: "horse-racing",
  harness: "harness-racing",
  greyhound: "greyhound-racing",
};

// Sportsbet's own sport+region classification, keyed by competition
// classId — verified directly: 1 = HR domestic (Moe, Muswellbrook, ...),
// 3 = HA domestic (Gloucester Park, Menangle, ...), 4 = GH domestic
// (Angle Park, Bulli, ...); 2/112/134/355 are each sport's INTERNATIONAL
// counterpart (Galway, Newcastle DG, Kasamatsu, Yonkers Raceway) and
// deliberately excluded below — AU-only, matching the existing
// marketCountries: ["AU"] filter on the Betfair side.
const SPORTSBET_CLASS_ID_TYPE = { 1: "horse", 3: "harness", 4: "greyhound" };

// Extracts the `window.__PRELOADED_STATE__ = {...}` object embedded in
// the page's HTML — brace-depth-aware (tracking string/escape state so a
// literal "}" or "</script>"-looking text inside a JSON string value
// can't prematurely end it) rather than a fixed-size slice or a naive
// regex, since the object's real size varies from one fetch to the next.
function extractPreloadedState(html) {
  const marker = "window.__PRELOADED_STATE__ = ";
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error("Sportsbet racing-schedule: __PRELOADED_STATE__ not found in page");
  }

  const objStart = markerIdx + marker.length;
  let depth = 0;
  let inString = false;
  let escape = false;
  let i = objStart;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }

  return JSON.parse(html.slice(objStart, i));
}

async function fetchSportsbetRaceSchedule() {
  const response = await fetch(SPORTSBET_RACING_SCHEDULE_URL);
  if (!response.ok) {
    throw new Error(`Sportsbet racing-schedule error: HTTP ${response.status}`);
  }

  const html = await response.text();
  const state = extractPreloadedState(html);
  const sportsbook = state.entities?.sportsbook;
  if (!sportsbook) {
    throw new Error("Sportsbet racing-schedule: unexpected page structure");
  }

  const competitions = sportsbook.competitions || {};
  const events = Object.values(sportsbook.events || {});

  return events
    .map((e) => {
      const competition = competitions[e.competitionId];
      const type = competition && SPORTSBET_CLASS_ID_TYPE[String(competition.classId)];
      if (!type || competition.regionType !== "DOMESTIC" || competition.regionId !== "australia") {
        return null; // not AU racing (international, or an unrecognised class) — not something to match against
      }

      return {
        id: e.id,
        type,
        competitionName: competition.name,
        raceNumber: e.raceNumber,
        // .milliseconds -> unix seconds, matching the shape
        // listUpcomingRacesInner's own matching already expects.
        startTime: Math.floor(e.startTime.milliseconds / 1000),
      };
    })
    .filter((e) => e !== null);
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

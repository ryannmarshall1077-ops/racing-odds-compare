// Sportsbet's own public racing API — no auth required. Discovered by
// inspecting the network requests sportsbet.com.au's own frontend makes.
const SPORTSBET_NEXT_EVENTS_URL =
  "https://www.sportsbet.com.au/apigw/sportsbook-racing/Sportsbook/Racing/NextEvents" +
  "?racingFilters=HR_DOMESTIC,HA_DOMESTIC,GH_DOMESTIC&groupByFilters=true";

const SPORTSBET_SPORT_SLUG = {
  horse: "horse-racing",
  harness: "harness-racing",
  greyhound: "greyhound-racing",
};

async function fetchSportsbetNextEvents() {
  const response = await fetch(SPORTSBET_NEXT_EVENTS_URL);
  if (!response.ok) {
    throw new Error(`Sportsbet NextEvents error: HTTP ${response.status}`);
  }
  return response.json();
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

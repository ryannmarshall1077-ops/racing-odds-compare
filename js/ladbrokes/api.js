// Ladbrokes' own public racing GraphQL endpoint — no auth required.
// Discovered by inspecting the network requests ladbrokes.com.au's own
// frontend makes on page load (a plain GET to a persisted-query GraphQL
// router) — confirmed live: calling this exact URL directly with no
// session/cookies at all returns the same data a real logged-out visit
// gets, so it's a genuine public feed, not something that needs the
// user's own session the way ladbrokesWatcher.js's page-scraping does.
//
// The persisted-query hash below is baked into Ladbrokes' own deployed
// frontend bundle (an Apollo "automatic persisted query" — the server
// already has this exact hash -> query text mapping registered, so a
// bare GET with just the hash + variables works without ever needing
// the actual GraphQL query text). It'll need re-discovering the same
// way if Ladbrokes ships a frontend release that changes this specific
// query — the same kind of fragility already accepted for Sportsbet's
// own feed format elsewhere in this codebase.
const LADBROKES_GRAPHQL_URL = "https://api.ladbrokes.com.au/gql/router";
const LADBROKES_RACING_HOME_HASH =
  "8fe8f9784427173481c661854e35edcc4a9bb503b62859a3a7dc4b59963bfbff";

// dateIso: "YYYY-MM-DD", Ladbrokes' own local race-day (matches
// tabRaceUrlFromCodes' own date segment convention).
async function fetchLadbrokesNextEvents(dateIso) {
  const variables = JSON.stringify({
    date: dateIso,
    horse: true,
    greyhound: true,
    harness: true,
    regions: ["DOMESTIC"],
    shouldFetchPools: false,
  });
  const extensions = JSON.stringify({
    persistedQuery: { version: 1, sha256Hash: LADBROKES_RACING_HOME_HASH },
  });
  const url =
    `${LADBROKES_GRAPHQL_URL}?variables=${encodeURIComponent(variables)}` +
    `&operationName=RacingHomeScreenWeb&extensions=${encodeURIComponent(extensions)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Ladbrokes RacingHomeScreenWeb error: HTTP ${response.status}`);
  }

  const { data, errors } = await response.json();
  if (errors?.length) {
    throw new Error(`Ladbrokes RacingHomeScreenWeb error: ${errors[0].message}`);
  }

  // The response is already split into horse/greyhound/harness top-level
  // buckets (matching the three booleans in `variables` above) — unlike
  // Sportsbet's own flat feed, which needed a separate sportsbetTypes
  // membership check to tell harness apart from horse. Flattened here
  // into one list of {type, meetingName, raceNumber, startTimeMs, id} —
  // one shape per race, same idea as Sportsbet's own events list, just
  // with its own field names.
  const events = [];
  for (const [type, group] of Object.entries(data || {})) {
    for (const meeting of group?.nodes || []) {
      if (meeting.isAbandoned) continue;
      for (const race of meeting.races?.nodes || []) {
        events.push({
          type,
          meetingName: meeting.name,
          raceNumber: race.number,
          startTimeMs: new Date(race.advertisedStart).getTime(),
          // Strips the GraphQL "RacingRace:" type prefix — the bare id
          // is what the real race URL actually uses (see
          // buildLadbrokesRaceUrl).
          id: race.id.replace(/^RacingRace:/, ""),
        });
      }
    }
  }
  return events;
}

function ladbrokesSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Builds a direct link to a specific race's page, e.g.
// https://www.ladbrokes.com.au/racing/ladbrokes-geelong/dac71c29-9ce7-43de-acab-6612d21cce99
// The slug segment is purely cosmetic — confirmed live, navigating with
// an arbitrary placeholder slug (keeping the real id) still loads the
// correct race, since Ladbrokes' own routing is entirely by id. Kept
// real anyway (not hardcoded to a placeholder) since it costs nothing
// and matches what a real Ladbrokes link actually looks like.
function buildLadbrokesRaceUrl(event) {
  return `https://www.ladbrokes.com.au/racing/${ladbrokesSlug(event.meetingName)}/${event.id}`;
}

// Neds' own public racing GraphQL endpoint — no auth required. Confirmed
// live: Neds and Ladbrokes run on the exact same underlying platform —
// same GraphQL router shape, the SAME persisted-query hash for
// RacingHomeScreenWeb, identical response shape (horse/greyhound/harness
// top-level buckets, "RacingRace:"-prefixed ids, meeting.isAbandoned,
// race.number/advertisedStart), and race pages share the exact same
// data-testid attributes ladbrokesWatcher.js/ladbrokes.js already scrape
// (runner-row/runner-name/price-button/price-button-racing, and even the
// countdown text "final") — so this file (and nedsWatcher.js/neds.js) are
// deliberately near-identical clones of their Ladbrokes counterparts,
// just pointed at neds.com.au. Kept as its own file rather than a shared
// one, matching every other bookie's own js/<bookie>/api.js — if Neds'
// platform ever diverges from Ladbrokes' down the line, there's nothing
// shared to accidentally break for both at once.
const NEDS_GRAPHQL_URL = "https://api.neds.com.au/gql/router";
const NEDS_RACING_HOME_HASH =
  "8fe8f9784427173481c661854e35edcc4a9bb503b62859a3a7dc4b59963bfbff";

// dateIso: "YYYY-MM-DD", Neds' own local race-day (matches
// tabRaceUrlFromCodes'/fetchLadbrokesNextEvents' own date convention).
async function fetchNedsNextEvents(dateIso) {
  const variables = JSON.stringify({
    date: dateIso,
    horse: true,
    greyhound: true,
    harness: true,
    regions: ["DOMESTIC"],
    shouldFetchPools: false,
  });
  const extensions = JSON.stringify({
    persistedQuery: { version: 1, sha256Hash: NEDS_RACING_HOME_HASH },
  });
  const url =
    `${NEDS_GRAPHQL_URL}?variables=${encodeURIComponent(variables)}` +
    `&operationName=RacingHomeScreenWeb&extensions=${encodeURIComponent(extensions)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Neds RacingHomeScreenWeb error: HTTP ${response.status}`);
  }

  const { data, errors } = await response.json();
  if (errors?.length) {
    throw new Error(`Neds RacingHomeScreenWeb error: ${errors[0].message}`);
  }

  // Same flattening as fetchLadbrokesNextEvents — one list of
  // {type, meetingName, raceNumber, startTimeMs, id}, sourced from the
  // same horse/greyhound/harness top-level buckets.
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
          id: race.id.replace(/^RacingRace:/, ""),
        });
      }
    }
  }
  return events;
}

function nedsSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Builds a direct link to a specific race's page, e.g.
// https://www.neds.com.au/racing/hamilton/a22e0271-b8e4-4913-a12c-29e1636edcac
// Confirmed live, same as buildLadbrokesRaceUrl: the slug is cosmetic,
// Neds' own routing is entirely by id.
function buildNedsRaceUrl(event) {
  return `https://www.neds.com.au/racing/${nedsSlug(event.meetingName)}/${event.id}`;
}

// Unibet's own public racing GraphQL endpoint — no auth required.
// Discovered the same way Ladbrokes'/Neds' own persisted-query feeds
// were: hooking window.fetch before triggering an in-page navigation
// (a plain reload missed it — Unibet's own bundle grabs its own fetch
// reference before a post-hoc hook can see it) and reading what its
// "Next To Go"/meetings screens actually called. Confirmed live: the
// exact same URL, no session/cookies, returns identical data logged out.
//
// The persisted-query hashes below are baked into Unibet's own deployed
// frontend bundle (an Apollo "automatic persisted query" — same kind of
// fragility already accepted for Ladbrokes'/Neds' own feeds elsewhere in
// this codebase, re-discoverable the same way if Unibet ships a frontend
// release that changes either query). Both calls also need one of
// "apollo-require-preflight"/"x-apollo-operation-name" set — confirmed
// live: Apollo Server's own CSRF-prevention plugin otherwise blocks a
// plain GET with a 400, since it has no other header/content-type
// signalling "this is a real app request, not a cross-site form post".
const UNIBET_GRAPHQL_URL = "https://rsa.unibet.com.au/api/v1/graphql";
const UNIBET_MEETINGS_BY_DATE_RANGE_HASH =
  "6126ca780c4d2e5092c50a8fb0dc15b3693eca18fa896372cf28829dd9a5e533";

// Unibet's own single-letter raceType, confirmed live against real
// meetings (Wodonga/Moruya horse = T, Angle Park/Hobart greyhound = G) —
// mapped straight to this codebase's own sport.id convention, same idea
// as PointsBet's own POINTSBET_RACING_TYPE.
const UNIBET_RACE_TYPE = { T: "horse", G: "greyhound", H: "harness" };

// Unibet's own countryCode for this query is a single string, not an
// array (confirmed live — passing an array like NTGQuery's own
// countryCodes variable returns zero results) — "AUS" for Australia,
// "NZL" for New Zealand (confirmed live; plain "NZ" returns nothing).
const UNIBET_COUNTRY_CODES = ["AUS", "NZL"];

async function fetchUnibetMeetings(countryCode, startIso, endIso) {
  const variables = JSON.stringify({
    startDateTime: startIso,
    endDateTime: endIso,
    countryCodes: countryCode,
    clientCountryCode: "AU",
    raceTypes: ["T", "G", "H"],
  });
  const extensions = JSON.stringify({
    persistedQuery: { version: 1, sha256Hash: UNIBET_MEETINGS_BY_DATE_RANGE_HASH },
  });
  const url =
    `${UNIBET_GRAPHQL_URL}?operationName=MeetingsByDateRange&variables=${encodeURIComponent(variables)}` +
    `&extensions=${encodeURIComponent(extensions)}`;

  const response = await fetch(url, {
    headers: { "apollo-require-preflight": "true", "x-apollo-operation-name": "MeetingsByDateRange" },
  });
  if (!response.ok) {
    throw new Error(`Unibet MeetingsByDateRange error: HTTP ${response.status}`);
  }

  const { data, errors } = await response.json();
  if (errors?.length) {
    throw new Error(`Unibet MeetingsByDateRange error: ${errors[0].message}`);
  }
  return data?.viewer?.meetingsByDateRange || [];
}

// startIso/endIso: a UTC window wide enough to cover "today" in every AU/NZ
// timezone — listUpcomingRacesInner's own endOfTodayUtc boundary is UTC-day
// based too, so this deliberately errs a few hours wider either side rather
// than trying to resolve which of AU's several timezones actually applies
// (same approximation already made everywhere else in this codebase).
async function fetchUnibetNextEvents(startIso, endIso) {
  const meetingGroups = await Promise.all(
    UNIBET_COUNTRY_CODES.map((cc) => fetchUnibetMeetings(cc, startIso, endIso))
  );

  // Flattened into the same {type, meetingName, raceNumber, startTimeMs,
  // id} shape every other bookie's own fetch{Bookie}NextEvents already
  // uses — eventKey doubles as both the match id and (via
  // buildUnibetRaceUrl) the literal URL segment, no separate slug/code
  // needed the way TAB/TABtouch's own venue-learning does.
  const events = [];
  for (const meetings of meetingGroups) {
    for (const meeting of meetings) {
      const type = UNIBET_RACE_TYPE[meeting.raceType];
      if (!type) continue;
      for (const event of meeting.events || []) {
        events.push({
          type,
          meetingName: meeting.name,
          raceNumber: event.sequence,
          startTimeMs: new Date(event.eventDateTimeUtc).getTime(),
          id: event.eventKey,
        });
      }
    }
  }
  return events;
}

// Builds a direct link to a specific race's page, e.g.
// https://www.unibet.com.au/racing#/event/202609150100.G.AUS.angle_park.1
// Confirmed live: a brand-new tab opened straight at this URL (not just an
// in-SPA hash change from an already-loaded page) renders the correct race
// immediately, name/prices and all.
function buildUnibetRaceUrl(event) {
  return `https://www.unibet.com.au/racing#/event/${event.id}`;
}

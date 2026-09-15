// OKEbet's own public racing GraphQL endpoint — no login required (a
// plain public API key, sent as a header by every visitor's own
// browser regardless of whether they're logged in — the same kind of
// public, client-embedded key already accepted elsewhere in this
// codebase, not a secret credential). Discovered by hooking
// window.fetch to also capture request bodies/headers before clicking
// into a real race — a URL-only hook (every other GraphQL bookie here)
// wasn't enough on its own this time: OKEbet's own query bodies need
// this "x-api-key" header or the request fails outright, and the
// request itself is a POST with the actual query in the body, not the
// URL.
const OKEBET_GRAPHQL_URL = "https://racing.okebet.bmapollo.com/query";
const OKEBET_API_KEY = "2sknff4upc6qe2s9vucldbt1cu";

// OKEbet's own upper-case racing type, confirmed live against real
// meetings — mapped straight to this codebase's own sport.id
// convention, same idea as PointsBet's own POINTSBET_RACING_TYPE.
const OKEBET_RACE_TYPE = { THOROUGHBRED: "horse", GREYHOUND: "greyhound", HARNESS: "harness" };

const OKEBET_MEETINGS_BETWEEN_QUERY = `
  query meetingsBetween($startDate: Date!, $endDate: Date!) {
    meetingsBetween(startDate: $startDate, endDate: $endDate) {
      slug
      type
      name
      track { country }
      races { slug name number start_at }
    }
  }
`;

// This endpoint genuinely rejects any startDate/endDate window wider
// than 32 hours ("duration between start and end date cannot be more
// than 32h0m0s", confirmed live) — caught here before this ever shipped
// with a too-wide window, exactly the same class of bug a caller-
// supplied ±20h-around-now window (fetchUnibetNextEvents' own shape)
// already caused for BetDeluxe once, live, in production (see that
// function's own comment, js/betdeluxe/api.js). Rather than accept an
// arbitrary caller-supplied window at all, this computes its own fixed
// ~24h AEST calendar-day window internally, the same approach
// betDeluxeTodayWindowUtc already uses — the one width confirmed to
// work here too.
function okeBetTodayWindowUtc() {
  const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;
  const nowAest = new Date(Date.now() + AEST_OFFSET_MS);
  const startUtc = new Date(
    Date.UTC(nowAest.getUTCFullYear(), nowAest.getUTCMonth(), nowAest.getUTCDate()) - AEST_OFFSET_MS
  );
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { startIso: startUtc.toISOString(), endIso: endUtc.toISOString() };
}

async function fetchOkeBetNextEvents() {
  const { startIso, endIso } = okeBetTodayWindowUtc();
  const response = await fetch(OKEBET_GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": OKEBET_API_KEY },
    body: JSON.stringify({
      query: OKEBET_MEETINGS_BETWEEN_QUERY,
      variables: { startDate: startIso, endDate: endIso },
      operationName: "meetingsBetween",
    }),
  });
  if (!response.ok) {
    throw new Error(`OKEbet meetingsBetween error: HTTP ${response.status}`);
  }

  const { data, errors } = await response.json();
  if (errors?.length) {
    throw new Error(`OKEbet meetingsBetween error: ${errors[0].message}`);
  }

  // Flattened into the same {type, meetingName, raceNumber, startTimeMs,
  // id} shape every other bookie's own fetch{Bookie}NextEvents already
  // uses — id here is meetingSlug+"/"+raceSlug (both handed back
  // verbatim by this same query), not a separately-computed slug the
  // way GoldBet's own buildGoldBetRaceUrl needs — no slugify algorithm
  // to keep in sync with OKEbet's own routing at all.
  //
  // AU/NZ only — same reasoning fetchPalmerbetNextEvents/
  // fetchBetDeluxeNextEvents already document: this endpoint returns
  // every country's meetings for the window with no filter of its own
  // (confirmed live: CAN/JPN/FRA/GBR/IRL/SWE/TUR/ITA/DNK/USA/NOR/CHL/BRA
  // meetings all present alongside AUS on the exact same real day
  // checked — no NZL meeting was seen live at all that day, so NZ
  // coverage here is unverified).
  const events = [];
  for (const meeting of data?.meetingsBetween || []) {
    if (meeting.track.country !== "AUS" && meeting.track.country !== "NZL") continue;
    const type = OKEBET_RACE_TYPE[meeting.type];
    if (!type) continue;

    for (const race of meeting.races || []) {
      events.push({
        type,
        meetingName: meeting.name,
        raceNumber: race.number,
        startTimeMs: new Date(race.start_at).getTime(),
        id: `${meeting.slug}/${race.slug}`,
      });
    }
  }
  return events;
}

// Builds a direct link to a specific race's page, e.g.
// https://okebet.com.au/racing/wodonga-636790926781449391/05-2123975/win
// event.id is already "<meetingSlug>/<raceSlug>" (see fetchOkeBetNextEvents
// above) — both handed back verbatim by OKEbet's own meetingsBetween
// query, confirmed live to be the exact same path segments a real link
// to this race uses.
function buildOkeBetRaceUrl(event) {
  return `https://okebet.com.au/racing/${event.id}/win`;
}

// Shared client for every "BetMaker" white-label tenant — a whole family
// of bookmakers (OKEbet, ReadyBet, RealBookie, BaggyBet, BetYouCan,
// Playwest, KnuckleBet, MarantelliBet, CrownBet, Swiftbet, PonyBet,
// BetAus, BetLocal, BetEstate, and others) all built on the same
// underlying racing platform ("BetMaker" software, per the user's own
// tip that kicked off this investigation), confirmed live to share:
//   - the same GraphQL query shape (meetingsBetween) and endpoint naming
//     pattern racing.<bmapolloSlug>.bmapollo.com/query
//   - a per-tenant public client-id header (see BETMAKER_TENANTS below)
//   - a genuinely shared underlying race database — the exact same real
//     race (e.g. wodonga-636790926781449391/06-2123976) resolves on
//     every tenant checked, just with each tenant's own pricing/odds
//   - the same 32-hour max query-window limit OKEbet's own endpoint
//     already enforces (see betMakerTodayWindowUtc below)
//
// OKEbet itself already has its own dedicated js/okebet/api.js (shipped
// separately, before this shared module existed) — left untouched here
// rather than folded in, to avoid touching known-working shipped code;
// every OTHER BetMaker tenant is served through this shared module
// instead of 7 near-duplicate per-bookie files.
//
// Each tenant's own "x-api-key" header value is actually its Cognito
// userPoolClientId (auth.authType is "jwt" in every tenant's own config,
// AWS Cognito User Pool + Client ID) — but confirmed live (same as
// OKEbet's own discovery) that this client id alone, sent as a plain
// header with no real login/token exchange, is sufficient for the
// public meetingsBetween query on every tenant tested. Found by
// searching a production JS bundle (client-*.js, shared across the
// whole BetMaker white-label suite — realbookie.com.au's own build
// happened to embed the full multi-tenant config table) for each
// tenant's own hostname, then reading off its "urls.racing" and
// "auth.userPoolClientId" fields directly, rather than hooking
// window.fetch per-tenant (RealBookie/BetYouCan/Terrybet's own
// frontends render racing data server-side and never call bmapollo
// from the browser at all, so a fetch-hook approach wouldn't have found
// anything for those three). Every key below was then independently
// re-verified live via a direct request to its own racing.*.bmapollo.com
// endpoint before being trusted.
//
// Terrybet (terrybet.com.au) is a confirmed real BetMaker tenant too
// (same config table, same URL/key shape) but its backend returned
// "System is in maintenance" on every attempt (both through its own
// live site, repeatedly, and via a direct API request) — a real,
// currently-live outage on Terrybet's own side, not anything wrong with
// this approach. Deliberately excluded from BETMAKER_TENANTS for now;
// add it back the same way as any tenant below once it's back up.
const BETMAKER_TENANTS = {
  readybet: {
    label: "ReadyBet",
    pageDomain: "readybet.com.au",
    bmapolloSlug: "readybet",
    apiKey: "7a72tm09a4d1v51l4at57386ua",
  },
  realbookie: {
    label: "RealBookie",
    pageDomain: "realbookie.com.au",
    bmapolloSlug: "realbookie",
    apiKey: "3716v0k99nr2qus1bkhtc7bit3",
  },
  baggybet: {
    label: "BaggyBet",
    pageDomain: "baggybet.com",
    bmapolloSlug: "baggybet",
    apiKey: "1nm1na4c2fpecg1vgp1v3p2pr7",
  },
  betyoucan: {
    label: "BetYouCan",
    pageDomain: "betyoucan.au",
    bmapolloSlug: "betyoucan",
    apiKey: "8dn3qimcsr0pisga0mngjh3n0",
  },
  playwest: {
    label: "Playwest",
    // The betting platform itself is playwestbet.com — playwest.com.au
    // redirects to a completely separate Shopify MERCHANDISE store
    // (shop.playwestbet.com), not the racing site, confirmed live.
    pageDomain: "playwestbet.com",
    bmapolloSlug: "playwest",
    apiKey: "1u6kr20mh5m0abotlefnc0c46s",
  },
  knucklebet: {
    label: "KnuckleBet",
    pageDomain: "knucklebet.com.au",
    bmapolloSlug: "knucklebet",
    apiKey: "5mqoe8m1veq72bl5ds0napssho",
  },
  marantellibet: {
    label: "MarantelliBet",
    pageDomain: "marantellibet.com",
    bmapolloSlug: "marantellibet",
    apiKey: "7kubhv2ig8v0moemo10rpmme6r",
  },
  // Second batch, user-requested — same platform, same discovery
  // method (the multi-tenant config table, found this time in
  // betestate.com.au's own build of the exact same shared client-*.js
  // bundle), each key independently re-verified live before being
  // trusted, same as the first batch above. CrownBet is a genuine
  // revival of the old (pre-BetEasy-merger) brand name on this
  // completely different, current platform — not the same company/
  // backend as the historical CrownBet at all, confirmed by its own
  // config entry living in this same BetMaker table.
  crownbet: {
    label: "CrownBet",
    pageDomain: "crownbet.com.au",
    bmapolloSlug: "crownbet",
    apiKey: "1b8vvipjgq694cqt6koarsuqrj",
  },
  swiftbet: {
    label: "Swiftbet",
    pageDomain: "swiftbet.com.au",
    bmapolloSlug: "swiftbet",
    apiKey: "2k7qfmkk7jaisoack274e4em7i",
  },
  ponybet: {
    label: "PonyBet",
    pageDomain: "ponybet.com.au",
    bmapolloSlug: "ponybet",
    apiKey: "1va9olufe5nbf1r704durfkfa5",
  },
  betaus: {
    label: "BetAus",
    pageDomain: "betaus.com.au",
    bmapolloSlug: "betaus",
    apiKey: "1unlh0pr8481dq638rstvtar92",
  },
  betlocal: {
    label: "BetLocal",
    pageDomain: "betlocal.com.au",
    bmapolloSlug: "betlocal",
    apiKey: "7qqln2722af772riki0m6okfqf",
  },
  betestate: {
    label: "BetEstate",
    pageDomain: "betestate.com.au",
    bmapolloSlug: "betestate",
    apiKey: "7e9lk0sk43o8u3ejdivdv87j4g",
  },
};

// Same upper-case racing type + AU/NZ-only filtering already confirmed
// live for OKEbet's own identical query shape — see js/okebet/api.js.
const BETMAKER_RACE_TYPE = { THOROUGHBRED: "horse", GREYHOUND: "greyhound", HARNESS: "harness" };

const BETMAKER_MEETINGS_BETWEEN_QUERY = `
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

// Identical reasoning/shape to okeBetTodayWindowUtc (js/okebet/api.js) —
// every BetMaker tenant's own meetingsBetween query shares the exact
// same backend, so the same confirmed-safe ~24h AEST-calendar-day
// window (well under the 32h limit OKEbet's own endpoint enforces) is
// reused here rather than re-deriving/re-verifying it per tenant.
function betMakerTodayWindowUtc() {
  const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;
  const nowAest = new Date(Date.now() + AEST_OFFSET_MS);
  const startUtc = new Date(
    Date.UTC(nowAest.getUTCFullYear(), nowAest.getUTCMonth(), nowAest.getUTCDate()) - AEST_OFFSET_MS
  );
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { startIso: startUtc.toISOString(), endIso: endUtc.toISOString() };
}

// Generic fetch for any one tenant's config (see BETMAKER_TENANTS above)
// — same flattened {type, meetingName, raceNumber, startTimeMs, id}
// shape every other bookie's own fetch{Bookie}NextEvents already uses,
// id being "<meetingSlug>/<raceSlug>" verbatim, same as OKEbet's own
// (no slugify algorithm to keep in sync with any tenant's own routing).
async function fetchBetMakerNextEvents(tenantConfig) {
  const { startIso, endIso } = betMakerTodayWindowUtc();
  const url = `https://racing.${tenantConfig.bmapolloSlug}.bmapollo.com/query`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": tenantConfig.apiKey },
    body: JSON.stringify({
      query: BETMAKER_MEETINGS_BETWEEN_QUERY,
      variables: { startDate: startIso, endDate: endIso },
      operationName: "meetingsBetween",
    }),
  });
  if (!response.ok) {
    throw new Error(`${tenantConfig.label} meetingsBetween error: HTTP ${response.status}`);
  }

  const { data, errors } = await response.json();
  if (errors?.length) {
    throw new Error(`${tenantConfig.label} meetingsBetween error: ${errors[0].message}`);
  }

  const events = [];
  for (const meeting of data?.meetingsBetween || []) {
    if (meeting.track.country !== "AUS" && meeting.track.country !== "NZL") continue;
    const type = BETMAKER_RACE_TYPE[meeting.type];
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

// e.g. https://readybet.com.au/racing/wodonga-636790926781449391/06-2123976/win
// — same "win" suffix and path shape OKEbet's own buildOkeBetRaceUrl
// already uses, confirmed live to be identical across every tenant
// (the shared race id resolves to the same real race URL shape on
// every one checked).
function buildBetMakerRaceUrl(tenantConfig, event) {
  return `https://${tenantConfig.pageDomain}/racing/${event.id}/win`;
}

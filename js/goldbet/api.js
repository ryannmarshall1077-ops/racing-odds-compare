// GoldBet's own public racing REST API — no auth required. Discovered
// by hooking window.fetch/XMLHttpRequest.prototype.open before clicking
// into a real race from the racing hub. Plain readable paths, no
// persisted-query hash fragility at all (same shape as Palmerbet's own
// feed) — "Betting System by GenerationWeb 201 (GenerationBet v1.7)",
// per the race page's own footer credit.
const GOLDBET_RACE_CARD_URL = "https://api.goldbet.com.au/v1/racing/race-card/today/A";

// GoldBet's own single-letter race_type, confirmed live against real
// meetings (Wodonga/Bowen thoroughbred = T, Albion Park harness = H,
// Angle Park greyhound = G) — mapped straight to this codebase's own
// sport.id convention, same idea as PointsBet's own POINTSBET_RACING_TYPE.
const GOLDBET_RACE_TYPE = { T: "horse", G: "greyhound", H: "harness" };

// The reverse mapping, for the URL builder below — confirmed live these
// are the literal path segment text GoldBet's own routing expects
// (e.g. "/racing/greyhound/angle-park/...").
const GOLDBET_URL_SEGMENT = { horse: "horse", greyhound: "greyhound", harness: "harness" };

async function fetchGoldBetNextEvents() {
  const response = await fetch(GOLDBET_RACE_CARD_URL);
  if (!response.ok) {
    throw new Error(`GoldBet race-card error: HTTP ${response.status}`);
  }

  const { data } = await response.json();

  // Flattened into the same {type, meetingName, raceNumber, startTimeMs,
  // id, description} shape every other bookie's own
  // fetch{Bookie}NextEvents already uses — description carried through
  // too (needed by buildGoldBetRaceUrl below to reconstruct the exact
  // slug GoldBet's own routing expects, unlike most other bookies' own
  // URLs which don't need the race's own title at all).
  //
  // is_australian (a plain boolean already on each meeting) used
  // directly rather than an explicit country-code allowlist — no NZ
  // meeting was seen live at all while building this (a full day's
  // real schedule checked), so NZ coverage under this flag is
  // unverified; revisit if that turns out wrong.
  const events = [];
  for (const meeting of data || []) {
    if (!meeting.is_australian) continue;
    const type = GOLDBET_RACE_TYPE[meeting.race_type];
    if (!type) continue;

    for (const race of meeting.races || []) {
      events.push({
        type,
        meetingName: meeting.meeting_name,
        description: race.description,
        raceNumber: race.race_number,
        startTimeMs: new Date(race.outcome_time).getTime(),
        id: race.event_id,
      });
    }
  }
  return events;
}

// GoldBet's own slugify: lowercase, every run of non-alphanumeric
// characters collapsed to a single hyphen, leading/trailing hyphens
// trimmed — confirmed live against several real races, including one
// with parentheses in its own title ("Fresh Pet Food Co (pbd Data)
// Maiden Stake Pr2 Divi" -> "fresh-pet-food-co-pbd-data-maiden-stake-
// pr2-divi").
function goldBetSlugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Builds a direct link to a specific race's page, e.g.
// https://goldbet.com.au/racing/horse/wodonga/baxters-concrete-bm62-handicap-race-4/2665760
// Both the venue AND the race-description segment must be exactly
// right — confirmed live: GoldBet's own routing 404s on a near-miss
// slug, unlike Ladbrokes'/BetRight's own id-only routing. The race
// segment is the race's own description, slugified, with "-race-<N>"
// appended (confirmed live: the real link for a race titled "Baxters
// Concrete Bm62 Handicap" is "baxters-concrete-bm62-handicap-race-4",
// not just the bare slugified description).
function buildGoldBetRaceUrl(event) {
  const segment = GOLDBET_URL_SEGMENT[event.type];
  const venueSlug = goldBetSlugify(event.meetingName);
  const descSlug = goldBetSlugify(event.description);
  return `https://goldbet.com.au/racing/${segment}/${venueSlug}/${descSlug}-race-${event.raceNumber}/${event.id}`;
}

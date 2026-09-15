// Shared client for every "Amused Group" white-label tenant running on
// "Black Stream" infrastructure — the same backend BetDeluxe's own
// already-shipped integration uses (js/betdeluxe/api.js), confirmed
// live to be shared not just in race-listing data but in ACTUAL PRICES
// too: the same real race's runner prices, fetched from
// api.blackstream.com.au, came back byte-for-byte identical whether
// requested from a yesbet.com.au tab or a betdeluxe.com.au tab. This is
// genuinely one backend wearing several different brand skins, not a
// shared-race-database-but-separate-pricing setup the way the BetMaker
// family (js/betmaker/api.js) turned out to be — there is no per-tenant
// key/header of any kind here at all.
//
// Because of that, there's no separate fetch function here the way
// js/betmaker/api.js's own fetchBetMakerNextEvents needs one per
// tenant: this file only builds each tenant's own race URL from an
// event BetDeluxe's own already-shipped fetchBetDeluxeNextEvents()
// found — background.js calls that ONE fetch, once, and reuses its
// result for every tenant below rather than re-fetching the exact same
// data 9 more times.
//
// BetDeluxe's own already-shipped files (js/betdeluxe/api.js,
// betdeluxeWatcher.js) are left untouched — every other Amused/
// Blackstream tenant is served through this shared module plus
// js/contentScripts/amusedWatcher.js instead, same "don't touch known-
// working shipped code" reasoning js/betmaker/api.js's own comment
// already documents for OKEbet.
const AMUSED_TENANTS = {
  // BetNation specifically needs the "www." prefix baked in here —
  // confirmed live: a cold direct navigation (exactly what
  // chrome.tabs.create/chrome.tabs.update do, unlike an in-page link
  // click) to a bare "betnation.com.au/racing/..." URL redirects to
  // its own bare homepage, silently dropping the whole race path —
  // "www.betnation.com.au" itself has no such issue, so requesting
  // that host directly just skips the broken hop entirely. User-
  // reported ("betnation doesn't open into the correct race" — every
  // race, not one specific one, which is what pointed at BetNation's
  // own routing rather than the shared meetId/raceId matching every
  // other Amused tenant already gets right). Checked live against
  // every other Amused tenant too — none of the other 8 have this
  // same bare-domain redirect bug, so this fix is BetNation-only.
  betnation: { label: "BetNation", pageDomain: "www.betnation.com.au" },
  bigbet: { label: "BigBet", pageDomain: "bigbet.com.au" },
  surge: { label: "Surge", pageDomain: "surge.com.au" },
  noisy: { label: "Noisy", pageDomain: "noisy.com.au" },
  pulsebet: { label: "PulseBet", pageDomain: "pulsebet.com.au" },
  betjet: { label: "BetJet", pageDomain: "betjet.com.au" },
  mightybet: { label: "MightyBet", pageDomain: "mightybet.com.au" },
  betexpress: { label: "BetExpress", pageDomain: "betexpress.com.au" },
  yesbet: { label: "YesBet", pageDomain: "yesbet.com.au" },
};

// Same case-sensitive path segment BETDELUXE_URL_SEGMENT (js/betdeluxe/
// api.js) already uses — duplicated here rather than referenced
// directly so this file stays self-contained (same reasoning every
// other bookie's own api.js here is self-contained), confirmed live to
// be identical across tenants: a real YesBet race link uses the exact
// same "/racing/Thoroughbred/AUS/<venue>/<meetId>/<raceNumber>/<raceId>"
// shape BetDeluxe's own does.
const AMUSED_URL_SEGMENT = { horse: "Thoroughbred", greyhound: "Greyhound", harness: "Harness" };

// event is one of fetchBetDeluxeNextEvents()'s own returned objects
// (already fetched once by background.js and matched to the current
// race) — reused here rather than re-fetched, since every Amused
// tenant's own race listing is confirmed identical to BetDeluxe's.
// Builds e.g. https://yesbet.com.au/racing/Greyhound/AUS/Bulli/800635/7/11416065
function buildAmusedRaceUrl(tenantConfig, event) {
  const segment = AMUSED_URL_SEGMENT[event.type];
  const venueSlug = event.meetingName.replace(/\s+/g, "-");
  return `https://${tenantConfig.pageDomain}/racing/${segment}/AUS/${venueSlug}/${event.meetId}/${event.raceNumber}/${event.id}`;
}

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
// Every one of these needs the "www." prefix baked in here — confirmed
// live, every one of these bare domains (e.g. "bigbet.com.au") 301-
// redirects to its own "www." version. That alone is harmless for a
// plain manual visit (the browser just follows the redirect once and
// stops), which is exactly why this was first mistaken for a
// BetNation-only bug (see the git history for that PR): a one-off
// manual test of the other 8 tenants at the time didn't turn up
// anything wrong.
//
// The real, extension-specific problem only shows up once
// background.js's own drift detection (ensureBookieTabMatchesExpectedUrl
// / the check inside applyBookieOdds — added to catch a tab silently
// wandering to the wrong race) is in the loop: `${bookieId}ExpectedUrl`
// gets stored as whatever buildAmusedRaceUrl below generated, which
// used to be the bare domain for 8 of these 9 tenants. The tab actually
// lands on the "www." version after the site's own redirect, so every
// single drift check saw that as a mismatch and re-navigated back to
// the bare URL — which redirects to "www." again — forever. User-
// reported as "it spins and nothing loads, but only when it opens
// automatically" (never when opened manually), which is exactly this
// self-inflicted reload loop: a human never triggers the periodic
// re-check that causes it. Baking "www." in here directly makes
// expectedUrl match the tab's real, final URL from the start, so the
// drift check never sees a mismatch and never re-navigates at all.
const AMUSED_TENANTS = {
  betnation: { label: "BetNation", pageDomain: "www.betnation.com.au" },
  bigbet: { label: "BigBet", pageDomain: "www.bigbet.com.au" },
  surge: { label: "Surge", pageDomain: "www.surge.com.au" },
  noisy: { label: "Noisy", pageDomain: "www.noisy.com.au" },
  pulsebet: { label: "PulseBet", pageDomain: "www.pulsebet.com.au" },
  betjet: { label: "BetJet", pageDomain: "www.betjet.com.au" },
  mightybet: { label: "MightyBet", pageDomain: "www.mightybet.com.au" },
  betexpress: { label: "BetExpress", pageDomain: "www.betexpress.com.au" },
  yesbet: { label: "YesBet", pageDomain: "www.yesbet.com.au" },
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

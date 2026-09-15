// Which bookmakers this extension compares against Betfair — shared
// between popup.js (rendering a column per bookie, opening their race
// tabs) and background.js (whose own BOOKIES extends each entry with
// scraping-specific fields: scraperFile, tabIdKey). Keeping the id/label
// pairing in one file means the two can't drift out of sync with each
// other; both load this file via their own mechanism (a <script> tag for
// popup.html, importScripts for the service worker).
const BOOKIE_LIST = [
  { id: "sportsbet", label: "Sportsbet", logo: "icons/bookies/sportsbet.png" },
  { id: "tab", label: "TAB", logo: "icons/bookies/tab.png" },
  { id: "ladbrokes", label: "Ladbrokes", logo: "icons/bookies/ladbrokes.png" },
  { id: "neds", label: "Neds", logo: "icons/bookies/neds.png" },
  { id: "pointsbet", label: "PointsBet", logo: "icons/bookies/pointsbet.png" },
  { id: "betr", label: "Betr", logo: "icons/bookies/betr.png" },
  { id: "tabtouch", label: "TABtouch", logo: "icons/bookies/tabtouch.png" },
  { id: "unibet", label: "Unibet", logo: "icons/bookies/unibet.png" },
  { id: "picklebet", label: "Picklebet", logo: "icons/bookies/picklebet.png" },
  { id: "palmerbet", label: "Palmerbet", logo: "icons/bookies/palmerbet.png" },
  { id: "betdeluxe", label: "BetDeluxe", logo: "icons/bookies/betdeluxe.png" },
  { id: "betright", label: "BetRight", logo: "icons/bookies/betright.png" },
  { id: "goldbet", label: "GoldBet", logo: "icons/bookies/goldbet.png" },
  { id: "okebet", label: "OKEbet", logo: "icons/bookies/okebet.png" },
  // The rest of the "BetMaker" platform family OKEbet is also part of
  // (confirmed live via a shared race-id database, identical GraphQL
  // feed shape, and identical DOM structure — see js/betmaker/api.js
  // for the full story). Terrybet is a confirmed real tenant of this
  // same platform too, but excluded here for now — its backend returned
  // a genuine "System is in maintenance" error on every attempt, both
  // through its own live site and via a direct API request; add it the
  // same way as any entry below once it's back up.
  { id: "readybet", label: "ReadyBet", logo: "icons/bookies/readybet.png" },
  { id: "realbookie", label: "RealBookie", logo: "icons/bookies/realbookie.png" },
  { id: "baggybet", label: "BaggyBet", logo: "icons/bookies/baggybet.png" },
  { id: "betyoucan", label: "BetYouCan", logo: "icons/bookies/betyoucan.png" },
  { id: "playwest", label: "Playwest", logo: "icons/bookies/playwest.png" },
  { id: "knucklebet", label: "KnuckleBet", logo: "icons/bookies/knucklebet.png" },
  { id: "marantellibet", label: "MarantelliBet", logo: "icons/bookies/marantellibet.png" },
  // The rest of the "Amused Group" / "Black Stream" platform family
  // BetDeluxe (above) is also part of — confirmed live to share not
  // just the race listing but the exact same PRICES too (see
  // js/amused/api.js for the full story). BetDeluxe's own entry stays
  // where it is above (already shipped, own dedicated files) — these 9
  // are the newly-added tenants, served through the shared
  // js/amused/api.js + amusedWatcher.js instead.
  { id: "betnation", label: "BetNation", logo: "icons/bookies/betnation.png" },
  { id: "bigbet", label: "BigBet", logo: "icons/bookies/bigbet.png" },
  { id: "surge", label: "Surge", logo: "icons/bookies/surge.png" },
  { id: "noisy", label: "Noisy", logo: "icons/bookies/noisy.png" },
  { id: "pulsebet", label: "PulseBet", logo: "icons/bookies/pulsebet.png" },
  { id: "betjet", label: "BetJet", logo: "icons/bookies/betjet.png" },
  { id: "mightybet", label: "MightyBet", logo: "icons/bookies/mightybet.png" },
  { id: "betexpress", label: "BetExpress", logo: "icons/bookies/betexpress.png" },
  { id: "yesbet", label: "YesBet", logo: "icons/bookies/yesbet.png" },
  // The "BetCloud" platform family — confirmed live to share a race-id
  // database (the exact same venueId/raceId resolves to the same real
  // race on every tenant) and identical DOM structure, but NOT shared
  // pricing (each tenant's own Win price genuinely differs slightly —
  // see js/contentScripts/betcloudWatcher.js for the full story). DOM-
  // scraped only — BetCloud's own real API sends a proprietary
  // attestation header this project deliberately doesn't attempt to
  // replicate (same line drawn during the bet365 investigation).
  { id: "bet777", label: "Bet777", logo: "icons/bookies/bet777.png" },
  { id: "betgalaxy", label: "BetGalaxy", logo: "icons/bookies/betgalaxy.png" },
  { id: "betprofessor", label: "BetProfessor", logo: "icons/bookies/betprofessor.png" },
  { id: "chromabet", label: "ChromaBet", logo: "icons/bookies/chromabet.png" },
  { id: "goldenbet888", label: "GoldenBet888", logo: "icons/bookies/goldenbet888.png" },
  { id: "juicybet", label: "JuicyBet", logo: "icons/bookies/juicybet.png" },
  { id: "junglebet", label: "JungleBet", logo: "icons/bookies/junglebet.png" },
  { id: "questbet", label: "QuestBet", logo: "icons/bookies/questbet.png" },
  { id: "titanbet", label: "TitanBet", logo: "icons/bookies/titanbet.png" },
  { id: "wellbet", label: "WellBet", logo: "icons/bookies/wellbet.png" },
  { id: "epicodds", label: "EpicOdds", logo: "icons/bookies/epicodds.png" },
];

// Settings > Bookie's own tiered layout (user-requested, replacing a
// flat checkbox list) — grouped by underlying platform, exactly the
// grouping the user themselves gave: "Corporates" (each its own
// separate integration — a genuinely different backend/DOM per site),
// "Bet Makers" (js/betmaker/api.js's own shared GraphQL platform — every
// tenant OKEbet's own architecture turned out to be shared with, see
// that file's own comment for the full story), "Gen Web" (GoldBet's
// own "GenerationBet" platform — currently a single tenant, but its own
// footer credit ("Betting System by GenerationWeb 201") names the
// platform the same way BetMaker's tenants do, so it gets its own tier
// rather than being lumped into Corporates), "Amused" (js/amused/
// api.js's own shared "Black Stream" platform — user-specified this
// group explicitly by name and membership, moving BetDeluxe out of
// Corporates into it since it turned out to be the same backend as the
// other 9), and "BetCloud" (js/contentScripts/betcloudWatcher.js's own
// shared platform — user-specified again; unlike every other tier
// here, DOM-scraped only, since its real API is defended by a
// proprietary attestation header this project doesn't attempt to
// replicate). bookieTierSectionHtml (options.js) is the only reader of
// this — BOOKIE_LIST/BOOKIE_EXTRAS above are unaffected, so a bookie
// missing from every tier here would simply never render a checkbox at
// all rather than breaking anything else; every id in BOOKIE_LIST must
// appear in exactly one tier below.
const BOOKIE_TIERS = [
  {
    id: "corporates",
    label: "Corporates",
    description: "Each its own separate integration",
    bookieIds: [
      "sportsbet",
      "tab",
      "ladbrokes",
      "neds",
      "pointsbet",
      "betr",
      "tabtouch",
      "unibet",
      "picklebet",
      "palmerbet",
      "betright",
    ],
  },
  {
    id: "betmakers",
    label: "Bet Makers",
    description: 'Shared "BetMaker" platform white-label brands',
    bookieIds: [
      "okebet",
      "readybet",
      "realbookie",
      "baggybet",
      "betyoucan",
      "playwest",
      "knucklebet",
      "marantellibet",
    ],
  },
  {
    id: "genweb",
    label: "Gen Web",
    description: '"GenerationBet" platform white-label brands',
    bookieIds: ["goldbet"],
  },
  {
    id: "amused",
    label: "Amused",
    description: 'Shared "Black Stream" platform white-label brands',
    bookieIds: [
      "betdeluxe",
      "betnation",
      "bigbet",
      "surge",
      "noisy",
      "pulsebet",
      "betjet",
      "mightybet",
      "betexpress",
      "yesbet",
    ],
  },
  {
    id: "betcloud",
    label: "BetCloud",
    description: 'Shared "BetCloud" platform white-label brands',
    bookieIds: [
      "bet777",
      "betgalaxy",
      "betprofessor",
      "chromabet",
      "goldenbet888",
      "juicybet",
      "junglebet",
      "questbet",
      "titanbet",
      "wellbet",
      "epicodds",
    ],
  },
];

// Single-letter race-type code shown in the compact race-info bar (e.g.
// "Angle Park G1 (G)") and the sidebar's race cards — purely cosmetic,
// deliberately its own copy rather than shared with background.js's
// RACE_TYPE_TO_TAB_CODE (that one is safety-critical, verified TAB URL
// construction, and must stay R/H/G regardless of what this displays).
// horse -> "T" (Thoroughbred) to match the Upcoming Races filter pill's
// own T/H/G lettering, not TAB's own R/H/G scheme.
const RACE_TYPE_CODE = { horse: "T", harness: "H", greyhound: "G" };

// The main table's own mode tabs (#mode-tabs, popup.html) and the Daily
// Planner's own Promotion column (popup.js) both need this exact same
// id/label pairing — kept here, in one place, so a renamed/added mode
// can't leave the planner's dropdown quietly out of sync with the tabs
// themselves (they're two separate DOM trees, only ever meant to agree).
const PROMO_MODES = [
  { id: "mug", label: "Mug" },
  { id: "bonus", label: "Bonus" },
  { id: "run2nd3rd", label: "Run 2nd 3rd" },
  { id: "run2nd", label: "Run 2nd" },
  // Same 2nd-place trigger as "run2nd" above, but the bookmaker pays
  // the FULL win price as real cash if it comes 2nd, instead of a
  // smaller bonus-bet-equivalent refund. Its own EV is a raw, unhedged
  // 3-outcome calculation (no Betfair lay, no commission) rather than
  // this file's usual hedge-blended QL approach, and only computable
  // when a race has a real 2- or 3-place Betfair place market (a
  // 55/45 rule-of-thumb split isolates Pr(2nd) from a 3-place one) —
  // see popup.js's run2ndWinEVPercent for the full formula/derivation.
  { id: "run2ndwin", label: "Run 2nd You Win" },
];

// The Daily Planner's own Promotion dropdown only ever offers the
// place-triggered promo modes — user-requested: planning ahead only
// makes sense for those (Mug/Bonus aren't the kind of thing you
// schedule a specific race for in advance). Derived from PROMO_MODES
// rather than its own separate list, so a label change to any of them
// still only needs updating in one place.
const PLANNER_PROMO_MODES = PROMO_MODES.filter(
  (m) => m.id === "run2nd3rd" || m.id === "run2nd" || m.id === "run2ndwin"
);

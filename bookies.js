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
];

// The Daily Planner's own Promotion dropdown only ever offers these two
// — user-requested: planning ahead only makes sense for the place-
// promo modes (Mug/Bonus aren't the kind of thing you schedule a
// specific race for in advance). Derived from PROMO_MODES rather than
// its own separate list, so a label change to either mode still only
// needs updating in one place.
const PLANNER_PROMO_MODES = PROMO_MODES.filter((m) => m.id === "run2nd3rd" || m.id === "run2nd");

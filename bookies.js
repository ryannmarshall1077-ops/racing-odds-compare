// Which bookmakers this extension compares against Betfair — shared
// between popup.js (rendering a column per bookie, opening their race
// tabs) and background.js (whose own BOOKIES extends each entry with
// scraping-specific fields: scraperFile, tabIdKey). Keeping the id/label
// pairing in one file means the two can't drift out of sync with each
// other; both load this file via their own mechanism (a <script> tag for
// popup.html, importScripts for the service worker).
const BOOKIE_LIST = [
  { id: "sportsbet", label: "Sportsbet" },
  { id: "tab", label: "TAB" },
  { id: "ladbrokes", label: "Ladbrokes" },
];

// Single-letter race-type code shown in the compact race-info bar (e.g.
// "Angle Park G1 (G)") and the sidebar's race cards — purely cosmetic,
// deliberately its own copy rather than shared with background.js's
// RACE_TYPE_TO_TAB_CODE (that one is safety-critical, verified TAB URL
// construction, and must stay R/H/G regardless of what this displays).
// horse -> "T" (Thoroughbred) to match the Upcoming Races filter pill's
// own T/H/G lettering, not TAB's own R/H/G scheme.
const RACE_TYPE_CODE = { horse: "T", harness: "H", greyhound: "G" };

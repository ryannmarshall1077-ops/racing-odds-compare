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
];

// Single-letter race-type code shown in the compact race-info bar (e.g.
// "Angle Park R1 (G)") — same R/H/G scheme TAB's own race URLs use (see
// RACE_TYPE_TO_TAB_CODE in background.js), duplicated here rather than
// shared with it since that one is safety-critical (verified TAB URL
// construction) and this one is purely cosmetic.
const RACE_TYPE_CODE = { horse: "R", harness: "H", greyhound: "G" };

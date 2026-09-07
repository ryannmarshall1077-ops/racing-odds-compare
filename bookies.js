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

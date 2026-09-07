// User-configurable preferences — separate from Betfair credentials (which
// stay in their own chrome.storage.sync keys, set up in options.html's
// "Betfair Connection" section) and from a race's live-session state (Mode/
// Stake/Hedge/Sort/Race Types can all still be changed per-session in the
// main popup without touching these — these are just what a fresh session
// *starts* from).
//
// Stored in chrome.storage.sync, not .local, so they survive a full
// extension reinstall — same reasoning as the Betfair credentials.
const DEFAULT_SETTINGS = {
  // Race Result / Display
  defaultMode: "mug",
  defaultSort: "edge",
  defaultStake: 50,
  defaultHedge: 100,
  defaultRaceTypes: ["horse", "harness", "greyhound"],
  showCountdowns: true,

  // Tab and Window management
  pinRaceTabs: false,
  focusRaceTabsOnOpen: false,

  // Other Behaviour and Functionality
  autoRefresh: true,

  // Colours and Layout
  accentColor: "#3ddc97",
  compactRows: false,
};

// Merges over DEFAULT_SETTINGS rather than returning the stored value
// as-is, so a setting added in a later version (not present in an
// existing user's stored object yet) still gets a sane value instead of
// undefined.
function loadSettings() {
  return chrome.storage.sync.get(["settings"]).then((stored) => ({
    ...DEFAULT_SETTINGS,
    ...(stored.settings || {}),
  }));
}

// Always writes a complete settings object back (loads current, applies
// the partial patch, saves the merged result) rather than a shallow
// storage.sync.set with just the changed keys, so callers never need to
// worry about clobbering fields they didn't touch.
function saveSettings(partial) {
  return loadSettings().then((current) => {
    const next = { ...current, ...partial };
    return chrome.storage.sync.set({ settings: next }).then(() => next);
  });
}

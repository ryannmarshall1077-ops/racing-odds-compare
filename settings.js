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
  // null = unlimited (matches the existing behavior of showing every
  // runner) — not defaulted to HorsePower's "10" since our races are
  // typically small fields where a cap would rarely matter, and silently
  // truncating an existing user's table isn't a change to make by default.
  maxResults: null,
  // Percentage POINTS knocked off whatever commissionForTrack() would
  // otherwise return (e.g. 2 on an 8% track -> 6% used everywhere) — for
  // a Betfair account with a loyalty/volume discount off the standard
  // Market Base Rate. 0 = no discount, matches every rate we've verified
  // so far.
  commissionDiscount: 0,
  // NOT yet consumed by Bonus Mode's Ret% column — that's still correctly
  // computed live per-runner from real odds (bonusRetentionPercent(),
  // verified against real HorsePower output). This mirrors HorsePower's
  // own "Default retention" field, which per its own hint text is a
  // fallback/target rather than what drives their real Ret% either — held
  // here as infrastructure for the still-unbuilt Run 2nd 3rd EV column
  // (see README's "EV deliberately NOT implemented" note), which does
  // need a retention *assumption* rather than a per-runner calculation.
  defaultRetention: 80,
  showLiquidityColumn: true,
  showLiabilityColumn: false,
  // Dollars — null = unlimited. Rows whose liability (Lay $ × (Betfair
  // odds - 1) — what you'd owe if the lay bet loses) exceeds this are
  // filtered out of the displayed table entirely, not just flagged.
  maxLiability: null,

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

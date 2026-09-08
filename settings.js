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
  // Scratched (Betfair status REMOVED) runners default to showing as
  // grayed-out placeholder rows — a full-field view. Off hides them
  // entirely instead, for anyone who'd rather just not see them.
  showScratchedRunners: true,
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

  // EV Colours and Thresholds — 4 ascending colour tiers, each with its
  // own per-row threshold (different scales: Mug's Edge% can run deeply
  // negative, Bonus's Ret% is normally 0-100%, Promo is a placeholder for
  // whenever Run 2nd 3rd/Run 2nd actually compute one) and colour. A
  // cell's Edge%/Ret% is coloured with the highest tier whose threshold
  // it meets or exceeds; below every tier's threshold it uses
  // edgeBelowThresholdColor instead. Promo covers both still-disabled
  // modes (one shared threshold set, not two) since neither has a
  // verified EV formula yet to tell them apart by.
  edgeColorBands: [
    { color: "#e69138", thresholds: { mug: -15, bonus: 50, promo: 0 } },
    { color: "#f1c232", thresholds: { mug: -10, bonus: 60, promo: 5 } },
    { color: "#93c47d", thresholds: { mug: -5, bonus: 70, promo: 10 } },
    { color: "#6aa84f", thresholds: { mug: -2, bonus: 80, promo: 15 } },
  ],
  // The catch-all colour for a value that doesn't clear even the lowest
  // tier above — no threshold of its own (it's whatever's left over once
  // the 4 tiers above don't match), just a colour. Defaults to the same
  // red already used elsewhere for "bad" (--accent-neg).
  edgeBelowThresholdColor: "#ff6b6b",
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

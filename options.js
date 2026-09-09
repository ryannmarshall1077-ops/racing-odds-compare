// --- Betfair Connection (unchanged behavior, just a renamed status el id
// now that the page has a second, separate status line for settings) ---

const form = document.getElementById("betfair-form");
const betfairStatusEl = document.getElementById("betfair-status");
const appKeyEl = document.getElementById("app-key");
const usernameEl = document.getElementById("username");
const passwordEl = document.getElementById("password");

function setBetfairStatus(message, kind) {
  betfairStatusEl.textContent = message;
  betfairStatusEl.className = `status ${kind}`;
}

// Credentials live in chrome.storage.sync, not .local — deliberately, so
// login survives a full extension removal/reinstall (e.g. this folder
// getting deleted and reloaded) instead of needing to be re-entered every
// time. This does mean they're stored via the user's Google account
// (Chrome Sync), not purely on this device — see the notice in the page.
chrome.storage.sync.get(["betfairAppKey", "betfairUsername"], (saved) => {
  if (saved.betfairAppKey) appKeyEl.value = saved.betfairAppKey;
  if (saved.betfairUsername) usernameEl.value = saved.betfairUsername;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const appKey = appKeyEl.value.trim();
  const username = usernameEl.value.trim();
  const password = passwordEl.value;

  if (!appKey || !username || !password) {
    setBetfairStatus("All fields are required.", "error");
    return;
  }

  setBetfairStatus("Logging in...", "");

  try {
    const sessionToken = await betfairLogin(appKey, username, password);

    await chrome.storage.sync.set({
      betfairAppKey: appKey,
      betfairUsername: username,
      betfairPassword: password,
      betfairSessionToken: sessionToken,
      betfairSessionTokenAt: Date.now(),
    });

    setBetfairStatus("Connected — session token saved.", "ok");
  } catch (err) {
    setBetfairStatus(err.message, "error");
  }
});

// --- Settings (Race Result/Display, Tab & Window, Other Behaviour, Colours) ---

const settingsStatusEl = document.getElementById("settings-status");
let settingsStatusTimer = null;

function flashSettingsStatus(message) {
  settingsStatusEl.textContent = message;
  clearTimeout(settingsStatusTimer);
  settingsStatusTimer = setTimeout(() => {
    settingsStatusEl.textContent = "";
  }, 1500);
}

const settingFields = {
  defaultMode: document.getElementById("setting-default-mode"),
  defaultSort: document.getElementById("setting-default-sort"),
  defaultStake: document.getElementById("setting-default-stake"),
  defaultHedge: document.getElementById("setting-default-hedge"),
  showCountdowns: document.getElementById("setting-show-countdowns"),
  maxResults: document.getElementById("setting-max-results"),
  commissionDiscount: document.getElementById("setting-commission-discount"),
  defaultRetention: document.getElementById("setting-default-retention"),
  showLiquidityColumn: document.getElementById("setting-show-liquidity-column"),
  showLiabilityColumn: document.getElementById("setting-show-liability-column"),
  showScratchedRunners: document.getElementById("setting-show-scratched-runners"),
  maxLiability: document.getElementById("setting-max-liability"),
  pinRaceTabs: document.getElementById("setting-pin-race-tabs"),
  focusRaceTabsOnOpen: document.getElementById("setting-focus-race-tabs"),
  autoRefresh: document.getElementById("setting-auto-refresh"),
  accentColor: document.getElementById("setting-accent-color"),
  compactRows: document.getElementById("setting-compact-rows"),
};

// maxResults/maxLiability are the only "blank = unlimited" fields — an
// empty string reads as null there, not 0 (Number("") === 0, which would
// silently mean "show nothing"/"allow no liability" instead of "no limit").
const nullableFields = new Set(["maxResults", "maxLiability"]);

const raceTypeCheckboxes = {
  horse: document.getElementById("setting-race-type-horse"),
  harness: document.getElementById("setting-race-type-harness"),
  greyhound: document.getElementById("setting-race-type-greyhound"),
};

// Settings > Bookie — built from BOOKIE_LIST (bookies.js) rather than a
// fixed set of ids like raceTypeCheckboxes above: bookies get added to
// this extension over time (Sportsbet/TAB/Ladbrokes so far), and a new
// one should show up here automatically rather than needing its own
// checkbox added by hand every time. Each checkbox saves the full
// selection immediately on change, same pattern as race types.
const bookieCheckboxesEl = document.getElementById("bookie-checkboxes");
const bookieCheckboxes = {};
for (const bookie of BOOKIE_LIST) {
  const label = document.createElement("label");
  label.className = "checkbox-label";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = `setting-bookie-${bookie.id}`;
  label.append(checkbox, ` ${bookie.label}`);
  bookieCheckboxesEl.append(label);
  bookieCheckboxes[bookie.id] = checkbox;
}

function selectedBookiesFromForm() {
  return Object.entries(bookieCheckboxes)
    .filter(([, checkbox]) => checkbox.checked)
    .map(([id]) => id);
}

for (const checkbox of Object.values(bookieCheckboxes)) {
  checkbox.addEventListener("change", () => {
    saveSettings({ enabledBookies: selectedBookiesFromForm() }).then(() =>
      flashSettingsStatus("Saved")
    );
  });
}

// Reflects a settings object into every control on the page — used both on
// initial load and after "Restore defaults", so the two never drift out of
// sync with each other.
// Same THEME_DEFAULT_ACCENT idea popup.js's own applyTheme()/
// applyDisplaySettings() use, duplicated rather than shared since this
// file also runs standalone on options.html (no popup.js there at all)
// — an untouched accentColor should still resolve to each theme's own
// legible default here too, not just inside the popup.
function applyThemeToPage(settings) {
  document.documentElement.dataset.theme = settings.theme;
  const themeDefaultAccent = settings.theme === "light" ? "#1f9d68" : DEFAULT_SETTINGS.accentColor;
  const accentColor =
    settings.accentColor === DEFAULT_SETTINGS.accentColor ? themeDefaultAccent : settings.accentColor;
  document.documentElement.style.setProperty("--accent", accentColor);
}

// Settings > Display > "Metric display" — a 3-way pill toggle
// (Edge %/EV $/Off) rather than a native <select>, same custom-control
// treatment as the EV Colours swatches below: no single form control to
// read a .value off, so this saves itself directly on click instead of
// going through the generic settingFields loop further down.
const metricDisplayBtns = [...document.querySelectorAll(".metric-display-btn")];

function applyMetricDisplayToForm(value) {
  for (const btn of metricDisplayBtns) {
    btn.classList.toggle("active", btn.dataset.value === value);
  }
}

metricDisplayBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    applyMetricDisplayToForm(btn.dataset.value);
    saveSettings({ metricDisplay: btn.dataset.value }).then(() => flashSettingsStatus("Saved"));
  });
});

function applySettingsToForm(settings) {
  applyThemeToPage(settings);
  settingFields.defaultMode.value = settings.defaultMode;
  settingFields.defaultSort.value = settings.defaultSort;
  settingFields.defaultStake.value = settings.defaultStake;
  settingFields.defaultHedge.value = settings.defaultHedge;
  applyMetricDisplayToForm(settings.metricDisplay);
  settingFields.showCountdowns.checked = settings.showCountdowns;
  settingFields.maxResults.value = settings.maxResults ?? "";
  settingFields.commissionDiscount.value = settings.commissionDiscount;
  settingFields.defaultRetention.value = settings.defaultRetention;
  settingFields.showLiquidityColumn.checked = settings.showLiquidityColumn;
  settingFields.showLiabilityColumn.checked = settings.showLiabilityColumn;
  settingFields.showScratchedRunners.checked = settings.showScratchedRunners;
  settingFields.maxLiability.value = settings.maxLiability ?? "";
  settingFields.pinRaceTabs.checked = settings.pinRaceTabs;
  settingFields.focusRaceTabsOnOpen.checked = settings.focusRaceTabsOnOpen;
  settingFields.autoRefresh.checked = settings.autoRefresh;
  settingFields.accentColor.value = settings.accentColor;
  settingFields.compactRows.checked = settings.compactRows;

  for (const [type, checkbox] of Object.entries(raceTypeCheckboxes)) {
    checkbox.checked = settings.defaultRaceTypes.includes(type);
  }

  for (const [id, checkbox] of Object.entries(bookieCheckboxes)) {
    checkbox.checked = settings.enabledBookies.includes(id);
  }

  applyEdgeBandsToForm(settings.edgeColorBands);
  applyEdgeBelowColorToForm(settings.edgeBelowThresholdColor);
}

function selectedRaceTypesFromForm() {
  return Object.entries(raceTypeCheckboxes)
    .filter(([, checkbox]) => checkbox.checked)
    .map(([type]) => type);
}

// --- EV Colours and Thresholds ---
// 4 fixed bands (not user-extensible), each a colour + a threshold per
// mode. Bands are queried by data-band rather than assuming DOM order
// matches array order, in case markup ever gets reordered.
const EDGE_BAND_MODES = ["mug", "bonus", "promo"];
const evBandEls = [0, 1, 2, 3].map((i) => ({
  box: document.querySelector(`.ev-band[data-band="${i}"]`),
  color: document.querySelector(`.ev-band-color[data-band="${i}"]`),
  hex: document.querySelector(`.ev-band-hex[data-band="${i}"]`),
  thresholds: Object.fromEntries(
    EDGE_BAND_MODES.map((mode) => [
      mode,
      document.querySelector(`.ev-band-threshold[data-band="${i}"][data-mode="${mode}"]`),
    ])
  ),
}));

// Accepts with or without a leading "#", 3 or 6 hex digits (typed hex
// codes are easy to get wrong) — returns a normalized "#rrggbb", or null
// if it's not a valid colour at all, so an in-progress/invalid edit isn't
// saved over a previously-good value.
function normalizeHex(value) {
  const trimmed = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed
      .toLowerCase()
      .split("")
      .map((c) => c + c)
      .join("")}`;
  }
  return null;
}

function applyEdgeBandsToForm(bands) {
  evBandEls.forEach((els, i) => {
    const band = bands[i];
    els.color.value = band.color;
    els.hex.value = band.color.replace("#", "").toUpperCase();
    els.box.style.borderColor = band.color;
    for (const mode of EDGE_BAND_MODES) {
      els.thresholds[mode].value = band.thresholds[mode];
    }
  });
}

function saveEdgeBands() {
  const bands = evBandEls.map((els) => ({
    color: els.color.value,
    thresholds: Object.fromEntries(
      EDGE_BAND_MODES.map((mode) => [mode, Number(els.thresholds[mode].value) || 0])
    ),
  }));
  saveSettings({ edgeColorBands: bands }).then(() => flashSettingsStatus("Saved"));
}

evBandEls.forEach((els) => {
  els.color.addEventListener("input", () => {
    els.hex.value = els.color.value.replace("#", "").toUpperCase();
    els.box.style.borderColor = els.color.value;
    saveEdgeBands();
  });

  els.hex.addEventListener("change", () => {
    const normalized = normalizeHex(els.hex.value);
    if (!normalized) {
      // Invalid entry — revert to whatever the swatch still holds rather
      // than saving garbage or leaving the two controls out of sync.
      els.hex.value = els.color.value.replace("#", "").toUpperCase();
      return;
    }
    els.color.value = normalized;
    els.hex.value = normalized.replace("#", "").toUpperCase();
    els.box.style.borderColor = normalized;
    saveEdgeBands();
  });

  for (const mode of EDGE_BAND_MODES) {
    els.thresholds[mode].addEventListener("change", saveEdgeBands);
  }
});

// The catch-all colour for a value that doesn't clear even the lowest
// tier above — same swatch/hex sync pattern as each band, just no
// threshold of its own and no per-band array index (a single setting,
// not part of edgeColorBands).
const edgeBelowColorEl = document.getElementById("setting-edge-below-color");
const edgeBelowHexEl = document.getElementById("setting-edge-below-hex");
const edgeBelowBoxEl = edgeBelowColorEl.closest(".ev-band");

function applyEdgeBelowColorToForm(color) {
  edgeBelowColorEl.value = color;
  edgeBelowHexEl.value = color.replace("#", "").toUpperCase();
  edgeBelowBoxEl.style.borderColor = color;
}

edgeBelowColorEl.addEventListener("input", () => {
  edgeBelowHexEl.value = edgeBelowColorEl.value.replace("#", "").toUpperCase();
  edgeBelowBoxEl.style.borderColor = edgeBelowColorEl.value;
  saveSettings({ edgeBelowThresholdColor: edgeBelowColorEl.value }).then(() =>
    flashSettingsStatus("Saved")
  );
});

edgeBelowHexEl.addEventListener("change", () => {
  const normalized = normalizeHex(edgeBelowHexEl.value);
  if (!normalized) {
    edgeBelowHexEl.value = edgeBelowColorEl.value.replace("#", "").toUpperCase();
    return;
  }
  edgeBelowColorEl.value = normalized;
  edgeBelowHexEl.value = normalized.replace("#", "").toUpperCase();
  edgeBelowBoxEl.style.borderColor = normalized;
  saveSettings({ edgeBelowThresholdColor: normalized }).then(() => flashSettingsStatus("Saved"));
});

loadSettings().then(applySettingsToForm);

// Each control saves itself the moment it changes — no separate "Save"
// button to remember to click, consistent with how Stake/Hedge already
// auto-apply in the main popup. A quick "Saved" flash confirms it without
// needing a persistent banner.
for (const [key, el] of Object.entries(settingFields)) {
  el.addEventListener("change", () => {
    let value;
    if (el.type === "checkbox") value = el.checked;
    else if (el.type === "number") {
      value = el.value === "" ? (nullableFields.has(key) ? null : 0) : Number(el.value);
    } else value = el.value; // select (mode/sort) and color both read fine as strings

    saveSettings({ [key]: value }).then(() => flashSettingsStatus("Saved"));
  });
}

for (const checkbox of Object.values(raceTypeCheckboxes)) {
  checkbox.addEventListener("change", () => {
    saveSettings({ defaultRaceTypes: selectedRaceTypesFromForm() }).then(() =>
      flashSettingsStatus("Saved")
    );
  });
}

document.getElementById("restore-defaults-btn").addEventListener("click", () => {
  chrome.storage.sync.set({ settings: DEFAULT_SETTINGS }).then(() => {
    applySettingsToForm(DEFAULT_SETTINGS);
    flashSettingsStatus("Restored defaults");
  });
});

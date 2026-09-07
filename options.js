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
  pinRaceTabs: document.getElementById("setting-pin-race-tabs"),
  focusRaceTabsOnOpen: document.getElementById("setting-focus-race-tabs"),
  autoRefresh: document.getElementById("setting-auto-refresh"),
  accentColor: document.getElementById("setting-accent-color"),
  compactRows: document.getElementById("setting-compact-rows"),
};

const raceTypeCheckboxes = {
  horse: document.getElementById("setting-race-type-horse"),
  harness: document.getElementById("setting-race-type-harness"),
  greyhound: document.getElementById("setting-race-type-greyhound"),
};

// Reflects a settings object into every control on the page — used both on
// initial load and after "Restore defaults", so the two never drift out of
// sync with each other.
function applySettingsToForm(settings) {
  settingFields.defaultMode.value = settings.defaultMode;
  settingFields.defaultSort.value = settings.defaultSort;
  settingFields.defaultStake.value = settings.defaultStake;
  settingFields.defaultHedge.value = settings.defaultHedge;
  settingFields.showCountdowns.checked = settings.showCountdowns;
  settingFields.pinRaceTabs.checked = settings.pinRaceTabs;
  settingFields.focusRaceTabsOnOpen.checked = settings.focusRaceTabsOnOpen;
  settingFields.autoRefresh.checked = settings.autoRefresh;
  settingFields.accentColor.value = settings.accentColor;
  settingFields.compactRows.checked = settings.compactRows;

  for (const [type, checkbox] of Object.entries(raceTypeCheckboxes)) {
    checkbox.checked = settings.defaultRaceTypes.includes(type);
  }
}

function selectedRaceTypesFromForm() {
  return Object.entries(raceTypeCheckboxes)
    .filter(([, checkbox]) => checkbox.checked)
    .map(([type]) => type);
}

loadSettings().then(applySettingsToForm);

// Each control saves itself the moment it changes — no separate "Save"
// button to remember to click, consistent with how Stake/Hedge already
// auto-apply in the main popup. A quick "Saved" flash confirms it without
// needing a persistent banner.
for (const [key, el] of Object.entries(settingFields)) {
  el.addEventListener("change", () => {
    let value;
    if (el.type === "checkbox") value = el.checked;
    else if (el.type === "number") value = Number(el.value);
    else value = el.value; // select (mode/sort) and color both read fine as strings

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

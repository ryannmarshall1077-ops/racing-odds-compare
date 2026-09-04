const form = document.getElementById("betfair-form");
const statusEl = document.getElementById("status");
const appKeyEl = document.getElementById("app-key");
const usernameEl = document.getElementById("username");
const passwordEl = document.getElementById("password");

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`;
}

chrome.storage.local.get(["betfairAppKey", "betfairUsername"], (saved) => {
  if (saved.betfairAppKey) appKeyEl.value = saved.betfairAppKey;
  if (saved.betfairUsername) usernameEl.value = saved.betfairUsername;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const appKey = appKeyEl.value.trim();
  const username = usernameEl.value.trim();
  const password = passwordEl.value;

  if (!appKey || !username || !password) {
    setStatus("All fields are required.", "error");
    return;
  }

  setStatus("Logging in...", "");

  try {
    const sessionToken = await betfairLogin(appKey, username, password);

    await chrome.storage.local.set({
      betfairAppKey: appKey,
      betfairUsername: username,
      betfairPassword: password,
      betfairSessionToken: sessionToken,
      betfairSessionTokenAt: Date.now(),
    });

    setStatus("Connected — session token saved.", "ok");
  } catch (err) {
    setStatus(err.message, "error");
  }
});

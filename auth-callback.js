// Supabase's own GoTrue redirect puts the session directly in this
// page's own URL fragment (#access_token=...&refresh_token=...&
// expires_in=...) — the same shape its client-side JS SDK parses on
// a normal web page, so no extra request is needed here just to get
// these values. Same expiresAt convention as popup.js's own
// isLoggedIn (a session past it is treated as no session at all).
(async () => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const expiresIn = Number(params.get("expires_in"));

  if (accessToken) {
    await chrome.storage.local.set({
      discordSession: {
        accessToken,
        refreshToken,
        expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
      },
    });
  }
  // No accessToken at all (Discord/Supabase sent an error back instead
  // — e.g. params.get("error_description")) — nothing to store, just
  // hand off to popup.js's own auth gate below, which will correctly
  // show the login screen again rather than silently pretending to
  // have signed in.

  window.location.href = chrome.runtime.getURL("popup.html");
})();

// Supabase's own GoTrue redirect puts the session directly in this
// page's own URL fragment (#access_token=...&refresh_token=...&
// expires_in=...&provider_token=...) — the same shape its client-side
// JS SDK parses on a normal web page, so no extra request is needed
// here just to get these values. Same expiresAt convention as
// popup.js's own isLoggedIn (a session past it is treated as no
// session at all).
//
// provider_token is Discord's own OAuth token (not Supabase's) —
// captured here because it's ONLY ever available right after login,
// straight from this redirect; there's no way to fetch it again
// later. popup.js's own membership check needs it to ask Discord
// directly whether this account still holds the paid member role,
// the exact same "Discord decides, never something the caller could
// just assert" check the Betting Blueprint site's own /auth/callback
// route already does for a normal website login.
(async () => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const providerToken = params.get("provider_token");
  const expiresIn = Number(params.get("expires_in"));

  if (accessToken) {
    await chrome.storage.local.set({
      discordSession: {
        accessToken,
        refreshToken,
        providerToken,
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

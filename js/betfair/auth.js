// Betfair interactive login (https://identitysso.betfair.com/api/login).
// Suitable for a Delayed application key used from a browser extension.
// Returns a session token on success, throws with Betfair's loginStatus on failure.
async function betfairLogin(appKey, username, password) {
  const response = await fetch("https://identitysso.betfair.com/api/login", {
    method: "POST",
    headers: {
      "X-Application": appKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ username, password }).toString(),
  });

  const data = await response.json();

  if (data.status !== "SUCCESS") {
    throw new Error(`Betfair login failed: ${data.error || data.status}`);
  }

  return data.token;
}

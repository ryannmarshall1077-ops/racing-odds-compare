// Injected on demand via chrome.scripting.executeScript against a
// tracked BetCloud tab (Bet777, BetGalaxy, BetProfessor, ChromaBet,
// GoldenBet888, JuicyBet, JungleBet, QuestBet, TitanBet, WellBet,
// EpicOdds — see js/contentScripts/betcloudWatcher.js for the full
// "shared platform" story), as part of background.js's
// scrapeBookieTab() — called once per auto-refresh cycle to keep that
// bookie's column current between betcloudWatcher.js's own live
// DOM-driven pushes.
//
// DOM-scraped rather than calling BetCloud's own REST API directly
// (`api.<tenant>.com.au/punter/...`, discovered live) — that API sends
// a proprietary `x-bc-attn` attestation header on every request, a
// per-request opaque token that looks like a bot-detection/fraud-
// prevention signature. Reverse-engineering or replicating that token
// to call the API directly would be exactly the kind of anti-automation
// bypass this project deliberately avoids (same line drawn during the
// bet365 investigation) — reading the DOM the page's own legitimate,
// already-attested request already rendered has no such concern at
// all, so that's the only approach used here.
//
// Selectors verified live across every one of these tenants — see
// betcloudWatcher.js's own comment for the full per-tenant
// verification story. `data-cy` attributes are Cypress test hooks
// (React/Chakra UI), about as stable an anchor as a selector can be.
(() => {
  const runners = [];

  for (const row of document.querySelectorAll('[data-cy="raceRunnerListItem"]')) {
    const name = row.querySelector('[data-cy="displayName"]')?.textContent.trim();
    const winBtn = row.querySelector('[data-cy="selectWin"]');
    // The price is always the LAST direct-child <p> of .btn-span — for
    // the favourite runner specifically, that same button also has an
    // earlier sibling <div> (a "Fav" badge, its own nested <p>text</p>)
    // that a plain `winBtn.textContent` would concatenate onto the
    // price ("Fav1.46") — confirmed live. The direct-child selector
    // skips that nested text entirely, no string-stripping needed.
    const priceEl = winBtn?.querySelector(".btn-span > p");
    const price = priceEl ? parseFloat(priceEl.textContent.trim()) : NaN;

    // A scratched runner (confirmed live against 2 real scratchings)
    // has no selectWin button at all — naturally excluded here, no
    // separate filtering needed, same convention every other bookie's
    // own scraper here already follows.
    if (name && !Number.isNaN(price)) runners.push({ name, price });
  }

  return { runners, scrapedAt: Date.now(), url: location.href };
})();

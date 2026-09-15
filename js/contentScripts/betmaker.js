// Injected on demand via chrome.scripting.executeScript against a
// tracked BetMaker-tenant tab (ReadyBet, RealBookie, BaggyBet,
// BetYouCan, Playwest, KnuckleBet, MarantelliBet — see
// js/betmaker/api.js for the full "shared platform" story), as part of
// background.js's scrapeBookieTab() — called once per auto-refresh
// cycle to keep that bookie's column current between
// betmakerWatcher.js's own live DOM-driven pushes.
//
// Content-identical to js/contentScripts/okebet.js (OKEbet is the same
// underlying platform, confirmed live, but already shipped with its own
// dedicated files before this shared module existed — left untouched
// rather than repointed, to avoid touching known-working shipped code).
// Duplicated rather than shared via a helper file since a one-shot
// scraper's return value is the last-evaluated expression of the
// injected script itself, not a normal function — see
// betmakerWatcher.js's own comment for why the watcher (a persistent
// script, not one-shot) can't just reuse this file either. Selectors
// verified live across every one of these tenants (see
// betmakerWatcher.js for the per-tenant verification story, including
// KnuckleBet's differently-built frontend still matching).
(() => {
  const runners = [];

  for (const label of document.querySelectorAll(".gs-runner-name-label")) {
    let row = null;
    let cur = label;
    for (let i = 0; i < 12 && cur; i++) {
      if (cur.querySelectorAll("button").length === 2) {
        row = cur;
        break;
      }
      cur = cur.parentElement;
    }
    if (!row) continue;

    const name = label.textContent.trim().replace(/\(\d+\)$/, "").trim();
    const winButton = row.querySelectorAll("button")[0];
    const price = parseFloat(winButton?.querySelector("span")?.textContent.trim());

    if (name && !Number.isNaN(price)) runners.push({ name, price });
  }

  return { runners, scrapedAt: Date.now(), url: location.href };
})();

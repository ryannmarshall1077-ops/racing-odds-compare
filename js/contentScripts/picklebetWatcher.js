// Persistent content script (declared in manifest.json, auto-injected on
// every Picklebet race page load/navigation) that watches for
// Picklebet's own front-end updating Win odds, and pushes fresh values
// to background.js the moment they change — same MutationObserver
// approach as every DOM-scraping bookie's own watcher here (Picklebet's
// live odds turned out to have no fetch/XHR/WebSocket call this
// extension could hook at all — confirmed live: its own bundle must
// grab a `fetch` reference before any post-hoc window.fetch hook
// installed here could ever see it — so this reads the rendered DOM
// instead, same as Betr/TABtouch already do).
//
// A CSS-module build (`Competitor-module--competitor--097b2`,
// `Outcome-module--label--588e6`, ...) — every selector below matches
// on the stable, human-readable PREFIX of a class name only
// ([class*="..."]), not the trailing content hash, so a Picklebet
// frontend rebuild that only changes those hashes (near-certain on
// every deploy) doesn't silently break this the way an exact class-name
// match would.
(() => {
  function scrapeRunners() {
    const rows = [...document.querySelectorAll('[class*="Competitor-module--competitor--"]')];
    const runners = [];

    for (const row of rows) {
      // A scratched runner's own row (confirmed live) still renders 4
      // "outcome" cells in the same positions a live runner's Win/Top2/
      // Top3/Top4 cells would, but each one holds only a bare dollar
      // deduction figure with no [class*="Outcome-module--label--"] at
      // all — so the "find the outcome actually labelled Win" lookup
      // below already naturally finds nothing for a scratched row
      // without needing this check at all. Kept anyway (same belt-and-
      // suspenders convention betrWatcher.js's own "deduction applied"
      // check already follows) since it makes the intent explicit and
      // costs nothing.
      if (/scratched/i.test(row.textContent)) continue;

      // The runner's own number+name ("1. Veri Collected") sits in its
      // own dedicated span — reading the whole name container instead
      // would concatenate in a separate sibling div holding just the
      // starting/barrier position number with no separator at all
      // (confirmed live: "1. Veri Collected" + "1" -> "1. Veri
      // Collected1"), the same class of bug already fixed for Ladbrokes/
      // TABtouch elsewhere in this codebase.
      const name = row.querySelector('[class*="Competitor-module--nameAndNumber--"]')?.textContent.trim();
      if (!name) continue;

      // However many outcome columns this race's own market view shows
      // (Win/Place, or Top2/3/4 — confirmed live both layouts exist,
      // selected by whichever market tab happens to be active) doesn't
      // matter: the one actually labelled "Win" is found by its own
      // text, not by position, so this works unchanged regardless of
      // which tab the page is currently showing.
      const winOutcome = [...row.querySelectorAll('[class*="Outcome-module--outcome--"]')].find(
        (o) => o.querySelector('[class*="Outcome-module--label--"]')?.textContent.trim() === "Win"
      );
      const priceText = winOutcome?.querySelector('[class*="Outcome-module--odds--"]')?.textContent.trim();
      const price = parseFloat(priceText);

      if (!Number.isNaN(price)) runners.push({ name, price });
    }

    return runners;
  }

  // Whether Picklebet itself has actually closed betting on this race —
  // confirmed live against a real resulted race (Hamilton R1, winner
  // "High Falls" — the same real race cross-checked against every other
  // bookie throughout this whole project) versus a genuinely still-open
  // one (Angle Park, ~an hour from jumping): a resulted race's own
  // market-tab strip carries an extra "Results" tab (and a "Deductions"
  // one alongside it) that simply doesn't exist at all while the race is
  // still open. Checked as "does a tab exactly named Results exist
  // anywhere on the page" rather than any specific wording near the
  // race header, since that's the one signal actually confirmed to
  // differ between the two real states.
  function scrapeMarketClosed() {
    const hasResultsTab = [...document.querySelectorAll('button, [role="tab"]')].some(
      (el) => el.textContent.trim() === "Results"
    );
    return hasResultsTab ? true : undefined;
  }

  let lastSentSignature = null;
  // See sportsbetWatcher.js's own copy of this flag for the full
  // reasoning: without it, a page loaded straight onto an already-
  // resulted race (never seen live) would freeze on an EMPTY runners
  // array forever instead of ever capturing the real closing price.
  let everSentRealPrices = false;

  function sendUpdateIfChanged() {
    const marketClosed = scrapeMarketClosed();
    const runners = marketClosed && everSentRealPrices ? [] : scrapeRunners();
    if (runners.length > 0) everSentRealPrices = true;
    if (runners.length === 0 && marketClosed === undefined) return;

    const signature = JSON.stringify({ runners, marketClosed });
    if (signature === lastSentSignature) return;
    lastSentSignature = signature;

    try {
      chrome.runtime.sendMessage({
        type: "PICKLEBET_ODDS_UPDATED",
        odds: {
          runners,
          ...(marketClosed !== undefined && { marketClosed }),
          scrapedAt: Date.now(),
          url: location.href,
        },
      });
    } catch {
      // Extension context invalidated (e.g. the extension was reloaded
      // while this tab stayed open) — the observer will try again on the
      // next mutation; nothing to do about this one.
    }
  }

  // Same debounce-with-max-wait reasoning as every other bookie's own
  // watcher here.
  const DEBOUNCE_MS = 50;
  const MAX_WAIT_MS = 150;
  let debounceTimer = null;
  let pendingSince = null;

  function scheduleUpdate() {
    const now = Date.now();
    if (pendingSince === null) pendingSince = now;

    clearTimeout(debounceTimer);

    if (now - pendingSince >= MAX_WAIT_MS) {
      pendingSince = null;
      sendUpdateIfChanged();
      return;
    }

    debounceTimer = setTimeout(() => {
      pendingSince = null;
      sendUpdateIfChanged();
    }, DEBOUNCE_MS);
  }

  new MutationObserver(scheduleUpdate).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  scheduleUpdate(); // initial snapshot once the page has rendered
})();

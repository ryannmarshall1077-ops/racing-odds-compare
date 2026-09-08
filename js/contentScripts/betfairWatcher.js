// Persistent content script (declared in manifest.json, auto-injected on
// every Betfair market page load/navigation) that watches for Betfair's own
// front-end updating Lay prices, and pushes fresh values to background.js
// the moment they change — same approach as sportsbetWatcher.js, so a
// Live application key (which only removes delay from the REST API) isn't
// needed for near-real-time updates; this reacts to Betfair's own page
// instead of polling their API on a timer.
(() => {
  // Reads one side of the ladder (Lay or Back) — both cells share the same
  // structure: a bet-selection-id attribute and a button with two <label>s
  // (price, then size prefixed with "$").
  function scrapeSide(selector) {
    const cells = document.querySelectorAll(selector);
    const bySelectionId = new Map();

    for (const cell of cells) {
      const selectionId = cell.getAttribute("bet-selection-id");
      const button = cell.querySelector("button");
      if (!selectionId || !button) continue;

      const labels = button.querySelectorAll("label");
      if (labels.length === 0) continue;

      const price = parseFloat(labels[0].textContent.trim());
      // Size is prefixed with "$" (e.g. "$7") — strip it before parsing.
      // Absent on some renders (e.g. a runner with no size at that price
      // yet), so this stays undefined rather than NaN in that case.
      const liquidity =
        labels.length > 1 ? parseFloat(labels[1].textContent.replace(/[^0-9.]/g, "")) : NaN;

      if (!Number.isNaN(price)) {
        bySelectionId.set(selectionId, {
          price,
          ...(!Number.isNaN(liquidity) && { liquidity }),
        });
      }
    }

    return bySelectionId;
  }

  function scrapeRunners() {
    // Each runner's best (nearest-to-market) Lay price cell carries the
    // exact same selection id our REST API uses, so matching is exact —
    // no fuzzy name comparison needed like on the Sportsbet side. Verified
    // against a live market page.
    const lay = scrapeSide(".first-lay-cell[bet-selection-id]");

    // Back side — this time actually verified against a real logged-in
    // Betfair session (a previous attempt guessed ".first-back-cell",
    // inferred from the Lay selector's own naming, and shipped a stale/
    // wrong Back price for a volatile runner because of it). The naming
    // is NOT symmetric with Lay: Back's best (nearest-to-market) cell is
    // marked "last-back-cell", not "first-back-cell" — confirmed directly
    // against a live market page (Angle Park greyhounds), where
    // .last-back-cell's price+size matched the page's own highlighted
    // "Back all" column exactly for every runner checked.
    const back = scrapeSide(".last-back-cell[bet-selection-id]");

    const runners = [];
    for (const [selectionId, layEntry] of lay) {
      const backEntry = back.get(selectionId);
      runners.push({
        selectionId,
        price: layEntry.price,
        ...(layEntry.liquidity !== undefined && { liquidity: layEntry.liquidity }),
        ...(backEntry && { backPrice: backEntry.price }),
        ...(backEntry?.liquidity !== undefined && { backLiquidity: backEntry.liquidity }),
      });
    }

    return runners;
  }

  let lastSentSignature = null;

  function sendUpdateIfChanged() {
    const runners = scrapeRunners();
    if (runners.length === 0) return;

    const signature = JSON.stringify(runners);
    if (signature === lastSentSignature) return;
    lastSentSignature = signature;

    try {
      chrome.runtime.sendMessage({
        type: "BETFAIR_ODDS_UPDATED",
        odds: { runners, scrapedAt: Date.now(), url: location.href },
      });
    } catch {
      // Extension context invalidated (e.g. reloaded while this tab stayed
      // open) — the observer will try again on the next mutation.
    }
  }

  // Plain debounce isn't enough here: the observer watches the whole page
  // (subtree: true), so on a busy market — a ticking countdown, matched
  // volume updating, an in-running race — *something* is mutating the DOM
  // almost continuously. Pure debounce keeps resetting its timer on every
  // one of those unrelated mutations and can go a long time without ever
  // actually firing. Capping the wait since the first pending mutation
  // guarantees a flush at least every MAX_WAIT_MS even under constant
  // churn, while DEBOUNCE_MS still coalesces rapid bursts in between.
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

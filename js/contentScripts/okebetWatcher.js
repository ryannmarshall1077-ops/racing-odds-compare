// Persistent content script (declared in manifest.json, auto-injected on
// every OKEbet race page load/navigation) that watches for OKEbet's own
// front-end updating Win odds, and pushes fresh values to background.js
// the moment they change — same MutationObserver approach as every
// other DOM-scraping bookie's own watcher here. OKEbet's real live feed
// is GraphQL (js/okebet/api.js has the full discovery story) but the
// per-race query needs a UUID this content script has no way to derive
// from the page's own URL (a completely separate id system from the
// numeric one the URL itself uses) — so this reads the rendered DOM
// instead, same as GoldBet's own watcher does for a different reason
// (no live feed found there at all).
//
// A div-based layout, not a real <table> (confirmed live) — but one
// genuinely stable, semantic class survives among the rest of the
// Tailwind-utility noise: "gs-runner-name-label" (present on nothing
// else), used here as the one anchor to find each runner row from,
// rather than any position- or utility-class-based selector that could
// drift with a rebuild.
(() => {
  function scrapeRunners() {
    const runners = [];
    for (const label of document.querySelectorAll(".gs-runner-name-label")) {
      // The runner row itself is several plain, otherwise-unnamed divs
      // above this label — found by walking up until exactly 2 <button>
      // descendants appear (confirmed live: always Win then Place, in
      // that order, the same order the page's own "WIN"/"PLACE" column
      // headers use) rather than hardcoding how many levels up that
      // happens to be right now. A scratched runner (confirmed live
      // against several real scratchings) has no such ancestor at all
      // — it renders with no Win/Place buttons whatsoever — so this
      // naturally finds nothing for one, no separate filtering needed.
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

      // The label's own text is "<number>. <name>(<barrier>)" with no
      // space before the barrier (confirmed live) — the barrier isn't
      // needed for matching at all, so it's simply trimmed off the end
      // rather than dug out of a nested span.
      const name = label.textContent.trim().replace(/\(\d+\)$/, "").trim();
      const winButton = row.querySelectorAll("button")[0];
      const price = parseFloat(winButton?.querySelector("span")?.textContent.trim());

      if (name && !Number.isNaN(price)) runners.push({ name, price });
    }
    return runners;
  }

  // Confirmed live: a resulted race's own info bar carries a standalone
  // "Closed" badge (alongside a separate CLOSED/INTERIM/RESULTED
  // progress indicator) — absent entirely on a still-open race checked
  // the same way. The runners section itself keeps showing full Win/
  // Place prices even once resulted (the real settled price), so this
  // is checked purely as its own separate signal, not inferred from the
  // runner list changing shape at all.
  function scrapeMarketClosed() {
    const hasClosedBadge = [...document.querySelectorAll("*")].some(
      (el) => el.textContent.trim() === "Closed" && el.children.length === 0
    );
    return hasClosedBadge ? true : undefined;
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
        type: "OKEBET_ODDS_UPDATED",
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

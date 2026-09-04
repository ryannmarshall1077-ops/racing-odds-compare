// Persistent content script (declared in manifest.json, auto-injected on
// every Betfair market page load/navigation) that watches for Betfair's own
// front-end updating Lay prices, and pushes fresh values to background.js
// the moment they change — same approach as sportsbetWatcher.js, so a
// Live application key (which only removes delay from the REST API) isn't
// needed for near-real-time updates; this reacts to Betfair's own page
// instead of polling their API on a timer.
(() => {
  function scrapeRunners() {
    // Each runner's best (nearest-to-market) Lay price cell carries the
    // exact same selection id our REST API uses, so matching is exact —
    // no fuzzy name comparison needed like on the Sportsbet side.
    const cells = document.querySelectorAll(".first-lay-cell[bet-selection-id]");

    const runners = [];
    for (const cell of cells) {
      const selectionId = cell.getAttribute("bet-selection-id");
      const button = cell.querySelector("button");
      if (!selectionId || !button) continue;

      // The price button renders two <label>s: price, then size (prefixed
      // with "$"). Labels' own classes are build-hashed and unstable, but
      // this structural order isn't.
      const labels = button.querySelectorAll("label");
      if (labels.length === 0) continue;

      const price = parseFloat(labels[0].textContent.trim());
      if (!Number.isNaN(price)) {
        runners.push({ selectionId, price });
      }
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

  let debounceTimer = null;
  function scheduleUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sendUpdateIfChanged, 400);
  }

  new MutationObserver(scheduleUpdate).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  scheduleUpdate(); // initial snapshot once the page has rendered
})();

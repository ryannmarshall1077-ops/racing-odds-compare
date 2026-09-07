// Persistent content script (declared in manifest.json, auto-injected on
// every TAB race page load/navigation) that watches for TAB's own
// front-end updating Fixed Odds Win prices, and pushes fresh values to
// background.js the moment they change — same approach as
// sportsbetWatcher.js/betfairWatcher.js. Selectors match tab.js's (see its
// comment for why this is DOM scraping and not TAB's own internal API).
//
// Also injected (per manifest.json's broad TAB match pattern) on TAB's
// meetings pages, where it harmlessly finds zero runner rows and never
// sends anything — no separate pathname check needed.
(() => {
  function scrapeRunners() {
    const rows = document.querySelectorAll('[data-testid^="runner-number-"]');
    const runners = [];

    for (const row of rows) {
      if (row.classList.contains("scratched")) continue;

      const nameEl = row.querySelector(".runner-name");
      const priceCell = row.querySelector("[data-test-fixed-odds-win-price]");
      const priceEl = priceCell?.querySelector(".animate-odd");

      const name = nameEl?.textContent.trim();
      const price = parseFloat(priceEl?.textContent.trim());

      if (name && !Number.isNaN(price)) {
        runners.push({ name, price });
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
        type: "TAB_ODDS_UPDATED",
        odds: { runners, scrapedAt: Date.now(), url: location.href },
      });
    } catch {
      // Extension context invalidated (e.g. the extension was reloaded
      // while this tab stayed open) — the observer will try again on the
      // next mutation; nothing to do about this one.
    }
  }

  // Same debounce-with-max-wait reasoning as sportsbetWatcher.js /
  // betfairWatcher.js — TAB's odds-animation elements mutate almost
  // continuously on a busy race page, so a pure debounce could go a long
  // time without ever firing.
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

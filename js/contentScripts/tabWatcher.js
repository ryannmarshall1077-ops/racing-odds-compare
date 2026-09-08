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

  // Whether TAB itself has actually closed betting on this race — the
  // true "gone in-play" signal per the user's own explicit direction
  // (Betfair can and does stay tradeable well past the real jump, so its
  // own status is unusable for this). Confirmed directly against a real
  // race page: <li class="status-text"><time>...</time></li> holds a
  // live duration ("-1m") while open, and switches to the literal text
  // "Closed" the moment betting actually closes — verified end to end
  // on the same race as it happened. Checking "isn't a duration" instead
  // of allow-listing "Closed" specifically, same reasoning as
  // sportsbetWatcher.js's own version of this — Sportsbet turned out to
  // show a *different* word ("Final Results") once fully resulted, so an
  // exact-word check risks missing whatever TAB's own equivalent is.
  const DURATION_PATTERN = /^-?\d+m?\s*\d*s?$/;
  function scrapeMarketClosed() {
    const el = document.querySelector(".status-text");
    const text = el?.textContent?.trim();
    return text && !DURATION_PATTERN.test(text) ? true : undefined;
  }

  let lastSentSignature = null;

  function sendUpdateIfChanged() {
    const runners = scrapeRunners();
    const marketClosed = scrapeMarketClosed();
    // marketClosed can arrive on an update with no runners at all (odds
    // cells commonly go blank/unparseable right as betting closes) —
    // checked separately so that signal isn't dropped by the runners-only
    // bail-out below.
    if (runners.length === 0 && marketClosed === undefined) return;

    const signature = JSON.stringify({ runners, marketClosed });
    if (signature === lastSentSignature) return;
    lastSentSignature = signature;

    try {
      chrome.runtime.sendMessage({
        type: "TAB_ODDS_UPDATED",
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

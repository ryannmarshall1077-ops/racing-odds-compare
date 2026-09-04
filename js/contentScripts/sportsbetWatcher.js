// Persistent content script (declared in manifest.json, auto-injected on
// every Sportsbet race page load/navigation) that watches for Sportsbet's
// own front-end updating the odds, and pushes fresh prices to background.js
// the moment they change — instead of polling on a fixed interval, this
// reacts on the same schedule Sportsbet's own page does.
(() => {
  function findAncestorPriceContainerId(el) {
    let cur = el;
    while (cur) {
      const id = cur.getAttribute && cur.getAttribute("data-automation-id");
      if (id && id.startsWith("racecard-outcome-") && id.endsWith("-price")) return id;
      cur = cur.parentElement;
    }
    return null;
  }

  function scrapeRunners() {
    const nameEls = document.querySelectorAll('[data-automation-id="racecard-outcome-name"]');
    const priceEls = document.querySelectorAll(
      '[data-automation-id^="outcome-"][data-automation-id$="-odds-button-text"]'
    );

    // The race card shows both Win and Place price columns, and both kinds
    // of button share the exact same data-automation-id (keyed by runner
    // only). Each is wrapped in a container carrying
    // "racecard-outcome-<marketIndex>-L-price" though, and Win is always
    // the first/leftmost column — keep only prices from whichever
    // container the very first price element belongs to.
    const winContainerId = priceEls.length > 0 ? findAncestorPriceContainerId(priceEls[0]) : null;
    const winPriceEls = winContainerId
      ? [...priceEls].filter((el) => findAncestorPriceContainerId(el) === winContainerId)
      : [...priceEls];

    const runners = [];
    const count = Math.min(nameEls.length, winPriceEls.length);

    for (let i = 0; i < count; i++) {
      const name = nameEls[i].textContent.trim();
      const price = parseFloat(winPriceEls[i].textContent.trim());
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

    // Skip sending when nothing actually changed, so an unrelated part of
    // the page re-rendering (e.g. the countdown timer) doesn't trigger
    // needless storage writes.
    const signature = JSON.stringify(runners);
    if (signature === lastSentSignature) return;
    lastSentSignature = signature;

    try {
      chrome.runtime.sendMessage({
        type: "BOOKMAKER_ODDS_UPDATED",
        odds: { runners, scrapedAt: Date.now(), url: location.href },
      });
    } catch {
      // Extension context invalidated (e.g. the extension was reloaded
      // while this tab stayed open) — the observer will try again on the
      // next mutation; nothing to do about this one.
    }
  }

  // Plain debounce isn't enough: the observer watches the whole page
  // (subtree: true), so on a busy racing page *something* is mutating the
  // DOM almost continuously (a countdown, unrelated UI). Pure debounce
  // keeps resetting its timer on every one of those and can go a long time
  // without ever firing. Capping the wait since the first pending mutation
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

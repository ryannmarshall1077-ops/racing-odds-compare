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
    // Scoped to the real race card ([data-automation-id="racecard-frame"])
    // rather than the whole document — a "Watchdog Tips" sidebar widget
    // elsewhere on the page (data-automation-id="tips-container") reuses
    // this exact same "racecard-outcome-name" attribute for its own
    // tipped-selection mini-cards, so an unscoped query silently picked up
    // extra duplicate name elements alongside the real 8 runners. Verified
    // live: a real race showed 12 name elements (8 real + 4 duplicated
    // tips) but only 8 real win-price elements — Math.min(names, prices)
    // below happened to still land on 8 and pair correctly by coincidence
    // in that exact DOM snapshot, but the tips widget can render its own
    // elements at any point in the DOM (before this scoping fix, nothing
    // stopped a mutation mid-render from interleaving them differently),
    // so trusting index-pairing against an unscoped, inflated count was
    // never actually safe — user-reported wrong odds for one specific
    // runner traced back to exactly this.
    const nameEls = document.querySelectorAll(
      '[data-automation-id="racecard-frame"] [data-automation-id="racecard-outcome-name"]'
    );
    const priceEls = document.querySelectorAll(
      '[data-automation-id="racecard-frame"] [data-automation-id^="outcome-"][data-automation-id$="-odds-button-text"]'
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

  // Whether Sportsbet itself has actually closed betting on this race —
  // the true "gone in-play" signal per the user's own explicit direction
  // (Betfair can and does stay tradeable well past the real jump, so its
  // own status is unusable for this). Confirmed directly against real
  // race pages: [data-automation-id="racecard-clock"] holds a live
  // duration ("1m 20s") while open, and switches to a status word once
  // betting closes — "Race Closed" right at the jump, "Final Results"
  // once fully resulted (found checking a race already well past its
  // jump — an exact match on "Race Closed" alone would have missed this
  // one entirely). Checking "isn't a duration" instead of allow-listing
  // specific wording covers both of those and anything phrased
  // differently (Abandoned, Postponed, ...).
  const DURATION_PATTERN = /^-?\d+m?\s*\d*s?$/;
  function scrapeMarketClosed() {
    const el = document.querySelector('[data-automation-id="racecard-clock"]');
    const text = el?.textContent?.trim();
    return text && !DURATION_PATTERN.test(text) ? true : undefined;
  }

  let lastSentSignature = null;

  function sendUpdateIfChanged() {
    const marketClosed = scrapeMarketClosed();
    // Stop scraping runner prices the moment betting closes — user-
    // reported the odds "shift around" once in-play; confirmed live on
    // a real race as it went in-play: the number of
    // [data-automation-id="racecard-outcome-name"] elements on the page
    // jumped from 10 to 14 the instant it closed (Sportsbet adds an
    // in-play market that reuses the exact same automation-id, with no
    // way for scrapeRunners()'s name/price pairing — which assumes a
    // stable 1:1 ordering between names and Win-column prices — to tell
    // those new elements apart from the original Win market's own).
    // Sending an empty runners array here is safe, not destructive:
    // applyBookieOdds (background.js) finds no name match for any of
    // them and leaves the race's existing prices exactly as they were,
    // same as TAB's own prices effectively freezing once its market
    // closes.
    const runners = marketClosed ? [] : scrapeRunners();
    // marketClosed can arrive on an update with no runners at all (odds
    // buttons commonly go blank/unparseable right as betting closes, and
    // now also deliberately forced empty once closed above) — checked
    // separately so that signal isn't dropped by the runners-only
    // bail-out below.
    if (runners.length === 0 && marketClosed === undefined) return;

    // Skip sending when nothing actually changed, so an unrelated part of
    // the page re-rendering (e.g. the countdown timer) doesn't trigger
    // needless storage writes.
    const signature = JSON.stringify({ runners, marketClosed });
    if (signature === lastSentSignature) return;
    lastSentSignature = signature;

    try {
      chrome.runtime.sendMessage({
        type: "BOOKMAKER_ODDS_UPDATED",
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

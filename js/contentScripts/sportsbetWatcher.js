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

  // Walks up from an element to the nearest ancestor whose own
  // data-automation-id is the BARE runner-row wrapper — "racecard-outcome-
  // <N>" with no "-price"/"-L"/etc suffix — as opposed to
  // findAncestorPriceContainerId's own "...-price" container just below.
  // Needed for the resulted-page fix below: a row's name and its price
  // both live somewhere under this same wrapper, so it's the shared
  // ancestor to pair them by.
  function findAncestorRowId(el) {
    let cur = el;
    while (cur) {
      const id = cur.getAttribute && cur.getAttribute("data-automation-id");
      if (id && /^racecard-outcome-\d+$/.test(id)) return id;
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
    // extra duplicate name elements alongside the real 8 runners.
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

    // Pairs each Win price with the name inside its OWN row, rather than
    // matching flat name-list/price-list by parallel array index. A
    // RESULTED race page (confirmed live) additionally renders a "Final
    // Results" placings panel that reuses this exact same
    // "racecard-outcome-name" attribute for its own entries — but lists
    // only placed runners, in FINISHING order, not runner-number order —
    // so the old index-pairing silently mismatched names to prices the
    // moment a race resulted (e.g. a runner shown with another runner's
    // price entirely). Containment sidesteps this: the Final Results
    // panel has no matching win-price element to walk up from in the
    // first place, so it's never consulted at all.
    const runners = [];
    for (const priceEl of winPriceEls) {
      const rowId = findAncestorRowId(priceEl);
      const row = rowId ? priceEl.closest(`[data-automation-id="${rowId}"]`) : null;
      const nameEl = row?.querySelector('[data-automation-id="racecard-outcome-name"]');
      const name = nameEl?.textContent.trim();
      const price = parseFloat(priceEl.textContent.trim());
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
  // Whether this page load has ever actually sent a non-empty scrape.
  // Distinguishes "this race was open on this page while still live, then
  // closed" (real prices already frozen by the block below — going empty
  // from here is safe) from "this page was loaded straight onto an
  // already-closed/resulted race" (nothing was ever frozen — closing
  // odds would go blank forever otherwise, which is the exact bug a race
  // never opened before it resulted used to hit).
  let everSentRealPrices = false;

  function sendUpdateIfChanged() {
    const marketClosed = scrapeMarketClosed();
    // Stop scraping runner prices once betting closes — user-reported the
    // odds "shift around" once in-play; confirmed live on a real race as
    // it went in-play: the number of
    // [data-automation-id="racecard-outcome-name"] elements on the page
    // jumped from 10 to 14 the instant it closed (Sportsbet adds an
    // in-play market that reuses the exact same automation-id). Sending
    // an empty runners array here is safe, not destructive:
    // applyBookieOdds (background.js) finds no name match for any of
    // them and leaves the race's existing prices exactly as they were.
    //
    // Exception: if nothing was ever actually captured yet on this page
    // load (everSentRealPrices still false — e.g. the page was opened
    // straight onto an already-RESULTED race, never seen live at all),
    // there's no real price frozen to protect, so scrape once now instead
    // of going straight to empty. scrapeRunners()'s containment-based
    // pairing (see its own comment) correctly ignores a resulted page's
    // "Final Results" panel and the in-play duplicate market alike, since
    // neither has a matching Win-price element to pair from — either this
    // finds genuine frozen closing odds, or it finds nothing, same as
    // before.
    const runners = marketClosed && everSentRealPrices ? [] : scrapeRunners();
    if (runners.length > 0) everSentRealPrices = true;
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

  // Sportsbet's own React app can fail to render at all on a direct
  // navigation to a race URL — user-reported/confirmed live: a genuine
  // "Uncaught Error: Minified React error #418" (a hydration mismatch) in
  // the console, then no racecard ever appears — while the identical URL
  // loads fine in a clean browser, pointing at another extension in the
  // same browser touching the same page rather than anything wrong with
  // this one. openOrNavigateTab (popup.js) only ever navigates this tab
  // once per race selection, so without this, a stuck load just sits
  // there forever, silently leaving whatever was last scraped (a
  // different, stale race) in place. Checking for the outer
  // "racecard-frame" specifically (not runner count) — a legitimately
  // closed/all-scratched race still has that frame, just no active
  // runners to scrape, which is correctly empty rather than stuck.
  const STUCK_CHECK_DELAY_MS = 8000;
  const RELOAD_GUARD_KEY = "raceOddsCompare:sportsbetReloadedFor";

  setTimeout(() => {
    if (document.querySelector('[data-automation-id="racecard-frame"]')) return;

    // Guarded via sessionStorage (survives this reload, but not a fresh
    // navigation to a different race's URL — see openOrNavigateTab) so a
    // one-off glitch gets exactly one retry, never an infinite reload
    // loop on a page that's genuinely, persistently broken.
    let alreadyReloaded = false;
    try {
      alreadyReloaded = sessionStorage.getItem(RELOAD_GUARD_KEY) === location.href;
      sessionStorage.setItem(RELOAD_GUARD_KEY, location.href);
    } catch {
      // sessionStorage inaccessible (rare, e.g. some privacy modes) —
      // reload anyway rather than getting stuck forever unable to try;
      // worst case is one extra reload, not a loop (this timer only ever
      // runs once per page load either way).
    }
    if (!alreadyReloaded) location.reload();
  }, STUCK_CHECK_DELAY_MS);
})();

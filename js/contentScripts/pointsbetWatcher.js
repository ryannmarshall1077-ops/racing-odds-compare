// Persistent content script (declared in manifest.json, auto-injected on
// every PointsBet race page load/navigation) that watches for PointsBet's
// own front-end updating Fixed Win odds, and pushes fresh values to
// background.js the moment they change — same approach as
// sportsbetWatcher.js/tabWatcher.js/ladbrokesWatcher.js/nedsWatcher.js.
//
// PointsBet has no data-testid attributes at all (unlike the Ladbrokes/
// Neds family) — its own stable hook is a `data-test` attribute instead,
// on the Win/Place odds buttons specifically:
// data-test="racingRunners<N>OutcomeRunnerWinOddsButton", N being the
// runner's own 0-based index. Confirmed live these stay in the DOM (just
// disabled="") on an already-resulted race, still holding the real
// closing price as their own text — this scraper works unmodified either
// way, live or resulted.
(() => {
  // The runner's own NAME has no comparable stable attribute — it lives
  // in a hashed-class <div> (e.g. class="f1zqw56", a CSS-in-JS build
  // artifact that changes across deploys) alongside the jockey/trainer
  // info, both inside the same <li> as the Win/Place buttons. Rather
  // than trust that hash, this walks up from the Win button to its own
  // <li> and reads the name from the START of that row's own flattened
  // text instead — every runner's name is reliably rendered first,
  // formatted "<number>. <name> (<barrier>)" (confirmed live across a
  // full field), so anchoring a regex at the start of the row's text and
  // stopping at the first "(" gets the name with no dependency on any
  // hashed class at all.
  function scrapeRunners() {
    const winButtons = document.querySelectorAll(
      '[data-test^="racingRunners"][data-test$="OutcomeRunnerWinOddsButton"]'
    );
    const runners = [];

    for (const btn of winButtons) {
      const row = btn.closest("li");
      const rowText = row?.textContent || "";
      const nameMatch = rowText.match(/^\s*\d+\.\s*(.+?)\s*\(/);
      const name = nameMatch ? nameMatch[1].trim() : null;
      const price = parseFloat(btn.textContent.trim());

      if (name && !Number.isNaN(price)) {
        runners.push({ name, price });
      }
    }

    return runners;
  }

  // Whether PointsBet itself has actually closed betting on this race —
  // the true "gone in-play" signal (Betfair's own status is unusable for
  // this — see sportsbetWatcher.js's own comment). Confirmed directly
  // against real race pages: unlike every other bookie here, there's no
  // single element whose TEXT switches from a duration to a status word
  // — instead, a [data-test="duration"] element inside the race's own
  // header exists at all only while still counting down, and is gone
  // entirely once closed (replaced by "Final Results"/similar text
  // elsewhere in the same header, itself with no stable attribute to key
  // off). Scoped to a bounded ancestor of the page's own <h1> (the venue
  // name) rather than the whole document — document-wide, the first
  // [data-test="duration"] match is just as likely to be some OTHER
  // race's own countdown in the "Next To Jump" sidebar ticker, confirmed
  // live: an already-resulted race's own page still had several such
  // elements, all belonging to unrelated upcoming races elsewhere on the
  // same page. 4 levels up from <h1> confirmed live to land on the exact
  // shared container both the venue name and the status text live
  // inside, on both an open and an already-resulted race.
  function raceHeaderScope() {
    let el = document.querySelector("h1");
    for (let i = 0; i < 4 && el?.parentElement; i++) el = el.parentElement;
    return el;
  }

  function scrapeMarketClosed() {
    const scope = raceHeaderScope();
    if (!scope) return undefined;
    return scope.querySelector('[data-test="duration"]') ? undefined : true;
  }

  let lastSentSignature = null;
  // See sportsbetWatcher.js's/ladbrokesWatcher.js's/nedsWatcher.js's own
  // copy of this flag for the full reasoning: without it, a page loaded
  // straight onto an already-resulted race (never seen live) would
  // freeze on an EMPTY runners array forever instead of ever capturing
  // the real closing price.
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
        type: "POINTSBET_ODDS_UPDATED",
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

  // Same debounce-with-max-wait reasoning as sportsbetWatcher.js/
  // tabWatcher.js/ladbrokesWatcher.js/nedsWatcher.js.
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

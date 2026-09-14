// Persistent content script (declared in manifest.json, auto-injected on
// every TABtouch race page load/navigation) that watches for TABtouch's
// own front-end updating Fixed Win odds, and pushes fresh values to
// background.js the moment they change — same approach as every other
// bookie's own watcher here.
//
// TABtouch's race page has a "View:" dropdown (Field / Results / Market
// Movers / ...) — while a race is still open this already defaults to
// "Field" (the full field, confirmed live), but the MOMENT it results
// it silently defaults to "Results" instead — a placings/dividends
// panel covering only the runners that actually placed, not the full
// field's own closing prices at all. Confirmed live: "Results" view's
// own name/price cells even reuse the exact same td.acceptor/.dividend
// classes as the real field table, AND a separate "Scratchings and
// Fixed Odds Deductions" panel (also reusing those same classes) sits
// alongside it — both would otherwise get scraped as if they were
// genuine runners. ensureFieldView() below switches back to "Field"
// unconditionally before every scrape, which sidesteps all of that at
// once, rather than trying to scrape "Results" view's own different
// shape. Deliberate side effect: if you have a resulted race's tab open
// and manually switch to "Results" to check placings/dividends, this
// switches it back to "Field" again on the very next odds-changing
// mutation — harmless (nothing is bet or lost, and clicking "Results"
// again undoes it), but worth knowing about if that seems surprising.
(() => {
  function ensureFieldView() {
    const titleEl = document.querySelector(".faux-select.viewmode p.title");
    if (!titleEl || /Field/i.test(titleEl.textContent)) return;
    const dropdown = document.querySelector(".faux-select.viewmode a");
    dropdown?.click();
    const fieldOption = [...document.querySelectorAll(".faux-select.viewmode li, .faux-select.viewmode a")].find(
      (o) => o.textContent.trim() === "Field"
    );
    fieldOption?.click();
  }

  // Confirmed live: a runner scratched outright simply has no row at
  // all in Field view (same as Ladbrokes/Neds), but one already fully
  // resulted with a scratching still shows a "Scratched" row (with a
  // deduction rate in the exact same price slot a real price would be
  // in) — excluded by name, same idea as betrWatcher.js's own
  // "deduction applied" check.
  //
  // The runner's own name (td.acceptor) and the Fixed Win price
  // (td.fixed.win .dividend) are both confirmed stable across live AND
  // resulted pages once on Field view. The favourite runner's own price
  // cell prepends a hidden "Favourite" label right inside the same
  // .dividend span with no separator (confirmed live: raw text
  // "Favourite2.75") — same class of bug as Ladbrokes' own "FAV2.90"
  // (see ladbrokesWatcher.js) — so the number is extracted with a regex
  // rather than trusting the cell's raw text wholesale.
  function scrapeRunners() {
    ensureFieldView();

    const nameCells = document.querySelectorAll("td.acceptor");
    const runners = [];

    for (const nameCell of nameCells) {
      const row = nameCell.closest("tr");
      if (/scratched/i.test(row?.textContent || "")) continue;

      const name = nameCell.textContent.trim();
      const priceEl = row?.querySelector(".fixed.win .dividend");
      const numberMatch = priceEl?.textContent.match(/\d+\.?\d*/);
      const price = numberMatch ? parseFloat(numberMatch[0]) : NaN;

      if (name && !Number.isNaN(price)) {
        runners.push({ name, price });
      }
    }

    return runners;
  }

  // Whether TABtouch itself has actually closed betting on this race —
  // the true "gone in-play" signal (Betfair's own status is unusable
  // for this — see sportsbetWatcher.js's own comment). Confirmed
  // directly against real race pages: a stable .dividends-as-at element
  // reads "Dividends as at: HH:MM:SS" while a race is still open, and
  // switches to "Betting closed: HH:MM:SS Dividends official: HH:MM:SS"
  // the moment it isn't — present on both Field and Results view alike,
  // so this doesn't depend on ensureFieldView() having run first.
  function scrapeMarketClosed() {
    const el = document.querySelector(".dividends-as-at");
    const text = el?.textContent || "";
    return /betting closed/i.test(text) ? true : undefined;
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
        type: "TABTOUCH_ODDS_UPDATED",
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

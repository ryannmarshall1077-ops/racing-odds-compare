// Persistent content script (declared in manifest.json, auto-injected on
// every Betr race page load/navigation) that watches for Betr's own
// front-end updating Fixed Win odds, and pushes fresh values to
// background.js the moment they change — same approach as every other
// bookie's own watcher here.
//
// Betr (a Material-UI/Next.js build) has neither data-testid nor
// data-test attributes anywhere on the page — its runner rows are only
// found via the framework's own generic `.MuiCard-root` class, and (a
// genuine structural difference from every other bookie here) the
// LIVE page and the RESULTED page render runner rows with different
// child markup: a live, still-open runner's Win price is a clickable
// <button>; once resulted, betting's no longer actionable at all so the
// same price renders as a plain <div> instead — confirmed live on two
// real races (Wodonga R1 live, Bursa R1 resulted). Both states,
// though, consistently wrap the runner's own "<number>. <name>
// (<barrier>)" text in three separate sibling <span>s inside a
// `div[style*="font-weight: 600"]` — confirmed identical on both pages
// — so the name is read from the SECOND such span, and the price from
// the first VISIBLE leaf element (button or div) elsewhere in the same
// card that holds a bare number, explicitly excluding anything inside
// that same name block (the barrier number, "10"/"(1)", is itself a
// bare leaf number and would otherwise be picked up as if it were a
// price).
(() => {
  function scrapeRunners() {
    const cards = [...document.querySelectorAll(".MuiCard-root")].filter((c) =>
      c.querySelector('div[style*="font-weight: 600"] > span')
    );
    const runners = [];

    for (const card of cards) {
      // A runner scratched after bets were already placed on it shows a
      // "Deduction applied" rate (e.g. "0.15") in the exact same price
      // slot instead of a real price — confirmed live: without this
      // check, that deduction rate gets scraped as if it were a
      // genuine (absurdly short) quoted price. Ordinary scratchings
      // (no card at all rendered for them once scratched, confirmed
      // live) never reach this loop in the first place, but this
      // covers the post-scratch-with-bets-placed case explicitly too.
      if (/deduction applied|scratched/i.test(card.textContent)) continue;

      const nameDiv = card.querySelector('div[style*="font-weight: 600"]');
      const nameSpans = nameDiv.querySelectorAll(":scope > span");
      const name = nameSpans[1]?.textContent.trim();

      const priceEls = [...card.querySelectorAll("button, div")].filter((el) => {
        if (nameDiv.contains(el)) return false; // excludes the barrier-number span
        if (el.children.length > 0) return false; // leaf only
        if (!/^\d+(\.\d+)?$/.test(el.textContent.trim())) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0; // MUI renders a hidden responsive duplicate of the same price alongside the visible one
      });
      const price = parseFloat(priceEls[0]?.textContent);

      if (name && !Number.isNaN(price)) {
        runners.push({ name, price });
      }
    }

    return runners;
  }

  // Whether Betr itself has actually closed betting on this race — the
  // true "gone in-play" signal (Betfair's own status is unusable for
  // this — see sportsbetWatcher.js's own comment). Confirmed directly
  // against real race pages: the race's own info line ("1590m | Soft5,
  // Overcast | Today, 2:00pm") sits alone in its own wrapper while still
  // open; once resulted, a status word ("Correct Weight" confirmed
  // live) renders as a second, sibling element in that exact same
  // wrapper. Checking "a second child exists" rather than allow-listing
  // specific wording (Correct Weight/Interim/Abandoned/...) covers
  // whatever that word actually is.
  function raceStatusScope() {
    const infoLine = [...document.querySelectorAll("h3")].find((e) => /^\d+m \|/.test(e.textContent.trim()));
    return infoLine?.parentElement?.parentElement || null;
  }

  function scrapeMarketClosed() {
    const scope = raceStatusScope();
    if (!scope) return undefined;
    return scope.children.length > 1 ? true : undefined;
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
        type: "BETR_ODDS_UPDATED",
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

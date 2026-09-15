// Persistent content script (declared in manifest.json, auto-injected on
// every GoldBet race page load/navigation) that watches for GoldBet's
// own front-end updating Win odds, and pushes fresh values to
// background.js the moment they change — same MutationObserver approach
// as every other DOM-scraping bookie's own watcher here (Betr/TABtouch/
// Picklebet). No live JSON feed found for a single race's own prices at
// all (several plausible endpoint names all 404'd — GoldBet's own race
// page is server-rendered, with only its "Today"/meeting-list feeds
// exposed as plain REST calls), so the rendered DOM is the only source.
//
// A genuinely simple, semantic runners table — <thead> gives the exact
// column meaning ("Runners"/"WIN"/"PLC"), so the Win price is found by
// that header's own text, not a fixed column position (robust against
// a column reorder, same reasoning Picklebet's own watcher already
// uses). Scratched runners (confirmed live against 3 real scratchings)
// don't even appear in this table at all — they render in a completely
// separate list below it — so nothing needs filtering out here.
(() => {
  function scrapeRunners() {
    const table = [...document.querySelectorAll("table")].find(
      (t) => t.querySelector("thead") && /win/i.test(t.querySelector("thead").textContent)
    );
    if (!table) return [];

    const headerCells = [...table.querySelectorAll("thead th, thead td")].map((el) => el.textContent.trim());
    const winIndex = headerCells.findIndex((h) => /^win$/i.test(h));
    if (winIndex === -1) return [];

    const runners = [];
    for (const row of table.querySelectorAll("tbody tr")) {
      const cells = [...row.querySelectorAll("td")];
      const nameCell = cells[0];
      if (!nameCell) continue;

      // The runner's own "<number>. <name>" sits as a bare trailing
      // text node directly inside one of the name cell's own divs
      // (confirmed live) — everything else in that same cell (barrier
      // number, weight, jockey, trainer, form) is properly wrapped in
      // its own child element, so the one div with non-empty OWN text
      // (excluding descendants) is unambiguously just the name.
      const nameDiv = [...nameCell.querySelectorAll("div")].find((d) =>
        [...d.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      );
      const name = nameDiv
        ? [...nameDiv.childNodes]
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent)
            .join("")
            .trim()
        : null;
      if (!name) continue;

      const price = parseFloat(cells[winIndex]?.textContent.trim());
      if (!Number.isNaN(price)) runners.push({ name, price });
    }
    return runners;
  }

  // Confirmed live: a resulted race's own info bar carries a standalone
  // "Final" badge (absent entirely on a still-open race checked the
  // same way) — the runners table itself keeps showing full Win/Place
  // prices even once resulted (the real settled price, not blanked),
  // so this is checked purely as its own separate signal, not inferred
  // from the table changing shape at all.
  function scrapeMarketClosed() {
    const hasFinalBadge = [...document.querySelectorAll("*")].some(
      (el) => el.textContent.trim() === "Final" && el.children.length === 0
    );
    return hasFinalBadge ? true : undefined;
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
        type: "GOLDBET_ODDS_UPDATED",
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

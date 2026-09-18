// Injected on demand via chrome.scripting.executeScript against the
// tracked GoldBet tab, as part of background.js's scrapeBookieTab() —
// called once per auto-refresh cycle to keep the GoldBet column current
// between goldbetWatcher.js's own live DOM-driven pushes.
//
// Selectors verified against real live GoldBet race pages — see
// goldbetWatcher.js's own comment for the full story on the runners
// table structure and why the Win price is found by its own header
// text rather than a fixed column position.
(() => {
  const table = [...document.querySelectorAll("table")].find(
    (t) => t.querySelector("thead") && /win/i.test(t.querySelector("thead").textContent)
  );
  const runners = [];

  if (table) {
    const headerCells = [...table.querySelectorAll("thead th, thead td")].map((el) => el.textContent.trim());
    // User-reported: signed in, this header reads "Fixed Win" instead
    // of the plain "WIN" every anonymous browsing session this was
    // built/verified against ever showed — this codebase never logs
    // into an account itself, so that state was never actually seen
    // live until now. A separate "VIC Win" column also appears once
    // signed in (a state-specific TOTE/parimutuel price, a genuinely
    // different product) — deliberately NOT matched here, so this
    // still finds the fixed-odds price every other bookie in this
    // extension is compared by, not that one.
    const winIndex = headerCells.findIndex((h) => /^(fixed\s+)?win$/i.test(h));

    if (winIndex !== -1) {
      for (const row of table.querySelectorAll("tbody tr")) {
        const cells = [...row.querySelectorAll("td")];
        const nameCell = cells[0];
        if (!nameCell) continue;

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
    }
  }

  return { runners, scrapedAt: Date.now(), url: location.href };
})();

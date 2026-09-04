# Racing Odds Compare

A Chrome extension that compares horse racing odds between Betfair Exchange
and a bookmaker, so you can spot where a fixed-odds price beats the exchange.

## Status

Early skeleton. The popup currently renders **mock data** (`mock-data.js`) so
the UI and edge-percentage calculation can be built and tested before any
live data source is wired in.

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" and select this folder
4. Click the extension icon in the toolbar to open the popup

## Betfair connection

Open the extension's options page (right-click the toolbar icon → Options)
and enter your Betfair **Application Key** plus your Betfair username and
password. This calls Betfair's official interactive login endpoint directly
from your browser and stores the resulting session token in
`chrome.storage.local` — nothing is sent anywhere except Betfair's own API.

Get a free **Delayed** application key (no approval needed) at
https://developer.betfair.com/.

## Roadmap

- [x] Betfair login (options page + session token)
- [x] Fetch real Betfair market odds (listMarketCatalogue / listMarketBook) —
      click "Refresh live odds" in the popup once Betfair is connected.
      Betfair prices are real; the bookmaker column is still a placeholder
      markup (`betfair * 1.08`) until a real bookmaker source exists.
- [x] Real Sportsbet odds — open a Sportsbet racing page in any tab, then
      click "Scan Sportsbet tab for odds" in the popup. It scrapes Win
      prices off that tab and merges them into the currently loaded race by
      matching runner names (click "Refresh live odds" first so there's a
      race to merge into).
- [x] Auto-refresh — Betfair prices refresh automatically every minute via
      `chrome.alarms` (Chrome's floor for alarm intervals, which also roughly
      matches how often a Delayed key's data changes at the source). A
      recent Sportsbet scan is re-applied on each refresh instead of being
      reverted to the placeholder markup. The popup updates live while open;
      "Refresh live odds" and "Scan Sportsbet tab" remain available manually.
- [x] Upcoming races list — the popup shows the next ~15 upcoming AU races
      (track, race number, time). Click one to open that exact race on both
      Betfair and Sportsbet in new tabs — no manual searching. Betfair's link
      is always exact (built from our own marketId); the Sportsbet link is
      found by matching venue + race number + start time against Sportsbet's
      own public race feed, so an unusual venue-name mismatch between the two
      sites could occasionally leave a race without a Sportsbet link (shown
      with a "!" marker).
- [ ] Other bookmakers (TAB, Ladbrokes, Neds, ...) — each needs its own
      content script since every site's markup differs
- [ ] Greyhound racing code (harness already appears to come through under
      the Horse Racing event type in AU)
- [x] Clicking a race in the Upcoming Races list loads it into the
      comparison table below. The selected race is remembered (in storage),
      so both the manual "Refresh live odds" button and auto-refresh keep
      following it — until a different race is clicked.
- [x] Opens as a full tab — clicking the toolbar icon opens the UI as a
      persistent browser tab (reusing one if it's already open) instead of a
      small popup, since a popup closes as soon as you click into one of the
      race tabs it opens.
- [x] Switching races reuses the same Betfair/Sportsbet tabs — navigates
      them to the new race in place (chrome.tabs.update) instead of closing
      and reopening. Any tab that needs to be created fresh (e.g. the user
      closed one manually) opens in the background so it can't steal focus
      away from the extension's own tab, which explicitly re-asserts its own
      focus afterward as a safety net.
- [x] Sportsbet auto-scan — the 1-minute auto-refresh alarm also re-scrapes
      the tracked Sportsbet tab automatically. The manual scan button also
      targets that same tracked tab directly, so it works without needing
      that tab focused first.
- [x] Sportsbet odds update the instant Sportsbet's own page changes them —
      `js/contentScripts/sportsbetWatcher.js` is auto-injected into every
      Sportsbet race page (declared in the manifest, not on-demand) and
      watches the odds elements with a MutationObserver. Whenever a price
      actually changes, it pushes the new value straight to the popup's
      table — reactive, not polling on a timer. The 1-minute alarm-based
      scan above remains as a fallback for tabs that were already open
      before this watcher could attach (a fresh navigation is what triggers
      injection).
- [x] Recovers automatically when the selected race finishes — once a race
      jumps, Betfair closes its WIN market and it drops out of the API. This
      used to leave the extension permanently frozen on that dead race,
      silently failing every refresh with no visible error. Now it clears
      the stale selection and falls back to the next upcoming race
      automatically, with a note in the footer explaining what happened.
      Known gap: the already-open Betfair/Sportsbet tabs don't auto-navigate
      to the new race in this case — only clicking a race in Upcoming Races
      does that.

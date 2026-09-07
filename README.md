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
- [x] Greyhound racing (harness already came through under the Horse
      Racing event type in AU — see the dedicated entry further down for
      how greyhound support was added)
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
- [x] Recovers when the tracked Sportsbet tab goes stale — tab ids don't
      survive a browser restart, and the tab may simply have been closed.
      Both the manual scan button and the automatic scan now detect this
      ("No tab with id...") and fall back to scanning whatever tab is
      currently active, instead of silently failing every time against a
      dead reference.
- [x] Matches runner names even when Sportsbet appends extra info — for NZ
      harness handicap races Sportsbet's name includes a country code and
      handicap distance Betfair's plain name doesn't (e.g. Betfair
      "itz trixton time" vs Sportsbet "itz trixton time nz (10m)"). Matching
      now treats one normalized name being a whole-word prefix of the other
      as a match, not just exact equality — found via diagnostic logging
      (#17) that showed real name lists side by side.
- [x] Scrapes Win prices only, not a Win/Place mix — the race card shows
      both a Win and a Place price column, and both kinds of button share
      the exact same `data-automation-id` (keyed by runner, not by market),
      so the scraper was grabbing all 18 price buttons for a 9-runner race
      and zipping them against 9 names by raw index — correct for the first
      runner, silently wrong for every one after that. Fixed by filtering to
      whichever price container the very first price element belongs to
      (Win is always the first/leftmost column), verified directly against
      a live race page before shipping.
- [x] Matches names with a non-breaking space before the barrier suffix —
      Sportsbet's markup puts "(Fr1)" etc. in a separate span starting with
      `&nbsp;` (U+00A0), not a normal space, so the whole-word-prefix check
      from #19 was silently failing on a character that's visually
      indistinguishable from a regular space. `normalizeName` now collapses
      all whitespace to plain spaces first. Confirmed via the actual
      character codes read off a live page (`...nz`, then char code 160,
      then `(Fr1)`).
- [x] Fixed the manual scan's fallback trying to scrape the extension's own
      tab — it used to fall back to "whichever tab is active," but since
      this extension is itself a full tab (not a popup, per #12), clicking
      the button from it makes it the active tab. Falls back to querying
      for an actual open `sportsbet.com.au` tab instead.
- [x] Betfair Lay prices update the instant Betfair's own page changes them
      — same approach as the Sportsbet watcher, no Live application key
      needed for this. `js/contentScripts/betfairWatcher.js` is
      auto-injected into every Betfair market page and watches the best Lay
      price cells with a MutationObserver, matching by Betfair's own
      `bet-selection-id` (exact, not fuzzy name matching like Sportsbet
      needs). The 1-minute REST API poll remains as a fallback and is still
      what a Live key would make more *accurate* — this watcher is what
      makes it *fast*; see the "Live key" discussion in this project's
      history for why both matter.
- [x] REST poll no longer overwrites fresher DOM-watcher prices — the
      1-minute auto-refresh alarm used to unconditionally rebuild every
      runner's Betfair price from its own REST fetch, clobbering whatever
      the watcher had just supplied with an older (Delayed-key) snapshot
      every single tick. `refreshRace()` now trusts the watcher's price if
      it updated within the last ~90 seconds, falling back to its own fetch
      only when the watcher hasn't supplied anything recent.
- [x] Freshness is tracked per runner, not per race — a suspended runner
      (common in-play, near jump) renders without a readable price on
      Betfair's page at all, so the watcher's update simply omits it. The
      previous race-wide freshness check meant one successfully-updated
      runner would incorrectly "protect" every other runner's price —
      including suspended ones the watcher never touched — from the REST
      poll's correction, letting stale numbers linger. Found by comparing
      against a real matched-betting tool's numbers side by side, then
      confirmed directly: a live in-play market where only 1 of 12 runners
      had a scrapeable price.
- [x] Fixed debounce starvation in both watchers — the MutationObserver
      watches the whole page (subtree: true), so on a busy racing page
      *something* is mutating almost continuously (countdown timers,
      matched-volume tickers). Plain debounce keeps resetting its timer on
      every one of those, and could go a long time without ever actually
      flushing a price update. Both watchers now cap the wait since the
      first pending mutation at 150ms, guaranteeing a flush at least that
      often even under constant unrelated DOM churn, while still coalescing
      rapid bursts with a 50ms debounce in between.
- [x] Auto-relogin on an expired Betfair session — a session token going
      stale used to surface as `INVALID_SESSION_INFORMATION` and require
      going back into Options to log in by hand. Since the app
      key/username/password entered there are already stored, an expired
      session now triggers an automatic re-login with those, retried once,
      transparently. Only a genuinely missing/wrong stored credential still
      needs a human back in Options.
- [x] Betfair credentials survive a full reinstall — previously stored in
      chrome.storage.local, which is wiped whenever the extension is
      actually removed and reloaded (not just refreshed), requiring
      re-entering everything in Options by hand again. Moved to
      chrome.storage.sync (tied to the user's Google account, so this is a
      deliberate tradeoff — the password now leaves the local device via
      Chrome Sync, disclosed on the Options page). manifest.json also gets
      a fixed `key`, giving the extension a stable ID across reloads/
      reinstalls — required for sync storage to reliably reconnect to the
      same data afterward. Non-credential state (race data, tab ids,
      selections) stays in local storage; only the four credential fields
      moved.
- [x] Commission-adjusted edge (QL%) — the edge column now uses
      `QL% = 100 × [B(1-c) - (L-c)] / (L-c)` (B = Sportsbet price,
      L = Betfair Lay price, c = Betfair's commission rate) instead of the
      simple `(bookmaker - betfair) / betfair` ratio, since Betfair takes a
      cut of net winnings that the raw ratio ignores. `commission.js` looks
      up the right rate from Betfair's published Market Base Rate table via
      a track-name → state map (rates vary by AU state/NZ/international);
      falls back to 8% (the most common rate) for an unrecognized track,
      logging a console warning so a gap in the map is visible rather than
      silently wrong. Fixed a real bug found while wiring this in: the race
      object never carried a plain `track` field (only a combined display
      string), so this lookup was silently always hitting the fallback
      before the fix.
- [x] Sortable runner list — an explicit "Sort: Number" / "Sort: Edge"
      toggle button sits in the Runner header. Edge (highest first, best
      value on top) is the default; toggling switches to runner-number
      order. Persists across live re-renders (auto-refresh re-applies
      whichever sort is currently selected instead of resetting it).
- [x] Hedge % control — an editable 0-100 input above the table controls
      how much of the recommended lay Edge% accounts for: 100% = full lay
      (standard QL%), 0% = no lay (plain (B-L)/L ratio, no commission,
      since a bet you never lay never touches Betfair), any value between
      scales commission's effect by that fraction —
      `Edge% = 100 × [B(1-h·c) - (L-h·c)] / (L-h·c)`. Verified against a
      real matched-betting tool's output at both the 0% and 100% endpoints
      for multiple runners — matched exactly.
- [x] Live countdown next to each race's time in Upcoming Races — ticks
      down every second (e.g. "22m 31s", "45s", "Jumped" once past start).
      Reads directly off whatever `.race-countdown` elements currently
      exist in the DOM each tick, so it keeps working across list
      re-renders without needing its own restart logic.
- [x] Lay $ column — the commission-adjusted Betfair lay stake required to
      hedge a back bet: `Stake × BackOdds / (LayOdds - Commission)`,
      scaled linearly by Hedge% (a literal stake amount, so laying half
      the position means staking half — unlike Edge%'s more complex
      partial-hedge treatment). A new Stake input (default $50) drives it
      alongside the existing Hedge input. Verified against three rows of
      real HorsePower output: $53.88, $50.58, $38.78 (stake $50, hedge
      100%) — all matched exactly, confirming the naive
      stake×backOdds/layOdds formula (no commission term) was wrong.
- [x] Mode selector — Mug (standard Win back+lay, the default) and Bonus
      (stake-not-returned free/bonus bet) so far; Run 2nd 3rd / Run 2nd are
      listed but disabled until their formulas are verified. Switching mode
      swaps both the Lay $ formula and what the metric column shows
      (Edge% vs Ret%), including its header text.
      - **Bonus Mode**: a SNR bonus bet only pays out the winnings
        (backOdds - 1), not the stake, so `layStakeBonus` uses
        `bonusValue × (BackOdds - 1) / (LayOdds - Commission)` in place of
        the Mug formula's `stake × BackOdds`.
      - **Ret%** (`bonusRetentionPercent`) is the % of the bonus bet's face
        value that converts to guaranteed real cash after hedging —
        derived directly from the Lay Stake formula above (guaranteed
        profit = full-hedge stake × (1-commission)), not a separate guess.
        Cross-checked two ways (via that definition, and via the
        simplified closed-form formula) and confirmed they agree exactly.
- [x] Click-to-copy on Lay $ — click any Lay $ value to copy it to the
      clipboard (for pasting straight into Betfair's stake field), with a
      brief "Copied!" confirmation. Delegated on the table body rather than
      bound per-row, so it keeps working across re-renders.
- [x] Liquidity column — same concept as HorsePower's Liquidity column:
      how much is actually available to match at the best (nearest) Betfair
      Lay price right now, in whole dollars (e.g. "$18"), shown as "—" when
      genuinely unknown rather than a misleading "$0". Both Betfair data
      paths already had this available without any new API request —
      `listMarketBook`'s `availableToLay[0]` carries `size` alongside
      `price`, and the Lay price button on Betfair's own page renders size
      as a second `<label>` right next to the price one — so this just
      reads a value that was already there. Threaded through the same
      per-runner freshness handling as the Lay price itself (DOM watcher
      vs. REST fallback), so it can never end up paired with a price from
      a different source/moment than the liquidity figure next to it.
- [x] Greyhound racing — Sportsbet's side (`js/sportsbet/api.js`) already
      supported it (its NextEvents feed request already included
      `GH_DOMESTIC`, and `buildSportsbetRaceUrl` already had a `greyhound`
      slug); the gap was entirely on the Betfair side, which only ever
      queried the "Horse Racing" event type:
      - "Upcoming Races" and the "next race" fallback (used when no race
        is selected yet) now query Betfair's "Horse Racing" **and**
        "Greyhound Racing" event types together (`RACING_SPORTS` in
        background.js) — one combined `listMarketCatalogue` call each,
        not two queried separately and merged by hand.
      - Each market's sport is read back via Betfair's own `EVENT_TYPE`
        projection (`market.eventType.name`) rather than remembered
        separately, so it's correct regardless of which code path found
        the market (`listMarketsByIds` when a specific race is already
        selected, or `listWinMarkets` for "next race"/the races list).
      - The Upcoming Races list's Betfair link now uses the right URL path
        segment per sport (`.../exchange/plus/greyhound-racing/market/...`
        vs. `horse-racing`) instead of a hardcoded one, and its Sportsbet
        match is filtered to that sport's own Sportsbet event type(s)
        first (horse/harness both map to Betfair's single "Horse Racing"
        type; greyhound to its own) — without that filter, a horse (or
        harness) meeting and a greyhound meeting sharing a track name and
        start time could cross-match.
      - `betfairWatcher.js`'s content script now also matches Betfair's
        greyhound market pages, not just horse racing's.
      - Each race in the Upcoming Races list shows a 🐎/🐕 prefix so the
        sport is obvious at a glance (a venue can host both on different
        days).
      - **Commission is the one open question**: `commissionForTrack` now
        takes a `sport` argument and looks up a `BETFAIR_COMMISSION`
        table per sport, but the greyhound table currently just reuses
        horse racing's rates as a starting assumption — this is NOT yet
        confirmed against Betfair's own published Market Base Rate card
        for greyhounds specifically. If it turns out to differ by state,
        `BETFAIR_COMMISSION.greyhound` in commission.js needs updating
        with real figures (currently flagged with a TODO comment there).
        Also added `TRACK_STATE_MAP` entries for the major greyhound
        tracks not already covered by a same-named horse track.

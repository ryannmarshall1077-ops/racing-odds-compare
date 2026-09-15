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
- [x] Other bookmakers (TAB, Ladbrokes, Neds, PointsBet so far — see
      their own dedicated entries further down for how/when each was
      actually added) — each needed its own content script since every
      site's markup differs, though Neds turned out to share Ladbrokes'
      own platform closely enough to reuse its selectors verbatim.
      Bet365 not yet done.
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
      - **Commission** — `commissionForTrack` now takes a `sport`
        argument and looks up a `BETFAIR_COMMISSION` table per sport.
        Confirmed against Betfair's own published Market Base Rate card:
        ACT and NSW are the only two regions where greyhound racing's
        rate (8%) differs from horse racing's (10% in both) — every
        other state/region charges the same rate for both sports. NT is
        intentionally left out of the greyhound table (Betfair's card
        marks NT greyhound racing "N/A" — no market offered there), which
        is harmless since no NT greyhound tracks are in `TRACK_STATE_MAP`
        either. Also added `TRACK_STATE_MAP` entries for the major
        greyhound tracks not already covered by a same-named horse track.
- [x] Race Types filter — a row of toggle buttons (Horse / Harness /
      Greyhound) above the Upcoming Races list, matching HorsePower's own
      filter bar. Multi-select (each toggles independently, all three on
      by default) rather than a single-choice filter, so e.g. "horse and
      greyhound but not harness" is a real option. Filters client-side
      against the last-fetched list (`latestRaces`) instead of
      re-querying Betfair on every toggle, so it's instant.
      - Betfair itself doesn't distinguish harness from gallops (both
        share its one "Horse Racing" event type), so harness needed a
        separate signal: a race's matched Sportsbet event's own `type`
        field (Sportsbet's feed already splits horse/harness/greyhound).
        No Sportsbet match means no signal either way, so it defaults to
        "horse" rather than being left unset — a race with no match
        already shows the existing "!" warning marker, so this default
        doesn't hide anything the UI wasn't already flagging as uncertain.
      - Each race row also gets a small 🐎/🏇/🐕 emoji prefix now that the
        list can mix three race types at once.
- [x] Settings page — a categorized accordion (`options.html`, opened via
      the ⚙ button in the popup header or the extension's right-click
      Options), matching HorsePower's own Settings layout:
      - **Betfair Connection** — the existing credentials form, just
        re-housed here instead of being the whole page.
      - **Race Result / Display** — Default Mode/Sort/Stake/Hedge/Race
        Types (what the main popup's own live controls *start* from each
        session — changing them live in the popup doesn't overwrite these,
        by design, so a quick experiment doesn't silently become your new
        default), plus a toggle for whether Upcoming Races shows countdown
        timers at all. Added after seeing HorsePower's own Race
        Result/Display settings:
        - **Maximum results** — caps how many runner rows the table shows
          (blank = unlimited, the existing behavior). "Maximum results per
          bookie" from HorsePower's version was deliberately left out — that
          only makes sense when comparing several bookmakers side by side;
          we compare exactly one (Sportsbet), so it wouldn't do anything
          different from "Maximum results" itself.
        - **Betfair commission discount** — percentage points knocked off
          whatever `commissionForTrack` would otherwise return, for an
          account with a loyalty/volume discount off the standard Market
          Base Rate. Applied to the commission value before every formula
          (Edge%/Ret%/Lay $/Liability) uses it, not just displayed.
        - **Default retention** — NOT yet consumed anywhere. Bonus Mode's
          Ret% column stays correctly computed live per-runner
          (`bonusRetentionPercent()`, verified against real HorsePower
          output). This exists as infrastructure for the still-unbuilt Run
          2nd 3rd EV column, which needs a retention *assumption* rather
          than a per-runner calculation — see the EV note further up.
        - **Liability column** (off by default) — what you'd owe if the lay
          bet loses: `Lay $ × (Betfair odds − 1)`, the standard exchange
          lay-liability formula. Computed from data already on each row (Lay
          $, Betfair odds), not scraped, so there's no "unknown" case like
          Liquidity has.
        - **Show Liquidity column** — a toggle for the existing column
          (on by default, matching its prior always-on behavior).
        - **Max liability** — rows whose liability exceeds this are hidden
          from the table entirely (not just flagged), matching HorsePower's
          own description of the setting. Blank = unlimited.
      - **Tab and Window management** — pin the Betfair/Sportsbet tabs
        when opened, and whether opening a race switches focus to those
        tabs (default: stay on this tab, the prior unconditional behavior).
      - **Other Behaviour and Functionality** — turn the background
        1-minute auto-refresh off entirely.
      - **Colours and Layout** — an accent colour picker (applied via the
        `--accent` CSS custom property popup.css already keyed everything
        off) and a compact table row density toggle.
      - All stored in `chrome.storage.sync` under one `settings` object
        (`settings.js`, shared by `popup.js`, `options.js`, and
        `background.js`), same as Betfair credentials — survives a full
        reinstall. Each field auto-saves on change (no separate Save
        button), and "Restore defaults" resets everything back to
        `DEFAULT_SETTINGS` without touching the Betfair credentials, which
        live under separate keys.
      - Every category here maps to a real, working feature — deliberately
        didn't replicate HorsePower's exact settings where we don't have
        the underlying feature yet (e.g. no colour *theme presets*, just
        one accent colour; no per-window tab placement, just pin/focus).
- [x] Removed "Scan Sportsbet tab for odds" — made redundant by
      sportsbetWatcher.js (pushes bookmaker updates the instant Sportsbet's
      own page changes, no button needed) and by the ~60s auto-refresh
      alarm (which already re-scrapes the tracked Sportsbet tab as part of
      its own cycle, via the same `scrapeBookmakerTab()`/`sportsbet.js`
      content script this button used to trigger manually). "Refresh live
      odds" stays — it's still the only way to force a fresh pull if
      auto-refresh has been turned off in Settings, and gives an
      on-demand refresh/error-retry instead of waiting on the alarm or a
      DOM mutation. Also removed `mergeBookmakerOdds` and popup.js's own
      copy of `normalizeName`/`namesMatch`/`findBookmakerPrice` (dead code
      once the button's client-side merge path was gone — the real,
      load-bearing copies of that matching logic live in background.js,
      used by both the REST refresh and the live DOM-watcher paths, and
      were untouched).
- [x] Shows the winner once Betfair settles the race, if it's still the
      one loaded — a 🏆 banner above the table, and the winning row gets a
      subtle highlight. Detected as part of the normal refresh flow
      (manual "Refresh live odds", or the ~60s auto-refresh alarm) via
      Betfair's own per-runner status field (`ACTIVE` pre-race, `WINNER`/
      `LOSER` once settled) — no separate polling of its own.
      - Previously, a settled race would have gone silently empty: the
        runner list was filtered to `status === "ACTIVE"` only, and every
        runner becomes `WINNER`/`LOSER` at settlement, so none passed.
        Now only genuinely scratched (`REMOVED`) runners get filtered out.
      - Betfair also stops returning fresh prices for a settled market, so
        a runner's Betfair price/liquidity now falls back to its last
        known value instead of going null (previously it would have been
        dropped entirely by a `betfair !== null` filter at the end of the
        same function) — keeps the table showing real final odds instead
        of blanking out right as the result comes in.
      - Falls back to "next race" the same way it already did once
        Betfair fully drops the market from its catalogue sometime after
        settlement (existing behavior, unrelated to this) — this only
        changes what happens *while* the just-settled race is still
        selected and returned.
- [x] Second bookmaker: TAB — the first step toward comparing multiple
      bookmakers instead of just Sportsbet, and the architecture that
      makes adding more from here straightforward.
      - **Multi-bookmaker data model** — a runner's single `bookmaker`
        field became `bookmakers: { sportsbet, tab }`; a race's single
        `bookmakerSource` became `bookmakerSources` (per bookie). The
        table now shows one column per bookmaker (`bookies.js` is the
        shared id/label list both `popup.js` and `background.js` read, so
        they can't drift apart), with whichever bookie currently has the
        higher price highlighted — that's the one Edge%/Ret%/Lay $/
        Liability are actually computed from, so the table always reflects
        the best real opportunity across every bookmaker compared, not
        just whichever is listed first.
      - **TAB's odds come from DOM scraping**, not an API — unlike
        Sportsbet's genuinely public NextEvents feed, the network requests
        TAB's own page makes for race data go through obfuscated,
        session-rotated paths (e.g. `/mMGa17/3nWsi/GSSHy/...`), which looks
        like deliberate anti-scraping protection and isn't something safe
        to depend on. `js/contentScripts/tab.js` (on-demand) and
        `tabWatcher.js` (live) instead read the rendered page directly,
        the same approach already used for Sportsbet — verified against a
        real live TAB race page: runner rows carry a stable
        `data-testid="runner-number-N"`, and the Fixed Odds Win price cell
        carries `data-test-fixed-odds-win-price` (Angular's own
        template-authored attributes survive their build process, unlike
        auto-generated class names). Confirmed scraping all 8 runners with
        correct prices directly against the live page before shipping.
      - **No auto-open for TAB out of the box, unlike Sportsbet** — TAB
        has no public race-list API to match against Betfair's own list,
        and its direct race URLs need TAB's internal 3-letter venue code
        (e.g. Launceston → `LAU`), which isn't derivable from the venue
        name and isn't something we're handed anywhere else.
      - **So TAB's venue codes are learned automatically instead of
        hand-typed.** `js/contentScripts/tabMeetings.js`, injected on
        TAB's own "Today's Racing" meetings pages, reads the real race
        links already on the page (regex-matched against TAB's own URL
        shape) and reports each `{venue, sport, slug, code}` triple to
        `background.js`, which merges them into a persisted
        `tabVenueCodes` table (keyed by venue+sport, since one venue can
        host more than one sport on different days). Verified the
        extraction regex against 5 real links captured from a live TAB
        meetings page (mixed countries, sports, and venue-name formats) —
        all 5 parsed correctly. The table only grows from meetings pages
        the user actually visits — nothing is hand-typed, and a venue
        simply has no TAB link until it's been seen once.
      - Once a venue's code is known, clicking that race in Upcoming Races
        opens (or reuses, same as the existing Betfair/Sportsbet tabs) a
        TAB tab for it too — verified end-to-end with a simulated race
        carrying a real learned TAB URL.
      - The ~60s auto-refresh alarm now re-scans every tracked bookmaker
        tab (not just Sportsbet's), and the diagnostic "scan found
        runners, but none matched" console warning now fires per bookie.
- [x] Sidebar + main-panel layout, matching a reference odds-comparison
      dashboard's structure (not its branding/colours — kept our own dark
      theme throughout):
      - **Left sidebar**: Upcoming Races moved out of the page's top flow
        into a dedicated, always-visible panel — race type filters, a
        track search box (client-side, matched against `race.track`,
        combined with the existing race type toggles), and the races list
        below it. The Settings button now lives in the sidebar's own
        header instead of the page's.
      - **Main panel**: the selected race's own info (sport + race name,
        plus a live countdown to its jump — `race.startTime`/`marketId`
        are now included in the race object returned by `refreshRaceInner`
        specifically so this could be shown; previously only the sidebar
        list had a countdown, not the race actually loaded) and the full
        odds table alongside it.
      - **Dedicated Best Price column** — the highest price across every
        bookmaker compared, with a badge naming which bookie(s) it came
        from (more than one if tied) — right after Runner. This is also
        exactly what Edge%/Ret%/Lay $/Liability get computed from
        (`bestBookmakerPrices`, generalized from the single-bookie version
        to return every tied bookie, not just the first found — so ties
        now highlight every matching column, not just one).
      - **Scratched runners now render as placeholder rows** instead of
        being silently omitted — a full-field view, sorted by box number,
        shown at the end of the table regardless of the active sort mode
        (sorting scratched rows by Edge% wouldn't mean anything, since
        they have no price). Needed loosening a filter in
        `refreshRaceInner` that had been dropping REMOVED runners
        entirely — they're kept now, purely so the UI has something to
        render a placeholder from.
      - **Market % footer row** — the overround (sum of implied
        probabilities) for Betfair and each bookmaker, computed from the
        race's full field regardless of any Max results/Max liability
        filtering applied to the displayed rows above it.
      - Deliberately left out: the reference's price-fluctuation
        sparkline + move-%, which needs real price-history tracking we
        don't have; its day-of-week quick filters and AU/NZ-vs-
        International toggle, which don't apply (we're AU-only by design,
        already Betfair-filtered); its actual bookmaker logos, replaced
        with plain text badges (a specific product's trademarked logos
        aren't ours to reproduce); and its bet-placement-workflow chrome
        (Comms/Depths header, Win/Place/Bonus/Promo buttons, Templates,
        Training) — this tool doesn't place bets, so none of that applies.
- [x] Betfair Back column, and liquidity moved inline into each Back/Lay
      price cell instead of its own column — matching the reference
      dashboard's Back/Lay styling (adapted to our own dark theme's colour
      palette, not copied literally):
      - **Back column** — `runner.betfairBack`/`betfairBackLiquidity`,
        `availableToBack[0]` from the same REST response `availableToLay[0]`
        already came from, so no new verification needed there (it's the
        same documented `ex` structure, just the other side). Display only:
        Edge%/Ret%/Lay $/Liability all deliberately keep computing from the
        Lay price, same as before — Back is never the relevant price for
        laying a bookmaker price off, only Lay is.
      - `betfairWatcher.js`'s live DOM scrape now also reads a
        `.first-back-cell[bet-selection-id]` — inferred from the existing,
        verified `.first-lay-cell` selector's own naming convention, since
        Betfair's exchange page needed a logged-in session to check it
        directly against the live DOM this time. Purely additive: if that
        selector is actually wrong and never matches anything, Back simply
        keeps falling back to the REST value above instead of going stale
        or breaking the (unaffected, still-verified) Lay scrape.
      - **Liquidity is no longer its own column** — each Back/Lay cell now
        shows its price with that side's own `$` liquidity figure stacked
        underneath it (`priceCellHtml`). The existing Settings > "Show
        liquidity" toggle still works the same way, just hiding the inline
        figures (`.cell-liquidity`) now instead of a whole column.
      - Back (blue, `--back-color`) and Lay (pink/magenta, `--lay-color`)
        get their own distinct text colour so the two are readable at a
        glance in both the header and every price cell.
      - **Follow-up, same session**: user feedback after trying this —
        Back and Lay read as two disconnected table columns, not the
        single grouped unit Betfair's own market view shows them as.
        Restructured into one merged `col-backlay` column: a single
        bordered `.backlay-box` per row containing two adjacent colour-
        coded halves (`.bl-back`/`.bl-lay`) touching each other with no
        gap, each still showing its own price + liquidity
        (`backLayCellHtml`/`priceCellInner`). Header, scratched-row
        placeholders, and the Market % footer row all use the same grouped
        box, so the layout stays consistent whether real data, a
        placeholder, or an aggregate is being shown. Verified the new
        merged-box rendering against mock data (including the null/
        scratched case) via a local static preview before committing.
- [x] Removed the dedicated Edge/Ret% column — each bookmaker's own price
      cell (Sportsbet, TAB) now shows that bookie's own Edge%/Ret%
      (`bookieMetricPercent`, the existing formula against that specific
      price instead of always the best one) stacked underneath its price,
      same treatment as Back/Lay's liquidity (`bookieCellHtml`,
      `.stacked-cell`/`.cell-sub`). The best-price highlight and Best
      Price column are unaffected — Edge/Ret% for the *best* bookie is
      just whichever bookie column's own figure happens to be highlighted.
      Scratched placeholder rows now carry their "Scratched" label in the
      runner-name cell instead of the (now-removed) last column. Verified
      against mock data via a local static preview before committing.
      - **Follow-up, same session**: the Best Price cell itself now also
        shows its own Edge%/Ret% stacked underneath (`bestPriceCellHtml`,
        `metricPercent` — the same overall best-price formula the old
        Edge column used), alongside the price and bookie badge(s). Since
        Best Price is always whichever bookie is currently winning, this
        figure always matches that bookie's own column exactly — verified
        against mock data (e.g. Best Price 3.90/TAB/+8.1% lines up with
        TAB's own column independently showing 3.90/+8.1%).
      - **Follow-up, same session**: reworked the Best Price cell into a
        wider "card row" layout per a reference screenshot — price and
        Edge%/Ret% stacked left (colour-coded together by sign, green/red,
        rather than price always being a fixed accent colour), the winning
        bookie's badge(s) as a rounded pill vertically centered on the
        right (`best-price-cell`/`best-price-text`/`best-price-badges`).
        Deliberately did NOT copy the reference's actual per-bookmaker
        brand colours (Palmerbet purple, Tab green, etc., real trademarked
        branding) — the badge stays our own accent-tinted pill regardless
        of which bookie it names, same reasoning as the plain-text badges
        elsewhere in this project.
- [x] Reworked the race-info bar into a compact two-line layout per a
      reference screenshot: a live-connection dot + `{track} R{number}
      ({sport code})` + a Comms badge on top, "Jumps at HH:MM · in Xm Ys"
      underneath (amber countdown):
      - **Live dot** — green with a soft glow once `race.source ===
        "live-betfair"`, plain grey otherwise (mock/placeholder) — means
        something rather than being purely decorative. Verified via the
        DOM (not just eyeballing the screenshot) that it correctly stays
        plain for mock data.
      - **Race title** uses the same single-letter sport code (R/H/G)
        TAB's own race URLs already use (`RACE_TYPE_CODE`, added to the
        shared `bookies.js` rather than reusing background.js's
        `RACE_TYPE_TO_TAB_CODE` directly, to avoid touching that
        already-verified, safety-critical TAB URL logic for a purely
        cosmetic duplicate). Needed a `raceNumber` field added to
        `refreshRaceInner`'s own race object (the same one-line regex
        `listUpcomingRacesInner` already used, just not previously carried
        through here too).
      - **Comms badge** — the same `commission` value (with any Settings
        discount already applied) the table's own Edge%/Ret%/Lay $ already
        use, just also surfaced here as a whole percentage.
      - Verified the whole bar against mock data via a local static
        preview before committing.
- [x] Fixed: Betfair Back price/liquidity was occasionally badly wrong for
      a volatile runner (real comparison against Betfair's own page found
      21.00/$40 shown vs the real 30/$8, while that same runner's Lay side
      matched perfectly). Root cause — the Back-cell DOM selector
      (`.first-back-cell`, added alongside the Back column) was only ever
      an inferred guess, never confirmed against a real logged-in Betfair
      session, but it was trusted over REST for up to 90s the same way
      Lay's *verified* selector is; once it produced one stale/wrong
      reading, that window kept serving it over REST's current value.
      Back price/liquidity is now always REST-sourced — dropped the
      DOM-freshness branch in `refreshRaceInner` entirely, stopped
      `applyBetfairOdds` from ever applying a DOM-reported Back price, and
      removed the now-dead Back-cell scrape from `betfairWatcher.js`
      rather than leave unverified, unused code in place. Only affects
      Back's *display* value — Edge%/Lay $/Liability always used Lay and
      were never affected.
      - **Follow-up, same session**: dropping DOM trust "fixed" the
        symptom but not the actual problem — added a diagnostic log to
        check whether REST was returning nothing for the affected runner
        (the assumed cause), and it never fired: REST kept returning a
        genuinely different, non-null price every refresh. This extension
        uses a free Delayed Betfair application key, which can itself lag
        up to ~180s behind the live market — REST alone was never going
        to be enough, the same way it wouldn't be for Lay either; the live
        DOM watcher is what actually keeps Lay accurate in practice.
        Back needed that same near-real-time source back, just the
        *correct* selector this time. With the user's own logged-in
        Betfair session open (via Claude in Chrome, with permission),
        inspected a live market's real DOM directly: Back's best
        (nearest-to-market) cell is marked `.last-back-cell`, not
        `.first-back-cell` — the naming isn't symmetric with Lay's
        `.first-lay-cell` the way the original guess assumed. Verified
        `.last-back-cell`'s price+size against the page's own highlighted
        "Back all" column for every runner in that market (including the
        one that had been wrong) before restoring the DOM-first-then-REST
        pattern in both `refreshRaceInner` and `applyBetfairOdds`.
- [x] Settings now opens as an in-page modal (dark overlay, tab strip,
      Done button) instead of navigating to a separate options.html tab,
      per a reference screenshot:
      - The modal's fields share the exact same ids as options.html's own
        copies — `options.js` manages both independently, completely
        unmodified. Right-click "Options" on the toolbar icon still opens
        the standalone options.html page too (Chrome requires that for the
        context-menu entry to exist at all); the modal is an additional
        entry point, not a replacement.
      - The 5 accordion sections became 4 tabs (Betfair / Display /
        Behaviour / Colours) — Tab and Window management merged into
        Behaviour alongside Other Behaviour and Functionality, since 3
        checkboxes didn't need their own tab.
      - **Settings now apply live the moment the modal closes** — a real
        gap the old separate-tab flow never had to deal with (closing that
        tab and coming back to an already-open popup tab never
        re-applied anything either, but it was far less noticeable there).
        Split the old one-shot settings-application block into
        `applyDisplaySettings` (accent colour, compact rows, liquidity/
        liability visibility, re-rendering the current race — re-run
        every time the modal closes) and the Default Mode/Sort/Stake/
        Hedge/Race Types seeding (deliberately still session-start-only,
        same reasoning as those fields already not being overwritten by
        live in-popup changes either).
      - Hit the same `[hidden]`-vs-class-specificity gotcha `#winner-banner`
        already needed a fix for: `.modal-tab-panel { display: flex }`
        outranked the browser's own `[hidden]` rule, so a "hidden" tab
        panel still rendered until `.modal-tab-panel[hidden] { display:
        none }` was added. Caught via an automated preview before
        shipping — the tab buttons visually switched, but the wrong
        panel's content kept showing underneath.
- [x] Configurable Edge %/Ret% colour thresholds ("EV Colours and
      Thresholds", a new Settings tab/accordion section), per a reference
      screenshot:
      - 4 fixed ascending colour tiers (not user-extensible), each with
        its own hex colour and a threshold per row. The reference's 4 rows
        (Qualifying/Mug/FVF/Bonus) don't map onto what we actually have,
        so ours are **Mug, Bonus, and Promo** — Promo covers both
        still-disabled Run 2nd 3rd/Run 2nd (one shared threshold set, not
        two, since neither has a verified EV formula yet to tell them
        apart by). Mug and Bonus run on very different scales (Edge% can
        run deeply negative; Ret% is normally 0-100%), which is exactly
        why thresholds are per-row rather than one shared set.
      - A cell's Edge%/Ret% is coloured with the **highest tier it meets
        or exceeds** (`edgeTierColor`) — inline `style`, not a CSS class,
        since a user's own hex code isn't limited to whatever a class
        could express. Below every tier's threshold, it keeps the
        original plain green/red-by-sign styling instead.
      - Applies everywhere Edge%/Ret% is shown: each bookie's own cell
        and the Best Price cell (`edgeMetricHtml`, shared by
        `bookieCellHtml`/`bestPriceCellHtml`).
      - Colour swatch and hex text field stay in sync either direction
        (`normalizeHex` accepts with/without a leading "#", 3 or 6 hex
        digits) — same UX as the reference. Each band's own box border
        is set inline to match its current colour.
      - Same markup (`.ev-band` and its children, matched by
        `data-band`/`data-mode`) exists on both the modal (popup.html)
        and the standalone options.html page — `options.js` populates and
        auto-saves both identically, unmodified, same pattern as every
        other setting.
      - Verified end-to-end against mock data via a local static preview:
        checked the tier maths by hand for 5 different Edge% values
        (all landed on the exactly-expected band), edited a band's hex
        and threshold live in the modal and confirmed the saved
        `chrome.storage.sync` value matched, then confirmed the table
        re-coloured with that exact custom colour immediately on closing
        the modal — and separately confirmed the same `.ev-band` markup
        renders correctly on the standalone options.html page too.
      - **Follow-up, same session**: user-reported "sort order looks
        wrong" in Bonus mode — the sort itself was correct
        (monotonically descending), but rows below the lowest tier's
        threshold still fell back to the *old* plain green-for-positive
        colour, which visually outranked the properly-tiered orange rows
        sitting right above them. Bonus's default lowest threshold (50%)
        makes this common, not a rare edge case — a legitimately-worse
        42% Ret% rendered the same green as a genuinely excellent 90%
        Ret%. Fixed `edgeMetricHtml`: a positive value below every tier
        now gets no colour at all (plain default text) instead of green;
        a negative one still falls back to the original red. Verified via
        `edgeMetricHtml` directly against the exact values from the
        user's screenshot (42.5/39.3/35.7/20.0/9.4 -> plain,
        53.1/50.0 -> tier 1 orange, -5 -> red) before shipping.
      - **Follow-up, same session**: replaced that plain/red split with a
        single configurable "Below every threshold" colour
        (`edgeBelowThresholdColor`, defaulting to the same red) — a 5th
        box in the EV Colours tab/section, same swatch+hex sync pattern
        as the 4 tiers but with no threshold of its own (it's just
        whatever's left over once those don't match). `edgeMetricHtml`
        simplified to always return a configured colour now — a matched
        tier, or this catch-all — rather than branching on the value's
        sign; removed the now-fully-unused `.edge-positive`/
        `.edge-negative` CSS classes. Verified: 42.5 (positive, below
        every tier) and -5 (negative) both now resolve to the same
        configured colour; editing the hex field live and closing the
        modal changed that colour immediately.
- [x] Moved the Mode/Stake/Hedge controls (`#hedge-control`) from their
      own full-width bar below the odds table into the right side of
      `#race-info-bar`, next to the track name/timer, per a reference
      screenshot:
      - `#race-info-bar` is now a row (track info left, controls right)
        instead of a column; the two existing lines (title+badge, jump+
        countdown) got wrapped in a new `.race-info-left` so they still
        stack the same way relative to each other.
      - `#hedge-control` dropped the border-top/border-bottom and
        padding it needed as its own section divider, and gained
        `flex-wrap` so it drops to a second line under real width
        pressure instead of overlapping `.race-info-left` — caught via
        an automated preview at a genuinely narrow window width (900px)
        before shipping; a first attempt (`.race-info-left { min-width:
        0 }`, meant to let a long title truncate) instead let it
        collapse to 0 and get overlapped by `#hedge-control`'s own
        content at that width, so that was removed again.
      - `.hedge-hint`'s old `margin-left: auto` (meant to push it to the
        far right of a full-width bar) was dropped too — it just flows
        normally after the Hedge % input now that the bar lives in a
        much narrower right-hand slot.
- [x] Race-number pills (R5, R6, R7, ...) underneath the jump-time line,
      per a reference screenshot — quick jumps between other races at
      the *same track* as the one currently loaded, without going back
      to the sidebar list:
      - Only ever shows races actually present in `latestRaces` (plus
        the currently-loaded race itself, in case it's fallen out of
        that list — e.g. mock data, or a race background.js already
        swapped out because its own selection expired), matched on both
        `track` and `sport`. Deliberately does NOT pad out a fake
        R1..R10 range with disabled placeholders for races we have no
        data for — Betfair's own API drops a race entirely once it
        jumps (see `loadUpcomingRaces`), so there's no reliable way to
        know a track's full race count in advance, and faking placeholder
        pills for races we can't actually back with real data isn't
        something this project does.
      - Clicking a pill reuses the exact same "load this race" logic the
        sidebar list's own rows already used — extracted into a shared
        `selectRace(race)` rather than duplicating it, so the two stay
        in sync structurally, not just by coincidence.
      - Verified against injected mock `latestRaces` data (3 races at one
        track, 1 at another) via a local static preview: the pill row
        correctly showed only the 3 same-track races in ascending order,
        and clicking one updated `selectedMarketId` and the sidebar's own
        "selected" highlight immediately.
- [x] "Past" section in Upcoming Races — races that resulted in the last
      10 minutes, per a reference screenshot, clickable the same as any
      upcoming race (loading them into the main table shows the winner
      via the existing winner-banner feature — nothing new needed there):
      - **New background.js polling**: every race `listUpcomingRacesInner`
        sees becomes a `pendingResultChecks` candidate
        (`seedPendingResultChecks`); each 1-minute alarm tick,
        `checkPendingResults` batch-checks every candidate whose start
        time has passed via `getMarketBook` (same runner-status field
        `r.status === "WINNER"` the winner banner already uses — this
        works for any race, not just whichever one happens to be
        selected, since it's the exact same Betfair mechanism), moving a
        confirmed-settled one into `recentResults` and giving up on
        (dropping) a pending one whose start time is more than 20 minutes
        past, covering an abandoned/void market that never actually
        settles. The alarm tick also now calls `listUpcomingRaces()`
        itself (not just on a manual refresh), so the candidate list
        keeps getting fed even if the user never touches the sidebar.
      - New `LIST_RECENT_RESULTS` message returns `recentResults` within
        the actual 10-minute display window (storage itself keeps a
        30-minute window, so a slightly-late check doesn't lose a result
        right at the edge).
      - **Sidebar restructure**: the flat race list became two named
        groups ("Past", collapsible + a count badge; "Today") — a shared
        `raceCardHtml(race, {isPast})` renders both, replacing the old
        single-line `.race-row`/emoji-prefix rows with a card style
        matching the reference (a coloured sport-letter badge —
        `RACE_TYPE_CODE`, bookies.js, reusing the same scheme and colour
        variables already used elsewhere rather than introducing new
        ones — a live dot or "Closed" pill, and a right-aligned time that
        counts a different direction per group: forward to an upcoming
        jump, backward from a past one's settlement). `selectRace(race)`,
        extracted from the sidebar list's own click handler in #61, is
        what both groups' rows call.
      - Click handling is delegated once per `<ul>` (bound at setup, not
        re-bound inside the render functions — those rebuild `innerHTML`
        on every refresh, so re-adding a delegated listener each time
        would have fired it that many times over per click) and looks the
        clicked race up fresh from `latestRaces`/`recentResults` rather
        than closing over a snapshot, so a stale reference was never a
        risk to begin with.
      - Deliberately left out the reference's "AU AUS" country/state
        subtitle — we don't have a clean equivalent for past results (the
        commission table's `TRACK_STATE_MAP` isn't exposed to popup.js,
        and adding it felt like scope creep on top of an already large
        change) — just the formatted start time instead.
      - Verified against an injected mock `LIST_RECENT_RESULTS` response
        (2 settled races at different tracks/times) via a local static
        preview: the section rendered both cards correctly (badge, pill,
        title, elapsed time counting up live), the collapse toggle
        correctly hid/showed the list, and clicking a past race's card
        correctly updated `selectedMarketId` the same way clicking an
        upcoming one already did.
      - **Follow-up, same session**: user-reported a race that had
        jumped and resulted never actually showed up in Past — it just
        sat in Today showing "Jumped" (its own countdown correctly
        detects that client-side once its start time passes) forever.
        Root cause: `loadUpcomingRaces()`/`loadRecentResults()` were only
        ever called once at popup startup and once per manual refresh
        click — background.js's own alarm was staying current
        internally the whole time, but nothing was asking the popup to
        re-fetch and pick that up. Added a `setInterval` (same ~1-minute
        cadence as background.js's own alarm, gated by the same Settings
        > Automatically refresh toggle every other auto-refresh in this
        extension already respects) that calls both.
- [x] Removed the manual "Upcoming Races" refresh button — the periodic
      poll above already covers what it did. `loadUpcomingRaces()` now
      only shows its "Loading..."/error placeholder on the very first
      call (`latestRaces` still empty), rather than blanking an
      already-populated list every routine background poll.
- [x] Past races now show the winner's actual name (not just that it
      resulted): `checkPendingResults` resolves the winning selection id
      (already had this from `getMarketBook`) against
      `listMarketsByIds`' runner catalogue — the same two-call split
      `refreshRaceInner` already uses for the currently-selected race —
      one batched catalogue call per tick for every newly-settled market,
      not one per race. Shown inline in the Past card's subtitle line
      (`🏆 {name}`), omitted entirely for the (should be rare) case a
      winner's name can't be resolved.
- [x] Fixed: the "Today" countdown claimed a race had "Jumped" the
      instant its scheduled start time passed, even though races commonly
      go off a few minutes late while the market is still genuinely OPEN
      — user-reported after noticing this exact case. `marketStatus`
      (OPEN/SUSPENDED/CLOSED, a real Betfair check) is now carried
      alongside `startTime` everywhere a race is: `refreshRaceInner`
      already fetches it for the currently-selected race;
      `checkPendingResults` already fetches it for any other race once
      due, and `listUpcomingRacesInner` now merges that onto the matching
      upcoming race so the sidebar has it too. Past its scheduled time,
      `formatCountdown` now shows "Delayed" unless `marketStatus` is a
      real, checked, non-OPEN value — "Jumped" needs actual confirmation,
      not just the clock. Verified against 4 cases via a local static
      preview: OPEN + past start -> "Delayed", SUSPENDED + past start ->
      "Jumped", unchecked (null) + past start -> "Delayed" (never
      presumes it jumped without confirmation), OPEN + future start ->
      normal forward countdown, unaffected.
      - **Follow-up, same session**: replaced the static "Delayed" label
        with a live negative countdown instead — user asked for it to
        keep visibly ticking rather than switching to a fixed word.
        Refactored the shared hours/minutes/seconds formatting out of
        `formatCountdown`/`formatElapsed` into one `formatDuration`
        helper (no sign of its own) so both just prefix "-" where they
        already did; "Jumped" is still the terminal state once
        `marketStatus` actually confirms non-OPEN. Verified live via a
        local static preview: an OPEN, past-start race counted down
        "-1m 35s" -> "-1m 42s" over several real seconds, while a
        SUSPENDED one alongside it still correctly showed "Jumped".
- [x] Reverted a run of 4 follow-on changes (loading every race today
      instead of the next 20, two different attempts at getting
      Sportsbet matches for races that far out, then excluding
      far-out/unmatchable races from the list instead) back to exactly
      this point — user asked to revert everything past here, having
      decided the simpler original behaviour (next 20 races, `!` on
      whichever ones don't get a Sportsbet match) was preferable to any
      of what came after. `background.js` and `js/betfair/api.js`
      restored file-for-file from this commit; `js/sportsbet/api.js` was
      already back to this state from an earlier revert in that same
      run. Upcoming Races is back to showing the next 20 races
      (`listWinMarkets(..., 20)`, no `to` bound), and a race either gets
      a real Sportsbet match or shows "!" — no horizon-based exclusion,
      no alternate data source.
- [x] TAB venue codes are now learned automatically, without the user
      manually visiting TAB's own meetings pages — user-reported "TAB
      doesn't auto-open when I select a race", root-caused to exactly
      that manual-visit dependency (`tabMeetings.js` only ever learns a
      code from a real meetings page actually being open, and previously
      nothing opened one on its own). `ensureTabVenueCodesLearnedToday`
      opens each sport's meetings page (`R`/`H`/`G`) in a background tab
      (`active: false`, doesn't steal focus — briefly visible in the tab
      strip, then closes itself ~6s later once `tabMeetings.js` has had
      time to report what it found), sequential rather than all 3 at
      once. Date-gated (`tabVenueCodesLearnedDate`, once per day) —
      checked on every alarm tick regardless (cheap once already done
      today), and once immediately at service-worker startup so it
      doesn't wait for the first tick. Deliberately not gated by
      Settings > Automatically refresh odds — learning static venue-code
      data is an unrelated concern from refreshing live odds, so turning
      that off shouldn't stop this too.
      - **Follow-up, same session**: user-reported harness races
        specifically still not auto-loading TAB even after the above.
        Real bug, not another learning gap: `listUpcomingRacesInner`
        already computes `raceType` ("horse" vs "harness", disambiguated
        via a matched Sportsbet event's own type — Betfair's single
        "Horse Racing" event type covers both) but was passing
        `sport.id` — always "horse" for anything under that one event
        type, never "harness" — into `tabRaceUrlFromCodes` instead.
        `tabMeetings.js` genuinely learns a harness venue's code keyed
        under "harness", so a lookup that only ever searched under
        "horse" could never find it, no matter how well the automatic
        learning above worked. Switched the one call site to pass
        `raceType` instead — a no-op for horse/greyhound (where it
        already equalled `sport.id`), fixes exactly the harness case.
- [x] "Matched: $X" badge in the race-info bar, next to Comms — total
      AUD matched on the selected market so far. `refreshRaceInner`
      already fetches `getMarketBook` for this race (same call
      `marketStatus` already came from) — just also carries
      `book.totalMatched` through now. Confirmed directly against a
      real Betfair market page before shipping: it shows the exact same
      figure as "Matched: AUD X" there. Display only, same as Liquidity
      — whole dollars with a thousands separator once large enough to
      need one, matching Betfair's own display.
      - **Follow-up, same session**: user-reported the badge always
        shows "—" against real data — verifying the *concept* against
        Betfair's own page (what this was checked against before
        shipping) turned out not to be enough to confirm the REST field
        itself actually comes back populated. Added a diagnostic
        (`console.warn` with the raw `book` object) for whenever
        `book.totalMatched` is null/undefined, so the next real
        reproduction shows the actual REST shape instead of guessing at
        it again.
      - **Follow-up, same session**: diagnostic showed `book.totalMatched`
        was never null — the console filter for it stayed empty across a
        real refresh. The actual bug: it *was* showing a value, just a
        stale/wrong one — extension read $138 while Betfair's own page
        read AUD 1,705 for the same market moments later. Root cause:
        `book.totalMatched` only comes from REST, which only refreshes on
        the ~60s `chrome.alarms` poll — too slow when matched volume can
        multiply within a couple of minutes of a jump. Fixed the same way
        Back/Lay prices already are: `betfairWatcher.js` now also scrapes
        the page's own live `.total-matched` span ("Matched: AUD X"),
        confirmed against real market pages for both greyhound and horse
        racing, and `refreshRaceInner`/`applyBetfairOdds` prefer that
        DOM-scraped value over REST's whenever it's under 90s old (same
        freshness pattern as `betfairPricedAt`). Removed the now-resolved
        diagnostic.
- [x] Settings > Display: "Show scratched runners" toggle. Scratched
      (Betfair status REMOVED) runners already rendered as grayed-out
      placeholder rows for a full-field view — this makes that
      optional (`showScratchedRunners`, default `true` — no change to
      existing behaviour until someone turns it off). Verified via the
      local popup preview harness with mock data's scratched runner
      ("6. Lucky Number"): unchecking hides the row immediately,
      re-checking brings it straight back.
- [x] Restyled the Upcoming Races sport-filter pills (Thoroughbred/
      Harness/Greyhound) to match a reference screenshot: a coloured
      circular letter badge (T/H/G) + label inside a tinted, coloured-
      border pill, using the same per-sport colours the sidebar's own
      race-sport-badge already uses (`--back-color`/`--amber`/
      `--accent`) rather than new one-off colours. Toggled-off stays
      the plain neutral outline it already was. Renamed the Horse
      filter's label/letter from "Horse"/R to "Thoroughbred"/T — purely
      a display change for this one row; `RACE_TYPE_CODE` (bookies.js,
      used for TAB URLs elsewhere) is untouched. Verified via the local
      popup preview harness: matches the reference styling, and
      toggling a pill off/on still filters the list correctly.
      - **Follow-up, same session**: user-reported the "Today" sidebar's
        race cards (and the race-info bar's subtitle, e.g. "Flemington
        R5 (R)") still showed the old "R" badge for horse races,
        inconsistent with the filter pill's new "T". That letter comes
        from `RACE_TYPE_CODE` in `bookies.js` — confirmed via its own
        comment and a repo-wide search to be purely cosmetic and
        deliberately separate from `RACE_TYPE_TO_TAB_CODE`
        (background.js, safety-critical real TAB URL building) —
        safe to change without touching TAB scraping at all. Changed
        `horse` to `"T"` there too. Verified via the local popup
        preview harness (a mocked `LIST_UPCOMING_RACES` response) that
        both the sidebar race card badge and the race-info bar
        subtitle now read "T".
- [x] Light/dark mode toggle (sun/moon button next to Settings in the
      sidebar header). Adds a `theme` setting ("dark", the existing
      unchanged default, or "light"), a `:root[data-theme="light"]`
      override block in popup.css for every neutral colour token
      (bg/panel/text/muted/border) plus darkened back-color/lay-color/
      amber (too pale for text on a light background otherwise) — every
      existing rule already reads these same variables, so no rule
      needed its own light-mode copy. `--accent` is the one exception:
      it's set inline by `applyDisplaySettings()` from the user's own
      accentColor setting, so an *untouched* accentColor now resolves
      to a theme-appropriate default (dark mode's bright mint is too
      pale to read as text on light) while an explicitly-customised
      accentColor still applies literally in either theme — same idea
      duplicated into options.js's own `applyThemeToPage()` so
      options.html looks right standalone too, without its own toggle
      button. Also added an explicit `color-scheme` (dark/light per
      theme) — missing before, and needed for the toggle to render
      reliably rather than depending on the browser's own force-dark
      heuristics for an unmarked page. Verified via the local popup
      preview harness: toggling flips every CSS variable and the
      button's icon correctly (confirmed via computed styles/color-
      scheme/painted-background-chain, all consistently light after
      toggling) — the harness's own screenshot capture couldn't
      visually confirm the final pixels past that point (a Chromium
      force-dark quirk specific to this sandboxed preview, inconsistent
      even against a trivial one-line test page, and invisible to every
      DOM-level check), so a final look in a real browser is still
      worth doing.
- [x] Race countdown now recognises Betfair suspending/closing a market
      live, instead of counting into negative indefinitely until the
      tab is manually refreshed. Root cause: the countdown already
      switches to "Jumped" on any non-OPEN `marketStatus`
      (`formatCountdown`, popup.js), but that value only ever came from
      REST's `listMarketBook.status` on the ~60s `chrome.alarms` poll —
      too slow right at the jump, same class of problem as the earlier
      totalMatched fix. Confirmed live (user's own screenshot): Betfair
      showed a race "Suspended" while the countdown kept ticking
      negative. Fixed the same way — `betfairWatcher.js` now also
      scrapes `.market-status-label` (only present in the DOM at all
      once Betfair has a non-open status to show — confirmed absent on
      a genuinely OPEN market, confirmed present with text "Suspended"
      then "Closed" on a real race as it actually happened), and
      `refreshRaceInner`/`applyBetfairOdds` prefer that DOM-scraped
      status over REST's whenever it's under 90s old, same freshness
      pattern as totalMatched/betfairPricedAt.
      - **Follow-up, same session**: user-reported the countdown said
        "Jumped" on the top bar, then reverted to counting down again
        a while later — the 90s freshness/expiry window copied from
        totalMatched was the wrong model for this field. totalMatched
        is a number that's merely "a bit stale" once its 90s expire;
        marketStatus is a one-way state (OPEN -> SUSPENDED -> CLOSED,
        never back), so expiring it fell straight through to REST's
        own still-stale "OPEN", undoing the fix. Replaced with a sticky
        rule instead: once either source has confirmed a market
        non-OPEN, that sticks for as long as it stays selected, no
        expiry at all — matched by marketId so switching races doesn't
        inherit the old one's status. Applied the same fix to
        `checkPendingResultsInner`'s own REST-only tracking (used for
        every *other* race besides the selected one), which had the
        same regress-to-OPEN flaw independently.
      - **Follow-up, same session**: user-reported the top bar
        correctly said "Jumped" for the selected race, but that same
        race's row in the sidebar's Upcoming Races list still counted
        down — a second, entirely separate marketStatus pipeline
        (`listUpcomingRacesInner`'s `pendingResultChecks`, REST-only,
        batch-checked) that the DOM-scrape fix above never touched.
        Layered the currently-selected race's own (DOM-confirmed)
        `liveRace.marketStatus` into `listUpcomingRacesInner`'s
        `marketStatusByMarketId` map, so the sidebar row for that one
        race stops disagreeing with its own top-bar countdown. Every
        *other* row still relies on `pendingResultChecks`' REST-only
        status (no live DOM signal exists for a race that isn't the
        one currently open), now at least sticky per the fix above.
- [x] Renamed the "Jumped" countdown label to "IN PLAY" per explicit
      request, with the exact trigger rule spelled out and confirmed
      already correct: counts normally to 0:00, keeps counting into
      negative from there, and only switches to "IN PLAY" once the
      market itself is confirmed non-OPEN — never on the clock alone
      hitting zero. That's exactly what the prior fixes already do;
      this was the label text itself (`formatCountdown`, popup.js).
      Factored the switch condition out into its own `isRaceInPlay()`
      so a second copy of the same rule doesn't drift out of sync —
      needed anyway to fix a side effect the rename surfaced: "Jumps at
      HH:MM &middot; in IN PLAY" read badly with the leftover "in"
      prefix (harmless with the old "in Jumped" too, but more
      noticeable now). The prefix is now its own span, hidden the
      moment `isRaceInPlay()` is true. Verified via the local popup
      preview harness: a race with a past start time and OPEN status
      keeps counting down negative ("in -0m 55s"); switching
      `marketStatus` to SUSPENDED immediately shows "IN PLAY" with the
      "in" prefix gone.
      - **Follow-up, same session**: user-reported "IN PLAY" still
        showed too early, right at 0:00, before the market was actually
        still open — and explicitly directed the fix: Betfair itself
        commonly stays tradeable well past the real jump ("you can
        still trade on Betfair after the race has jumped"), so its own
        status is fundamentally unusable as the "gone in-play" trigger
        no matter how fresh the read is. Stop using it entirely for
        that; use whichever bookmaker (Sportsbet/TAB) tab is actually
        open instead — the bookmaker's own market genuinely closing is
        the real signal. Displayed countdown itself is untouched
        (still Betfair's own scheduled `startTime`, still counts past
        0:00 into negative exactly as before); only what triggers the
        switch to "IN PLAY" changed.

        Found and verified the real DOM signal on both sites directly,
        the same rigor as Betfair's own `.market-status-label`:
        Sportsbet's `[data-automation-id="racecard-clock"]` and TAB's
        `.status-text` both hold a live duration while open and switch
        to a status word once betting actually closes — confirmed
        against real races as they closed live. Checking "doesn't look
        like a duration" rather than allow-listing exact wording,
        since Sportsbet turned out to show *different* words depending
        on how long post-close it's checked ("Race Closed" right at
        the jump, "Final Results" once fully resulted) — an exact
        match on "Race Closed" alone, tried first, would have missed
        the second case entirely.

        `sportsbetWatcher.js`/`tabWatcher.js` now scrape this
        (`scrapeMarketClosed()`) the same way `betfairWatcher.js`
        already scrapes prices, feeding a new sticky
        `liveRace.bookieMarketClosed` flag (background.js's
        `applyBookieOdds`/`refreshRaceInner`, same one-way-only
        reasoning as `marketStatus`'s own fix) that `popup.js`'s
        `isRaceInPlay`/`formatCountdown` now key off instead of
        `marketStatus`. Betfair's own `marketStatus` is kept on the
        race object for potential display, just no longer drives
        anything. Same inherent limitation as before for the sidebar's
        *other* rows (nothing scrapes a bookmaker page for a race that
        isn't the one currently open — no API exists for this either,
        unlike Betfair's own status). Verified via the local popup
        preview harness: Betfair `SUSPENDED` + bookie still open keeps
        counting down negative; Betfair still `OPEN` + bookie closed
        immediately shows "IN PLAY" — confirming Betfair has no say in
        either direction any more.
      - **Follow-up, same session**: user asked for the top bar and the
        matching sidebar row to flip to "IN PLAY" at the same time —
        `bookieMarketClosed` reaches the top bar instantly
        (`chrome.storage.onChanged`, already reactive), but the
        sidebar's own cached copy only got refreshed by
        `loadUpcomingRaces()`'s own ~60s poll, so the top bar could say
        "IN PLAY" up to a minute before the identical race's sidebar
        row did. The `onChanged` handler now also patches the matching
        `latestRaces` entry's `bookieMarketClosed`/`marketStatus`
        in place and re-renders the filtered list immediately, instead
        of waiting on the next poll. Verified via the local popup
        preview harness (a working `chrome.storage.onChanged` in the
        shim this time, not just a direct `renderRace()` call, to
        actually exercise this code path): flipping `bookieMarketClosed`
        in storage updates both the top bar and the sidebar row's
        `data-bookie-market-closed` attribute on the very same tick —
        caught and fixed a stale-cached-script false negative in the
        harness itself along the way (cache-busted the script tag to
        get a trustworthy result).
- [x] Fixed Sportsbet odds "shifting around" once a race goes in-play
      (user-reported, with TAB's own prices staying accurate as the
      point of comparison). Confirmed live on a real race as it went
      in-play: the number of
      `[data-automation-id="racecard-outcome-name"]` elements on the
      page jumped from 10 to 14 the instant it closed — Sportsbet adds
      an in-play market reusing the exact same automation-id, which
      `scrapeRunners()`'s name/price pairing (assumes a stable 1:1
      ordering between names and Win-column prices) has no way to
      distinguish from the original Win market's own runners.
      `sportsbetWatcher.js` now stops scraping runner prices entirely
      the moment `scrapeMarketClosed()` is true, sending an empty
      `runners` array from then on just to still carry the
      `marketClosed` signal through. Confirmed this is safe, not
      destructive: `applyBookieOdds` (background.js) finds no name
      match for an empty list and leaves the race's existing prices
      exactly as they were — matching TAB's own prices effectively
      freezing once its market closes, which is what looked "accurate"
      by comparison in the first place.
      - **Follow-up, same session**: caught a second-order bug before
        shipping (not user-reported — found reviewing the fix's own
        knock-on effects). `applyBookieOdds` unconditionally cached the
        raw scan (including the new empty `runners`) as the "most
        recent scan" — `refreshRaceInner`'s own REST-refresh fallback
        reads that same cache on its ~60s tick, and an empty list there
        would make *it* find no price either and fall back to the
        synthetic betfair×1.08 placeholder (or null), silently
        replacing the just-frozen real price with a made-up one within
        a minute. Skipped that cache write specifically for a
        `marketClosed`-with-empty-`runners` update.
- [x] Winning runner now also marked directly on its own row in the
      odds table, not just the banner above it. Betfair settling the
      market and marking a runner WINNER (`refreshRaceInner`,
      background.js) already drove both `winner-row`'s subtle
      background tint (existing, easy to miss on its own) and the
      winner-banner — this is the same already-detected result shown
      again right on that runner's row (a small "🏆 Winner" tag next to
      its name, matching the existing `.scratched-tag` convention), not
      a new detection mechanism. Verified via the local popup preview
      harness: marking a mock runner WINNER shows the tag on its row
      alongside the existing banner.
      - **Follow-up, same session**: user-reported Betfair's own page
        already showed "Closed" with a named winner while the
        extension still showed "IN PLAY" with no winner tag. The
        currently-selected race's own winner detection
        (`refreshRaceInner`) only refreshes on the ~60s
        `chrome.alarms` tick, so up to a minute's lag here is expected
        on its own, not necessarily a bug — asked the user to confirm
        whether it resolves after another ~60-90s before assuming
        otherwise. Added a diagnostic either way: logs every runner's
        raw REST status whenever the market itself looks closed but no
        WINNER was found, so if it's still missing well past that
        window the next reproduction shows whether REST genuinely
        hasn't caught up yet or something else is dropping it, instead
        of guessing between those two again.
      - **Follow-up, same session**: found the real bug from the
        user's own reproduction (clicking "Refresh live odds" jumped
        to a completely different, upcoming race instead of showing
        the winner) — no need for the diagnostic to even fire.
        `refreshRaceInner` checks `listMarketCatalogue` for the
        selected market first; Betfair drops a market from catalogue
        noticeably sooner than `listMarketBook` stops returning its
        real result (same asymmetry `checkPendingResultsInner`
        already relies on for the sidebar's own Past results, added
        earlier but never reused here). Once catalogue came back
        empty, the existing code assumed the race was simply gone and
        silently switched the whole popup to the next upcoming race —
        before ever trying `listMarketBook` for the real result.
        Added `settledRaceFromBook()`: when catalogue is empty, try
        `listMarketBook` for that exact market first; if it resolves a
        real `WINNER`, keep showing that race (reusing its own
        already-known track/runners/prices — none of that needs
        refreshing once settled — just each runner's result, the
        winner name, and marketStatus) instead of jumping away. Only
        falls through to "next upcoming race" if `listMarketBook` has
        nothing either (genuinely gone, not just resulted).
      - **Follow-up, same session**: user-reported the winner still
        doesn't show even with this fix — and, checked separately,
        the sidebar's own Past section (`checkPendingResultsInner`, an
        entirely different code path to `listMarketBook` for the same
        market) also has no winner for this race. That rules out a
        bug specific to this new function and points at the shared
        dependency instead: `listMarketBook` persisting after a market
        goes non-OPEN *while still in catalogue* was directly
        verified earlier; persisting after catalogue drops the market
        *entirely* was assumed, by extrapolation, not verified the
        same way. Added a diagnostic to find out which: logs the raw
        `book` and every runner's status whenever `settledRaceFromBook`
        finds no `WINNER`, so the next reproduction shows whether
        `listMarketBook` genuinely has nothing left by that point, or
        has something that just doesn't look like what this code
        expects.
      - **Follow-up, same session**: user's reproduction proved
        `refreshRaceInner` genuinely ran for the exact stuck race (a
        different, unrelated diagnostic a few lines below fired using
        that same race's own runners), yet neither winner diagnostic
        added so far logged anything — meaning the conditions gating
        both of them were themselves hiding the one case actually
        worth seeing (`settledRaceFromBook` never even got reached:
        catalogue still had this market). Replaced the conditional
        "only log when book.status isn't OPEN" diagnostic with an
        unconditional one — logs `book.status`/`winner`/every runner's
        status on *every* refresh of the selected race, so nothing
        gets filtered out regardless of what those values turn out to
        be this time.
      - **Follow-up, same session**: the unconditional diagnostic gave
        a definitive answer — `book.status=OPEN, winner=null` for a
        race Betfair's own page already showed "Closed" with a named
        winner on. REST genuinely doesn't catch up to a settled
        result for a long while on a Delayed key — the same class of
        problem marketStatus/totalMatched already hit this session,
        just longer-lasting than either. Fixed the same way, again:
        `betfairWatcher.js` now also scrapes the winning runner's name
        directly off the page (`.runner-line.winner-runner
        .runner-name` — confirmed absent on a genuinely still-open
        market, confirmed present with the real winner's name on a
        resulted one, checked live on both). Matched against this
        race's own runner names via `normalizeName` (strips the
        box-number prefix Betfair's plain DOM name lacks but its own
        catalogue name has) — no fuzzy matching needed, both sides are
        Betfair's own name for the same runner. `applyBetfairOdds`
        marks that runner `WINNER` and sets `race.winner`; made that
        sticky in `refreshRaceInner`'s own per-runner REST mapping too
        (same reasoning as `alreadyConfirmedNonOpen`), since without
        that the very next ~60s REST poll — still reading a stale
        pre-result status — would silently erase it again. The
        existing winner-banner and in-table "Winner" tag (already
        keyed off `runner.result === "WINNER"`, regardless of source)
        needed no changes at all to pick this up.
- [x] Removed the winner-banner (the standalone bar above the odds
      table) per request, now redundant with the in-table "Winner" tag
      it duplicated. Deleted its markup/logic/CSS outright, and tidied
      three unrelated comments elsewhere in popup.css that referenced
      it only as a historical example of an id-vs-class `[hidden]`
      specificity fix (that pattern's other examples still stand on
      their own without it).
- [x] Countdown now shows "RESULTED" (not "IN PLAY") once a winner is
      actually known — `hasWinner` takes priority over
      `bookieMarketClosed` in `formatCountdown`, since a known winner
      means the race is definitely done regardless of what
      bookieMarketClosed (betting merely having closed, not the actual
      result) still says. `isRaceInPlay` broadened into
      `isShowingStatusWord` (now covers either status word, for the
      race-info bar's "in" prefix-hiding check) plus a small
      `isPastJumpTime` split out from it. Wired `winner` through the
      exact same two paths bookieMarketClosed already uses for the
      sidebar: `listUpcomingRacesInner`'s own liveRace-layering (for
      the ~60s poll) and the `chrome.storage.onChanged` listener's
      instant `latestRaces` patch (so the sidebar row flips to
      "RESULTED" the same instant the top bar does, not up to a minute
      later). Verified via the local popup preview harness: a mock
      race with `bookieMarketClosed: true` and a `WINNER` runner shows
      "RESULTED" (not "IN PLAY"), "in" prefix hidden, banner gone,
      winner tag still showing on the runner's own row.
- [x] Run 2nd 3rd mode — enabled and implemented, per user-provided
      formula:
      ```
      EV = Pr(win) × QL
         + Pr(2nd or 3rd) × (bonus bet × retention% − QL)
         + Pr(worse than 3rd) × QL
      ```
      QL ("qualifying loss") is the same dollar figure Mug Mode's own
      Edge% already represents on this stake — user-confirmed: "QL is
      just the edge in mug mode". Bonus bet value is the same as
      Stake, not a separate amount — user-confirmed, matching how
      Bonus Mode already reuses Stake as its own bonus-bet size.
      Pr(win)/Pr(place) are each runner's own implied probability
      (1/Lay price) on the WIN market and a *new* Betfair PLACE
      market fetch respectively (`js/betfair/api.js`'s
      `listPlaceMarket`, `background.js`'s `refreshRaceInner`) — only
      trusted when the place market actually pays exactly 3 places
      (`listMarketBook`'s own `numberOfWinners` field, confirmed via
      Betfair's own docs/dev-forum before relying on it): a smaller
      field's Top 2 Finish market would make Pr(place)−Pr(win) mean
      Pr(2nd only), not Pr(2nd or 3rd) — silently wrong for exactly
      the races this promo cares about most, so left `null` there
      (renders "—", same convention as a missing bookmaker price)
      rather than approximated. Expressed as a %-of-stake so it slots
      into the exact same column/threshold/sorting infrastructure
      Edge%/Ret% already use, including a real gap the mode's own
      possible-`null` metric exposed in `sortedRunners`'s comparator
      (never nullable before this) — fixed to sort those to the
      bottom. Lay $/Liability are unchanged from Mug Mode (the
      underlying qualifying bet is the same mechanic either way).
      Verified by hand against the formula for two different runners'
      real numbers in the local popup preview harness — both matched
      the displayed EV% exactly — plus the graceful "—" `null` path
      for runners without place-market data.
- [x] Fixed a real runner (Sale R1's Dr Tanya) showing a wrong
      Sportsbet price and no TAB price at all — two separate, genuine
      bugs found by inspecting both bookies' actual live pages
      directly for this exact race:
      1. **Sportsbet name matching failed entirely for this one
         runner**: Betfair's own catalogue calls it "Dr Tanya", but
         Sportsbet *and* TAB both list it as "Dr. Tanya" — the period
         alone broke every existing match check. `normalizeName`
         (background.js, shared by both bookies) now strips periods
         too, same treatment already given to apostrophes for the
         identical reason (a genuine presence/absence difference
         between sites, not a style difference normalizing to one
         form would fix).
      2. **Sportsbet's own scraper was reading duplicate DOM
         elements**: a "Watchdog Tips" sidebar widget elsewhere on the
         page reuses the exact same `data-automation-id=
         "racecard-outcome-name"` attribute for its own tipped-
         selection mini-cards. An unscoped query silently picked up
         these too (12 name elements for an 8-runner race) — the
         index-based name/price pairing happened to still land right
         in the one live snapshot checked, but nothing guaranteed
         that, since the tips widget can render at any point in the
         DOM relative to the real race card. `sportsbetWatcher.js`'s
         `scrapeRunners()` now scopes both its name and price queries
         to `[data-automation-id="racecard-frame"]` (the real race
         card only), verified live to give back exactly 8 correctly-
         paired runners for the same race.
- [x] Added New Zealand racing. Checked every downstream piece before
      touching anything, since most of it turned out to already
      support NZ with zero changes needed:
      - `commission.js` already has a full NZ track/state map and its
        own 6% commission rate.
      - Sportsbet's own "DOMESTIC" feed already returns real NZ races
        (confirmed live: `country: "New Zealand"`, e.g. Cambridge,
        Ascot Park) under its existing `australia-nz` URL scheme —
        already matched by the manifest's existing content-script
        patterns.
      - TAB's own meetings pages already list NZ tracks alongside AU
        ones (confirmed live: "Cambridge (NZL)"), and
        `tabMeetings.js`'s venue-name scraping already strips *any*
        parenthetical country/state code generically, not just AU
        ones — nothing NZ-specific needed there either.

      The one actual gap: Betfair's own market fetch
      (`listWinMarkets`, `js/betfair/api.js`) hardcoded
      `marketCountries: ["AU"]`, filtering NZ out at the very first
      step before any of the above ever got a chance to run. Added
      `"NZ"` alongside it — the single change this needed.
      - **Follow-up, same session**: user-reported Sportsbet not
        loading for a real NZ race. Confirmed live: Betfair lists
        Cambridge's track as plain "Cambridge", but Sportsbet calls
        the exact same venue "Cambridge Synthetic" (its all-weather
        track) — the venue-matching's exact-string check
        (`listUpcomingRacesInner`) never had a chance, this venue
        simply never matched Sportsbet at all. Fixed by reusing
        `namesMatch` (the same whole-word-prefix check already used
        for runner names, e.g. Betfair "itz trixton time" vs
        Sportsbet "itz trixton time nz (10m)") for the venue name too,
        instead of a second copy of the same idea — the exact same
        style of mismatch, just one level up from runners to venues.
- [x] Removed the sidebar's "Past" section (races settled in the last
      10 minutes) — user-requested. Full removal, not just hiding the
      UI: `checkPendingResultsInner`'s (background.js) winner-name
      resolution (a second `listMarketsByIds` catalogue call per tick,
      solely to build the now-removed section's rows) and the
      `recentResults` storage field are both gone — a newly-settled
      race is now just dropped from `pendingResultChecks` outright,
      one fewer Betfair API call per background tick. The
      `pendingResultChecks`/`checkPendingResultsInner` machinery itself
      stays: it also stamps a real OPEN/SUSPENDED/CLOSED market status
      onto the "Today" list's own rows (`listUpcomingRacesInner`),
      unrelated to the section being removed. Also removed:
      `LIST_RECENT_RESULTS` (background.js message handler),
      `loadRecentResults`/`renderPastRacesList`/`formatElapsed`
      (popup.js), the `past-races-section` markup (popup.html), and
      the now-dead `.race-closed-badge`/`.race-elapsed`/`.race-winner`/
      `.races-group-chevron`/`.races-count-badge` CSS (popup.css).
      Verified in the local static-preview harness: the sidebar renders
      just the "Today" list with no console errors and no leftover
      "Past" header.
- [x] Added Ladbrokes as a third bookmaker column, alongside Sportsbet
      and TAB — user-requested. The table/footer/note rendering
      (`bookieCellHtml`, the Market % row, `noteFor`, `bestBookmakerPrices`)
      was already fully driven off `BOOKIE_LIST` (bookies.js), so adding
      the id there plus a header `<th>` (popup.html) was the entire
      popup-side change; verified in the local static-preview harness
      with a mock Ladbrokes price on one runner and a null on another —
      renders, sorts by best price, and shows "—" correctly with no
      console errors.
      - `js/contentScripts/ladbrokesWatcher.js` (persistent, mirrors
        sportsbetWatcher.js/tabWatcher.js) and `js/contentScripts/
        ladbrokes.js` (one-shot, mirrors tab.js) — selectors verified
        against real Ladbrokes race pages: runner rows carry
        `data-testid="runner-row"`, the name `data-testid="runner-name"`,
        and Fixed Win is the first of five same-named
        `data-testid="price-button"` elements per row (Fixed Win, Fixed
        Place, Starting Price, Best Tote/SP, Mid Tote Place — no
        per-column testid to key off instead, but confirmed live across
        two different real races). A scratched runner isn't rendered as
        a row at all on Ladbrokes (unlike TAB), so no scratched-row
        filter was needed. Market-closed signal is
        `data-testid="race-card-header-countdown"` — a live duration
        ("20m") while open, a status word ("final", confirmed on an
        already-resulted race) once closed — same "isn't a duration"
        check as Sportsbet/TAB's own version, rather than allow-listing
        specific wording.
      - **Known v1 limitation**: no `ladbrokesUrl` field exists yet, so
        clicking a race in Upcoming Races won't auto-open the matching
        Ladbrokes tab the way it does for Sportsbet/TAB — investigated
        live and found no way to build one. Every Ladbrokes race lives
        at an opaque per-race GUID
        (`/racing/<venue-slug>/<race-guid>`) with no derivable pattern
        (unlike TAB's slug+code); the overview page's own race-number
        grid has no real `<a href>` at all — confirmed live, it's pure
        client-side Vue routing with no API call visible either (the
        actual odds/race data never showed up in any captured network
        request, so it appears to be held in the SPA's in-memory state
        rather than fetched per-navigation). A race page's own 1-10
        race-number tabs DO carry real hrefs to each other once you're
        already on one, so a TAB-meetings-style "learn codes" content
        script is possible in principle, just needs a bootstrap
        (getting to any one race page per venue first) — not built yet.
        Same starting point Sportsbet and TAB both had before their own
        auto-matching existed: this works today for any race the user
        already has open in a Ladbrokes tab (matched by runner name,
        same as every other bookie), just not auto-opened.
      - **Follow-up, same session**: user asked for auto-open on all
        bookies. Investigated further — `ladbrokes.com.au/sitemap.xml`
        does list real `/racing/<slug>/<guid>` URLs, but confirmed live
        it's stale (a matching slug resolved to a meeting from 6 days
        ago, not today's), so it can't be trusted as a live-schedule
        source. A synthetic `.click()` on the overview page's race grid
        also confirmed live *not* to trigger Vue's own navigation (no
        URL change) — its handler appears to require a genuinely
        trusted input event, which a content script can't produce.
        User-decided: stay manual rather than ship either an unreliable
        sitemap-based guess or `chrome.debugger`-based trusted clicks
        (the one option that would technically work, but shows a
        visible "this extension is debugging this browser" banner on
        any tab it touches).
- [x] Settings > Display > "Metric display": Edge%/Ret%/EV% (whichever
      Mode is active) or the same figure as a dollar amount — stake ×
      that %, not a different calculation, per the user's own framing.
      `formatMetric()` (popup.js) is the one place both `bookieCellHtml`
      and `bestPriceCellHtml` now go through for this, so the two can't
      drift out of sync on formatting. Deliberately doesn't touch
      `edgeMetricHtml`'s own colour-tier lookup — EV Colours' threshold
      bands stay percent-based regardless of this setting, same
      reasoning `defaultRetention`'s own comment already gives for
      keeping a display preference separate from the underlying
      calculation. The Market % footer row (overround, unrelated to
      Edge/Ret%/EV% despite sharing a "%" sign) is untouched. Verified
      in the local static-preview harness: switching the setting
      re-renders every cell from "+8.1%"-style to "+$4.04"-style (stake
      $50 × 8.1%), a null price still shows "—" either way, and the
      Market % row stays a plain percentage throughout.
      - **Follow-up, same session**: user wanted this to read as a
        3-way pill toggle (Edge %/EV $/Off) rather than a `<select>`,
        with a third "Off" option (no suffix at all — cells show just
        the price) added alongside it. Replaced the `<select>` with
        `.metric-display-btn` buttons (popup.html/options.html) and
        custom click-to-save wiring in options.js (same pattern the EV
        Colours swatches already use, since there's no single form
        control to read a `.value` off). `formatMetric()` short-circuits
        to `""` for "off", and `bookieCellHtml`/`bestPriceCellHtml` both
        skip rendering the sub-line's `<span>` at all when it's empty —
        not just an empty one — so "Off" genuinely shows just the price,
        no stray gap. The new button styling (popup.css) is deliberately
        *not* scoped to `#settings-modal` like its neighbours — no
        per-page difference is needed here, so one shared rule styles
        both the popup's modal and the standalone options.html page,
        rather than duplicating it into options.css too.
- [x] Settings > "Bookie" tab — a checkbox per bookmaker (Sportsbet/
      TAB/Ladbrokes, built from BOOKIE_LIST so a future fourth bookie
      shows up here with no hand-added checkbox) to show/hide it as its
      own column and, more importantly, exclude/include it from Best
      Price/Edge% and the data-source note. `visibleBookies()`
      (popup.js) — a settings-filtered view of BOOKIE_LIST — is now
      what `bestBookmakerPrices`, `noteFor`, and `openRaceTabs` iterate,
      so a disabled bookie can never win the Best Price badge and no
      longer gets its own race tab auto-opened either. Deliberately
      NOT what the table's own column rendering iterates, though: the
      header (`<th data-bookie="...">`, popup.html), each body row's
      per-bookie `<td>`, the scratched-runner placeholder row, and the
      Market % footer row all still always generate every bookie's
      cell (over the full, unfiltered `BOOKIE_LIST`) and hide the
      disabled ones via their own `hidden` attribute instead — the
      header is static markup that never regenerates, unlike the body/
      footer, which `applyDisplaySettings` (called on startup and every
      Settings-modal close) handles directly; the alternative
      (skipping disabled bookies' cells outright) would have left the
      header/body/footer column counts drifting apart from each other.
      `bookies.js` also had to be added to options.html's own `<script>`
      tags — it's already loaded in popup.html, but the standalone
      options.html page never needed it before this. Verified in the
      local static-preview harness on both pages: unchecking TAB and
      Ladbrokes hides both columns immediately, re-computes Best Price
      down to Sportsbet alone, drops both from the data-source note,
      and re-checking either brings it straight back with its
      already-cached odds — no rescan needed, and "Restore defaults"
      correctly re-checks all three.
- [x] Merged Settings' "Colours" and "EV Colours" tabs into one
      "Colours" tab (popup.html) / section (options.html) — user-
      requested. No JS changes needed: every field kept its own id, so
      options.js's `document.getElementById` lookups and the EV band
      swatch wiring don't care where in the DOM tree they ended up.
      Purely markup — dropped the now-unused "EV Colours" tab button
      (popup.html) and unwrapped its panel's content directly into
      "Colours"'s own (same merge on options.html's side: one
      `<details>` section instead of two, "Colours and Layout"/"EV
      Colours and Thresholds" both shortened to plain "Colours").
      Verified in the local static-preview harness on both pages: one
      "Colours" tab/section now holds Accent Colour, Compact table
      rows, and all 4 EV band swatches + the "below every threshold"
      one together, no dead tab, no console errors.
- [x] Rewrote Run 2nd 3rd mode's EV formula and enabled Run 2nd mode
      (previously disabled — no verified formula existed for it) —
      from a full formula spec the user supplied ("Racing Edge & EV
      Formulas" doc, not committed to the repo — a personal reference
      file, same treatment `.devserver.ps1` already gets via
      `.gitignore`), complete with its own worked numeric example
      (Bendigo R11, Coconut Carter) used to verify this against.
      - The core insight the doc corrects: a Betfair win-market lay
        only ever pays out on win vs. not-win, so the qualifying bet's
        own dollar result (**QL**) is the *same number* whether the
        runner wins or finishes last — the 2nd/3rd bonus is a fully
        separate amount added on top, not something QL gets split
        three ways for. `EV = QL + Pr(trigger placing) × bonus`. The
        previously-shipped formula (PR #92) mixed QL into the
        2nd-or-3rd branch as `bonusValue − QL` instead of leaving QL
        alone there too — algebraically wrong (verified by expanding
        it: it reduces to `QL×(1−2×Pr(2nd or 3rd)) + Pr(2nd or 3rd)×bonusValue`,
        not `QL + Pr(2nd or 3rd)×bonusValue`), which is why every
        earlier worked example this session refused to line up.
      - `qlNoHedge`/`qlFullHedge`/`qualifyingLoss` (popup.js) — QL at a
        given Hedge %, now an explicit linear blend of the 0% and 100%
        dollar results (`(1−h)×QL(0%) + h×QL(100%)`) rather than the
        previous nonlinear commission-scaling approach — a deliberate,
        different (simpler, per the doc "an approximation, not an
        exact derivation") partial-hedge treatment than Mug/Bonus
        modes' own `edgePercent`, which is untouched.
      - `harvillePlaceProbs` (popup.js) — Pr(exactly 2nd)/Pr(exactly
        3rd) for every runner, derived purely from the WIN market's
        own raw (non-normalized) implied probabilities via the
        Harville (1973) sequential-elimination model, a direct
        transcription of the doc's own reference implementation.
        Replaces reading Pr(place) off Betfair's actual PLACE market
        and subtracting Pr(win) (PR #92) — abandoned because that only
        ever gives Pr(2nd or 3rd) combined, never Pr(2nd) alone, which
        Run 2nd mode genuinely needs; Harville gives both from data
        already on hand (the WIN market alone). `listPlaceMarket`
        (js/betfair/api.js) and the place-market fetch/`numberOfWinners`
        check it fed (background.js's `refreshRaceInner`) are gone —
        one fewer Betfair API call per refresh.
      - Computed once per race (`computeHarvillePlaceProbs`, called
        from `renderRace`) rather than once per runner/bookie cell —
        `metricPercent`/`bookieMetricPercent` get called up to 4x per
        runner (main + each bookie column), and Harville's own
        O(n²)/O(n³) work has no reason to redo itself that often for
        the same field. Cached in a module-level Map keyed by
        selectionId, same pattern `currentSettings`/`stakeAmount`
        already use for "whatever's true of the render in progress."
        Scratched runners and anything with no current Betfair price
        are excluded from the Harville field entirely.
      - `promoEVPercent` replaces `run2nd3rdEVPercent`, shared by both
        Run 2nd (`placeProb` = Pr(2nd) alone) and Run 2nd 3rd
        (`placeProb` = Pr(2nd) + Pr(3rd)) — `metricPercent`/
        `bookieMetricPercent` pass in whichever applies. Bonus's own
        cap defaults to the stake itself ("commonly C = S" per the
        doc), same convention Bonus Mode already uses for its own
        bonus-bet size.
      - Verified in the local static-preview harness against the
        doc's own worked example (stake $50, bestPrice 17.00, lay
        16.50, commission 8%, retention 80%): reproduces its QL($1.52
        at 0% hedge, −$2.38 at 100%) and EV (+$9.74 at 0%, matches to
        the cent; +$5.84 at 100% — the doc's own text says $5.85, a
        one-cent rounding slip in the doc itself, not this
        implementation) exactly once its own Pr(2nd or 3rd) figure is
        plugged in directly. Also spot-checked the full Harville +
        blend chain end-to-end on a made-up 8-runner field at 0%, 50%,
        and 100% hedge, both modes, hand-recomputing each shown EV%
        independently — all matched — plus a scratched runner mid-
        session to confirm it's excluded from Harville without error.
      - `<option value="run2nd">` un-disabled (popup.html's Mode
        select and Default Mode select, options.html's Default Mode
        select); EV Colours' "Promo" hint text and the "Default
        retention" hint text (both files) updated to no longer call
        Run 2nd "still disabled".
      - **Follow-up, same session**: user compared Run 2nd 3rd's own
        output against a real matched-betting tool (BR Terminal) for
        an actual race (Ballarat R11 greyhounds) with identical
        underlying prices — ours read +24.8% for a runner (Ritza Old
        Mate), BR Terminal read +9.5%. BR Terminal's own Settings
        panel disclosed its exact formula
        (`EV = p_win × price + p_refund × bonus_conv − 1`), which
        turned out to be algebraically identical to ours at 0% hedge
        (same retention/stake/fair-price-source too) — so the formula
        itself wasn't the problem. Back-solving their own equation for
        their implied Pr(2nd or 3rd) gave ~21.0%, against Harville's
        own 40.1% for that exact runner — roughly 2x apart, the entire
        gap. Concluded (user-confirmed) that BR Terminal reads Pr(2nd
        or 3rd) straight off Betfair's real PLACE market rather than
        estimating it — real market consensus outperforming a
        theoretical model here. Reverted Run 2nd 3rd specifically back
        to reading the real PLACE market (bringing back
        `listPlaceMarket`/the place-market fetch in
        `refreshRaceInner`/`placeBetfair`, all three removed earlier
        this same session) — `promoPlaceProb` (popup.js) is the new
        dispatcher: Run 2nd 3rd uses `placeBetfair` (real market, Pr(place)
        − Pr(win), null if that market's missing or doesn't pay
        exactly 3 places), Run 2nd still uses Harville (the place
        market can never isolate Pr(2nd) alone). Verified in the local
        static-preview harness with a `placeBetfair` chosen to
        reproduce BR Terminal's own +9.5% exactly: Run 2nd 3rd now
        matches it to the decimal, a runner with no `placeBetfair` at
        all correctly shows "—", and Run 2nd mode is unaffected
        (still gets a real Harville-derived number for every runner
        regardless of `placeBetfair`).
      - **Follow-up, same session**: user-reported Run 2nd's own EV%
        coming out *higher* than Run 2nd 3rd's for the same runner —
        should never happen, since finishing 2nd alone can't be more
        likely (or more valuable) than finishing 2nd or 3rd. Root
        cause: Run 2nd 3rd was reading real Pr(2nd or 3rd) off the
        PLACE market (the fix above), but Run 2nd was still using
        Harville's own *absolute* Pr(2nd) estimate regardless — two
        independent sources with no guaranteed relationship to each
        other, and Harville had already been found (same fix above) to
        run noticeably hotter than real market data for at least one
        real runner.
        - `background.js`: the PLACE market lookup now also accepts
          `numberOfWinners === 2` ("Top 2 Finish", common for smaller
          fields), not just `=== 3` — new race-level
          `placeMarketWinners` field records which one applied (or
          null), since `placeBetfair` alone means a different thing
          depending on it: Pr(2nd or 3rd) combined when the market
          pays 3, but Pr(2nd) *alone* when it pays 2 (only two
          placings exist at all, so "placed but didn't win" only ever
          means 2nd there).
        - `promoPlaceProb` (popup.js) now branches on
          `placeMarketWinners`: pays-3 → Run 2nd 3rd uses the real
          combined figure directly; Run 2nd splits that *same* real
          number by Harville's own relative 2nd:3rd ratio (not its
          absolute p2) — anchoring Run 2nd to the identical real total
          Run 2nd 3rd uses, so Run 2nd's own figure can no longer
          exceed Run 2nd 3rd's for the same runner, by construction.
          Pays-2 → Run 2nd uses the real figure directly (no Harville
          at all), Run 2nd 3rd stays null (no 3rd-place information
          exists in a 2-place market). Neither/no market at all → Run
          2nd 3rd stays null, Run 2nd falls back to Harville's own
          absolute p2 (same behaviour as before this fix) — nothing to
          anchor to or contradict in that case either.
        - Verified in the local static-preview harness across all
          three cases on the same 5-runner field: pays-3 now shows Run
          2nd strictly below Run 2nd 3rd for every runner (previously
          Run 2nd came out *higher* for all five); pays-2 shows a real
          number for Run 2nd and "—" for Run 2nd 3rd; no place market
          shows Run 2nd falling back to its old Harville figure and
          Run 2nd 3rd showing "—" — no console errors in any case.
- [x] Sidebar "IN PLAY" for races other than the one currently loaded
      — user-noticed: a race's countdown just kept counting down past
      zero indefinitely for every OTHER row in Upcoming Races, since
      `bookieMarketClosed` (the actual "gone in-play" trigger) only
      ever exists for whichever one race has a live-scraped bookie tab
      open. Discussed the options first (asked, didn't implement
      until user picked one): a plain "stop the countdown looking
      broken past zero" relabel (cheapest, no new signal); reusing
      Betfair's own OPEN/SUSPENDED/CLOSED market status — already
      fetched for every pending race by `checkPendingResultsInner`'s
      own winner check, zero new API cost — as a rougher fallback
      in-play signal for rows with no tab open (chosen); opening a
      background bookie tab per upcoming race to scrape each one's own
      status the same way TAB's venue codes get learned (rejected —
      heavy, would visibly flicker many tabs continuously for a
      cosmetic sidebar detail).
      - `isShowingStatusWord`/`formatCountdown` (popup.js) now take a
        4th `betfairMarketStatus` parameter — "IN PLAY" fires on
        `bookieMarketClosed === "true"` OR Betfair's own status being
        anything other than "OPEN" (a new `isBetfairMarketClosed()`
        helper), not just the former. bookieMarketClosed still wins
        first/fastest for the one race with a tab open, matching the
        existing "Betfair itself stays tradeable well past the real
        jump" finding — this is deliberately just an *additional*,
        rougher fallback for every other row, not a replacement.
      - `race.marketStatus` was already being computed for every
        upcoming race (`listUpcomingRacesInner`, background.js) and
        already synced into the sidebar's own cache on live updates
        (`chrome.storage.onChanged` listener) — this just had to be
        threaded into each race card's `data-market-status` attribute
        (`raceCardHtml`) and the main race-info bar's own countdown
        element, the same way `bookieMarketClosed`/`hasWinner` already
        are, so `tickCountdowns()` can read it every second.
      - Verified in the local static-preview harness with 3 sidebar
        rows: one past its jump time with Betfair still "OPEN" (stays
        a plain negative countdown, unchanged — no signal available at
        all, matches the known, accepted residual gap), one
        "SUSPENDED" (now shows "IN PLAY" — the fix), and one with a
        winner known (still "RESULTED", unaffected) — plus the same
        check against the main race-info bar's own countdown. No
        console errors.

- [x] Removed the Harville (1973) place-probability model from Run 2nd
      mode entirely — user asked to factor Betfair's own market
      efficiency % (overround) into the formula as a non-configurable
      default (reversing an earlier "nah dont add it" on the same
      idea); scoping that out, Harville's own two fallback uses in
      `promoPlaceProb` (an absolute Pr(2nd) estimate when no place
      market exists, and a relative 2nd:3rd ratio to split a real
      "Top 3 Finish" total) were both already known to disagree with
      real market data by roughly 2x for an actual runner in a small
      field — the reason Run 2nd 3rd was moved onto real place-market
      data outright in an earlier fix. Rather than layer a market-
      efficiency correction onto a model already found unreliable,
      user asked to drop Harville altogether: Run 2nd now shows a
      number only when a real "Top 2 Finish" place market is available
      (Pr(2nd) directly, no model), and stays "—" for everything else
      (a "Top 3 Finish" market with no way to isolate 2nd from the
      combined total, or no place market at all) — same "no reliable
      number to show" convention already used for a missing bookmaker
      price. Mug mode's Edge% and Bonus mode's Ret% were never touched
      by any of this (they don't use Harville or `promoPlaceProb`) and
      still match their own verified HorsePower figures.
      - Removed `harvillePlaceProbs`, `computeHarvillePlaceProbs`, and
        the module-level `placeProbsBySelectionId` cache from popup.js
        entirely, along with `renderRace`'s own per-render call to
        recompute it. `promoPlaceProb` collapsed to: `run2nd3rd` →
        real combined Pr(2nd or 3rd) when `placeMarketWinners === 3`,
        else `null`; `run2nd` → real Pr(2nd) when
        `placeMarketWinners === 2`, else `null`. `promoEVPercent` and
        `metricPercent`/`bookieMetricPercent` needed no changes — they
        already treat a `null` placeProb as "nothing reliable to show."
      - background.js's own comment on the PLACE market fetch
        (`refreshRaceInner`) updated to describe the same real-data-or-
        null behavior instead of the old Harville-split/fallback
        framing.
      - Verified in the local static-preview harness with a 3-runner
        mock race and a synthetic PLACE market (two runners with a
        real `placeBetfair` price, one without): with
        `placeMarketWinners = 3`, Run 2nd 3rd showed a real EV% for the
        two runners with place prices (hand-verified exact match: QL
        via `qualifyingLoss` + Pr(2nd or 3rd) × refund, e.g. +43.8% for
        Thunder Strike at TAB) and "—" for the one without; Run 2nd
        showed "—" for every runner (no way to isolate 2nd from a
        Top 3 total without Harville). Re-rendered the same race with
        `placeMarketWinners = 2`: Run 2nd now showed the same real
        figures Run 2nd 3rd had shown (correct — with only two
        placings, "placed but didn't win" only ever means 2nd).
        Switched to Mug mode and confirmed its Edge% figures were
        byte-for-byte unchanged from before this fix. No console
        errors.

- [x] Flash the main panel and blank every Edge%/Ret%/EV% figure the
      moment the loaded race goes in-play — user request: once a
      bookmaker's market is suspended, the prices behind those figures
      are no longer tradeable, so leaving them on screen unchanged
      reads as "still actionable" when it isn't. Reuses the exact same
      "gone in-play" rule tickCountdowns/formatCountdown already use
      for that race's own countdown (bookieMarketClosed primary,
      Betfair's own OPEN/SUSPENDED/CLOSED status a rougher fallback —
      see isBetfairMarketClosed's own comment) rather than a second,
      separate signal.
      - `metricsSuspended` (popup.js, module-level, read by
        `formatMetric`) — blanks the Edge%/Ret%/EV% sub-line in every
        price cell for as long as the loaded race is in play,
        independent of Settings > Display's own `metricDisplay`
        ("off" is a persistent user choice; this is temporary and
        reverts the moment the market's no longer suspended). Best
        Price/bookie cells still show their price — only the metric
        sub-line disappears — and the Market % footer row is untouched
        (it's an overround figure, not an Edge%/EV%).
      - `flashMainPanel()` (popup.js) + a `.flash-in-play` CSS
        animation on `#main-panel` (popup.css, 1s, `--accent-neg` fading
        to transparent — the same red already used for a negative
        Edge%, reading here as "stopped/suspended") — triggered from
        `renderRace` the moment the race's in-play state flips from
        false to true, tracked via `lastRenderedMarketId`/
        `lastRenderedInPlay` so it fires exactly once per transition,
        not on every auto-refresh re-render for as long as the race
        stays in play, and resets (no spurious flash) when a different
        race's marketId loads even if that new race is already in
        play.
      - Verified in the local static-preview harness: rendered a mock
        race not in play (Edge% visible, e.g. +8.1%/-10.2%, panel
        class empty) → flipped `bookieMarketClosed` true and
        re-rendered (panel class became `flash-in-play`, computed
        `animation-name: race-in-play-flash`, background rendering the
        red flash color, every Edge% figure gone from the table, Market
        % footer unaffected) → waited out the 1s timeout (class cleared)
        → re-rendered again while still in play (did not re-flash) →
        loaded a fresh, different-marketId race that's not in play
        (state reset with no spurious flash, Edge% figures reappeared).
        No console errors.

- [x] Fixed a real bug in the "gone in-play" fallback added by the
      sidebar IN PLAY fix above: user-reported/live-confirmed (a
      Sportsbet screenshot showing its own race clock still at "-13s" —
      a live duration, betting genuinely still open — right next to our
      own top bar already showing "IN PLAY") that Betfair routinely
      auto-suspends its own market right at its scheduled start time
      even when the real jump is running late, and `isBetfairMarketClosed`
      was treating that routine, temporary suspension as if the race
      had actually gone in-play — for the currently-loaded race too,
      not just the tab-less sidebar rows it was actually meant for. That
      also meant the flash/hide-metrics feature above fired on the same
      false signal, blanking every Edge%/EV% figure while the
      bookmaker market was still genuinely tradeable.
      - `hasLiveBookie` — true whenever any bookie has ever gone "live"
        for a race (`race.bookmakerSources` having a "live" entry,
        background.js) — i.e. there's a real DOM scrape actively
        confirming its state, so `bookieMarketClosed` alone (still
        false) can be trusted outright and Betfair's own routine early-
        suspend ignored entirely. `isBetfairMarketClosed` (popup.js)
        now takes this as a 2nd parameter and short-circuits to `false`
        whenever it's true; `isShowingStatusWord`/`formatCountdown`
        thread it through as a 5th parameter the same way
        `betfairMarketStatus` already is.
      - background.js's `listUpcomingRacesInner` — added
        `hasLiveBookieMarketId` (mirroring the existing
        `bookieMarketClosedMarketId`'s own "only the currently-selected
        race can ever carry this" limitation) and threaded
        `hasLiveBookie` onto that one race's own object in the sidebar
        list, so its row doesn't disagree with the top bar. `renderRace`
        (popup.js) computes the same value from `race.bookmakerSources`
        directly and writes it to `#race-countdown-main`'s own dataset
        (`data-has-live-bookie`), and the `chrome.storage.onChanged`
        listener that instant-syncs bookieMarketClosed/marketStatus/
        winner into the sidebar's cached race now syncs this too, for
        the same "shouldn't lag a minute behind the top bar" reason
        those already do.
      - Verified in the local static-preview harness: a mock race 13s
        past its scheduled start, Betfair `marketStatus: "SUSPENDED"`,
        `bookieMarketClosed: false`, `bookmakerSources: { sportsbet:
        "live" }` (reproducing the screenshot exactly) rendered as
        `in -0m 20s` (a duration, not "IN PLAY"), Edge% figures still
        visible (-7.8%/-8.6%), no flash, `metricsSuspended` false.
        Called `formatCountdown` directly for the 3 cases side by side:
        no live bookie + Betfair SUSPENDED → "IN PLAY" (sidebar-row
        fallback still works, unchanged); live bookie + Betfair
        SUSPENDED → real duration (the fix); no live bookie + Betfair
        OPEN → real duration. Confirmed `bookieMarketClosed: "true"`
        still wins outright regardless of `hasLiveBookie` (a genuinely
        closed bookmaker market always shows "IN PLAY"). No console
        errors.

- [x] Same PR, second bug found immediately after by the user testing
      it live: `renderRace`'s own `raceInPlay` (driving
      `metricsSuspended`/`flashMainPanel`, from the flash/hide-metrics
      feature above) hand-rolled a second, incomplete copy of the
      "gone in-play" rule that dropped `isShowingStatusWord`'s own
      `isPastJumpTime` gate entirely — any benign/temporary Betfair
      `marketStatus !== "OPEN"` (unrelated to the race actually being
      in-play) blanked every Edge%/EV% figure regardless of how much
      time was left before the jump. User-reported/screenshotted: a
      race 4m 42s from its jump, Mug mode, every Edge% figure gone
      entirely. Fixed by calling `isShowingStatusWord` directly instead
      of re-deriving its rule a third time, so this can't drift out of
      sync with what the countdown itself displays again — exactly the
      failure mode its own comment already warned about ("so this
      can't drift out of sync"), just not followed the first time.
      Verified in the local static-preview harness: a mock race 4m 36s
      from its jump with `marketStatus: "SUSPENDED"` and no live bookie
      now correctly renders with Edge% figures visible and
      `metricsSuspended: false` (previously blanked); confirmed the
      genuinely-in-play case (past jump time, suspended, no live
      bookie) still correctly sets `metricsSuspended: true` and flashes
      the panel — no regression on the fix above it.

- [x] Same PR, third bug: user-reported the panel flashing every time
      they opened a race that happened to already be in play — e.g.
      clicking a different race card whose market had already jumped.
      `renderRace`'s own transition tracking reset `lastRenderedInPlay`
      to `false` on a marketId change and then treated that reset as a
      transition, flashing exactly backwards from what its own comment
      claimed ("opening a race that's already in play never spuriously
      flashes" — the code did the opposite). Added `isNewMarket` and
      skip the flash outright whenever it's true, regardless of the
      newly-loaded race's own in-play state — only a genuine false→true
      transition *while already viewing the same race* still flashes.
      Verified in the harness: opening a different, already-in-play
      race no longer flashes (still correctly sets
      `metricsSuspended: true`, just silently); the same race
      transitioning to in-play while being watched continuously still
      flashes and blanks its figures, unchanged.
      - Also changed the flash's own colour from `--accent-neg` (red)
        to plain white per user request — a deliberate, non-themed
        colour, same regardless of dark/light mode.

- [x] Rebranded around Betting Blueprint's own logo and gave the whole
      layout a polish pass — user request: "make the layout look
      professional and developed", then "add our logo and make it
      themed with similar colours, make it look like an end product".
      Scoped as a refinement of the existing structure/colours (not a
      from-scratch redesign, confirmed with the user first), plus the
      brand-colour swap and real logo placement once those were asked
      for explicitly.
      - **Brand colour** — `--accent` (popup.css) changed from the old
        teal-green (`#3ddc97`) to Betting Blueprint's own blue
        (`#2f6feb`, `#1f56c9` in light mode), used for every general
        UI/chrome touchpoint: buttons, focus rings, the headline Best
        Price column + its bookie badge, selected sidebar race, hover
        states. `DEFAULT_SETTINGS.accentColor` (settings.js) and
        `THEME_DEFAULT_ACCENT` (popup.js) updated to match — both must
        stay equal for an unedited Settings > Colours accent to still
        resolve per-theme correctly; an already-customized accent is
        untouched.
      - **New `--positive` token** (popup.css) — carved out a small,
        fixed set of "good/live/won" *data* signals (greyhound's own
        sport-identity colour, the live-connection dot, a settled
        winner's row/tag, an "ok" status message in both the popup and
        options.html) that stay green regardless of the brand colour,
        the same way `--accent-neg`'s red already does for "bad". Every
        literal rgba() tint paired with one of these (winner-row,
        live-dot's glow) was already hardcoded green and needed no
        change; the ones that were actually brand-blue now
        (best-price/bookie-badge/selected-race/live-bookie-dot tints)
        got their own literal rgba() updated to match — this file can't
        `rgba(var(--accent))` directly, so each tint is a literal
        spelled-out copy of whichever token it's meant to track (an
        existing convention, not a new one).
      - **Real logo** — the sidebar header's plain "Racing Odds
        Compare" text gained a `.brand-mark` slot using the extension's
        own already-in-repo toolbar icon (`icons/icon128.png` — this
        was already the Betting Blueprint "BB" mark, just never
        reused inside the page itself). The user's source PNG (with
        the full "BETTING BLUEPRINT" wordmark) came from a file on
        their Desktop, not directly extractable from a pasted chat
        image — asked, then found it once told where to look.
      - **Real bookie logos** — `BOOKIE_LIST` (bookies.js) gained a
        `logo` field per bookmaker. Couldn't extract these from the
        user's pasted screenshots either (same limitation); asked, and
        per the user's own choice fetched each bookmaker's real logo
        directly from their own site's `<link rel="icon">`/
        `apple-touch-icon` tags (sportsbet.com.au, tab.com.au,
        ladbrokes.com.au — same "identify the bookmaker" nominative use
        every odds-comparison tool already makes of these) rather than
        hunting for local files. Saved to `icons/bookies/*.png`. Shown
        as a small rounded-square `.bookie-logo` next to the bookmaker's
        name in both the table's own column headers and the Best
        Price cell's "which bookie(s) won" badge.
      - **General polish** — every plain-text/emoji icon replaced with
        a matching inline SVG (currentColor, so it inherits its own
        element's colour/hover rules): the settings gear, the search
        field's icon (now positioned inside the input via CSS instead
        of living in the placeholder string), the Comms/Matched header
        badges, the winner tag's trophy, and the theme toggle's sun/
        moon. Added: a shared hover/focus transition across every
        interactive control; a themed thin scrollbar (sidebar, odds
        table, settings modal); a focus-ring glow (`--focus-ring`,
        matching accent) on text/number inputs and the mode select; a
        rounded-card border + sticky header on the odds table itself
        (`#odds-table-wrapper`, safe to combine with its existing
        horizontal scroll — `overflow-x`/`overflow-y` both explicitly
        `auto`, which clips to the border-radius per spec); a subtle
        row-hover highlight; unified control heights/padding across
        the search field, Stake/Hedge inputs, and Mode select; a new
        `--panel-raised` token for hover backgrounds (light mode's own
        copy deliberately not identical to `--panel`, unlike an
        earlier pass of this same token — white-on-white made the new
        table row hover invisible in light mode until caught and
        fixed).
      - Verified in the local static-preview harness across dark and
        light mode: brand-blue vs `--positive`-green applied to the
        right elements (spot-checked bookie badges, greyhound sport
        badge, a marked WINNER row + its trophy icon, the live dot),
        Settings modal's every tab (Betfair/Display/Bookie/Colours —
        confirmed Colours' own EV tier bands are untouched, still
        user-configurable independent of the brand accent), row hover
        visible in both themes after the `--panel-raised` fix, real
        bookie logos loading without error
        (`naturalWidth`/`complete` checked on every `.bookie-logo`),
        and the layout holding up cleanly from a wide (1600px) down to
        a narrow (500px) viewport. No console errors.
      - Follow-up, same session: dropped each bookie's own text label
        next to its logo (both the column header and the Best Price
        cell's badge) — user-requested, once the real logos made the
        text redundant. `.bookie-th`/`.bookie-badge` go icon-only; the
        bookmaker's name is still reachable via `alt` text and (for the
        badge, which has no visible label of its own left at all) a new
        `title` attribute on hover. `.bookie-badge` shrank from a
        pill sized for icon+text to a small circular icon-only badge.

- [x] Matched the odds table's own density/boldness to bet337 Terminal
      specifically — user sent a screenshot and asked to "aim to match
      the visual feel of bet337's while keeping the colour scheme the
      same" (i.e. our own brand blue/positive-green, not a copy of
      their palette). This PR also had to re-apply the previous PR's
      own bookie-text-removal commit (`0172798`) — that branch got
      merged into `main` one push before it landed, so it never
      actually shipped; brought back in here via cherry-pick.
      - **Coloured runner badges** — `runnerNumberHtml`/
        `RUNNER_NUMBER_COLORS` (popup.js): a small solid-colour square
        badge (12 distinct hues, cycling past that) now leads every
        runner row instead of a plain "1." folded into the name text —
        our own palette, not any bookmaker's real silk colours, and
        independent of the brand accent (a runner's own identity, not
        UI chrome). Scratched rows deliberately kept plain (no badge)
        — a bold colour there would fight the existing muted/italic
        "this runner is out" treatment.
      - **Bolder full-cell EV tint** — `edgeMetricHtml` (popup.js) now
        also returns a `bg` (the same EV tier colour as a ~14%-opacity
        `rgba()`, via a new `hexToRgb` helper — needed because these
        are arbitrary user-configured hex values from Settings > EV
        Colours, not one of popup.css's own fixed tokens), applied as
        an inline `style="background:…"` on the Best Price and each
        bookie's own `<td>` directly — a real coloured cell background
        next to the coloured text, not text-colour alone, matching the
        reference's own denser look. Respects `metricsSuspended` (an
        in-play race) the same way the text already does, so a
        suspended market's cells don't show a bold colour with no
        figure behind it. The Best Price cell's own existing default
        tint (`.col-best-price`'s flat class-level background) is left
        alone when there's no real metric to show — the inline style is
        only added when there's an actual colour to override it with.
      - **Best-price cell outline** — `.col-bookie.best-price` gained
        an inset `box-shadow` outline in the brand accent, boxing
        whichever bookie(s) tie for the best price on that row, on top
        of its existing bold-blue text — the reference's own "here's
        the winner" boxed highlight, in our colour instead of theirs.
      - **Mode as segmented pills, not a `<select>`** — `#mode-tabs`/
        `.mode-tab-btn` (popup.html/css) replace the live toolbar's
        `<select>` with 4 buttons in a recessed track, the active one a
        solid accent pill — the reference's own Win/Place/Bonus/Promo
        tab treatment. `setMode(mode)` (popup.js) is now the one place
        that changes `currentMode` — both the click handler and
        Settings > Display's own defaultMode seeding go through it, so
        the active pill can never drift out of sync with the real mode
        the way two separate copies of "set currentMode + sync the UI"
        risked. Settings > Display's own "Default Mode" field
        deliberately stayed a plain `<select>` — a normal fit for a
        settings form, not the live control the reference's own
        tab-styled toggle was actually replacing.
      - Deliberately NOT attempted: the reference's own "FLUCTS"
        sparkline column (a live price-history mini-chart per runner).
        That's a real feature needing price-history tracking we don't
        currently store, not a styling change — flagged rather than
        faked with placeholder data.
      - Verified in the local static-preview harness, both themes:
        runner badges render distinct/readable; Mug → Bonus mode switch
        via the new pills updates `currentMode`, the active pill, and
        every cell's figures correctly (confirmed via DOM state, not
        just visually, after initially misreading a compressed
        screenshot); Settings > Display's "Default Mode" `<select>`
        confirmed untouched; a marked WINNER row's own per-cell tints
        and the winner-row's own tint coexist without conflict; the
        flash-on-in-play animation (an unrelated, pre-existing feature)
        still fires correctly. No console errors.

- [x] Same session, three more user-reported rough edges once the
      denser styling above made them stand out:
      - **Header row inconsistency — misdiagnosed, then corrected**:
        first removed Best Price/Back/Lay's own coloured headers
        (accent blue / --back-color / --lay-color) to match the plain
        muted headers everywhere else, assuming that colour mismatch
        was the actual complaint. User clarified it wasn't — "I was
        referring to the best price box didnt have the same highlight
        as the other" — the real gap was that `.col-best-price` never
        got the same accent-outline box a winning bookie's own cell
        does. Reverted the header-colour change outright (Best
        Price/Back/Lay headers are coloured again, same as always)
        and added the actual fix instead: `td.col-best-price.has-price`
        gets the same `box-shadow: inset 0 0 0 1.5px var(--accent)` as
        `.col-bookie.best-price` (now `.row-best`, see below),
        conditioned on `bestPrice != null` — never on a scratched
        row's "—" or the footer's Market % row.
      - **A stray divider line** — `#race-info-bar`'s own
        `border-bottom` sat directly under both the race title/countdown
        and the Mode/Stake/Hedge controls, at the same height the
        sidebar's own race list was still visible beside it — user
        described it as "the line that runs across separating the race
        list and race details and mode box." Removed outright; the
        table's own header row still has its own border immediately
        below, so no visual gap opened up where it used to be.
      - **Runner badge colours were invented, not real** — user sent a
        real Sportsbet/racing screenshot showing the actual Australian
        saddlecloth colour-by-number convention (1 red, 2 black/white
        check, 3 white, 4 blue, 5 orange, 6 green, 7 black, 8 pink).
        `RUNNER_NUMBER_COLORS` (popup.js) replaced with exactly that,
        continued 9-12 with the same real convention (emerald, purple,
        grey, brown) instead of the made-up 12-hue palette from the PR
        above. #2 gets an actual small CSS checkerboard
        (`.runner-number-check`, two offset diagonal-split gradients)
        rather than a flat colour, with a black text-shadow so the
        number stays legible over both the light and dark squares; #3
        (white) gets a fixed grey border so it doesn't disappear
        against a light-mode page background; every swatch now carries
        its own explicit text colour instead of assuming white always
        works.
      - Verified in the harness: `#race-info-bar`'s computed
        `border-bottom-width` confirmed `0px`; each runner badge's
        computed background/border/`background-image` checked
        individually (red/orange/blue solids, #3's real border,
        #2's real `background-image` gradient, not just a solid
        colour). No console errors.

- [x] Same session, two more from the user: the row/column highlight
      needed to actually match a reference terminal's own two
      *independent* settings ("Highlight best bookie per runner" —
      green tint per row — and "Highlight best runner per bookie" —
      gold outline per column), not the single row-only outline this
      had become; and race times switched from 24-hour to 12-hour
      am/pm.
      - **Row + column highlight, both at once** — `renderRace`
        (popup.js) now computes `bestBookieMetricByBookie` once per
        render (one pass over every displayed row, per bookie: the
        highest `bookieMetricPercent` value in that bookie's own
        column) before building any row, since column-best has to know
        every runner's figure for a bookie before any one row can be
        judged against it. Each bookie `<td>` then carries two
        independent classes: `.row-best` (this bookie ties for the
        best price for *this* runner — reuses the existing price-based
        `bestBookmakerPrices` check outright, since every mode's EV
        formula is monotonic in the bookmaker price for a fixed
        runner, so "best price" and "best EV" never disagree within
        one row) gets a strong green (`--positive`) tint, overriding
        the cell's usual EV-tier tint outright; `.col-best` (this
        runner ties for the best figure *this bookie* has anywhere in
        the race) gets an inset amber (`--amber`) outline, independent
        of `.row-best` — a cell can carry both at once, same as the
        reference. Old `.col-bookie.best-price` (a single outline,
        conflating the two) removed outright.
      - **12-hour race times** — `formatJumpTime` (the race-info bar's
        "Jumps at…") hand-rolled to `H:MM am/pm` (no leading zero on
        the hour, lower-case am/pm, guaranteed regardless of browser
        locale) instead of relying on `toLocaleTimeString()`, which
        the plain-24-hour version this replaces had deliberately
        avoided for the opposite reason. The sidebar's own per-race
        time (`raceCardHtml`) already used `toLocaleTimeString` in a
        way that likely already showed am/pm under most locales, but
        gained an explicit `hour12: true` so it can never silently
        drift from `formatJumpTime`'s own guaranteed format.
      - Verified in the harness: a synthetic 3-runner/3-bookie race
        with deliberately distinct prices per cell — every single
        `.row-best`/`.col-best` flag checked against independently
        hand-computed row and column maxima (all correct); the one
        cell that was column-best but not row-best had its computed
        `box-shadow` confirmed as the exact `--amber` rgb value, not
        just visually present. `formatJumpTime` checked directly for
        midnight (`12:05 am`) and noon (`12:00 pm`), not just a
        daytime example. No console errors.

- [x] Best Price cell's own highlight corrected again, and both
      bookie-grid highlights made independently toggleable — user:
      "change the best price colum to match the best price box shown
      (green text and shded green box) not green highlighted border",
      then "can we add it to seetings to be able to toggle on and off
      like as seen in the photo" (the same bet337 Settings screenshot
      from before).
      - **Best Price cell** — the accent-outline box-shadow added two
        commits ago (itself a fix for a different, earlier
        misunderstanding) removed outright. It now just relies on the
        same EV-tier tint every bookie cell already had — which
        already reads as "green text and a shaded green box" whenever
        the price is genuinely good, no separate signal needed. That
        tint's own opacity bumped from 0.14 to 0.2 across the board
        (`edgeMetricHtml`, popup.js) so it reads as a real shaded box
        rather than a faint wash — the same change makes ordinary
        bookie cells' own EV-tier tint a little more visible too.
        `has-price`, the class this outline needed, removed along with
        it — no longer used by anything.
      - **Two new Settings > Colours toggles** —
        `highlightBestBookiePerRunner`/`highlightBestRunnerPerBookie`
        (settings.js, both default on — unchanged behaviour for
        anyone who doesn't touch them), with matching checkboxes in
        both popup.html's modal and options.html's standalone page
        (the two already share every other Colours field the same
        way). `renderRace`'s own `rowBest`/`colBest` computation
        (popup.js) now short-circuits on the matching setting before
        even checking the underlying condition, so a disabled
        highlight is never computed as true, not just hidden by CSS.
      - Verified in the harness: Best Price cell's computed
        `box-shadow` confirmed `none` and its background confirmed an
        exact rgba tint matching its own text colour (not just visibly
        similar). Toggled each new setting off independently through
        the actual Settings UI (not by editing `currentSettings`
        directly) and confirmed `.row-best`/`.col-best` cell counts
        dropped to 0 only for the disabled one, then restored both and
        confirmed counts matched the pre-toggle baseline exactly —
        caught a save-order race condition in testing itself (firing
        two setting changes with no wait between them lost one
        update, a pre-existing characteristic of `saveSettings`'s own
        read-then-write pattern, not a bug in either new checkbox) and
        redid the check with realistic timing between changes. No
        console errors.

- [x] Odds table cells centred (were right-aligned) and bookie logos
      enlarged, per a user screenshot and follow-up request.
      - `th, td`'s own base `text-align` changed to `center` (was
        `right`); `th:first-child`/`td:first-child`'s own separate
        `text-align: left` (unchanged) still keeps the Runner column
        reading left-to-right. `.stacked-cell` (the price+Edge%/Ret%
        stack every bookie's own cell uses) had its `align-items`
        changed from `flex-end` to `center` to match — the parent
        `<td>`'s own `text-align` alone doesn't reach a flex child's
        cross-axis alignment.
      - `.bookie-logo` grown from 14px to 22px (`border-radius` 4px to
        5px to match the larger size proportionally).
      - Verified in the harness: computed `text-align` checked directly
        on the Lay $ cell (`center`) and the Runner cell (`left`, still
        unaffected); logo `offsetWidth`/`offsetHeight` confirmed 22.
        No console errors.

- [x] Moved the two bookie-grid highlight toggles from Settings >
      Colours to Settings > Display (user request) — same checkboxes,
      same ids, just relocated markup (right after the Display Edge
      %/EV $/Off toggle, before Default Race Types) in both
      popup.html's modal and options.html's standalone page. No JS
      changes needed — `settingFields`/`applySettingsToForm` (options.js)
      already look these up by id, not DOM position.
      - Verified in the harness: the two checkboxes' elements confirmed
        contained by `.modal-tab-panel[data-tab="display"]` and NOT by
        `[data-tab="colours"]` (via `.contains()`, not just visually),
        both still correctly checked after the move. No console
        errors.

- [x] Fixed a real bug: user-reported/screenshotted that a race's
      favourite runner never got a Ladbrokes price at all, cross-
      referencing Ladbrokes' own real page (clearly showing a live
      Fixed Win price, "FAV" badge and all, for that exact runner).
      Live-inspected the real DOM (`js/contentScripts/ladbrokes.js`/
      `ladbrokesWatcher.js`'s own target page) to find why: the
      favourite's own `[data-testid="price-button"]` element carries
      an extra "FAV" badge `<div>` as a sibling of the actual price
      `<button>`, so that element's own `textContent` reads
      `"FAV2.90"` — `parseFloat("FAV2.90")` is `NaN`, so the price got
      silently dropped (the exact same "no reliable number" path a
      genuinely missing price takes) for every favourite, in every
      race, while every non-favourite runner's plain price text
      parsed fine. Confirmed live (not just theorised) that a nested
      `[data-testid="price-button-racing"]` element holds only the
      number, on every runner regardless of favourite status — both
      files switched to read that instead of the outer element's own
      text.
      - Verified directly against a real, current Ladbrokes race page
        (Healesville R2): the exact fixed scraping logic run live
        returned a real price for the favourite ("Mum's Energy",
        $2.80, live-fluctuated from the user's own $2.90 screenshot)
        alongside every other runner's own price, unchanged from
        before the fix.

- [x] Added an AU/NZ country filter to the sidebar's Upcoming Races,
      per a user screenshot of a similar toggle (a Ladbrokes AU/AU&NZ/
      International control) — same idea, but a plain independent
      on/off pair rather than a combined radio-style control, matching
      how Race Types already works right above it.
      - `race.country` (background.js's `listUpcomingRacesInner`) —
        Betfair's own EVENT projection already returns this on every
        market (the same projection `listWinMarkets` already
        requests), no extra API cost. Every race this extension ever
        lists is already AU or NZ (`listWinMarkets`'s own
        `marketCountries` filter), so there's no third value to
        account for.
      - `selectedCountries` (popup.js) — both on by default, same
        toggle/persist pattern as `selectedRaceTypes`, applied
        alongside it in `renderFilteredRacesList`'s own
        `matchesFilter`. A race with no `country` at all (shouldn't
        happen for a real Betfair market, but placeholder/mock data
        doesn't always set one) is never filtered out by this, rather
        than silently disappearing from Today for an unrelated reason.
      - `#country-filter`/`.country-btn` (popup.html/css) — same pill
        shape/hover/toggle behaviour as the Race Type buttons, but one
        shared accent tint rather than a colour per item, since AU vs
        NZ isn't a distinct "identity" the same way horse/harness/
        greyhound are.
      - Deliberately scoped to just the live sidebar toggle, not also
        a Settings > Display "Default Countries" the way Race Types
        has one — not asked for, and easy to add later if wanted.
      - Verified in the harness: 3 mock races (2 AU, 1 NZ) all shown
        with both toggles on; toggling NZ off dropped exactly the NZ
        race (checked the actual visible race list, not just the
        toggle's own state) and left both AU races; toggling back on
        restored it. A 4th race with no `country` field at all stayed
        visible through the same NZ-off toggle, confirming the
        fallback. No console errors.

- [x] Added an AU/NZ label next to each race card's own start time
      (`raceCardHtml`, popup.js — `race.country`, same field the
      filter above already added) — user-requested follow-up, small
      muted badge next to the time text rather than a full pill,
      since this is just a label here, not a toggle.
      - User also reported the country filter itself "not working —
        it's supposed to remove races from the list if it's not
        selected." Re-verified the filter logic itself in the harness
        with real `country` values present on mock races — toggling
        NZ off correctly dropped exactly the NZ race, same result as
        before — so `renderFilteredRacesList`'s own matching logic is
        confirmed still correct. The `!race.country` fallback this
        filter has (never hides a race with no country at all, so a
        real bug elsewhere can't look like "silently disappeared for
        no reason") means if every real race's own `country` field is
        coming back empty from Betfair's own API for some reason not
        yet confirmed, every race would show regardless of which
        toggle is on — exactly matching what was reported. Asked the
        user to check `latestRaces[0]` in the popup's own DevTools
        console to confirm whether that's actually happening before
        changing anything further — not fixed yet, still open pending
        that.

- [x] Sidebar's own `.race-live-dot` given a real meaning — user
      clarified (in passing, re: a different site's own dot): "the
      green circle is the race status. green=markets opened
      red=markets closed." Ours was purely decorative before this —
      always the same colour on every card, never toggled by
      anything.
      - `raceCardHtml` (popup.js) now computes `marketClosed` via
        `isShowingStatusWord` — the exact same "gone in-play or
        resulted" check that race's own countdown already shows IN
        PLAY/RESULTED for, not a second copy of that logic, so the
        dot and the countdown word can never disagree. `.closed`
        swaps the dot from green (`--positive`) to red (`--accent-neg`)
        — the same colour roles `.live-dot.live`'s own "connected"
        signal and the EV tiers' own bad-value red already use, not
        new one-off colours. A `title` attribute ("Market open"/
        "Market closed") added alongside, since the colour alone
        isn't very discoverable.
      - Verified in the harness with three mock races covering every
        state `isShowingStatusWord` distinguishes: a genuinely open
        race (green, "Market open"), one flagged `bookieMarketClosed:
        true` — in-play (red, "Market closed"), and one with a
        `winner` set — resulted (red, "Market closed") — checked each
        dot's own computed class and title directly, not just visually.
        No console errors.

- [x] Fixed two real bugs in the odds table's own header row, both
      user-reported/screenshotted: the Best Price header not lining up
      vertically with Runner/Sort: Edge next to it, and its background
      reading as a different colour from the rest of the header bar.
      - **Background mismatch** — `.col-best-price`'s own class-level
        tint (meant for the data cells below the header) was beating
        the sticky header's shared `background: var(--panel)` on
        specificity (a class beats `thead th`'s two-element
        selector), so the Best Price *header* cell picked up a faint
        blue tint none of its neighbours had. Added
        `thead th.col-best-price { background: var(--panel); }` to
        win that back — the data cells keep their own tint untouched.
      - **Vertical misalignment** — measured it directly rather than
        guessing: the Runner header's own box (`display: flex`
        *and* `position: sticky` on the same `<th>`, from the sort
        button's own layout) computed a shorter height (36px) than
        its plain sticky sibling cells (41.5px) in this browser,
        breaking the table's own equal-row-height guarantee and
        visibly offsetting its content from Best Price next to it.
        Moved the flex row onto a new inner `<span class=
        "th-runner-inner">` (popup.html) instead of the `<th>` itself
        — keeping the `<th>` a plain sticky table-cell (default
        `vertical-align: middle`, same as every other header) sidesteps
        the browser quirk entirely.
      - Verified in the harness: both header cells' computed
        `getBoundingClientRect()` heights confirmed identical (41.5px
        each, not just visually close) and their computed
        `backgroundColor` confirmed byte-for-byte identical, in both
        dark and light mode. No console errors.

- [x] Race-info bar's own dot (`#race-live-dot`, next to the track/race
      title above the odds table) now shares the sidebar list's
      "green=open, red=closed" market-status meaning instead of a
      separate "live Betfair connection" signal it used to show — user
      asked for it to "update the same time as the one in the upcoming
      race list."
      - `renderRace` (popup.js) now toggles it from `raceInPlay`, the
        exact same `isShowingStatusWord` result already computed there
        for the in-play flash/metrics-suspend logic just above it — not
        a second copy of that check — so this dot and the sidebar's own
        can never disagree.
      - `tickCountdowns()` (the once-a-second interval already driving
        the "Jumps at HH:MM · in ..." countdown) now re-derives this dot
        too, from the same `isShowingStatusWord` call it already makes
        for hiding the countdown's "in" prefix. That means it flips to
        red the instant the countdown itself switches to IN PLAY/
        RESULTED, every second, rather than only whenever a race is
        first loaded or the next background poll happens to land —
        actually "the same time," not just the same eventual value.
      - `title` swaps between "Market open"/"Market closed" to match,
        and `.live-dot`'s CSS was repointed from its old grey/green
        "connected" colours to the sidebar dot's own green/red
        (`--positive`/`--accent-neg`) tokens.
      - Verified in the harness: called `renderRace` with a race flagged
        `marketStatus: "CLOSED"` and confirmed the dot's own class,
        title, and computed background all flipped to the closed state;
        separately, mutated only the countdown element's dataset (no
        re-render) and called `tickCountdowns()` alone — confirmed it
        still flips the dot to closed in step with the countdown text
        itself switching to "IN PLAY." No console errors.

- [x] Fixed two real bugs, both user-reported/screenshotted: the
      Sportsbet logo appearing cropped/circular next to TAB and
      Ladbrokes' full-square ones, and a decorative blue circular
      background/border around every bookie logo in the Best Price
      cell's own badge.
      - **Sportsbet logo** — `icons/bookies/sportsbet.png` replaced
        with the logo the user supplied directly (saved to their own
        Pictures folder), a full-bleed square "sb" mark, same treatment
        as TAB/Ladbrokes' own icons rather than a padded/circular
        emblem.
      - **Best Price badge** — `.bookie-badge` (popup.css) had its own
        `background`/`border`/`border-radius`/`padding` (a blue-tinted
        pill wrapping the logo) removed entirely, so the cell now shows
        just the plain logo, same as the column header.
      - Verified in the harness: read the new icon file directly to
        confirm it's the full square logo, not a re-crop of the old
        one; checked every `.bookie-logo`'s own `getBoundingClientRect()`
        (still a uniform 22px everywhere) and `.bookie-badge`'s computed
        style (`background: transparent`, no border, `border-radius: 0`,
        no padding) directly rather than just visually. No console
        errors.

- [x] Betfair's own Back/Lay price and liquidity now freeze the moment a
      race actually jumps, instead of continuing to follow Betfair's own
      in-play trading.
      - `refreshRaceInner` (background.js) — once
        `bookieMarketClosedConfirmed` (the same "has this race actually
        gone in-play" signal popup.js's own countdown/market-status dot
        already rely on, hoisted earlier in the function so the runner
        loop can use it too) is true, `betfair`/`betfairLiquidity`/
        `betfairBack`/`betfairBackLiquidity` all just carry forward
        whatever `existingRunner` already holds instead of taking a
        fresh DOM/REST value — Betfair's own in-play trading swings
        wildly once running and no longer reflects a meaningful "closing"
        line, so this is deliberately permanent for the rest of that
        race's selection, not a freshness window that could later thaw.
      - Verified: a standalone freeze-logic check run across three
        simulated refresh cycles (open → just-jumped → still-jumped, each
        with a different synthetic REST price/liquidity) confirmed the
        frozen value stays exactly what it was the moment it first froze,
        ignoring every later "fresh" value. No console errors.
      - A CLV (Closing Line Value) column briefly existed alongside this
        — a new column showing Best Price's own Edge%/Ret% against the
        now-frozen price, hidden until the race jumped — but was removed
        again outright per a direct follow-up user request ("remove the
        clv column entirely"), rather than kept around disabled. The
        freeze above is unaffected; only the CLV-specific code (the
        `clvMetricHtml`/`formatClvMetric`/`clvCellHtml` trio, its
        `<th class="col-clv">`, and every `<td class="col-clv">`) came
        back out.
      - Housekeeping note: PR #120 auto-merged right after its first
        commit landed, before the two follow-up commits above (hide,
        then remove CLV) had been pushed to that same branch — so they
        never actually reached `main` despite being reported as done.
        [PR #121](https://github.com/ryannmarshall1077-ops/racing-odds-compare/pull/121)
        (opened straight from that same branch) brings main in line with
        what was actually asked for.

- [x] The runner-number badge for horse/harness runners now shows that
      horse's own real "silks" — the actual small colour thumbnail
      Betfair itself displays — instead of a generic AU saddlecloth-
      colour-by-number convention that doesn't represent real horses.
      User-reported ("horse racing is different to dog racing... can we
      get the horses colour in the list to match up whats displayed on
      betfair"), confirmed directly against Betfair's own live site:
      the exact race the user screenshotted (Mildura, "Calf Pen"/"Shes
      Poppy"/etc.) really does show a distinct per-horse silk image next
      to each runner — number-by-number flat colours (1=red, 2=black/
      white check, ...) agree with real silks on nothing. Dog racing has
      no such image at all (confirmed against a live greyhound market's
      own DOM: zero `img.horse-racing-silk` elements there), so
      greyhounds keep today's flat-colour badge unchanged, and a horse/
      harness runner whose silk hasn't been scraped yet just falls back
      to it too.
      - **Where it actually comes from** — the silk image's own filename
        turned out to be some Betfair-internal horse id, NOT this
        runner's own selectionId (confirmed live: they don't match at
        all for the same runner, e.g. selectionId 102633199 vs a silk
        filename like 2391692.png) — so it can't be constructed from our
        own REST catalogue call the way everything else here is keyed.
        It only exists in the market page's own DOM, so `betfairWatcher.js`
        (the existing content script already scraping Back/Lay prices
        live off the tracked Betfair tab) now also reads each
        `img.horse-racing-silk`'s own `src`, keyed by whichever
        `bet-selection-id` its enclosing runner row already carries —
        the exact same id every price cell already keys off.
      - `applyBetfairOdds` (background.js) merges `silkUrl` onto the
        matching runner, sticky once known (a later scrape that doesn't
        happen to re-read it should never erase an already-known one) —
        and `refreshRaceInner`'s own runner-rebuild (which reconstructs
        the whole runner object from scratch every REST cycle, not a
        spread of the old one) now explicitly carries it forward too,
        since nothing else there would have.
      - `runnerNumberHtml` (popup.js) renders the real silk `<img>` (no
        background/border of its own — same plain treatment as
        `.bookie-logo`, user-reported an earlier white-boxed version
        didn't match) with the number put back as plain "N. Name" text
        in front of it (matching a reference screenshot) when `silkUrl`
        is known, falling back to the existing coloured number badge
        otherwise.
      - Verified: read the actual live DOM of the exact race the user
        screenshotted (via the user's own logged-in Chrome) to confirm
        `img.horse-racing-silk` is real, confirm the selectionId/silk-id
        mismatch directly (ruling out constructing the URL from REST
        data), and confirm a live greyhound market has none. In the
        harness: assigned real, live-fetched Betfair silk URLs to two
        mock runners and confirmed exactly those two rendered the real
        image (no background/border, matching `.bookie-logo`'s own
        computed style) while every other runner still rendered the
        original flat-colour badge, both in the same table. No console
        errors.

- [x] Fixed a real bug in the Betfair back/lay/liquidity freeze itself
      (the earlier entry above added it, but user-reported it wasn't
      actually taking effect once bookie markets closed).
      - Root cause: `refreshRaceInner`'s own freeze only covers the
        ~60s REST refresh. `applyBetfairOdds` — the separate, far more
        frequent handler that applies betfairWatcher.js's near-real-time
        DOM-scraped price/liquidity the instant Betfair's own page
        changes — had no freeze check at all, so it kept overwriting the
        frozen value with whatever Betfair's own in-play page showed on
        every single scrape, undoing the freeze within moments of it
        taking effect.
      - Fixed by gating `applyBetfairOdds`'s own price/liquidity/back/
        backLiquidity merge on the same `liveRace.bookieMarketClosed`
        flag `refreshRaceInner` already checks — once true, this handler
        now leaves those fields untouched entirely (silks stay
        independent of this, still merged either way).
      - Verified: a standalone simulation of the real function across
        three calls (open → bookie market closes → two more simulated
        Betfair in-play swings) confirmed the price/liquidity stayed
        exactly what they were the moment the market closed, both times
        a later "fresh" in-play value tried to come through.

- [x] Liquidity in the Betfair Back/Lay boxes now disappears entirely
      once the race goes in-play, alongside the price freeze above —
      user-requested follow-up. The frozen price is still meaningful as
      the closing line; a frozen liquidity figure is just a stale number
      from the moment trading stopped, not real depth any more, so it
      gets the same "gone, not shown as a dash" treatment every other
      Edge%/Ret%/EV% figure `metricsSuspended` already gives.
      - `priceCellInner` (popup.js, shared by both halves of every
        Back/Lay box) now checks `metricsSuspended` and omits the
        `<span class="cell-liquidity">` element outright rather than
        rendering it empty — the box actually shrinks to just the price,
        not a blank gap where the figure used to be.
      - Verified in the harness: 10 `.cell-liquidity` elements present
        on a still-open race, 0 after simulating `bookieMarketClosed:
        true` (screenshot confirmed the boxes visibly shrank to price-
        only), back to 10 again re-rendering the same still-open race
        afterward — checked both directions. No console errors.

- [x] Clicking a sidebar race that had already jumped/resulted before
      the user ever opened it now actually shows that race's result,
      instead of silently redirecting to a different, unrelated
      upcoming race — user-reported exactly this happening.
      - Root cause: `refreshRaceInner`'s existing "market dropped out
        of catalogue" fallback (`settledRaceFromBook`) could only ever
        rebuild a result view from `stored.liveRace` — the one race,
        if any, that happened to already be loaded live. A race the
        user never actually clicked into before it jumped has no
        cached runner names anywhere, and `listMarketBook` (the actual
        result) never carries names, only selectionId/status — so
        there was nothing to build a named result view from at all,
        and the code fell straight through to "genuinely gone",
        loading the next upcoming race instead.
      - Fixed by widening the net: `listUpcomingRacesInner` now also
        caches every race's own runner names/selectionIds (from the
        same catalogue response the sidebar list already comes from,
        well before any of them jump) into a new `knownRaceRunners`
        map, pruned of anything more than `KNOWN_RACE_RUNNERS_MAX_AGE_MS`
        (6h) past its own start time. `refreshRaceInner`'s fallback now
        checks this cache too when `stored.liveRace` doesn't match,
        building a placeholder `previousRace` (real names, every price
        field explicitly `null`/`{}` rather than left `undefined`, so
        the same `== null` checks every price cell already has render
        "—" instead of a stray `NaN`) for `settledRaceFromBook` to
        layer the real result onto.
      - Verified: a standalone simulation of the cache's own
        write/prune/lookup cycle confirmed a race's names survive being
        cached before it jumps, survive falling out of the ~20-wide
        upcoming window on a later fetch (still within the 6h cutoff),
        and a genuinely stale unrelated entry past that cutoff gets
        pruned. In the harness: fed `renderRace` the exact shape this
        fallback would produce (real names, a winner, every price
        field null) — rendered with no console errors, correctly
        showed "RESULTED" (via `tickCountdowns`) once ticked, the
        winning runner's own "Winner" tag, and no liquidity figures
        (still correctly suspended).

- [x] Ladbrokes now auto-opens into the exact selected race, same as
      Sportsbet already did — user asked why TAB/Ladbrokes didn't do
      this too. TAB turned out to already have the right mechanism
      (`tabRaceUrlFromCodes`/`tabMeetings.js`, unchanged here — confirmed
      live it's still working: TAB's own real race links still match
      the exact URL pattern that scraper expects, and TAB genuinely has
      no public feed to fetch directly instead, unlike what turned out
      to be true for Ladbrokes). Ladbrokes had neither before this — its
      own overview page has no real links to scrape (confirmed live,
      just `cursor-pointer` divs with no href) and its race URLs are
      opaque GUIDs with no derivable pattern from the URL alone.
      - Found a way anyway: Ladbrokes' own frontend calls a public,
        unauthenticated GraphQL endpoint
        (`https://api.ladbrokes.com.au/gql/router`, a persisted-query
        GET) to build its own race grid — discovered by monkey-patching
        `window.fetch` on a real page load and reading what it actually
        called. Confirmed live: calling that exact URL directly with no
        session/cookies returns full horse/greyhound/harness data for
        any date, already split into those three buckets. Each race's
        own `id` there is exactly the GUID Ladbrokes' real race URLs
        use — confirmed by clicking into a real race and comparing.
      - Also confirmed live: the URL's slug segment (the bit before the
        GUID) is purely cosmetic — navigating with an arbitrary
        placeholder slug and the real GUID still loaded the correct
        race, since Ladbrokes' own routing is entirely by id.
      - New `js/ladbrokes/api.js` (`fetchLadbrokesNextEvents`/
        `buildLadbrokesRaceUrl`) mirrors `js/sportsbet/api.js`'s own
        shape. `listUpcomingRacesInner` (background.js) now matches each
        Betfair market against it the same way it already does for
        Sportsbet (`lbMatch`, alongside the existing `sbMatch`) — venue
        name + race number + a 5-minute start-time tolerance — and sets
        the new `ladbrokesUrl` field `openRaceTabs` (popup.js) already
        knew how to open generically (it was always coded to treat any
        `${bookie.id}Url` the same way; only Ladbrokes' own value was
        ever missing).
      - One real venue-naming quirk found and handled: Ladbrokes brands
        some of its own feature meetings with a "Ladbrokes " prefix on
        the venue name itself (confirmed live: "Ladbrokes Geelong" for
        Betfair's own plain "Geelong", while an unbranded meeting the
        same day needs no such handling at all) — stripped before
        matching (`stripLadbrokesBrandPrefix`), since the existing
        `namesMatch` prefix rule only handles a suffix difference
        (Sportsbet's own case), not a sponsor prefix like this one.
      - `manifest.json`'s `host_permissions` gained
        `https://api.ladbrokes.com.au/*` (the site itself, `www.
        ladbrokes.com.au`, was already listed) — needed for
        background.js's own fetch to that API subdomain.
      - Verified live end-to-end, not just in theory: fetched real
        current data (271 races across all three sports), confirmed the
        one branding-prefix case matches correctly and an unrelated
        venue doesn't, and confirmed the exact resulting URL for a real
        race actually loads that race on Ladbrokes' own site.

- [x] TAB now learns a venue's code on the spot the moment you click a
      race it hasn't seen yet, instead of leaving TAB's tab untouched
      until tomorrow's scheduled background visit — user-reported TAB
      "just didn't work" for a race like this, which from the outside
      looked identical to a real bug (a diagnostic console session
      together confirmed the underlying `namesMatch`/regex machinery
      itself was fine; the actual gap was purely "hasn't been learned
      yet" with no on-demand fallback).
      - New `ensureTabUrlForRace` (background.js) — checks
        `tabVenueCodes` first (instant, the common case once a venue's
        been seen at all this session or via today's background visit),
        and only if that comes back empty does it call the exact same
        `visitTabMeetingsPage` the once-a-day job already uses, then
        re-checks. A new `ENSURE_TAB_URL` message exposes it to the
        popup.
      - `openRaceTabs` (popup.js) now calls this specifically for TAB
        when `race.tabUrl` is missing, instead of just leaving that
        bookie's tab alone — a ~6s delay only the very first time a
        given venue/sport combo is opened; instant on every later click
        once it's known.
      - Verified: a standalone simulation of the real function (fake
        storage + a fake page-visit that "learns" a venue) confirmed a
        first click for an unknown venue triggers exactly one visit and
        resolves to the real URL, a second race at the same venue
        resolves instantly with zero further visits, and a genuinely
        unmatchable venue falls back to `null` cleanly rather than
        throwing.

- [x] Run 2nd/Run 2nd 3rd modes' own Pr(2nd)/Pr(3rd) completely replaced
      with a power-adjusted, market-calibrated Harville model — a
      deliberate user-requested u-turn on an earlier decision (a prior
      version dropped Harville entirely because raw Harville disagreed
      with real market data by ~2x for an actual runner — this is a
      carefully re-derived return to it, not that same attempt again
      unchanged). Previously: real Betfair place-market data only, and
      only when the exact right market existed (`placeMarketWinners`
      2 for Run 2nd, 3 for Run 2nd 3rd) — anything else, including the
      common case of a Top-3 market when Run 2nd alone needed just the
      2nd-place split, stayed a flat `null`, "no reliable number to
      show."
      - **The model** (`popup.js`, new `computeHarvilleModel` and its
        own helpers) — normalizes every priced, non-scratched runner's
        win probability to sum to 100% (Harville's own derivation
        assumes a coherent field, unlike Mug mode's deliberately
        un-normalized `1/LayOdds` convention elsewhere in this file),
        raises them to a power λ ("flattens" the field, correcting
        Harville's own well-documented favourite-overestimation bias),
        then runs the standard Harville sequential-elimination formulas
        for Pr(2nd)/Pr(3rd) on the adjusted field.
      - **Calibrating λ** — rather than guessing one fixed exponent,
        λ is fitted per race by minimizing the sum of squared errors
        between the model's own Top-2 (or Top-3) prediction per runner
        and whatever real place-market data (`placeBetfair`) this race
        actually has, via a ternary search over a bounded range (a
        smooth, single-dipped curve — no external solver needed). No
        real place-market data at all falls back to a fixed λ = 0.85
        (literature's own commonly-cited 0.8-0.95 correction range)
        rather than skipping the adjustment outright.
      - Computed once per race render (`renderRace` → new module-level
        `currentHarvilleModel`, keyed by `selectionId`), not once per
        runner per render — this is O(n²)-O(n³) work, wasteful to
        repeat the way the old direct `placeBetfair` lookup could
        afford to. `promoPlaceProb` now just looks its own runner up in
        it instead of computing anything itself.
      - `promoEVPercent`'s own EV formula (`QL + placeProb × Refund`)
        is completely unchanged — mathematically it was already exactly
        the 3-branch (win/place/lose) expectation the user described
        wanting, just algebraically simplified; only where `placeProb`
        itself comes from changed.
      - Caught and fixed a real bug along the way: `mock-data.js`'s own
        runners all had `selectionId: null`, which collapsed every
        runner into one shared model entry the moment this was tested
        in the harness — fixed there (real per-runner ids added), not
        worked around in the model itself, since real Betfair data
        never has this problem.
      - Verified thoroughly given real money rides on this: `powerAdjust`
        with λ=1 is a true identity; Σ Pr(2nd) and Σ Pr(3rd) across a
        whole field both compute to exactly 1 (a strong,
        reference-number-free correctness check baked into Harville's
        own derivation); a favourite always gets a higher Pr(2nd)/
        Pr(3rd) than a longshot; the λ-fitting optimizer recovers a
        *known* synthetic λ to 9 decimal places from data generated by
        that exact λ, and measurably reduces error versus leaving λ at
        1. In the harness (post mock-data fix): a 5-runner field
        produced 5 distinct model entries, Σ Pr(2nd)/Σ Pr(3rd) both
        exactly 1.000000, correctly monotonic by favourite→longshot,
        Run 2nd 3rd's own combined figure bigger than Run 2nd's alone,
        and a race with no real place data at all correctly fell back
        to λ = 0.85. No console errors.

- [x] Fixed a real bug in the Harville model above: user-reported the
      new Run 2nd 3rd figures disagreeing with a reference tool's own
      by roughly the same ~2x margin raw Harville was originally
      dropped over — traced live to a genuinely illiquid PLACE market
      (a lower-tier greyhound race's own "Top 3" market), not the
      model itself.
      - Root cause: a real place market's own per-runner implied
        probabilities should sum to roughly `winners` across the whole
        field (one runner "wins" each of the K paid places — the same
        conservation Harville's own model enforces by construction).
        Live diagnostic (`chrome.storage.local.get("liveRace", ...)` in
        the popup's own DevTools) turned up a real Top-3 market summing
        to 0.97, not ~3 — its own "best available to lay" price sitting
        on a stale/token order rather than real consensus, common for
        PLACE markets specifically (far less traded than the WIN
        market, especially on a lower-tier meeting). Fitting λ against
        that dragged it to 0.41 — far outside the literature's own
        0.8-0.95 range — inflating every runner's own modeled Top-3
        chance 3-9x past what the real market implied.
      - Fixed with a coherence check (`COHERENCE_TOLERANCE = 0.5`,
        `computeHarvilleModel`): a real place market's implied
        probabilities summing to less than half of `winners` is
        rejected as a calibration target outright — not a market
        efficiency problem worth trusting harder, there's no real
        signal left in it — falling back to the safe default λ = 0.85
        instead of fitting to noise.
      - Verified against the exact real numbers from the live
        diagnostic: the Richmond R12 (G) data that exposed this now
        correctly falls back to λ = 0.85 instead of fitting to 0.41; a
        separately-checked genuinely coherent Top-2 market (summing to
        ~1.96, well within tolerance) still calibrates normally, not
        rejected too. Confirmed the same in the full render path with
        no console errors.

- [x] A deliberate conservative haircut on top of the Harville model's
      own Pr(2nd)/Pr(3rd) output — user-requested directly: a missed
      opportunity (the model understating a real edge) costs nothing;
      an inflated one (overstating it) costs real money on a bet that
      wasn't actually +EV, so asked for the model to structurally lean
      low rather than chase a perfect central estimate. Prompted by a
      second live comparison (Cranbourne R10) where the model's own
      figures for a race's favourite ran well above a reference tool's
      even with a coherent real place market and a sane fitted λ — not
      something the coherence check above catches, since that's
      specifically for an incoherent market, not this.
      - `CONSERVATISM_FACTOR = 0.7` (`computeHarvilleModel`) — every
        runner's own Pr(2nd)/Pr(3rd) gets multiplied by this before
        being stored in the model, applied uniformly (not chasing any
        one specific cause of overestimation, the same rabbit hole that
        made a prior version drop Harville entirely). One constant,
        openly tunable — lower for more conservative, higher if it
        turns out too conservative in practice.
      - Deliberately does NOT change which runner the model ranks
        highest — a flat multiplier preserves relative order, it only
        scales the magnitude down. The Cranbourne case's other symptom
        (the model picking a genuinely different "best" runner than
        the reference tool, not just a different number for the same
        one) is a separate, still-open question this change doesn't
        address on its own.
      - Verified in the harness: Σ Pr(2nd) across a field that summed
        to exactly 1 before this change now sums to exactly 0.7 (=
        CONSERVATISM_FACTOR), and the field's own best-to-worst ranking
        by Pr(2nd)+Pr(3rd) is unchanged before vs after the haircut. No
        console errors.

- [x] Capped how far `fitHarvilleLambda`'s own calibration search can
      go — user-requested: don't prioritize favourites as much, dampen
      the EV spread across the field. lambda < 1 flattens the
      favourite/longshot gap by design (the whole reason the power
      adjustment exists), but nothing stopped the fit from landing
      *above* 1 when that best matched a race's own real place data —
      confirmed live this actually happens (1.02-1.15 in real
      comparisons), which sharpens the gap instead, the opposite of
      what this exists for.
      - New `MAX_HARVILLE_LAMBDA = 0.85` (same value as
        `DEFAULT_HARVILLE_LAMBDA`, so calibration can only ever match or
        beat that baseline's own flattening, never fall back toward raw
        Harville's sharper shape) — the search range itself is capped
        at this (`fitHarvilleLambda`'s own `hi`), not clamped onto the
        fitted result afterward, so the cap is baked into what "best
        fit" even means for this model now.
      - Verified: a real-world-shaped case that previously fit to ~1.06
        (sharpening) now caps at exactly 0.85; a separately-checked case
        that genuinely wants a strongly-flattening low lambda (0.5) is
        recovered exactly, unaffected by the cap. Confirmed the same in
        the full render path (a case shaped to previously land above 1
        now produces 0.844 for every runner) with no console errors.

- [x] The sidebar's Upcoming Races list now shows every race for the
      rest of the day, not just the next ~20 soonest across all sports
      combined — user-requested, specifically as a flat list still
      sorted by jump time (not grouped by track/meeting), so nothing
      needs scrolling or clicking through track-by-track to see what's
      coming up.
      - `listWinMarkets` (`js/betfair/api.js`) gained an optional
        `marketStartTimeTo` param, added to the existing
        `marketStartTime` filter's own `to` bound alongside its
        already-there `from: now` (unchanged) — left unset by
        `refreshRaceInner`'s own "single soonest race" fallback call,
        which only ever wants `maxResults: 1` regardless of how far out
        Betfair would otherwise search.
      - `listUpcomingRacesInner` (background.js) now passes the current
        UTC day's own end-of-day boundary (`endOfTodayUtc`, via
        `setUTCHours(24,0,0,0)` — the same UTC-day approximation this
        codebase already makes elsewhere for "today", e.g.
        `fetchLadbrokesNextEvents`'s own date param) and raises
        `maxResults` from 20 to 1000 — Betfair's own documented
        `listMarketCatalogue` ceiling, not an arbitrary number.
        `FIRST_TO_START` sort (unchanged) keeps the result chronological.
      - No popup.js/UI changes needed at all — `renderRacesList` already
        maps over the full `latestRaces` array with no truncation
        anywhere in the frontend, so the wider backend list just renders
        in full automatically.
      - Verified: the date-boundary math resolves to the correct next
        UTC midnight from any "now"; the filter object correctly omits
        `to` entirely for the old single-soonest-race call site
        (backward compatible) and includes both bounds for the sidebar's
        own call; confirmed no hidden `.slice`/cap anywhere in the
        popup's own rendering that would silently truncate a longer
        list.

- [x] Fixed a real bug this same "all races today" change exposed:
      Sportsbet's own price column showing its betfair×1.08 placeholder
      — styled identically to a real price, no visual difference at
      all — for a race Sportsbet's own tracked tab plainly hadn't
      loaded yet (most likely because Sportsbet itself doesn't list a
      market that many hours ahead of jump, something users are far
      more likely to click into now that the whole day's races show
      up). User-caught live: every single runner's own Sportsbet number
      in a real race exactly matched Betfair's own Lay price × 1.08,
      while TAB/Ladbrokes showed real, independent numbers for the same
      runners.
      - Root cause: the placeholder decision was made per-runner,
        inline, during the same pass that counts how many runners a
        bookie's own recent scan matched — so it had no way to know
        the race-WIDE result (every runner, not just this one) before
        deciding. A real Sportsbet scan existing but matching *zero*
        runners in this race means that scan is for a completely
        different race (the tab hasn't caught up), not "no data yet" —
        but the code couldn't tell those two cases apart.
      - Fixed by hoisting the match-counting into its own pass over
        every runner first (`bookmakerMatched`, now computed once,
        fully, before the main runner-building pass reads it), then
        gating the placeholder on a new `sportsbetScanIsForADifferentRace`
        — true only when a real recent scan exists but matched nothing
        at all in this race. The original "never scanned yet at all"
        case (`recentBookieRunners.sportsbet` itself null) is
        unaffected — the placeholder still shows then, exactly as
        before.
      - Verified: a standalone simulation of the exact live scenario
        (Sportsbet's own scan real but for unrelated runner names, TAB/
        Ladbrokes matching everyone) confirmed the placeholder is now
        suppressed (`null`, not a synthetic number) for every runner,
        while TAB/Ladbrokes are unaffected; a second case (Sportsbet
        never scanned at all) confirmed the original placeholder
        behaviour still fires unchanged.

- [x] Fixed the real root cause behind Sportsbet tabs not auto-opening
      for (and showing a permanent "!" warning on) races further into
      the day, now that the sidebar shows all of them: `js/sportsbet/api.js`'s
      `fetchSportsbetNextEvents` used to call Sportsbet's own
      `Racing/NextEvents` feed, which hard-caps at exactly 120 events
      across ALL of AU/NZ domestic horse/harness/greyhound racing
      combined — confirmed live against the real API, including trying
      `count`/`take`/`limit`/`pageSize` overrides on it directly, all
      silently ignored. That cap was invisible while the sidebar only
      ever showed ~20 upcoming races, but once every race for the rest
      of the day started showing, any race beyond the cap simply never
      appeared in Sportsbet's own feed at all — no match was ever
      possible for it, so `sportsbetUrl` stayed permanently `null`,
      which is exactly what draws the sidebar's "!" marker and is also
      why `openRaceTabs` (popup.js) never opened/navigated a Sportsbet
      tab for it (a missing URL there is deliberately left untouched,
      same treatment as TAB before its venue code is learned) — and
      with no tab ever pointed at the right race, whatever the scraper
      read back was for whichever race that tab happened to be sitting
      on already.
      - Fixed by switching to Sportsbet's own per-meeting
        `Racing/Competitions?classId=N&date=YYYY-MM-DD` endpoint instead
        (classId 1/3/4 = Aus/NZ horse/harness/greyhound, the same three
        domestic codes the old feed's own filter already scoped to) —
        confirmed live it returns every meeting and every race for that
        one day with no cap at all, each event carrying the exact same
        fields (`id`/`type`/`competitionName`/`raceNumber`/`startTime`)
        the old feed did, so nothing downstream (`buildSportsbetRaceUrl`,
        the `sbMatch` lookup in `listUpcomingRacesInner`) needed to
        change at all. Queried for both today's and tomorrow's UTC-based
        calendar date (Sportsbet's own `date` param resolves against its
        own server-local day, not UTC) and de-duped by event id, so a
        late race that falls under Sportsbet's "tomorrow" before this
        extension's own UTC-day sidebar cutoff reaches it still gets
        covered.
      - Verified live end to end against the real API: the old feed
        capped at 120 events; the new one returned 381 events across 36
        meetings for the exact same moment, including a real Ballarat
        greyhound race that the old feed's cap had been excluding.

- [x] `sportsbetWatcher.js` now recovers automatically when Sportsbet's
      own page fails to render at all. User-reported the Sportsbet
      column showing nothing for a race whose tab had genuinely
      navigated to the correct URL — confirmed live in the user's own
      browser: the page's console showed a real `Uncaught Error:
      Minified React error #418` (a React hydration mismatch), after
      which no racecard ever appeared at all — while the exact same race
      URL, loaded fresh in a clean browser with no other extensions
      running, rendered correctly first try. Points at another
      extension in the same browser touching Sportsbet's own page (the
      user runs several racing/betting-tool extensions alongside this
      one) rather than anything wrong with Sportsbet's markup itself or
      this extension's own selectors — confirmed those selectors are
      still exactly right by finding the expected runner count on the
      same clean-browser load.
      - Since `openRaceTabs` (popup.js) only ever navigates a bookie's
        tab once per race selection, a page that fails to render this
        way previously just sat there forever, silently leaving
        whatever was scraped from the *previous* race in place —
        indistinguishable from Sportsbet simply "not working."
      - Fixed with a one-shot self-heal: 8 seconds after the page
        should have settled, if the outer `racecard-frame` element
        still never appeared at all, reload the tab once. Checked
        against the frame itself rather than runner count, so a
        legitimately closed/all-scratched race (which still has the
        frame, just no active runners) is correctly left alone, not
        mistaken for stuck. Guarded via `sessionStorage` (survives the
        reload itself, but not a fresh navigation to a different race's
        URL) so a one-off glitch gets exactly one retry rather than
        looping forever on a page that's genuinely, persistently down.

- [x] Added a **Daily Planner** (user-requested) — a new calendar-icon
      button next to Settings opens an in-page modal with a table for
      planning which of today's races you're running a promo on, ahead
      of time: pick a Course, then a Race at that course, then which
      Bookmaker and Promotion type (the same Mug/Bonus/Run 2nd 3rd/
      Run 2nd modes the main table's own tabs already use — shared from
      one place, `bookies.js`'s new `PROMO_MODES`, so the two can't
      silently drift apart). Rows are edited freely and only actually
      committed on Save (`chrome.storage.local`'s new `dailyPlanner`
      key) — closing the modal without saving discards whatever was
      added/removed/changed.
      - A saved race gets a small 📌 pin next to its title in the
        Upcoming Races sidebar (`raceCardHtml`'s own
        `plannerEntryForMarketId` lookup) plus a left-border accent, so
        a planned race is visible at a glance without opening the
        planner back up.
      - Loading a planned race into the main table (`renderRace`)
        automatically switches the mode tab to match its planned
        promotion type, and highlights that bookmaker's whole column
        (header + every runner's cell) with its own distinct outline —
        composing cleanly with the existing row-best (green)/col-best
        (amber) highlights rather than fighting either of them. The
        mode switch only fires on an actual race change, not every
        re-render a Stake/Hedge tweak already triggers — manually
        picking a different mode on a planned race sticks instead of
        being immediately reverted back.
      - A planner row survives its own race jumping and dropping out of
        Betfair's catalogue (`listUpcomingRacesInner`'s ~20-races-wide
        window doesn't apply here, but a race still eventually drops
        once it's well and truly done) — its Course/Race dropdowns fall
        back to a synthetic option built from the entry's own
        cached track/race number/start time, so the row keeps reading
        sensibly and Save doesn't silently drop it, instead of the
        dropdown quietly jumping to a different race.
      - Verified end to end via a local static-preview harness: adding/
        removing rows, switching Course (which correctly resets that
        row's Race to the new course's own soonest one), Save
        persisting to storage and updating the sidebar pin immediately,
        loading a planned race switching the mode tab and highlighting
        the right bookmaker column (and *not* the others), a manual
        mode override on an already-loaded planned race surviving an
        unrelated re-render, the highlight clearing on an unplanned
        race, and closing without saving correctly discarding the
        draft.

- [x] Two user-requested changes to the Daily Planner above:
      - **Type a race range instead of picking one race at a time.**
        The Races column is now a text input (`3`, `1-5`, or a comma-
        separated mix like `1-3,5,7-8`) instead of a single-race
        dropdown — a live preview underneath resolves it against that
        course's actual races the moment you type (`R1 2:40 pm, R2 3:10
        pm, ...`), or explains why it doesn't (an unparseable range, or
        a valid one with nothing at that course), before Save ever has
        to. One row now expands into as many committed entries as the
        range matches; reopening the modal groups them back into one
        row per (course, bookmaker, promotion) with the range text
        reconstructed (`formatRaceRangeList`) — a plan saved as "1-5"
        still reads as "1-5" when you come back to edit it, not five
        separate rows.
      - **Promotion is Run 2nd/Run 2nd 3rd only.** The Planner's own
        Promotion dropdown no longer offers Mug/Bonus — planning ahead
        only makes sense for the place-promo modes. Derived
        (`PLANNER_PROMO_MODES`, `bookies.js`) from the same list the
        main table's mode tabs use rather than a separate one, so a
        label change to either mode still only needs updating in one
        place.
      - Also addressed, from a screenshot of the first version: the
        bookmaker highlight on a loaded planned race was a pink border
        around *every runner's* cell in that column, plus a 📌 next to
        the header icon — busy, and not what was asked for. Now it's
        just a plain highlighted box around the bookmaker's header icon
        alone (`th.planned-bookie-col .bookie-th`); no per-runner
        borders, no header emoji.
      - Verified via the same local harness: typing a range live-
        updates its own row's preview without disturbing any other
        row's input focus; an invalid range and a valid-but-unmatched
        range both show their own distinct warning; saving "1-5"
        expands into 5 real entries and pins all 5 in the sidebar;
        reopening collapses those same 5 back into one "1-5" row;
        loading a planned race still switches the mode tab correctly
        and highlights only that bookmaker's header box, with the
        Promotion dropdown showing just the two allowed options.

- [x] Three more Daily Planner changes, all from follow-up screenshots
      after trying the previous version:
      - **Every field is now a plain typeable text input** (Course,
        Bookmaker(s), Promotion — Races already was) instead of a
        `<select>`, each backed by a `<datalist>` for suggestions —
        user-requested: "make all boxes textboxes so its typeable so
        you can look up races, bookmakers and promo." Course/Bookmaker/
        Promotion resolve by exact, case-insensitive match against
        their own datalist's real values (`plannerMatchTrack`/
        `plannerMatchBookieIds`/`plannerMatchPromoId`) — the same
        "can only ever really resolve to a real option" constraint a
        `<select>` already had, just typed instead of clicked.
      - **Plan more than one bookmaker in the same row.** The
        Bookmaker(s) field takes a comma-separated list (e.g.
        `Sportsbet, TAB`) instead of one at a time — a live preview
        underneath shows exactly which names resolved, or names
        whichever ones didn't (`Not recognised: ...`). One row now
        expands into one committed entry per (race, bookmaker) pair;
        `plannerEntriesForMarketId` (renamed from the old singular
        `plannerEntryForMarketId`) returns every entry for a race, so
        loading it highlights *every* bookmaker column you picked, not
        just one. Reopening the modal groups entries back into rows in
        two passes — first by (track, race, promotion) to see which
        bookmakers were actually planned together for each race, then
        by (track, promotion, bookmaker set) to collapse races sharing
        that exact combination back into one range — so a row saved as
        "1-5" on "Sportsbet, TAB" still reads that way when reopened.
      - **Removed the pin emoji entirely** (the sidebar's own 📌, not
        just the header one fixed last time) — the sidebar's left-
        border accent (`.race-card.planned`) is the only visual signal
        now. What's actually planned moved onto the race card's own
        `title` attribute instead, so hovering it still tells you
        (lists every bookmaker/promotion pair now, not just one).
      - Also fixed, from the same screenshot: the header highlight
        (`th.planned-bookie-col`) was still only boxing the small logo
        icon inside the header cell, not the header cell itself — moved
        the box-shadow onto the `<th>` directly so the *whole* header
        box is highlighted, matching what was actually asked for.
      - Verified via the same local harness end to end: adding a row,
        typing a range + "Sportsbet, TAB" into Bookmaker(s), a
        deliberate typo showing its own "Not recognised" warning,
        saving expanding 5 races × 2 bookmakers into 10 real entries
        and pinning all 5 races in the sidebar, reopening collapsing
        those 10 back into one "1-5" / "Sportsbet, TAB" row, and
        loading a planned race highlighting *both* bookmaker header
        boxes (whole cell, not just the logo) while leaving the third
        bookmaker and every runner row untouched.

- [x] Daily Planner's Bookmaker(s) field replaced with an actual
      search-and-pick widget, from a follow-up screenshot plus explicit
      direction: "search sportsbet and select then also type tab and
      select tab as well" — the comma-separated text field from the
      previous version technically supported more than one bookmaker,
      but wasn't the click-to-add interaction actually asked for.
      - Typing filters a dropdown of not-yet-picked bookmakers; picking
        one adds its own logo (bookies.js's `BOOKIE_LIST.logo` — same
        icon the odds table header already uses) right into the same
        box the search text is typed into, not a separate row of chips
        stacked above it (also explicitly requested) — clicking a
        logo removes it. Selecting uses "mousedown" rather than
        "click" specifically so the search box never loses focus when
        you pick a suggestion, which is what makes "search, pick, keep
        typing the next one" work as one continuous motion instead of
        having to click back into the field each time. Enter also
        picks the top match, for typing a full name and not reaching
        for the mouse.
      - The three other fields' own live preview text underneath them
        (Races' "→ R4 3:00 pm, ...", Bookmaker(s)' "→ Sportsbet") was
        removed entirely, per explicit direction ("remove sub headings
        underneath text boxes") — Save's own status message is the
        only feedback now if something didn't resolve.
      - Fixed the table not lining up / needing a horizontal scrollbar
        (both user-reported, screenshotted) two different ways:
        `table-layout: fixed` with explicit per-column percentages
        (rather than letting each column size to its own row's
        content, which is what let rows drift out of alignment with
        each other) is what actually keeps every row lined up; the
        overflow itself traced back to a *different*, pre-existing
        rule — a bare `table { min-width: 700px; }` meant for the main
        odds table's own many columns was also matching this table and
        refusing to let it shrink below 700px no matter what was set
        on `#planner-table` directly, fixed with an explicit
        `min-width: 0` override there.
      - Verified via the same local harness: typing "tab" and picking
        it via a simulated mousedown correctly keeps focus on the
        search box and adds TAB's logo into the box alongside
        Sportsbet's; removing a logo and re-adding a different one via
        Enter both work; Save/reopen round-trips a multi-bookmaker,
        multi-race plan correctly; and the table's own wrapper reports
        zero horizontal overflow (scrollWidth === clientWidth) with
        every column's rendered width matching its intended percentage
        of the container, not the old table-wide 700px floor.

- [x] Two more Daily Planner changes, user-requested:
      - **Settings > Bookie now overwrites the planner too.** Disabling
        a bookmaker there no longer leaves it sitting around planned
        somewhere its own column isn't even shown any more — any
        already-saved plan entries against it are dropped
        (`pruneDailyPlannerToEnabledBookies`, popup.js) the moment
        settings are applied (startup, and every time the Settings
        modal closes), and it stops appearing in the Bookmaker(s)
        search-and-pick widget's own suggestions at all
        (`plannerBookieSuggestions` now filters through `visibleBookies()`
        rather than the raw `BOOKIE_LIST`). Verified: planning a race on
        both Sportsbet and TAB, then disabling TAB in Settings, drops
        exactly the TAB entry from both memory and storage while leaving
        the Sportsbet one untouched, and TAB no longer shows up as a
        pickable suggestion afterward.
      - **A dedicated Promo Colour in Settings > Colours.** The Daily
        Planner's own highlight (a planned race's sidebar border, and
        the bookmaker(s) header box it switches on when that race
        loads) used to just reuse `--lay-color` — now it's its own
        setting (`DEFAULT_SETTINGS.promoColor`, a `--promo-color` CSS
        variable) with a colour picker of its own, same "resolve
        differently per theme until actually touched" treatment
        `accentColor`/`--accent` already gets
        (`THEME_DEFAULT_PROMO_COLOR`, popup.js). Verified: changing it
        in Settings updates `--promo-color` live and persists to
        storage, without touching the genuinely-unrelated `--lay-color`
        (Betfair's own Lay-price cells) anywhere else in the table.

- [x] Added a **Bookie Spotlight** — user-requested: "a textbox where
      you can search and select bookie to automatically show up in the
      race table if its on," placed above the sidebar's own track
      search box. Search and pick one or more bookmakers (reusing the
      exact same logo-chips-in-a-box widget the Daily Planner's own
      Bookmaker(s) field already uses — same mousedown-to-select
      behaviour, so search-pick-search-pick-again stays one continuous
      motion) and that bookmaker's own column highlights in the main
      odds table for whatever race is loaded, without needing to
      actually plan a race against it first. "if it's on" — only
      bookmakers enabled in Settings > Bookie are ever offered, and
      disabling one afterward drops it from the spotlight immediately,
      same treatment the planner's own bookmaker picks already get.
      - Session-only (not persisted to storage) — a quick, ad-hoc way
        to eyeball one bookmaker's column against the field, not
        something that needs to survive a popup close the way an
        actual saved plan does.
      - Unioned with (not replacing) whatever the Daily Planner has
        actually planned for the loaded race — a bookmaker highlighted
        either way gets the same header treatment; spotlighting never
        touches the mode tab, since it isn't tied to any particular
        promo type the way a planner entry is.
      - Verified via the local static-preview harness: picking TAB
        highlights only its own header box (Sportsbet's stays
        untouched); adding Ladbrokes via Enter keeps both highlighted;
        disabling TAB in Settings drops it from `spotlightBookieIds`
        and its header highlight immediately while Ladbrokes' stays on.

- [x] Reworked what actually controls a bookie column's visibility in
      the Race Table, per explicit direction: Settings > Bookie now
      *only* gates which bookmakers are available to search/select (the
      Daily Planner's own Bookmaker(s) field, the sidebar's Bookie
      Spotlight, and opening a bookie's own race tab) — it no longer
      shows or hides a column by itself, and a column is no longer
      highlighted either, only shown or not. So:
      - **Settings** = enable/disable which bookies can be searched and
        selected going forward. No longer touches column visibility at
        all, and no longer prunes an already-made Planner/Spotlight
        selection just because it was later disabled — pick something,
        and it stays picked regardless of what Settings does afterward.
      - **Bookie Spotlight** = select bookies to display.
      - **Daily Planner** = bookies planned against the *loaded* race
        display too.
      - **Race Table** = shows only the union of those two — a bookie
        column appears if and only if it's planned for this exact race
        or currently spotlighted; nothing shows automatically just for
        being enabled, and the whole `th.planned-bookie-col` highlight
        mechanism (added a few commits back) is gone entirely, replaced
        by the column just not being there at all when neither applies.
      - `bestBookmakerPrices` (Best Price, Edge%/Ret%/Lay $/Liability's
        own underlying price, sort order) now takes this same
        `displayedBookieIds` set explicitly and only ever considers
        bookmakers actually shown — previously it (and `metricPercent`/
        `rowLayDollars`/`sortedRunners`, which all call it) always
        considered every *enabled* bookmaker regardless of whether its
        own column was visible, which would have kept badging/scoring
        a bookie with no column to point at.
      - Verified via the local static-preview harness: a fresh load
        with nothing planned or spotlighted shows *zero* bookie
        columns; spotlighting TAB shows only TAB's; disabling TAB in
        Settings afterward leaves it fully displayed and spotlighted
        (only stops it being offered as a *new* pick elsewhere); and
        Best Price/Edge% on the one visible column render real numbers
        derived only from it, not `NaN`/`undefined` from a hidden one.

- [x] Extended the same rule to which bookmaker tabs auto-open —
      user-requested: "no tabs should open automatically unless its
      selected in the bookie search bar." `openRaceTabs` (popup.js)
      used to open/reuse a tab for every *enabled* bookmaker
      (`visibleBookies()`) on every race selection; it now only does so
      for whichever bookmakers are currently in `spotlightBookieIds` —
      Settings > Bookie has no say in this either, consistent with it
      no longer controlling Race Table column visibility. The Betfair
      tab itself is unaffected (it's the exchange this whole comparison
      runs against, not one of the bookmakers being compared) — it
      keeps opening for every race regardless.
      - Picking a bookmaker in the Bookie Spotlight now also opens its
        tab immediately for whatever race is already loaded
        (`refreshBookieSpotlight` calls `openRaceTabs` alongside its
        existing `renderRace` call) — without this, a freshly-picked
        bookmaker's own column would show in the table right away, but
        its tab wouldn't actually open until the next time some race
        happened to get (re)selected.
      - Verified via the local static-preview harness (spying on every
        `chrome.tabs.create`/`update` call): selecting a race with
        nothing spotlighted opens only Betfair's own tab, no
        Sportsbet/TAB/Ladbrokes tab at all; spotlighting TAB
        immediately opens exactly TAB's own tab at its correct URL,
        with Sportsbet and Ladbrokes never appearing in either batch.
      - **Fixed a real bug found immediately after, user-reported**: a
        race planned against Sportsbet only (Daily Planner) still
        opened Sportsbet+TAB+Ladbrokes tabs on selection, even though
        the Race Table itself correctly showed only Sportsbet's column
        — `openRaceTabs` was checking only the Bookie Spotlight's own
        picks and never looked at the Planner at all, the exact same
        set `renderRace` already uses for column visibility. Fixed by
        factoring both out into one shared `raceDisplayedBookieIds(race)`
        (planner entries for that race ∪ Bookie Spotlight picks) that
        `renderRace` and `openRaceTabs` now both call — the two can't
        drift apart again since there's only one place computing it.
        Verified via the same harness: planning Sportsbet only for a
        race opens exactly one bookmaker tab (Sportsbet, at its correct
        URL) alongside Betfair's, never TAB or Ladbrokes; additionally
        spotlighting Ladbrokes on top of that plan then opens exactly
        Sportsbet + Ladbrokes, with TAB still never appearing.

- [x] Deselecting a bookmaker now closes its tab automatically —
      user-requested: "If I then deselect TAB from the Bookie Search
      bar, any currently open TAB tabs should automatically close,"
      explicitly "even if the bookmaker tab was already open before I
      deselected it," and "for all bookmakers, not just TAB." Added
      `closeUnneededBookieTabs(race)`, which closes any bookmaker's own
      currently-open tab that's fallen out of `raceDisplayedBookieIds`
      entirely (the exact same set `openRaceTabs` opens tabs for and
      `renderRace` shows columns for) — a bookmaker still planned
      against the race, or still spotlighted, is always left alone
      regardless of which one of those just changed.
      - Wired into the two places that can actually shrink that set:
        removing a chip from the Bookie Spotlight, and a Daily Planner
        Save that no longer plans a bookmaker against the loaded race
        (which now also opens tabs for anything newly planned, the
        same way the Spotlight already does immediately on pick,
        rather than waiting for a re-selection).
      - Verified via the local static-preview harness (spying on every
        `chrome.tabs.create`/`update`/`remove` call): spotlighting
        Sportsbet then TAB opens both tabs; deselecting TAB's chip
        fires a `remove` for exactly TAB's own tab id, while
        Sportsbet's tab only ever gets `update`d, never removed;
        planning Ladbrokes against the loaded race via Save opens its
        tab immediately without touching Sportsbet's.

- [x] Cleaned up the Bookie Search Bar's own wording, user-requested:
      its placeholder now reads "Select bookmaker" (was "Spotlight a
      bookie..."), and the field's own tooltip — which described it as
      only highlighting a bookmaker's column — is gone entirely, since
      that was never actually what it does (it decides which bookmaker
      columns/tabs show at all, not just a highlight on top of an
      already-shown one).

- [x] Added an **interactive Tutorial** (new button next to Planner/
      Settings) — user-requested: guide the user through the *real*
      controls, not a page of text, with highlighted sections, short
      explanations, Back/Next/Skip/Finish, and a step counter. 8 steps
      (`TUTORIAL_STEPS`, popup.js): Upcoming Races, Bookie Search Bar,
      Daily Planner, Race Table, Hedge %, Race Timer, Bookmaker Tabs,
      Settings.
      - No separate full-page overlay element at all — each step dims
        the rest of the page via one huge-spread `box-shadow` directly
        on the real element being explained (`.tutorial-highlight`,
        popup.css), the classic lightweight "spotlight" trick: the
        shadow paints as a near-infinite dark sheet everywhere outside
        that element's own box, while the element's own content sits
        on top of its own shadow (how box-shadow always paints) and so
        reads as the one lit-up thing on the page. A z-index above
        every modal's own is what lets the Planner/Settings steps
        reach in and highlight something *inside* an open modal.
      - The Planner and Settings steps actually open/close those
        modals as you step through (`onEnter`/`onExit` per step) —
        forward opens it, Back away from it (or Skip/Finish/Escape
        while it's open) closes it again, symmetrically in both
        directions.
      - Fixed a real bug found immediately while testing: the step
        text/counter/button labels were wrapped in
        `requestAnimationFrame`, which a background/inactive tab can
        go a long time (or forever) without firing — every step's
        tooltip content stayed stuck on the *previous* step's text
        until the tab happened to regain focus. Made all of that
        synchronous; only the tooltip's own on-screen *position*
        (which needs the target's settled bounding box) still gets a
        deferred re-measurement, via a plain `setTimeout` instead.
      - Verified via the local static-preview harness: stepping
        through all 8 with Next shows the right title/target/counter
        at each one and opens/closes the Planner and Settings modals
        at exactly the right steps; Back out of the Planner step
        closes it and going forward again reopens it; Skip and Escape
        both end the tour cleanly (clearing the highlight, hiding the
        tooltip, and closing whichever modal was left open) from the
        middle of a step, not just from the last one.

- [x] Fixed post-race data not backfilling for Sportsbet/Ladbrokes closing
      odds and the Betfair closing price — user-reported: "the racing
      table will show the winner but the bookmaker closing prices and
      Betfair closing prices are blank" for a race that resulted without
      being watched live, then narrowed it further: "it works for TAB but
      not any other bookies." Root-caused (confirmed live against real
      resulted races) to two separate, unrelated bugs — TAB itself was
      never broken:
      - **Sportsbet/Ladbrokes**: `sportsbetWatcher.js`/`ladbrokesWatcher.js`
        deliberately send an *empty* runners array the instant a race's
        own market closes (so in-play odds swings can't corrupt an
        already-frozen pre-jump price) — but that rule fired even when
        nothing had ever actually been captured yet, e.g. opening a race
        for the first time *after* it had already resulted. There was
        never a real price to protect in that case, so it froze on
        *blank* forever instead. Fixed by tracking whether a page load has
        ever sent a real (non-empty) scrape yet (`everSentRealPrices`) —
        only suppress the scrape once something real is already frozen;
        otherwise scrape once now, since a resulted Sportsbet/Ladbrokes
        page still renders its final fixed odds (confirmed live).
      - **Sportsbet only, on top of the above**: `sportsbetWatcher.js` and
        the one-shot `js/contentScripts/sportsbet.js` paired names to
        prices by parallel array index. A RESULTED race page additionally
        renders a "Final Results" placings panel that reuses the exact
        same `racecard-outcome-name` attribute as the real runners, but
        lists only placed runners in *finishing* order — polluting the
        name list and shifting the index-pairing out of sync with the
        (unaffected) price list. Live-confirmed on a real resulted race
        (Sandown Park G R8): the old pairing gave "Reanna's Pride" and
        "Zipping Una"'s real prices to "Atticus" and "Flying Rogue"
        instead. Fixed by pairing per Win-price element via DOM
        containment instead — walk up to that price's own runner-row
        wrapper (`racecard-outcome-<selectionId>`, no suffix) and read the
        name from within that same row — which the Final Results panel
        has no price element to walk up from in the first place, so it's
        never consulted at all. `js/contentScripts/sportsbet.js` also
        picked up the same `racecard-frame` scoping `sportsbetWatcher.js`
        already had (it was querying the whole document unscoped).
      - **Betfair**: `getMarketBook` only requested `EX_BEST_OFFERS`, which
        goes empty the moment a market's fully settled (no more live
        back/lay layers) — leaving the Betfair column permanently blank
        for a race nobody watched live long enough to freeze a real price
        for. Added `EX_TRADED` to the request so `lastPriceTraded` (the
        final price a bet actually matched at) reliably comes back, and
        used it as the last-resort fallback for both the Lay-based price
        and the Back price shown in the table, below the DOM watcher and
        the live REST price but above showing nothing. Also applied in
        `settledRaceFromBook` (the fallback used once a race's market has
        dropped out of Betfair's catalogue entirely) — which previously
        always returned `betfair: null` and `bookmakers: {}` unconditionally
        even when a perfectly good cached bookmaker scan already existed.
      - v1 scope note, not yet done: this fixes closing odds once a race
        is actually opened/selected at some point (live or after the
        fact) — a race truly never clicked into at all still won't show
        bookmaker odds automatically, since there's no background
        mechanism yet that opens a bookmaker tab on its own once a race
        results. Betfair's own closing price *is* fully automatic already
        (pure REST, no tab needed). Ladbrokes also has a standing, separate
        limitation: there's still no derivable race URL for it (see
        `ladbrokesWatcher.js`), so it only ever works if the user had a
        matching Ladbrokes tab open at some point.

- [x] Added a new Mode: **Run 2nd You Win** — user-requested, alongside
      the existing Mug/Bonus/Run 2nd 3rd/Run 2nd tabs (`#mode-tabs`,
      popup.html). Same trigger as Run 2nd (the runner comes 2nd,
      nothing else), but pays out completely differently: the
      bookmaker settles the bet as a genuine WIN at the original price
      (real cash, stake × (bookmaker − 1)) instead of a smaller
      bonus-bet-equivalent refund.
      - User supplied the exact formula to follow (a standard 3-outcome
        promo-value calculator), which this deliberately implements
        literally rather than reusing this file's own hedge-blended QL
        approach the other modes share: the RAW, UNHEDGED expected
        value of the bookmaker bet at face value — no Betfair lay, no
        commission. Three outcomes (win, 2nd, anything else), each
        weighted by its own true ("no-vig") probability:
        `P(win) = 1/betfair`, `P(top2) = 1/placeBetfair`,
        `P(2nd) = P(top2) − P(win)`, `P(lose) = 1 − P(top2)`; both win
        and 2nd pay `stake × (bookmaker − 1)`, a loss is `−stake`. New
        `run2ndWinEVPercent` (popup.js) — an earlier version of this
        reused Run 2nd's own hedge-based QL formula, algebraically
        equivalent to this one only at Hedge % = 0 (proved by hand and
        replaced once the user specified this exact unhedged formula
        instead).
      - Only computable when the race's REAL Betfair place market pays
        exactly 2 places (`race.placeMarketWinners === 2`, a genuine
        "Top 2 Finish" market) — a 3-place market's own price is
        Pr(top 3), which would silently fold 3rd place into P(2nd) if
        used directly, so it's left uncomputable (renders "—") rather
        than approximated. This is noticeably more races than Run 2nd/
        Run 2nd 3rd ever go blank for, since those fall back to a
        Harville model when there's no clean real market to use; this
        mode deliberately has no such fallback — the user's own formula
        calls for the real Top 2 market specifically, not a modelled
        estimate.
      - Because there's no Betfair lay in this model at all, `Lay $`/
        `Liability` now render "—" for this mode specifically —
        `rowLayDollars` returns `null` for it (a real dollar figure
        there would misleadingly imply a lay is actually part of this
        mode's strategy) and `liabilityFor`/the row renderer/the Max
        Liability filter all needed a null-safe path added for exactly
        that case, none of which existed before this mode (every other
        mode's own Lay $ was always a real number).
      - Bucketed under the existing "Promo" EV Colour threshold key
        (Settings), same as Run 2nd/Run 2nd 3rd — no new threshold
        fields needed.
      - Added to `PROMO_MODES`/`PLANNER_PROMO_MODES` (bookies.js — so
        it's also plannable in the Daily Planner, same as Run 2nd/Run
        2nd 3rd), the mode-tabs row (popup.html), and the Default Mode
        dropdown in *both* Settings surfaces — the in-popup Settings
        modal and the separate `options.html` page each keep their own
        independent copy of that `<select>`, so both needed the new
        `<option>`.
      - Verified via the local static-preview harness against a
        synthetic Top-2-market test race: hand-worked the exact EV%
        figure for a test runner and matched the live-computed value
        to 10+ significant figures; confirmed Lay $/Liability render
        "—" for this mode and a real dollar figure for every other
        mode, unchanged.

- [x] Extended Run 2nd You Win to also work off a real Top 3 market —
      user-supplied method, since most bigger AU/NZ fields only ever
      get a "Top 3 Finish" Betfair place market, not a Top 2 one (the
      previous version left the mode entirely uncomputable there).
      - A Top 3 market's own implied probability
        (`P(top3) = 1/placeBetfair`) minus `P(win)` is the COMBINED
        "2nd or 3rd" probability, not Pr(2nd) alone. Rather than split
        it evenly, isolates Pr(2nd) via a standard matched-betting rule
        of thumb: in a balanced field, 2nd is always slightly more
        likely than 3rd, so the gap is split 55/45 in 2nd's favour
        (new `TOP3_SECOND_PLACE_SHARE` constant, popup.js).
      - `run2ndWinEVPercent` now branches on
        `race.placeMarketWinners` (2 vs 3) for how Pr(2nd) itself is
        derived, but the rest of the formula (P(lose) = whatever's left
        once win and 2nd are both accounted for; same
        stake×(bookmaker−1) payout on both win and 2nd) is unchanged
        and shared by both branches — a real Top 2 market's own
        P(top2) already IS Pr(win-or-2nd) directly, so it skips the
        55/45 split entirely rather than needlessly reapplying it.
      - Verified against the user's own worked example (win odds 2.16,
        Top 3 odds 1.24, $100 stake): matched their hand-calculated
        +$40.81 EV (40.81%) to within a rounding difference (40.806%);
        confirmed the existing Top 2 case's own number is completely
        unchanged, and a race with neither a real Top 2 nor Top 3
        market still correctly returns null (no Harville or other
        fallback — still requires one of those two real markets).

- [x] Four user-requested changes to the interactive Tutorial (see its
      own entry above):
      - Step 3 (Daily Planner) now highlights the actual `#planner-btn`
        in the sidebar header instead of auto-opening the modal and
        highlighting its panel — the body text explicitly says "Click
        this button to open the Daily Planner" first, then explains
        what it's for, so a beginner learns where to click rather than
        having it opened for them.
      - Step 7 was a duplicate of Step 2 (both pointed at
        `#bookie-spotlight`, one titled "Bookie Search Bar", the other
        "Bookmaker Tabs") — replaced entirely with **Mode Toggle
        Switches**, highlighting `#mode-tabs`. Explains each of the 5
        modes (Mug/Bonus/Run 2nd 3rd/Run 2nd/Run 2nd You Win) and which
        real promo each one matches, so a beginner knows which tab to
        switch to for their own bookmaker's actual deal — worded as
        "switch to" rather than "turn on/off" since they're mutually
        exclusive tabs, not independent toggles.
      - Step 8 (Settings) now highlights the actual `#settings-btn`
        gear icon instead of auto-opening the modal, same treatment as
        Step 3 — "Click this gear icon to open Settings" first, then a
        brief rundown of what it controls.
      - Step 2 (Bookie Search Bar) left completely untouched, per
        explicit request.
      - Removing the auto-open `onEnter`/`onExit` from both the Planner
        and Settings steps needed no other changes — `goToTutorialStep`
        already treats them as optional (`if (incoming.onEnter)` /
        `outgoing?.onExit`), so a step without either just highlights
        its target and does nothing else, exactly as intended.
      - Verified via the local static-preview harness: stepped through
        all 8 forward and all 8 backward, confirming each one's
        highlighted element id matches the new target and neither modal
        ever pops open unexpectedly at any step; confirmed Skip/Finish
        both still end the tour cleanly with no lingering highlight.

- [x] Two Daily Planner changes, user-requested:
      - Renamed **Course &rarr; Track** everywhere user-visible: the
        table's own column header, the input's placeholder, the
        field-hint paragraph, and the Tutorial's own Daily Planner step
        text. Purely a label change — every internal identifier
        (`courseText`, `plannerCourseOptions`, `plannerMatchTrack`'s own
        param, the `planner-course-input`/`planner-course-options`
        ids) was deliberately left alone: none of it is user-visible,
        and the persisted storage format already uses `track` as its
        real field name (`dailyPlanner` entries, background.js/
        popup.js), so there was never any saved-data migration to
        worry about either way.
      - **Promotion is now a real `<select>` dropdown**, not a typed
        text input with autocomplete suggestions — only ever offers
        PLANNER_PROMO_MODES' own 3 entries (Run 2nd 3rd/Run 2nd/Run 2nd
        You Win), so a bad/misspelled promo (the old free-text field's
        one real failure mode — Save's own "no valid promotion" problem
        message) simply can't happen any more. New
        `plannerPromoOptionsHtml` (popup.js) builds each row's own
        `<option>`s straight from PLANNER_PROMO_MODES, each value set to
        that mode's exact LABEL — the same value `plannerMatchPromoId`
        (Save's own text-to-id lookup) already expected, so nothing
        downstream needed touching at all. The existing delegated
        `input` listener (`planner-promo-input`, unchanged class name)
        already covered this for free too — a native `<select>` fires
        `input` on every selection change the same way a text input
        fires it on every keystroke. Removed the now-dead
        `planner-promo-options` `<datalist>` and its one-time fill.
      - Verified via the local static-preview harness: added a row,
        confirmed the Promotion cell renders as an actual `<select>`
        pre-populated with all 3 modes and the right one pre-selected;
        changed it, saved, and confirmed the persisted entry's own
        `promoType` matched; closed and reopened the modal and
        confirmed the dropdown correctly re-selected the saved value
        from scratch (the full round trip, not just the in-memory
        write). No console errors.

- [x] Visual polish pass on the Daily Planner table, user-requested
      ("clean, professional, all symmetrical, like an end product") —
      the underlying functionality is unchanged, this is styling only:
      - Track/Races (plain text inputs) had no explicit styling at all
        before this — they only looked reasonably dark because of
        `color-scheme: dark` making the browser render its own native
        form controls in a dark theme, which happens to look close but
        doesn't actually match this app's own panel/border tokens, or
        the Promotion `<select>`/Bookmaker(s) box sitting right next to
        them. All four (Track, Races, Promotion, Bookmaker(s)) now
        share the exact same background/border/radius, and Track/
        Races/Promotion all get an explicit `min-height: 30px` too —
        matching `.planner-bookie-box`'s own existing min-height
        exactly, so every cell in a row lines up at the same height.
      - Added a divider under the header row and between each planner
        row (`border-top` on `tr + tr td`, not touching the existing
        `border-bottom: none` override that keeps the main odds table's
        own generic row-border rule from leaking into this table) — it
        read as a loose stack of fields rather than an actual table
        without this.
      - Rebalanced the 5 column widths: Promotion widened from 18% to
        31% (needed room for "Run 2nd You Win", the longest of the 3
        real options, added after these widths were first set — it was
        truncating), the remove-button column shrunk from 14% to 8%
        (all it ever needs for one "×"), funding the difference without
        widening the table itself.
      - The remove button is now a proper 26px circular icon button
        with a subtle hover background, rather than a bare "×"
        character floating with no visible affordance.
      - Simplified the field-hint paragraph from 4 dense sentences
        (documenting exactly how typing/suggestions/the dropdown/the
        bookmaker search box each work) down to 2 short ones covering
        just the purpose and the payoff — the how is self-evident from
        the fields themselves (a dropdown is obviously a dropdown), and
        already covered for a first-time user by the Tutorial's own
        Daily Planner step.
      - Verified via the local static-preview harness: checked computed
        styles directly (not just a screenshot) — Track/Races/Promotion
        all render at an identical 30px height with matching background/
        border/radius; the header and inter-row dividers are present;
        "Run 2nd You Win" renders in full, unclipped, in its own cell.
        No console errors.

- [x] Added **Neds** as a fourth bookmaker — user-requested (alongside
      PointsBet, not yet done). Turned out to be by far the easiest
      addition so far: confirmed live that Neds runs on the exact same
      underlying platform Ladbrokes does — the identical GraphQL router
      (`api.neds.com.au/gql/router`, same persisted-query hash for
      `RacingHomeScreenWeb`, byte-identical response shape) and race
      pages sharing the exact same `data-testid` attributes
      (`runner-row`/`runner-name`/`price-button`/`price-button-racing`/
      `race-card-header-countdown`, right down to the same lowercase
      "final" text on a resulted race). `js/neds/api.js`,
      `js/contentScripts/neds.js`, and `js/contentScripts/nedsWatcher.js`
      are deliberately near-verbatim clones of their Ladbrokes
      counterparts rather than a shared file — if Neds' platform ever
      diverges from Ladbrokes' down the line, there's nothing shared to
      accidentally break for both at once.
      - Unlike Ladbrokes' own history (no derivable race URL for a long
        while, tab-open-only until a public feed was later found), Neds
        starts with a real feed (and therefore a real `nedsUrl`, matched
        the same way `ladbrokesUrl`/`sportsbetUrl` already are) from day
        one — `openRaceTabs`/`raceDisplayedBookieIds`/the odds table's
        own column rendering all needed zero changes, since every one
        of them already drives off `BOOKIE_LIST` generically rather
        than a hardcoded per-bookie list.
      - The one genuinely hand-written piece: a static 4th `<th
        data-bookie="neds">` column header (popup.html) — the header row
        turned out to be the one part of the odds table NOT built from
        `BOOKIE_LIST` (every body row/footer cell already is), so it
        needed its own matching entry the same way Sportsbet/TAB/
        Ladbrokes' each already have one.
      - Icon (`icons/bookies/neds.png`) is Neds' own real app icon
        (fetched live from their site — a proper square orange mark,
        matching the solid-colour-square style every other bookie's own
        icon already uses), not the white wordmark SVG their homepage
        actually links first (that one's designed for a coloured
        background and would've rendered invisible against this app's
        own dark cell background).
      - Also added `neds` to `DEFAULT_SETTINGS.enabledBookies`
        (settings.js) so it's enabled by default for a fresh install —
        same as every existing bookie already is. Note this only
        affects a fresh install; an existing user's already-saved
        settings won't retroactively gain it (same accepted limitation
        this settings system already had before Neds — array fields
        replace rather than merge).
      - Verified via the local static-preview harness (header/body/
        footer column counts stay in sync, no console errors) and live
        against real neds.com.au race pages: the exact Ladbrokes
        scraping logic, unmodified, correctly extracted real runner
        names/prices from an actual race card.

- [x] Added **PointsBet** as a fifth bookmaker — user-requested (the
      second of the two asked for alongside Neds). A genuinely separate
      platform from the Ladbrokes/Neds family, so this one needed real,
      from-scratch investigation rather than a clone:
      - Its own public REST feed
        (`https://api.au.pointsbet.com/api/racing/v3/meetings`, no query
        params at all) was found by hooking `window.fetch`/
        `XMLHttpRequest.prototype.open` *before* loading a real racing
        page — reading network requests after the fact kept missing it
        entirely (the real call had already scrolled out of the
        request-list buffer by the time it was checked). One call
        returns every meeting for today, already grouped with each
        meeting's own races (id/number/start time) nested inside — no
        separate per-race lookup needed at all, simpler than every
        other bookie's own feed here.
      - PointsBet's own race URLs are genuinely structured and
        human-readable (`/racing/<Type>/<Country>/<Venue>/race/<id>`,
        e.g. `/racing/Greyhound/AUS/Ballarat/race/115131990`) — confirmed
        live for Thoroughbred/Harness/Greyhound and both an AUS and a
        GBR race. `js/pointsbet/api.js`'s own `POINTSBET_RACING_TYPE`
        maps the feed's numeric `racingType` (1/2/4, confirmed live
        against real AU meetings of each kind) to this codebase's own
        sport.id convention.
      - No `data-testid` attributes anywhere on the page at all (unlike
        the Ladbrokes/Neds family) — its own stable hook is
        `data-test="racingRunners<N>OutcomeRunnerWinOddsButton"` on each
        Win odds button specifically (confirmed live these survive,
        merely `disabled`, on an already-resulted race, still holding
        the real closing price as their own text). The runner's own
        NAME has no comparable stable attribute at all — it lives in a
        hashed CSS-in-JS class that changes across deploys — so
        `pointsbetWatcher.js`/`pointsbet.js` instead read it from the
        START of the runner's own row text (every name is reliably
        rendered first, as `"<number>. <name> (<barrier>)"`), never
        touching the hashed class.
      - The market-closed signal is shaped differently here too: rather
        than one element whose TEXT switches from a duration to a
        status word (every other bookie's own convention), a
        `[data-test="duration"]` element only EXISTS at all while still
        counting down, and is simply gone once closed — confirmed live
        on both states. Scoped to a bounded ancestor of the page's own
        `<h1>` rather than the whole document: unscoped, the first
        `[data-test="duration"]` match on an already-resulted race's own
        page was reliably some OTHER, unrelated race's own countdown in
        the "Next To Jump" sidebar ticker instead.
      - Icon (`icons/bookies/pointsbet.png`) is PointsBet's own real
        apple-touch-icon (fetched live from their site), matching the
        solid-colour-square style every other bookie's own icon already
        uses.
      - Verified via the local static-preview harness (header/body/
        footer column counts stay in sync across all 5 bookies now, no
        console errors) and live against real pointsbet.com.au race
        pages, including the exact final watcher logic run together in
        one pass against a genuinely resulted race: correctly reported
        the market as closed and extracted all 9 real runner names/
        prices.

- [x] Added **Betr** as a sixth bookmaker — user-requested (alongside
      TABtouch, its own separate entry below). Turns out Betr runs on
      "BlueBet" infrastructure (Betr is BlueBet's own brand) — its real
      API lives at `web20-api.bluebet.com.au`, not betr.com.au itself,
      found the same fetch/XHR-hooking way PointsBet's own was (reading
      network requests after the fact kept missing it — the real call
      had already scrolled out of the request buffer).
      `GroupedRaceCard?DaysToRace=0` means "today" with no date string
      to compute at all — simpler than every other bookie's own feed
      here.
      - A genuine structural difference from every other bookie added
        so far: Betr's race page (a Material-UI/Next.js build, no
        `data-testid`/`data-test` attributes anywhere) renders a live,
        still-open runner's Win price as a clickable `<button>`, but
        once resulted — betting no longer actionable at all — the exact
        same price renders as a plain `<div>` instead. Confirmed live on
        two real races (one open, one resulted): both states
        consistently wrap the runner's own "N. Name (barrier)" text in
        3 sibling `<span>`s inside a `div[style*="font-weight: 600"]`,
        so the name is read from the second such span (no dependency on
        either state's own hashed class), and the price from the first
        *visible* leaf element (button or div) elsewhere in the card
        holding a bare number — explicitly excluding the name block
        itself, since the barrier number ("10"/"(1)") is itself a bare
        leaf number and would otherwise be picked up as if it were a
        price.
      - A runner scratched *after* bets were already placed on it shows
        a "Deduction applied" rate (e.g. "0.15") in the exact same price
        slot instead of a real price — confirmed live this would
        otherwise get scraped as if it were a genuine (absurdly short)
        quoted price; excluded by checking for that text explicitly.
      - The market-closed signal: the race's own info line ("1590m |
        Soft5, Overcast | Today, 2:00pm") sits alone in its own wrapper
        while open; once resulted, a status word ("Correct Weight"
        confirmed live) renders as a second, sibling element in that
        same wrapper — checking "a second child exists" rather than
        allow-listing specific wording covers whatever that word
        actually is.
      - Icon (`icons/bookies/betr.png`) is Betr's own real favicon —
        oddly only reachable at the bare `/favicon.ico` path (no `<link
        rel="icon">` at all in the page's own `<head>`), and itself an
        ICO container wrapping a real embedded 256×256 PNG rather than
        classic ICO bitmap data — extracted by finding the PNG file
        signature inside the downloaded bytes and slicing from there.
      - Verified via the local static-preview harness (6 bookies now in
        sync across header/body/footer) and live against real
        betr.com.au race pages — the exact final scraping logic run
        against both a genuinely open race and a genuinely resulted one,
        correctly extracting real runner names/prices from both states
        and correctly excluding the deduction-rate runner in each.

- [x] Added **TABtouch** as a seventh bookmaker — user-requested
      (alongside Betr above). Not to be confused with tab.com.au
      (already integrated) — TABtouch is Western Australia's own
      RWWA-run TAB, a completely separate company from tab.com.au's
      Tabcorp, running its own separate site with its own separate
      markup.
      - No public feed found (same starting point tab.com.au itself
        had) — venue codes are instead learned from real `<a href>`
        links on TABtouch's own "All Racing" hub page
        (`tabtouchMeetings.js`), same idea as `tabMeetings.js`. Genuinely
        simpler than tab.com.au's own version though: ONE page already
        lists every meeting across every sport and country for today
        (confirmed live), so only one background visit is ever needed —
        not one per sport — and TABtouch's own race URL
        (`/racing/<date>/<code>/<raceNumber>`) has no separate race-type
        letter to build at all, unlike tab.com.au's own `/R|H|G/`
        segment. New `tabtouchRaceUrlFromCodes`/`learnTabtouchVenueCodes`/
        `visitTabtouchMeetingsPage`/`ensureTabtouchUrlForRace`/
        `ensureTabtouchVenueCodesLearnedToday` (background.js) mirror
        their tab.com.au namesakes function-for-function; popup.js's own
        `openRaceTabs` got the same on-demand-learn-on-first-click
        fallback TAB's own click handler already has.
      - Each meeting row on the hub page carries its own sport as a
        sibling `<span class="image-matrix race-type dogs-black">`
        (or `trots-black`/`horse-black`) — confirmed live across a real
        day's full card spanning all three.
      - The race page itself turned out to have a real, unexpected trap:
        it defaults to "Field" view (the full field) while a race is
        still open, but the *moment* it results, it silently switches to
        "Results" view instead — a placings/dividends panel covering
        only the runners that actually placed. Confirmed live: "Results"
        view's own name/price cells reuse the *exact same*
        `td.acceptor`/`.dividend` classes the real field table uses, and
        a separate "Scratchings and Fixed Odds Deductions" panel
        (also reusing those same classes) sits alongside it — both
        would otherwise get scraped as if they were genuine runners,
        the first one with a `WIN` value blank for anything that didn't
        actually win (silently pairing a non-winner with what was
        really its own *Place* dividend instead — a real wrong-value
        bug caught only by cross-checking against the page's own
        displayed numbers, not just an empty-data gap). Fixed by
        switching back to "Field" view unconditionally before every
        scrape (`ensureFieldView()`) rather than trying to scrape
        "Results" view's own different shape at all — deliberately
        means that if you have a resulted race's tab open and manually
        switch to "Results" to check placings, this switches it back to
        "Field" on the next odds-changing mutation (harmless, and
        reversible by clicking "Results" again, but worth knowing).
      - The favourite runner's own price cell prepends a hidden
        "Favourite" label with no separator (confirmed live: raw text
        "Favourite2.75") — the exact same class of bug as Ladbrokes' own
        "FAV2.90" (see `ladbrokesWatcher.js`) — so the number is
        extracted with a regex rather than trusting the cell's raw text.
      - Icon (`icons/bookies/tabtouch.png`) was originally TABtouch's own
        apple-touch-icon, fetched live from their site; replaced shortly
        after with a cleaner square logo the user had already saved
        locally (same purple/white TABtouch branding, just a nicer
        wordmark treatment).
      - Verified via the local static-preview harness (all 7 bookies now
        in sync) and live against real tabtouch.com.au race pages: the
        venue-code scraper against a real day's full "All Racing" hub
        (dozens of venues, all three sports, correct codes); the runner
        scraper against both a genuinely open race and an already-
        resulted one, in each case confirming the wrong-value bug above
        was real before the "Field" view fix and gone after it.

- [x] Bookie columns in the odds table can now be reordered by drag —
      user-requested ("can we make the bookie colums rotatable my
      drag"). Drag a bookmaker's own column header left/right to move
      it; the new order is saved (`Settings.bookieColumnOrder`,
      `chrome.storage.sync`) and persists across popup reopens.
      - Every bookie `<th>` is now built fresh by
        `renderBookieHeaderCells()` (`popup.js`) from
        `orderedBookieList()`, in whatever order
        `bookieColumnOrder` says — popup.html no longer hardcodes
        these 7 `<th>` elements at all, since actually reordering
        columns means moving real DOM nodes, not just toggling each
        one's own `hidden` attribute the way `enabledBookies` already
        does. The per-runner row cells, the scratched-runner
        placeholder row, and the Market % footer row all switched from
        iterating the raw `BOOKIE_LIST` to `orderedBookieList()` too,
        so header/body/footer can never drift out of sync with each
        other.
      - Native HTML5 drag-and-drop (`draggable="true"` +
        dragstart/dragover/dragleave/drop/dragend), delegated on
        `#odds-table thead` rather than one listener per `<th>` (those
        elements get destroyed and recreated on every reorder) — no
        library needed, and every modern browser already gives a
        drag-ghost/drop-target affordance for free. `.dragging`
        (dimmed) and `.drag-over` (an inset accent outline, same
        treatment `.col-best` already uses) are the only new CSS
        (`popup.css`), plus a `grab` cursor on every bookie header.
      - Caught and fixed a real crash before shipping: the very first
        `renderBookieHeaderCells()` call runs immediately at script
        load (so headers exist before real settings have even loaded),
        and it reads `currentSettings.bookieColumnOrder` — but
        `currentSettings` was declared with `let` further down in the
        file, so that first read was a temporal-dead-zone
        `ReferenceError` that killed the *entire* script the instant it
        ran, before anything below it (the whole sidebar race list
        included) ever executed. This is exactly what a user hit live —
        the popup's sidebar stuck forever on "Loading…" with no bookie
        columns and no runners at all. Fixed by moving the
        `currentSettings` declaration up above where it's first read.
        Also added a `renderBookieHeaderCells()` call inside
        `applyDisplaySettings` (previously it only ran once at load,
        using the hardcoded default order, and again on a drag-drop —
        never once the user's *actual* saved order had loaded), so a
        returning user's own dragged order now genuinely applies on
        every popup open, not just the default.
      - Verified via the local static-preview harness: confirmed the
        crash (and the "Loading…" hang it caused) reproduces exactly
        against the pre-fix code and is gone after the fix; simulated a
        real drag via dispatched `DragEvent`s and confirmed the header,
        each row's own cells, and the footer all reorder together with
        no drift; confirmed `.dragging`/`.drag-over` render correctly
        mid-drag and leave no stray classes behind afterward; confirmed
        the new order round-trips through `chrome.storage.sync` and
        survives a full page reload (backed the harness's storage shim
        with real `localStorage` specifically to test this).

- [x] Restored the pink highlight around a bookmaker's own column
      header when it's actually planned (with a promo) for the loaded
      race — user-reported it "doesn't show up anymore" once a promo's
      selected on that bookie in the Daily Planner.
      - This highlight (`th.planned-bookie-col`, `--promo-color`)
        genuinely used to exist, then got removed entirely in an
        earlier rework of bookie-column visibility (a bookie's column
        either shows — planned or spotlighted — or it doesn't, no
        highlight layered on top; at the time showing the column at
        all already meant "planned or spotlighted", so the highlight
        felt redundant). What that removal didn't anticipate: once
        Planner and Spotlight picks both just render as identical,
        plain columns, there's no longer any way to tell at a glance
        which one is the actual promo you're running versus one that's
        only there for price comparison — restoring the highlight,
        scoped correctly this time, fixes exactly that.
      - Scoped to *planned* only, not `displayedBookieIds` (planned OR
        spotlighted) — a bookmaker spotlighted purely for comparison
        never gets tagged as if a promo were running on it.
        `renderRace` (`popup.js`) now toggles `.planned-bookie-col` on
        each bookie `<th>` from `plannerEntriesForMarketId`'s own
        result for the loaded race, right alongside the existing
        `hidden` toggle, so the two can never drift apart.
      - Verified via the local static-preview harness: a bookmaker
        planned (with a promo) for the loaded race shows the pink
        outline around its whole header box; a second bookmaker merely
        spotlighted alongside it for comparison shows with no highlight
        at all, confirmed side by side in the same screenshot.

- [x] Added **Unibet**, **Picklebet**, and **Palmerbet** — three more
      bookmakers, user-requested. Each turned out to need a genuinely
      different integration shape from every bookie already here:
      - **Unibet** (Kindred Group) has its own public persisted-query
        GraphQL feed (`js/unibet/api.js`), same kind of feed Ladbrokes/
        Neds already have — confirmed live: `MeetingsByDateRange` lists
        every AU/NZ meeting for a date window with real venue names and
        `eventKey`s, and a fresh tab opened straight at
        `unibet.com.au/racing#/event/<eventKey>` (not just an in-SPA
        hash change from an already-loaded page) renders the correct
        race immediately. `unibetWatcher.js` is a genuinely different
        shape from every other bookie's own watcher here: rather than a
        MutationObserver scraping the rendered DOM, it polls the exact
        same `EventQuery` feed directly on an interval — Unibet's own
        page turned out to have no fetch/XHR call this extension could
        hook at all (its own bundle grabs a `fetch` reference before a
        post-hoc hook installed here could ever see it), but the feed
        itself is clean, structured JSON, so there was nothing worth
        scraping the DOM for anyway. Runner scratchings
        (`competitor.status === "Scratched"`) confirmed live against
        several real races. One honest gap: market-closed detection
        (`event.status !== "Open"`) could only be built from the schema
        shape, not confirmed against a real resulted race — every AU/NZ
        race checked live while building this was still hours from
        jumping, so "Open" was the only status value ever actually
        observed. Worth re-checking against a real resulted Unibet race
        once one's convenient to look at.
      - **Picklebet** has no public feed found (same starting point
        tab.com.au/TABtouch each started from) — confirmed live via the
        same fetch/XHR/WebSocket hooking technique that found every
        other bookie's own real feed here, this one genuinely has
        neither. Falls back to DOM scraping
        (`picklebetWatcher.js`/`picklebet.js`), matched by the stable,
        human-readable PREFIX of its CSS-module class names
        (`[class*="Competitor-module--competitor--"]` etc.), not the
        trailing content hash a rebuild would change. Its own race URLs
        are pure opaque UUID pairs (meetingId + raceId, no cosmetic slug
        or derivable number-based path at all) — genuinely two levels
        deep to learn, unlike TAB/TABtouch's own single-hub-page
        learning: `picklebetMeetings.js` runs in two different modes
        (matched against two different URL patterns in manifest.json)
        depending on which page it's actually on — the "Today" list
        page (meeting-level: venue name + meetingId, grouped under a
        sport heading walked in real document order) or one specific
        meeting's own page (race-level: every race's own id is already
        a real link right there in the page's initial markup, no need
        to click through each race number's own tab first).
        `ensurePicklebetUrlForRace` (background.js) can take up to two
        on-demand page visits (~6s each) the very first time a given
        meeting is opened this session — instant on every later race
        within that same meeting. Market-closed detection (a "Results"
        tab appearing in the market-tab strip, absent while a race is
        genuinely still open) confirmed live against a real resulted
        race (see Palmerbet below — the same race, cross-checked).
      - **Palmerbet** has its own public REST feed
        (`js/palmerbet/api.js`) — plain readable paths, no persisted-
        query hash fragility to keep in sync with a frontend release at
        all (confirmed live: the exact same URLs, no session/cookies,
        return identical data logged out). Same "poll the feed
        directly, no DOM scraping" shape as Unibet's own watcher, for
        the same reason (a clean structured feed with nothing worth
        scraping a DOM for) — `palmerbetWatcher.js` combines two calls
        per poll (race detail for runners/scratchings/status, then the
        race's own Win market for live prices — confirmed live neither
        endpoint alone carries both). Best-verified of the three: its
        market-closed signal (`race.status: "Open"` → `"Final"`) was
        confirmed against a REAL resulted race — Hamilton R1, winner
        "High Falls" running as runner #6 — the exact same real race
        already cross-checked against Sportsbet/TAB/Neds/PointsBet/
        Betr/TABtouch throughout this whole project, and Picklebet's own
        independent data for the identical race (same winner, same
        runner numbers, same scratching) confirmed it again from a
        completely separate source.
      - All three: icons fetched live from each site's own favicon
        (Unibet, Picklebet — plain PNGs) or extracted from an ICO
        container wrapping a real PNG (Palmerbet's own `/favicon.ico`,
        same technique already used for Betr's icon — scanning the
        downloaded bytes for the PNG signature and slicing from there).
      - Verified via the local static-preview harness: all 10 bookies
        now render correctly (header, each row's own cells, and the
        footer all still exactly in sync); every new logo loads without
        a broken-image icon; `BOOKIE_LIST`/`enabledBookies`/
        `bookieColumnOrder` all carry the 3 new ids correctly. Every new
        `background.js`/content-script file syntax-checked (`new
        Function(code)` against each file, no execution) and null-byte
        checked before committing.

- [x] Fixed Betr's own tab no longer auto-opening — user-reported.
      Genuinely unrelated to the 3 new bookmakers just above (confirmed
      live): `fetchBetrNextEvents` (`js/betr/api.js`) started throwing
      "meeting is not iterable" the instant it reached
      `MultipleShortcutSummary`, one of two admittedly-unrelated top-
      level keys `GroupedRaceCard`'s own response always carried
      alongside the 3 real racing-type ones (Thoroughbred/Greyhounds/
      Trots) — a real, live BlueBet-side API change: that key used to
      be something the existing `Array.isArray(group)` check already
      skipped outright, and it now IS an array too (of plain shortcut
      objects like `{MarketType, EventMultipleId, ...}`, not a
      meeting's own nested array of races) — so the loop's inner
      `for (const race of meeting)` reached a plain object instead of
      an array and threw, discarding every real race already collected
      from the 3 genuine groups earlier in the same pass, since the
      exception propagated out of the whole function with nothing
      returned at all (caught by `listUpcomingRacesInner`'s own
      best-effort `.catch`, so `betrUrl` just silently stayed null for
      every race instead of erroring loudly).
      - Fixed by checking one level deeper — is THIS specific "meeting"
        itself an array of races, not just the top-level group — which
        is what actually tells a real meeting apart from a flat list of
        shortcut objects that merely happens to sit at the same top
        level now.
      - Verified live against the real, current `GroupedRaceCard`
        response: the exact same fix, run against today's real data,
        now returns 580 real events with no error (was 0, uncaught
        exception, before the fix).

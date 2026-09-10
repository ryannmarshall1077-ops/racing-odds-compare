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

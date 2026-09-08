// Placeholder data standing in for a live odds feed.
// Shape matches what refreshRaceInner() (background.js) actually returns:
// { race: string, runners: [{ name, betfair, betfairBack, bookmakers: { sportsbet, tab } }] }
const MOCK_RACE = {
  race: "Race 5 - Flemington",
  track: "Flemington",
  raceNumber: 5,
  sport: "horse",
  sportLabel: "Horse Racing",
  marketId: "1.mock",
  startTime: new Date(Date.now() + 12 * 60 * 1000).toISOString(),
  marketStatus: "OPEN",
  totalMatched: 18452,
  source: "mock",
  bookmakerSources: { sportsbet: "placeholder", tab: "placeholder" },
  runners: [
    {
      name: "1. Thunder Strike",
      betfair: 3.4,
      betfairLiquidity: 120,
      betfairBack: 3.35,
      betfairBackLiquidity: 95,
      bookmakers: { sportsbet: 3.8, tab: 3.9 },
      result: "ACTIVE",
    },
    {
      name: "2. Silver Comet",
      betfair: 5.0,
      betfairLiquidity: 45,
      betfairBack: 4.9,
      betfairBackLiquidity: 30,
      bookmakers: { sportsbet: 4.6, tab: 4.8 },
      result: "ACTIVE",
    },
    {
      name: "3. Northern Flame",
      betfair: 8.5,
      betfairLiquidity: 18,
      betfairBack: 8.2,
      betfairBackLiquidity: 10,
      bookmakers: { sportsbet: 9.0, tab: null },
      result: "ACTIVE",
    },
    {
      name: "4. Coastal Run",
      betfair: 12.0,
      betfairLiquidity: 6,
      betfairBack: 11.5,
      betfairBackLiquidity: 4,
      bookmakers: { sportsbet: 11.0, tab: 12.5 },
      result: "ACTIVE",
    },
    {
      name: "5. Midnight Rally",
      betfair: 21.0,
      betfairLiquidity: null,
      betfairBack: 19.5,
      betfairBackLiquidity: null,
      bookmakers: { sportsbet: 26.0, tab: null },
      result: "ACTIVE",
    },
    // A scratched runner — renders as a grayed-out placeholder row rather
    // than being omitted, so the mock data exercises that path too.
    {
      name: "6. Lucky Number",
      betfair: null,
      betfairLiquidity: null,
      betfairBack: null,
      betfairBackLiquidity: null,
      bookmakers: { sportsbet: null, tab: null },
      result: "REMOVED",
    },
  ],
};

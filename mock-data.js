// Placeholder data standing in for a live odds feed.
// Shape matches what refreshRaceInner() (background.js) actually returns:
// { race: string, runners: [{ name, betfair, bookmakers: { sportsbet, tab } }] }
const MOCK_RACE = {
  race: "Race 5 - Flemington",
  track: "Flemington",
  marketId: "1.mock",
  startTime: new Date(Date.now() + 12 * 60 * 1000).toISOString(),
  source: "mock",
  bookmakerSources: { sportsbet: "placeholder", tab: "placeholder" },
  runners: [
    {
      name: "1. Thunder Strike",
      betfair: 3.4,
      bookmakers: { sportsbet: 3.8, tab: 3.9 },
      betfairLiquidity: 120,
      result: "ACTIVE",
    },
    {
      name: "2. Silver Comet",
      betfair: 5.0,
      bookmakers: { sportsbet: 4.6, tab: 4.8 },
      betfairLiquidity: 45,
      result: "ACTIVE",
    },
    {
      name: "3. Northern Flame",
      betfair: 8.5,
      bookmakers: { sportsbet: 9.0, tab: null },
      betfairLiquidity: 18,
      result: "ACTIVE",
    },
    {
      name: "4. Coastal Run",
      betfair: 12.0,
      bookmakers: { sportsbet: 11.0, tab: 12.5 },
      betfairLiquidity: 6,
      result: "ACTIVE",
    },
    {
      name: "5. Midnight Rally",
      betfair: 21.0,
      bookmakers: { sportsbet: 26.0, tab: null },
      betfairLiquidity: null,
      result: "ACTIVE",
    },
    // A scratched runner — renders as a grayed-out placeholder row rather
    // than being omitted, so the mock data exercises that path too.
    {
      name: "6. Lucky Number",
      betfair: null,
      bookmakers: { sportsbet: null, tab: null },
      betfairLiquidity: null,
      result: "REMOVED",
    },
  ],
};

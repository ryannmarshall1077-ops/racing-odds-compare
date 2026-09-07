// Placeholder data standing in for a live odds feed.
// Shape matches what refreshRaceInner() (background.js) actually returns:
// { race: string, runners: [{ name, betfair, bookmakers: { sportsbet, tab } }] }
const MOCK_RACE = {
  race: "Race 5 - Flemington",
  track: "Flemington",
  source: "mock",
  bookmakerSources: { sportsbet: "placeholder", tab: "placeholder" },
  runners: [
    {
      name: "1. Thunder Strike",
      betfair: 3.4,
      bookmakers: { sportsbet: 3.8, tab: 3.9 },
      betfairLiquidity: 120,
    },
    {
      name: "2. Silver Comet",
      betfair: 5.0,
      bookmakers: { sportsbet: 4.6, tab: 4.8 },
      betfairLiquidity: 45,
    },
    {
      name: "3. Northern Flame",
      betfair: 8.5,
      bookmakers: { sportsbet: 9.0, tab: null },
      betfairLiquidity: 18,
    },
    {
      name: "4. Coastal Run",
      betfair: 12.0,
      bookmakers: { sportsbet: 11.0, tab: 12.5 },
      betfairLiquidity: 6,
    },
    {
      name: "5. Midnight Rally",
      betfair: 21.0,
      bookmakers: { sportsbet: 26.0, tab: null },
      betfairLiquidity: null,
    },
  ],
};

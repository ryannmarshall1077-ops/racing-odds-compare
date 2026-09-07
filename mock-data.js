// Placeholder data standing in for a live odds feed.
// Shape matches what a real data source (see js/sources/) should return:
// { race: string, runners: [{ name, betfair, bookmaker }] }
const MOCK_RACE = {
  race: "Race 5 - Flemington",
  track: "Flemington",
  source: "mock",
  bookmakerSource: "placeholder",
  runners: [
    { name: "1. Thunder Strike", betfair: 3.4, bookmaker: 3.8, betfairLiquidity: 120 },
    { name: "2. Silver Comet", betfair: 5.0, bookmaker: 4.6, betfairLiquidity: 45 },
    { name: "3. Northern Flame", betfair: 8.5, bookmaker: 9.0, betfairLiquidity: 18 },
    { name: "4. Coastal Run", betfair: 12.0, bookmaker: 11.0, betfairLiquidity: 6 },
    { name: "5. Midnight Rally", betfair: 21.0, bookmaker: 26.0, betfairLiquidity: null },
  ],
};

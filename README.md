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

## Roadmap

- [ ] Real Betfair odds via the official Betfair API-NG (requires a Betfair
      account + application key)
- [ ] Real bookmaker odds — needs a per-site content script once a specific
      bookmaker page's markup has been inspected
- [ ] Auto-refresh via `background.js` instead of static mock data
- [ ] Harness and greyhound racing codes

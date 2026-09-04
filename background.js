// Service worker entry point. Currently idle — will later own polling a
// real odds source and caching results in chrome.storage for popup.js to read.
chrome.runtime.onInstalled.addListener(() => {
  console.log("Racing Odds Compare installed");
});

// Copyright (C) 2026 Pelagic Games

/**
 * Fills the solved tally on Crosspath's index.html after level data and progress
 * helpers load. Reads completion state without changing storage.
 */

(() => {
  const levels = window.CrosspathLevels;
  const solved = window.CrosspathProgress.completedCount(levels);
  document.querySelector("#solved-tally").textContent = `${solved} of ${levels.length} solved`;
})();

// Copyright (C) 2026 Pelagic Games

/**
 * Fills the solved tally on Crosspath's index.html after level data and progress
 * helpers load. Reads completion state without changing storage, and adds the
 * "Not saved" notice when browser storage is unavailable.
 */

(() => {
  const levels = window.CrosspathLevels;
  const solved = window.CrosspathProgress.completedCount(levels);
  const tally = document.querySelector("#solved-tally");
  tally.textContent = `${solved} of ${levels.length} solved`;
  const notice = window.CrosspathProgress.createStorageNotice();
  if (notice) tally.append(notice);
})();

// Copyright (C) 2026 Pelagic Games

(() => {
  const levels = window.CrosspathLevels;
  const solved = window.CrosspathProgress.completedCount(levels);
  document.querySelector("#solved-tally").textContent = `${solved} of ${levels.length} solved`;
})();

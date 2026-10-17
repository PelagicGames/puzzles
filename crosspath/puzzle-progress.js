// Copyright (C) 2026 Pelagic Games

(() => {
  const storageKey = "crosspath.completedPuzzleCodes";
  const difficulties = [
    { id: "very-easy", label: "Very easy" },
    { id: "easy", label: "Easy" },
    { id: "medium", label: "Medium" },
    { id: "hard", label: "Hard" },
    { id: "very-hard", label: "Very hard" }
  ];
  const difficultyRank = new Map(difficulties.map(({ id }, index) => [id, index]));

  function completedCodes() {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.some((code) => typeof code !== "string")) {
      throw new Error(`Invalid puzzle completion data in "${storageKey}".`);
    }
    return parsed;
  }

  function isCompleted(code) {
    return completedCodes().includes(code);
  }

  function markCompleted(code) {
    const completed = completedCodes();
    if (completed.includes(code)) return;
    completed.push(code);
    window.localStorage.setItem(storageKey, JSON.stringify(completed));
  }

  function orderedLevels(levels) {
    return levels
      .map((level, index) => ({ level, index }))
      .sort((left, right) => (
        difficultyRank.get(left.level.difficulty) - difficultyRank.get(right.level.difficulty)
        || left.index - right.index
      ));
  }

  function nextUnsolved(levels, currentCode) {
    const ordered = orderedLevels(levels);
    const currentIndex = ordered.findIndex(({ level }) => level.code === currentCode);
    const candidates = currentIndex < 0
      ? ordered
      : [...ordered.slice(currentIndex + 1), ...ordered.slice(0, currentIndex)];
    return candidates.find(({ level }) => level.code !== currentCode && !isCompleted(level.code)) || null;
  }

  function completedCount(levels) {
    return levels.filter(({ code }) => isCompleted(code)).length;
  }

  window.CrosspathProgress = {
    completedCodes,
    completedCount,
    difficulties,
    isCompleted,
    markCompleted,
    nextUnsolved,
    orderedLevels,
    storageKey
  };
})();

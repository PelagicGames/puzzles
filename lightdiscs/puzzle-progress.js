// Copyright (C) 2026 Pelagic Games

(() => {
  const storageKey = "lightdiscs.completedPuzzleCodes";
  const difficulties = [
    { id: "very-easy", label: "Very easy" },
    { id: "easy", label: "Easy" },
    { id: "medium", label: "Medium" },
    { id: "hard", label: "Hard" },
    { id: "very-hard", label: "Very hard" }
  ];
  const difficultyRank = new Map(
    difficulties.map(({ id }, index) => [id, index])
  );
  const xorUnlockCount = 15;

  function combinationFor(levelOrCombination) {
    if (typeof levelOrCombination === "string") return levelOrCombination;
    return levelOrCombination?.combination || "standard";
  }

  function completionKey(code, levelOrCombination = "standard") {
    const combination = combinationFor(levelOrCombination);
    return combination === "xor" ? `xor:${code}` : code;
  }

  function completedCodes() {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.some((code) => typeof code !== "string")) {
      throw new Error(`Invalid puzzle completion data in "${storageKey}".`);
    }
    return parsed;
  }

  function isCompleted(code, levelOrCombination = "standard") {
    return completedCodes().includes(completionKey(code, levelOrCombination));
  }

  function markCompleted(code, levelOrCombination = "standard") {
    const completed = completedCodes();
    const key = completionKey(code, levelOrCombination);
    if (completed.includes(key)) return;
    completed.push(key);
    window.localStorage.setItem(storageKey, JSON.stringify(completed));
  }

  function orderedLevels(levels) {
    return levels
      .map((level, index) => ({ level, index }))
      .sort((left, right) => (
        Number((left.level.combination || "standard") === "xor")
          - Number((right.level.combination || "standard") === "xor")
        || difficultyRank.get(left.level.difficulty)
          - difficultyRank.get(right.level.difficulty)
        || left.index - right.index
      ));
  }

  function nextUnsolved(levels, currentCode) {
    const ordered = orderedLevels(levels);
    const current = typeof currentCode === "object"
      ? currentCode
      : { code: currentCode, combination: "standard" };
    const currentIndex = ordered.findIndex(({ level }) => (
      level.code === current.code
      && (level.combination || "standard") === combinationFor(current)
    ));
    const candidates = currentIndex < 0
      ? ordered
      : [...ordered.slice(currentIndex + 1), ...ordered.slice(0, currentIndex)];
    return candidates.find(({ level }) => (
      completionKey(level.code, level) !== completionKey(current.code, current)
        && !isCompleted(level.code, level)
    )) || null;
  }

  function completedStandardCount() {
    return completedCodes().filter((key) => !key.startsWith("xor:")).length;
  }

  function xorUnlocked() {
    return completedStandardCount() >= xorUnlockCount;
  }

  function completedDifficultyCount(levels, combination = "standard") {
    return difficulties.filter(({ id }) => {
      const matching = levels.filter((level) => (
        level.difficulty === id
        && (level.combination || "standard") === combination
      ));
      return matching.length > 0
        && matching.every((level) => isCompleted(level.code, level));
    }).length;
  }

  window.LightDiscProgress = {
    completedCodes,
    completedDifficultyCount,
    completedStandardCount,
    completionKey,
    difficulties,
    isCompleted,
    markCompleted,
    nextUnsolved,
    orderedLevels,
    storageKey,
    xorUnlocked,
    xorUnlockCount
  };
})();

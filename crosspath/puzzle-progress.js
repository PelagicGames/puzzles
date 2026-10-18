// Copyright (C) 2026 Pelagic Games

/**
 * Completion storage and difficulty-ordered navigation shared by menu, catalogue
 * and puzzle pages. Publishes CrosspathProgress without requiring level data.
 * Saves exact puzzle codes as a JSON string array in localStorage; storage and
 * malformed-data errors propagate rather than silently discarding progress.
 */

(() => {
  const storageKey = "crosspath.completedPuzzleCodes";
  const difficulties = [
    { id: "very-easy", label: "Very easy" },
    { id: "easy", label: "Easy" },
    { id: "medium", label: "Medium" },
    { id: "hard", label: "Hard" },
    { id: "very-hard", label: "Very hard" }
  ];
  // Lower ranks are easier; catalogue order breaks ties within each band.
  const difficultyRank = new Map(difficulties.map(({ id }, index) => [id, index]));

  /**
   * @returns {string[]} Freshly read completion codes, or an empty array when absent.
   * Throws for malformed JSON, unexpected shapes or unavailable storage.
   */
  function completedCodes() {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.some((code) => typeof code !== "string")) {
      throw new Error(`Invalid puzzle completion data in "${storageKey}".`);
    }
    return parsed;
  }

  /**
   * @param {string} code - Exact puzzle code.
   * @returns {boolean} Whether storage contains the code.
   */
  function isCompleted(code) {
    return completedCodes().includes(code);
  }

  /**
   * @param {string} code - Exact solved puzzle code.
   * @returns {void} Appends the code to storage only if not already recorded.
   */
  function markCompleted(code) {
    const completed = completedCodes();
    if (completed.includes(code)) return;
    completed.push(code);
    window.localStorage.setItem(storageKey, JSON.stringify(completed));
  }

  /**
   * @param {Object[]} levels - Catalogue entries with difficulty and code fields.
   * @returns {Object[]} New difficulty-ordered level/index pairs preserving source indices.
   */
  function orderedLevels(levels) {
    return levels
      .map((level, index) => ({ level, index }))
      .sort((left, right) => (
        difficultyRank.get(left.level.difficulty) - difficultyRank.get(right.level.difficulty)
        || left.index - right.index
      ));
  }

  /**
   * @param {Object[]} levels - Catalogue entries.
   * @param {string} currentCode - Current puzzle to exclude from candidates.
   * @returns {Object|null} Next unsolved level/index pair, wrapping difficulty order;
   * starts at the beginning when the current code is unknown.
   */
  function nextUnsolved(levels, currentCode) {
    const ordered = orderedLevels(levels);
    const currentIndex = ordered.findIndex(({ level }) => level.code === currentCode);
    const candidates = currentIndex < 0
      ? ordered
      : [...ordered.slice(currentIndex + 1), ...ordered.slice(0, currentIndex)];
    return candidates.find(({ level }) => level.code !== currentCode && !isCompleted(level.code)) || null;
  }

  /**
   * @param {Object[]} levels - Catalogue entries to count.
   * @returns {number} Entries whose codes have been completed.
   */
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

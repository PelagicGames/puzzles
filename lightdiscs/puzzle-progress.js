// Copyright (C) 2026 Pelagic Games
/**
 * Browser completion and campaign ordering API for menus, tutorials and puzzle.js.
 * Load before those controllers; publishes LightDiscProgress. Reads localStorage
 * on demand and writes only through markCompleted. Invalid stored JSON/data and
 * storage access failures propagate to callers rather than silently resetting it.
 */

(() => {
  // Legacy standard codes stay unprefixed; XOR completions have an "xor:" prefix.
  const storageKey = "lightdiscs.completedPuzzleCodes";
  // Display order is also the difficulty sort order within each campaign.
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
  // Count standard completion keys, rather than completed difficulty bands.
  const xorUnlockCount = 15;

  /**
   * @param {Object|string} levelOrCombination - Level record or combination name.
   * @returns {string} Combination, defaulting absent record fields to standard.
   */
  function combinationFor(levelOrCombination) {
    if (typeof levelOrCombination === "string") return levelOrCombination;
    return levelOrCombination?.combination || "standard";
  }

  /**
   * @param {string} code - Canonical level code.
   * @param {Object|string} levelOrCombination - Level or combination.
   * @returns {string} Campaign-specific storage identity.
   */
  function completionKey(code, levelOrCombination = "standard") {
    const combination = combinationFor(levelOrCombination);
    return combination === "xor" ? `xor:${code}` : code;
  }

  /**
   * Read and validate persistent completion data; malformed data throws.
   * @returns {string[]} Fresh array of stored keys, or empty when never stored.
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
   * Read storage to check a campaign-specific completion.
   * @param {string} code - Canonical level code.
   * @param {Object|string} levelOrCombination - Level or combination.
   * @returns {boolean} Whether its completion key is stored.
   */
  function isCompleted(code, levelOrCombination = "standard") {
    return completedCodes().includes(completionKey(code, levelOrCombination));
  }

  /**
   * Append a new completion to localStorage; existing keys cause no write.
   * @param {string} code - Canonical level code.
   * @param {Object|string} levelOrCombination - Level or combination.
   * @returns {void}
   */
  function markCompleted(code, levelOrCombination = "standard") {
    const completed = completedCodes();
    const key = completionKey(code, levelOrCombination);
    if (completed.includes(key)) return;
    completed.push(key);
    window.localStorage.setItem(storageKey, JSON.stringify(completed));
  }

  /**
   * Sort a copy by standard before XOR, difficulty, then original catalogue index.
   * @param {Object[]} levels - Catalogue records, left unchanged.
   * @returns {Object[]} {level, index} records retaining navigation indices.
   */
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

  /**
   * Scan after the current entry, wrapping and excluding that entry; reads storage.
   * Does not filter candidates by the XOR unlock threshold.
   * @param {Object[]} levels - Catalogue records.
   * @param {Object|string} currentCode - Current level or standard-campaign code.
   * @returns {Object|null} Next {level, index}, or null when none remains.
   */
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

  /**
   * @returns {number} Number of stored keys without the XOR prefix; reads storage.
   */
  function completedStandardCount() {
    return completedCodes().filter((key) => !key.startsWith("xor:")).length;
  }

  /**
   * @returns {boolean} Whether stored standard completions reach the unlock threshold.
   */
  function xorUnlocked() {
    return completedStandardCount() >= xorUnlockCount;
  }

  /**
   * Count non-empty difficulty groups for which every supplied level is completed.
   * @param {Object[]} levels - Catalogue records to group; reads completion storage.
   * @param {string} combination - Campaign to inspect.
   * @returns {number} Fully completed difficulty bands.
   */
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

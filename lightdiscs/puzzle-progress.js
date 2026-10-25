// Copyright (C) 2026 Pelagic Games
/**
 * Browser completion and campaign ordering API for menus, tutorials and puzzle.js.
 * Load before those controllers; publishes LightDiscProgress. Reads localStorage
 * on demand and writes only through markCompleted. Storage is probed once on
 * load: when the browser blocks it (or a write fails), reads see no saved keys,
 * completions are kept in memory for the current page only and
 * createStorageNotice() supplies a "Not saved" indicator for progress displays.
 * Invalid stored JSON/data still throws rather than silently resetting progress.
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
  const storageNoticeText = "Progress is not being saved: local browser storage must be enabled to track progress.";
  const storageAvailable = probeStorage();
  // Completion keys that could not be written; forgotten when the page unloads.
  const unsavedKeys = [];
  let noticeCount = 0;

  /**
   * @returns {boolean} Whether a test key can be written, read back and removed.
   */
  function probeStorage() {
    const probeKey = `${storageKey}.probe`;
    try {
      const storage = window.localStorage;
      storage.setItem(probeKey, "1");
      const readable = storage.getItem(probeKey) === "1";
      storage.removeItem(probeKey);
      return readable;
    } catch {
      return false;
    }
  }

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
   * @returns {string[]} Fresh array of stored keys plus unsaved keys from this
   * page, or empty when never stored or storage is unavailable.
   */
  function completedCodes() {
    const stored = storageAvailable ? window.localStorage.getItem(storageKey) : null;
    const parsed = stored === null ? [] : JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.some((code) => typeof code !== "string")) {
      throw new Error(`Invalid puzzle completion data in "${storageKey}".`);
    }
    return [...parsed, ...unsavedKeys.filter((key) => !parsed.includes(key))];
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
   * Append a new completion to localStorage; existing keys cause no write. When
   * storage is unavailable or the write fails, remember it for this page only.
   * @param {string} code - Canonical level code.
   * @param {Object|string} levelOrCombination - Level or combination.
   * @returns {boolean} Whether the completion is held in persistent storage.
   */
  function markCompleted(code, levelOrCombination = "standard") {
    const completed = completedCodes();
    const key = completionKey(code, levelOrCombination);
    if (completed.includes(key)) return !unsavedKeys.includes(key);
    completed.push(key);
    if (storageAvailable) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(completed));
        return true;
      } catch {
        // Quota or permission failures fall through to page-only memory.
      }
    }
    unsavedKeys.push(key);
    return false;
  }

  /**
   * Build a focusable "Not saved" pill whose tooltip explains why progress is
   * not tracked; styled by .storage-notice rules in styles.css.
   * @returns {HTMLElement|null} New pill, or null when storage is available.
   */
  function createStorageNotice() {
    if (storageAvailable) return null;
    noticeCount += 1;
    const notice = document.createElement("span");
    const icon = document.createElement("span");
    const label = document.createElement("span");
    const tip = document.createElement("span");
    notice.className = "storage-notice";
    notice.tabIndex = 0;
    notice.title = storageNoticeText;
    notice.setAttribute("role", "note");
    icon.className = "storage-notice-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "\u26a0";
    label.textContent = "Not saved";
    tip.id = `storage-notice-tip-${noticeCount}`;
    tip.className = "storage-notice-tip";
    tip.setAttribute("role", "tooltip");
    tip.textContent = storageNoticeText;
    notice.setAttribute("aria-describedby", tip.id);
    notice.append(icon, label, tip);
    notice.addEventListener("keydown", (event) => {
      if (event.key === "Escape") notice.blur();
    });
    return notice;
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
    createStorageNotice,
    difficulties,
    isCompleted,
    markCompleted,
    nextUnsolved,
    orderedLevels,
    storageAvailable,
    storageKey,
    storageNoticeText,
    xorUnlocked,
    xorUnlockCount
  };
})();

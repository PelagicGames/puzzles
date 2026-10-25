// Copyright (C) 2026 Pelagic Games

/**
 * Completion storage and difficulty-ordered navigation shared by menu, catalogue
 * and puzzle pages. Publishes CrosspathProgress without requiring level data.
 * Saves exact puzzle codes as a JSON string array in localStorage. Storage is
 * probed once on load: when the browser blocks it (or a write fails), reads see
 * no saved codes, completions are kept in memory for the current page only and
 * createStorageNotice() supplies a "Not saved" indicator for progress displays.
 * Malformed stored data still throws rather than silently discarding progress.
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
  const storageNoticeText = "Progress is not being saved: local browser storage must be enabled to track progress.";
  const storageAvailable = probeStorage();
  // Completions that could not be written; forgotten when the page unloads.
  const unsavedCodes = [];
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
   * @returns {string[]} Freshly read completion codes plus any unsaved ones from
   * this page, or an empty array when absent. Throws for malformed stored data.
   */
  function completedCodes() {
    const stored = storageAvailable ? window.localStorage.getItem(storageKey) : null;
    const parsed = stored === null ? [] : JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.some((code) => typeof code !== "string")) {
      throw new Error(`Invalid puzzle completion data in "${storageKey}".`);
    }
    return [...parsed, ...unsavedCodes.filter((code) => !parsed.includes(code))];
  }

  /**
   * @param {string} code - Exact puzzle code.
   * @returns {boolean} Whether storage contains the code.
   */
  function isCompleted(code) {
    return completedCodes().includes(code);
  }

  /**
   * Append the code to storage only if not already recorded; when storage is
   * unavailable or the write fails, remember it for this page only.
   * @param {string} code - Exact solved puzzle code.
   * @returns {boolean} Whether the completion is held in persistent storage.
   */
  function markCompleted(code) {
    const completed = completedCodes();
    if (completed.includes(code)) return !unsavedCodes.includes(code);
    completed.push(code);
    if (storageAvailable) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(completed));
        return true;
      } catch {
        // Quota or permission failures fall through to page-only memory.
      }
    }
    unsavedCodes.push(code);
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
    createStorageNotice,
    difficulties,
    isCompleted,
    markCompleted,
    nextUnsolved,
    orderedLevels,
    storageAvailable,
    storageKey,
    storageNoticeText
  };
})();

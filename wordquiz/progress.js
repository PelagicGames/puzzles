// Copyright (C) 2026 Pelagic Games

/**
 * Solved-puzzle storage and random puzzle selection shared by the menu and puzzle
 * pages. Saves solved puzzle IDs as a JSON string array in localStorage. Storage
 * is probed once on load: when the browser blocks it (or a write fails), reads see
 * no saved IDs, solves are kept in memory for the current page only and
 * createStorageNotice() supplies a "Not saved" indicator for progress displays.
 * Malformed stored data still throws rather than silently discarding progress.
 * Publishes WordQuizProgress in browsers and exports it under Node for tests.
 */

(() => {
  const root = typeof window !== "undefined" ? window : globalThis;
  const storageKey = "wordquiz.solvedPuzzleIds";
  const storageNoticeText = "Progress is not being saved: local browser storage must be enabled to track progress.";
  const storageAvailable = probeStorage();
  // Solves that could not be written; forgotten when the page unloads.
  const unsavedIds = [];
  let noticeCount = 0;

  /**
   * @returns {boolean} Whether a test key can be written, read back and removed.
   */
  function probeStorage() {
    const probeKey = `${storageKey}.probe`;
    try {
      const storage = root.localStorage;
      storage.setItem(probeKey, "1");
      const readable = storage.getItem(probeKey) === "1";
      storage.removeItem(probeKey);
      return readable;
    } catch {
      return false;
    }
  }

  /**
   * @returns {string[]} Freshly read solved IDs plus unsaved ones from this page,
   * or an empty array when absent. Throws for malformed stored data.
   */
  function solvedIds() {
    const stored = storageAvailable ? root.localStorage.getItem(storageKey) : null;
    const parsed = stored === null ? [] : JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string")) {
      throw new Error(`Invalid Word Quiz progress data in "${storageKey}".`);
    }
    return [...parsed, ...unsavedIds.filter((id) => !parsed.includes(id))];
  }

  /**
   * @param {string} id - Puzzle ID.
   * @returns {boolean} Whether the puzzle has been solved on this device.
   */
  function isSolved(id) {
    return solvedIds().includes(id);
  }

  /**
   * Append the ID only if not already recorded; when storage is unavailable or
   * the write fails, remember it for this page only.
   * @param {string} id - Puzzle ID just solved.
   * @returns {boolean} Whether the solve is held in persistent storage.
   */
  function markSolved(id) {
    const solved = solvedIds();
    if (solved.includes(id)) return !unsavedIds.includes(id);
    solved.push(id);
    if (storageAvailable) {
      try {
        root.localStorage.setItem(storageKey, JSON.stringify(solved));
        return true;
      } catch {
        // Quota or permission failures fall through to page-only memory.
      }
    }
    unsavedIds.push(id);
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
    const notice = root.document.createElement("span");
    const icon = root.document.createElement("span");
    const label = root.document.createElement("span");
    const tip = root.document.createElement("span");
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
   * @param {Object[]} puzzles - Bank entries.
   * @returns {number} Bank entries solved; IDs no longer in the bank are ignored.
   */
  function solvedCount(puzzles) {
    const solved = new Set(solvedIds());
    return puzzles.filter(({ id }) => solved.has(id)).length;
  }

  /**
   * @param {Object[]} puzzles - Bank entries.
   * @param {string} [excludeId] - Puzzle to leave out, normally the one on screen.
   * @param {() => number} [random] - Source of floats in [0, 1).
   * @returns {Object|null} A random unsolved entry, or null when everything is solved.
   */
  function randomUnsolved(puzzles, excludeId, random = Math.random) {
    const solved = new Set(solvedIds());
    const candidates = puzzles.filter(({ id }) => id !== excludeId && !solved.has(id));
    if (!candidates.length) return null;
    return candidates[Math.floor(random() * candidates.length)];
  }

  root.WordQuizProgress = {
    createStorageNotice,
    isSolved,
    markSolved,
    randomUnsolved,
    solvedCount,
    solvedIds,
    storageAvailable,
    storageKey,
    storageNoticeText
  };
  if (typeof module !== "undefined") module.exports = root.WordQuizProgress;
})();

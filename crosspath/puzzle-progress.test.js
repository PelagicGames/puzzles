// Copyright (C) 2026 Pelagic Games

/**
 * Run with node crosspath/puzzle-progress.test.js from the repository root.
 * Loads committed levels and progress helpers in Node with in-memory storage;
 * verifies completion and navigation without writing browser or disk state, and
 * that blocked or full storage leaves progress unsaved rather than failing.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// The storage stub preserves missing-key semantics using string-keyed values.
const values = new Map();
global.window = {
  localStorage: {
    /**
     * @param {string} key - Storage key.
     * @returns {string|null} Stored value or null when absent.
     */
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    /**
     * @param {string} key - Storage key.
     * @param {string} value - Serialised value.
     * @returns {void} Replaces the in-memory entry.
     */
    setItem(key, value) {
      values.set(key, value);
    },
    /**
     * @param {string} key - Storage key.
     * @returns {void} Deletes the in-memory entry.
     */
    removeItem(key) {
      values.delete(key);
    }
  }
};
["puzzle-levels.js", "puzzle-progress.js"].forEach((file) => {
  vm.runInThisContext(
    fs.readFileSync(path.join(__dirname, file), "utf8"),
    { filename: file }
  );
});

/**
 * @param {Object} sandboxWindow - Window stand-in for an isolated context.
 * @returns {Object} CrosspathProgress loaded against that window.
 */
function loadIsolatedProgress(sandboxWindow) {
  const context = vm.createContext({ window: sandboxWindow });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "puzzle-progress.js"), "utf8"),
    context,
    { filename: "puzzle-progress.js" }
  );
  return sandboxWindow.CrosspathProgress;
}

const levels = window.CrosspathLevels;
const progress = window.CrosspathProgress;
assert.strictEqual(progress.storageAvailable, true);
assert.strictEqual(progress.createStorageNotice(), null);

// Difficulty order and an empty store establish the navigation starting point.
assert.deepStrictEqual(
  progress.difficulties.map(({ id }) => id),
  ["very-easy", "easy", "medium", "hard", "very-hard"]
);
assert.strictEqual(progress.completedCount(levels), 0);

// Repeated completion is idempotent and advances to the next ordered puzzle.
const ordered = progress.orderedLevels(levels);
const first = ordered[0].level;
const second = ordered[1].level;
assert.strictEqual(progress.nextUnsolved(levels, null).level, first);
progress.markCompleted(first.code);
progress.markCompleted(first.code);
assert.deepStrictEqual(progress.completedCodes(), [first.code]);
assert.ok(progress.isCompleted(first.code));
assert.strictEqual(progress.nextUnsolved(levels, first.code).level, second);

// Exhausted catalogues have no successor; corrupt storage must not be accepted.
levels.forEach(({ code }) => progress.markCompleted(code));
assert.strictEqual(progress.completedCount(levels), levels.length);
assert.strictEqual(progress.nextUnsolved(levels, first.code), null);

values.set(progress.storageKey, "{\"bad\":true}");
assert.throws(() => progress.completedCodes(), /Invalid puzzle completion data/);

// A throwing localStorage getter reads as empty and keeps completions page-only.
const blocked = loadIsolatedProgress({
  get localStorage() {
    throw new Error("SecurityError: storage is blocked");
  }
});
assert.strictEqual(blocked.storageAvailable, false);
assert.strictEqual(blocked.completedCount(levels), 0);
assert.strictEqual(blocked.markCompleted(first.code), false);
assert.ok(blocked.isCompleted(first.code));
assert.strictEqual(blocked.nextUnsolved(levels, first.code).level, second);
assert.match(blocked.storageNoticeText, /local browser storage must be enabled/);

// Writes that fail after a successful probe are also kept for this page only.
let quotaFull = false;
const quotaValues = new Map();
const quota = loadIsolatedProgress({
  localStorage: {
    getItem: (key) => (quotaValues.has(key) ? quotaValues.get(key) : null),
    setItem: (key, value) => {
      if (quotaFull) throw new Error("QuotaExceededError");
      quotaValues.set(key, value);
    },
    removeItem: (key) => quotaValues.delete(key)
  }
});
assert.strictEqual(quota.storageAvailable, true);
assert.strictEqual(quota.markCompleted(first.code), true);
quotaFull = true;
assert.strictEqual(quota.markCompleted(second.code), false);
assert.deepStrictEqual([...quota.completedCodes()], [first.code, second.code]);
assert.strictEqual(quotaValues.get(quota.storageKey), JSON.stringify([first.code]));

function renderCatalogue(crowded) {
  const storage = new Map();
  const createElement = () => ({
    children: [],
    attributes: {},
    classList: { toggle() {} },
    append(...children) { this.children.push(...children); },
    setAttribute(name, value) { this.attributes[name] = value; }
  });
  const nodes = Object.fromEntries(
    ["#difficulty-list", "#solved-tally", "#catalogue-kicker", "#catalogue-standfirst"]
      .map((selector) => [selector, createElement()])
  );
  const context = vm.createContext({
    URLSearchParams,
    window: {
      location: { search: crowded ? "?mode=crowded" : "" },
      localStorage: {
        getItem: (key) => storage.has(key) ? storage.get(key) : null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key)
      }
    },
    document: { createElement, querySelector: (selector) => nodes[selector] }
  });
  ["puzzle-levels.js", "crowded-levels.js", "puzzle-progress.js", "puzzles.js"].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context, { filename: file });
  });
  return nodes["#difficulty-list"].children;
}

const normalSections = renderCatalogue(false);
const crowdedSections = renderCatalogue(true);
assert.strictEqual(normalSections.length, 5);
assert.strictEqual(crowdedSections.length, 5);
normalSections.forEach((section) => assert.strictEqual(section.children[2].children.length, 12));
crowdedSections.forEach((section) => assert.strictEqual(section.children[2].children.length, 6));
normalSections.forEach((section, index) => {
  assert.strictEqual(section.children[1].textContent, crowdedSections[index].children[1].textContent,
    "difficulty descriptions are shared across modes");
});
assert.strictEqual(crowdedSections[4].children[1].textContent,
  "The most demanding puzzles, with substantial ambiguity.");
assert.strictEqual(crowdedSections[0].children[2].children[0].href, "./puzzle.html?level=1&mode=crowded");
assert.strictEqual(crowdedSections[4].children[2].children[5].href, "./puzzle.html?level=30&mode=crowded");

console.log("Crosspath progress tests passed.");

// Copyright (C) 2026 Pelagic Games

/**
 * Run with node crosspath/puzzle-progress.test.js from the repository root.
 * Loads committed levels and progress helpers in Node with in-memory storage;
 * verifies completion and navigation without writing browser or disk state.
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
    }
  }
};
["puzzle-levels.js", "puzzle-progress.js"].forEach((file) => {
  vm.runInThisContext(
    fs.readFileSync(path.join(__dirname, file), "utf8"),
    { filename: file }
  );
});

const levels = window.CrosspathLevels;
const progress = window.CrosspathProgress;

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

console.log("Crosspath progress tests passed.");

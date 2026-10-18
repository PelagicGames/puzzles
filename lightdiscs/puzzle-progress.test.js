// Copyright (C) 2026 Pelagic Games
/**
 * Standalone campaign persistence tests: node lightdiscs/puzzle-progress.test.js
 * Reads both catalogues and progress via Node's VM, using a Map-backed localStorage
 * double rather than real browser storage. Checks ordering, completion identities,
 * next-level wrapping and unlock/star counts; only the success log is written.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Isolate persistent state so completion checks cannot affect a player's progress.
const values = new Map();
global.window = {
  localStorage: {
    /**
     * @param {string} key - Storage key.
     * @returns {string|null} Stored serialised value, or the browser-compatible null.
     */
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    /**
     * Update the in-memory storage double.
     * @param {string} key - Storage key.
     * @param {string} value - Serialised value.
     * @returns {void}
     */
    setItem(key, value) {
      values.set(key, value);
    }
  }
};
["puzzle-levels.js", "xor-puzzle-levels.js", "puzzle-progress.js"].forEach((file) => {
  vm.runInThisContext(
    fs.readFileSync(path.join(__dirname, file), "utf8"),
    { filename: file }
  );
});

const levels = window.LightDiscLevels;
const progress = window.LightDiscProgress;

// Difficulty ordering is stable within standard then XOR; each band has six titles.
assert.deepStrictEqual(
  progress.difficulties.map(({ id }) => id),
  ["very-easy", "easy", "medium", "hard", "very-hard"]
);
const ordered = progress.orderedLevels(levels);
assert.deepStrictEqual(
  ordered.map(({ level }) => level.difficulty),
  [
    ...Array(6).fill("very-easy"),
    ...Array(6).fill("easy"),
    ...Array(6).fill("medium"),
    ...Array(6).fill("hard"),
    ...Array(6).fill("very-hard"),
    ...Array(6).fill("very-easy"),
    ...Array(6).fill("easy"),
    ...Array(6).fill("medium"),
    ...Array(6).fill("hard"),
    ...Array(6).fill("very-hard")
  ]
);
["standard", "xor"].forEach((combination) => progress.difficulties.forEach(({ id }) => {
  assert.deepStrictEqual(
    levels
      .filter((level) => (
        level.difficulty === id && level.combination === combination
      ))
      .map(({ title }) => title),
    ["Puzzle 1", "Puzzle 2", "Puzzle 3", "Puzzle 4", "Puzzle 5", "Puzzle 6"]
  );
}));

// Standard completion retains legacy bare-code storage and does not mark neighbours.
progress.markCompleted(levels[0].code, levels[0]);
assert.strictEqual(progress.isCompleted(levels[0].code, levels[0]), true);
assert.strictEqual(progress.isCompleted(levels[1].code), false);
assert.deepStrictEqual(
  JSON.parse(values.get(progress.storageKey)),
  [levels[0].code]
);

// Next-unsolved skips stored completions and wraps after the final ordered entry.
let next = progress.nextUnsolved(levels, levels[0].code);
assert.strictEqual(next.level.code, ordered[1].level.code);
progress.markCompleted(ordered[1].level.code);
next = progress.nextUnsolved(levels, ordered.at(-1).level.code);
assert.strictEqual(next.level.code, ordered[2].level.code);

// The threshold counts standard completions; XOR keys must be separately prefixed.
assert.strictEqual(progress.xorUnlocked(), false);
levels
  .filter(({ combination }) => combination === "standard")
  .slice(0, progress.xorUnlockCount)
  .forEach((level) => progress.markCompleted(level.code, level));
assert.strictEqual(progress.xorUnlocked(), true);

const firstXor = levels.find(({ combination }) => combination === "xor");
progress.markCompleted(firstXor.code, firstXor);
assert.strictEqual(progress.isCompleted(firstXor.code, firstXor), true);
assert.strictEqual(
  JSON.parse(values.get(progress.storageKey)).includes(`xor:${firstXor.code}`),
  true
);

// A completed catalogue has no next unsolved entry and earns all five bands per mode.
levels.forEach((level) => progress.markCompleted(level.code, level));
assert.strictEqual(progress.nextUnsolved(levels, levels[0]), null);
assert.strictEqual(progress.completedDifficultyCount(levels, "standard"), 5);
assert.strictEqual(progress.completedDifficultyCount(levels, "xor"), 5);

console.log("Light Disc progress tests passed.");

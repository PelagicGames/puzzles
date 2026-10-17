// Copyright (C) 2026 Pelagic Games

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const values = new Map();
global.window = {
  localStorage: {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
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

assert.deepStrictEqual(
  progress.difficulties.map(({ id }) => id),
  ["very-easy", "easy", "medium", "hard", "very-hard"]
);
assert.strictEqual(progress.completedCount(levels), 0);

const ordered = progress.orderedLevels(levels);
const first = ordered[0].level;
const second = ordered[1].level;
assert.strictEqual(progress.nextUnsolved(levels, null).level, first);
progress.markCompleted(first.code);
progress.markCompleted(first.code);
assert.deepStrictEqual(progress.completedCodes(), [first.code]);
assert.ok(progress.isCompleted(first.code));
assert.strictEqual(progress.nextUnsolved(levels, first.code).level, second);

levels.forEach(({ code }) => progress.markCompleted(code));
assert.strictEqual(progress.completedCount(levels), levels.length);
assert.strictEqual(progress.nextUnsolved(levels, first.code), null);

values.set(progress.storageKey, "{\"bad\":true}");
assert.throws(() => progress.completedCodes(), /Invalid puzzle completion data/);

console.log("Crosspath progress tests passed.");

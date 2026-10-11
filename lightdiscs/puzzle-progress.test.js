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

const levels = window.LightDiscLevels;
const progress = window.LightDiscProgress;

assert.deepStrictEqual(
  progress.difficulties.map(({ id }) => id),
  ["very-easy", "easy", "medium", "hard", "very-hard"]
);
assert.deepStrictEqual(
  progress.orderedLevels(levels).map(({ level }) => level.difficulty),
  [
    ...Array(8).fill("very-easy"),
    ...Array(3).fill("medium"),
    ...Array(3).fill("very-hard")
  ]
);

progress.markCompleted(levels[0].code);
assert.strictEqual(progress.isCompleted(levels[0].code), true);
assert.strictEqual(progress.isCompleted(levels[1].code), false);
assert.deepStrictEqual(
  JSON.parse(values.get(progress.storageKey)),
  [levels[0].code]
);

let next = progress.nextUnsolved(levels, levels[0].code);
assert.strictEqual(next.level.code, levels[1].code);
progress.markCompleted(levels[1].code);
next = progress.nextUnsolved(levels, levels[13].code);
assert.strictEqual(next.level.code, levels[2].code);

levels.forEach(({ code }) => progress.markCompleted(code));
assert.strictEqual(progress.nextUnsolved(levels, levels[0].code), null);

console.log("Light Disc progress tests passed.");

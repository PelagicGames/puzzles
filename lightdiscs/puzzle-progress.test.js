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
const ordered = progress.orderedLevels(levels);
assert.deepStrictEqual(
  ordered.map(({ level }) => level.difficulty),
  [
    ...Array(6).fill("very-easy"),
    ...Array(6).fill("easy"),
    ...Array(6).fill("medium"),
    ...Array(6).fill("hard"),
    ...Array(6).fill("very-hard")
  ]
);
progress.difficulties.forEach(({ id }) => {
  assert.deepStrictEqual(
    levels.filter(({ difficulty }) => difficulty === id).map(({ title }) => title),
    ["Puzzle 1", "Puzzle 2", "Puzzle 3", "Puzzle 4", "Puzzle 5", "Puzzle 6"]
  );
});

progress.markCompleted(levels[0].code);
assert.strictEqual(progress.isCompleted(levels[0].code), true);
assert.strictEqual(progress.isCompleted(levels[1].code), false);
assert.deepStrictEqual(
  JSON.parse(values.get(progress.storageKey)),
  [levels[0].code]
);

let next = progress.nextUnsolved(levels, levels[0].code);
assert.strictEqual(next.level.code, ordered[1].level.code);
progress.markCompleted(ordered[1].level.code);
next = progress.nextUnsolved(levels, ordered.at(-1).level.code);
assert.strictEqual(next.level.code, ordered[2].level.code);

levels.forEach(({ code }) => progress.markCompleted(code));
assert.strictEqual(progress.nextUnsolved(levels, levels[0].code), null);

console.log("Light Disc progress tests passed.");

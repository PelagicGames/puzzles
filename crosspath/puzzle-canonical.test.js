// Copyright (C) 2026 Pelagic Games

/**
 * Run with node crosspath/puzzle-canonical.test.js from the repository root.
 * Loads the rules, solver, canonical-form helpers and committed levels into a Node
 * window shim; checks ordering, symmetry invariance and the distance metric.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = {};
["crosspath-rules.js", "solver.js", "puzzle-levels.js", "puzzle-canonical.js"].forEach((file) => {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), "utf8"), { filename: file });
});

const canonical = window.CrosspathCanonical;
const levels = window.CrosspathLevels;

// Concentric squares from the outside in, each clockwise from its top-left corner.
assert.strictEqual(canonical.cellRank(0, 0), 0);
assert.strictEqual(canonical.cellRank(0, 8), 8);
assert.strictEqual(canonical.cellRank(8, 8), 16);
assert.strictEqual(canonical.cellRank(8, 0), 24);
assert.strictEqual(canonical.cellRank(1, 0), 31);
assert.strictEqual(canonical.cellRank(1, 1), 32);
assert.strictEqual(canonical.cellRank(4, 4), 80);
const ranks = new Set();
for (let row = 0; row < 9; row += 1) for (let col = 0; col < 9; col += 1) ranks.add(canonical.cellRank(row, col));
assert.strictEqual(ranks.size, 81);

// Boundary positions run clockwise from N1 to W1.
assert.deepStrictEqual([0, 8, 9, 17, 18, 26, 27, 35].map(canonical.perimeterKey),
  ["N1", "N9", "E1", "E9", "S9", "S1", "W9", "W1"]);
assert.strictEqual(canonical.perimeterIndex({ row: 0, col: 0, dir: window.CrosspathRules.W }), 35);

const boards = levels.map(({ code }) => canonical.solvedBoard(code));
const forms = boards.map(canonical.canonicalForm);
boards.forEach((board, index) => {
  const form = forms[index];
  // Every orientation of a board shares one canonical form, at distance zero.
  canonical.ORIENTATIONS.forEach((orientation) => {
    const turned = canonical.transformBoard(board, orientation);
    assert.deepStrictEqual(canonical.canonicalForm(turned).board, form.board, `level ${index + 1}`);
    assert.strictEqual(canonical.compareBoards(turned, board), 0);
    assert.strictEqual(canonical.distance(turned, board).total, 0);
  });
  // The canonical start is the earliest reachable boundary position, then the end.
  canonical.ORIENTATIONS.forEach((orientation) => {
    const exits = window.CrosspathRules.findExits(canonical.transformBoard(board, orientation))
      .map(canonical.perimeterIndex).sort((left, right) => left - right);
    assert.ok(form.start < exits[0] || (form.start === exits[0] && form.end <= exits[1]));
  });
  assert.strictEqual(form.ranks[0], canonical.cellRank(0, form.start));
});

// The metric is symmetric, bounded by its weights and orders components by significance.
const maximum = Object.values(canonical.WEIGHTS).reduce((sum, weight) => sum + weight, 0);
for (let left = 0; left < forms.length; left += 1) {
  for (let right = left + 1; right < forms.length; right += 1) {
    const there = canonical.distance(forms[left], forms[right]);
    const back = canonical.distance(forms[right], forms[left]);
    assert.strictEqual(there.total, back.total);
    assert.ok(there.total > 0 && there.total <= maximum);
    assert.ok(canonical.compareBoards(boards[left], boards[right]) !== 0, `levels ${left + 1} and ${right + 1} match`);
  }
}
assert.ok(canonical.WEIGHTS.squares > canonical.WEIGHTS.endpoints && canonical.WEIGHTS.endpoints > canonical.WEIGHTS.cells);
assert.deepStrictEqual(canonical.distance(levels[0].code, boards[0]), { total: 0, endpoints: 0, squares: 0, cells: 0 });

// Levels added after the first thirty were chosen to be distinct from every other level.
levels.slice(30).forEach((level, offset) => {
  const index = 30 + offset;
  forms.forEach((form, other) => {
    if (other !== index) assert.ok(canonical.isDistinct(forms[index], form), `level ${index + 1} is close to ${other + 1}`);
  });
});

console.log(`Crosspath canonical form tests passed (${levels.length} levels).`);

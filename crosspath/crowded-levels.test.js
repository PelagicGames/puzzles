// Copyright (C) 2026 Pelagic Games

/**
 * Run with node crosspath/crowded-levels.test.js from the repository root.
 * Checks the committed crowded-mode catalogue without writing files.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = {};
["crosspath-rules.js", "solver.js", "puzzle-levels.js", "crowded-levels.js"].forEach((file) => {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), "utf8"), { filename: file });
});

const rules = window.CrosspathRules;
const solver = window.CrosspathSolver;
const levels = window.CrosspathCrowdedLevels;
const STRATA = [[1, 9], [10, 19], [20, 39], [40, Infinity]];
const bandIds = solver.CROWDED_COMPLEXITY_BANDS.map(({ id }) => id);

assert.strictEqual(levels.length, bandIds.length * 6, "six crowded puzzles per band");
const normalCodes = new Set(window.CrosspathLevels.map(({ code }) => code));
// Completion is stored by code, so crowded codes must not collide with normal ones.
levels.forEach(({ code }) => assert.ok(!normalCodes.has(code), "crowded codes differ from normal codes"));
assert.strictEqual(new Set(levels.map(({ code }) => code)).size, levels.length, "crowded codes are distinct");

bandIds.forEach((band, bandIndex) => {
  const entries = levels.slice(bandIndex * 6, bandIndex * 6 + 6);
  assert.ok(entries.every(({ difficulty }) => difficulty === band), `${band} puzzles are grouped in band order`);
  entries.forEach(({ title, code, crowdedness }, index) => {
    const name = `crowded ${band} ${title}`;
    assert.strictEqual(title, `Puzzle ${index + 1}`);
    const analysis = solver.analyseCode(code, { crowded: true });
    assert.ok(analysis.unique, `${name} has one crowded solution (${analysis.diagnostics.join(" ")})`);
    assert.strictEqual(analysis.complexity.difficulty, band, `${name} crowded band`);

    const puzzle = rules.parseCode(code);
    const board = rules.composeBoard(puzzle.tiles, analysis.solution);
    assert.ok(rules.analyseBoard(board, puzzle.markers, { crowded: true }).solved, `${name} traces in crowded mode`);
    assert.ok(!rules.analyseBoard(board, puzzle.markers).solved, `${name} needs crowded rules`);
    assert.strictEqual(rules.crowdedness(board), crowdedness, `${name} recorded crowdedness`);
    assert.ok(crowdedness >= 1, `${name} is crowded`);
    if (index) assert.ok(crowdedness > entries[index - 1].crowdedness, `${name} is more crowded than the last`);
  });
  STRATA.forEach(([minimum, maximum]) => {
    assert.ok(
      entries.some(({ crowdedness }) => crowdedness >= minimum && crowdedness <= maximum),
      `${band} covers crowdedness ${minimum}-${maximum}`
    );
  });
});

console.log(`Crosspath crowded level tests passed (${levels.length} levels).`);

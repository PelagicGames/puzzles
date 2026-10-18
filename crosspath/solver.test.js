// Copyright (C) 2026 Pelagic Games

/**
 * Run with node crosspath/solver.test.js from the repository root.
 * Reads the rules, solver and committed level catalogue into a Node window shim;
 * checks parsing, uniqueness, difficulty and complete path coverage without writes.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Browser-style exports are shared by the three scripts in this process.
global.window = {};
["crosspath-rules.js", "solver.js", "puzzle-levels.js"].forEach((file) => {
  vm.runInThisContext(
    fs.readFileSync(path.join(__dirname, file), "utf8"),
    { filename: file }
  );
});

const rules = window.CrosspathRules;
const solver = window.CrosspathSolver;
const levels = window.CrosspathLevels;

// T-junctions, dead ends and diagonals are not valid path squares.
["0b0000000", "1000000a0", "e00000000"].forEach((tile) => {
  assert.throws(() => rules.parseTile(tile), /./, `${tile} should be rejected`);
});
assert.throws(() => rules.parseTile("000000000"), /./, "an empty tile should be rejected");

// Code-level validation rejects repeated tiles and excessive boundary clues.
const sample = levels[0].code;
const tileTexts = sample.split(" F:")[0].slice(3).split(" ");
assert.throws(
  () => rules.parseCode(`T: ${[tileTexts[0], ...tileTexts.slice(0, 8)].join(" ")} F: - X: -`),
  /unique/
);
assert.throws(() => rules.parseCode(`T: ${tileTexts.join(" ")} F: - X: N1 N2 N3`), /two/);

// Catalogue invariants cover size, distinct codes and representation of every band.
assert.ok(levels.length >= 30, "the initial puzzle set should hold at least 30 levels");
assert.strictEqual(new Set(levels.map(({ code }) => code)).size, levels.length, "levels must be distinct");

const bandIds = solver.COMPLEXITY_BANDS.map(({ id }) => id);
const seenBands = new Set();
// Every published puzzle must solve uniquely, preserve clues and visit both crossing axes.
levels.forEach(({ title, code, difficulty }) => {
  const analysis = solver.analyseCode(code);
  assert.ok(analysis.unique, `${title} must have exactly one solution (${analysis.diagnostics.join(" ")})`);
  assert.ok(bandIds.includes(difficulty), `${title} has an unknown difficulty`);
  assert.strictEqual(analysis.complexity.difficulty, difficulty, `${title} complexity band`);
  seenBands.add(difficulty);

  const puzzle = rules.parseCode(code);
  puzzle.fixed.forEach(({ tile, slot }) => {
    assert.strictEqual(analysis.solution[slot], tile, `${title} fixed tile ${tile + 1} stays in place`);
  });
  const board = rules.composeBoard(puzzle.tiles, analysis.solution);
  const result = rules.analyseBoard(board, puzzle.markers);
  assert.ok(result.solved, `${title} solution should trace cleanly`);
  assert.strictEqual(result.exits.length, 2, `${title} path has exactly two ends`);
  assert.strictEqual(result.unvisited.length, 0, `${title} visits every path square`);

  // Swapping any two movable tiles must break the solution.
  const fixedSlots = new Set(puzzle.fixed.map(({ slot }) => slot));
  const movable = [...Array(9).keys()].filter((slot) => !fixedSlots.has(slot));
  if (movable.length >= 2) {
    const swapped = [...analysis.solution];
    [swapped[movable[0]], swapped[movable[1]]] = [swapped[movable[1]], swapped[movable[0]]];
    assert.ok(!rules.analyseBoard(rules.composeBoard(puzzle.tiles, swapped), puzzle.markers).solved);
  }
});
assert.deepStrictEqual([...seenBands].sort(), [...bandIds].sort(), "every difficulty band is represented");

console.log(`Crosspath solver tests passed (${levels.length} levels).`);

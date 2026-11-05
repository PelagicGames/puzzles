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
  // Normal catalogue labels are intentionally retained from the legacy calibration.
  assert.strictEqual(analysis.complexity.legacy.difficulty, difficulty, `${title} historical complexity band`);
  assert.strictEqual(analysis.complexity.difficulty, solver.bandFor(analysis.complexity.score).id);
  const refined = analysis.complexity.refined;
  assert.strictEqual(refined.model, "forced-progress-v2");
  assert.strictEqual(analysis.complexity.model, refined.model);
  assert.strictEqual(analysis.complexity.score, refined.score);
  assert.strictEqual(refined.steps.length, analysis.complexity.placements);
  assert.strictEqual(refined.forcedSteps + analysis.complexity.unforcedSteps, refined.steps.length);
  assert.strictEqual(refined.score, Math.round(refined.scanningCost + refined.reasoningCost));
  assert.strictEqual(refined.placementCost, refined.steps.length);
  assert.ok(refined.score > 0, "published puzzles with remaining placements do not collapse to zero");
  assert.ok(Math.abs(refined.scanningCost
    - refined.placementCost - refined.distractionCost - refined.hiddenSingleCost) < 0.0002);
  refined.steps.forEach((step, index) => {
    assert.strictEqual(step.distractors, analysis.complexity.distractorsByStep[index]);
    const distractionCost = Math.log2(1 + step.distractors / (step.remaining * Math.max(1, step.forcedMoves)));
    assert.ok(Math.abs(step.distractionCost - distractionCost) < 0.0001);
    assert.ok(step.scanningCost >= 1, "every placement has a positive scanning cost");
    assert.ok(Math.abs(step.scanningCost - 1 - step.distractionCost - step.hiddenSingleCost) < 0.0002);
    if (step.technique === "single") {
      assert.ok(step.forcedMoves > 0);
      assert.ok(step.scanningCost <= 2 + Math.log2(step.remaining), "forced scanning cost is bounded");
      assert.strictEqual(step.reasoningCost, 0, "forced moves have no unforced reasoning cost");
      const expected = step.remaining > 1 ? Math.log2(step.slotOptions) / Math.log2(step.remaining) : 0;
      assert.ok(Math.abs(step.hiddenSingleCost - expected) < 0.0001, "hidden-single scanning uses its slot options");
    } else {
      assert.strictEqual(step.forcedMoves, 0);
      assert.strictEqual(step.hiddenSingleCost, 0);
      const weight = step.technique === "elimination" ? 2 : 3 + Math.log2(step.options);
      const expected = step.remaining * Math.log2(step.options) * weight;
      assert.ok(Math.abs(step.reasoningCost - expected) < 0.0001, "unforced cost uses relevant ambiguity");
    }
  });
  if (!analysis.complexity.unforcedSteps) {
    const maximum = refined.steps.reduce((total, step) => total + 2 + Math.log2(step.remaining), 0);
    assert.ok(refined.score <= Math.ceil(maximum), "singles-only costs remain logarithmically bounded");
  }
  seenBands.add(difficulty);

  const puzzle = rules.parseCode(code);
  const before = JSON.stringify(puzzle);
  assert.deepStrictEqual(solver.complexity(puzzle, analysis.solution).refined, refined);
  assert.strictEqual(JSON.stringify(puzzle), before, "complexity preserves its input");
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

const fullyFixed = rules.parseCode(sample);
const solution = solver.solve(fullyFixed).solutions[0];
fullyFixed.fixed = solution.map((tile, slot) => ({ tile, slot }));
const fixedComplexity = solver.complexity(fullyFixed, solution);
assert.strictEqual(fixedComplexity.refined.score, 0);
assert.strictEqual(fixedComplexity.refined.scanningCost, 0);
assert.strictEqual(fixedComplexity.refined.reasoningCost, 0);
assert.deepStrictEqual(fixedComplexity.refined.steps, []);
fullyFixed.fixed.pop();
const finalMove = solver.complexity(fullyFixed, solution).refined;
assert.strictEqual(finalMove.score, 1, "a remaining forced move is not scored as zero");
assert.strictEqual(finalMove.placementCost, 1);
assert.strictEqual(finalMove.distractionCost, 0);
assert.strictEqual(finalMove.hiddenSingleCost, 0);
assert.strictEqual(finalMove.reasoningCost, 0);

console.log(`Crosspath solver tests passed (${levels.length} levels).`);

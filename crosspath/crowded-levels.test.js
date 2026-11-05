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
["crosspath-rules.js", "solver.js", "puzzle-canonical.js", "puzzle-levels.js", "crowded-levels.js"].forEach((file) => {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), "utf8"), { filename: file });
});

const rules = window.CrosspathRules;
const solver = window.CrosspathSolver;
const canonical = window.CrosspathCanonical;
const levels = window.CrosspathCrowdedLevels;
const forms = [];
const STRATA = [[1, 9], [10, 19], [20, 39], [40, Infinity]];
const bandIds = solver.CROWDED_COMPLEXITY_BANDS.map(({ id }) => id);
const straightforwardCode = "T: 5053a9000 ac56f953c 050050050 050050a90 06a690500 005005003 000000aaa 00000006a 5005003ac F: 5@1 X: -";
const straightforwardComplexity = solver.analyseCode(straightforwardCode, { crowded: true }).complexity;
assert.ok(!levels.some(({ code }) => code === straightforwardCode),
  "the mismatched former Hard Puzzle 1 is replaced, not moved into another band");
assert.strictEqual(straightforwardComplexity.legacy.score, 98, "legacy analysis remains comparable");
assert.strictEqual(straightforwardComplexity.score, 20, "refined score is the primary difficulty score");
assert.strictEqual(straightforwardComplexity.difficulty, "medium");
assert.strictEqual(straightforwardComplexity.refined.score, 20, "the forced chain has modest distraction costs");
assert.strictEqual(straightforwardComplexity.refined.forcedSteps, 7);
assert.strictEqual(straightforwardComplexity.refined.placementCost, 8);
assert.ok(straightforwardComplexity.refined.distractionCost > 0);
assert.strictEqual(straightforwardComplexity.refined.hiddenSingleCost, 0);
assert.strictEqual(straightforwardComplexity.refined.reasoningCost, 4);
assert.strictEqual(straightforwardComplexity.refined.scanningCost, 15.5683);
assert.deepStrictEqual(straightforwardComplexity.refined.steps.map((step) => step.forcedMoves),
  [2, 2, 2, 2, 2, 1, 0, 1]);
const firstStep = straightforwardComplexity.refined.steps[0];
assert.ok(firstStep.distractionCost < Math.log2(1 + firstStep.distractors / firstStep.remaining),
  "multiple available forced moves reduce distraction costs");
assert.ok(straightforwardComplexity.refined.steps.slice(0, 6).every((step) => (
  step.technique === "single" && step.scanningCost >= 1 && step.reasoningCost === 0
)), "the six direct forced placements have positive, bounded scanning costs");
assert.deepStrictEqual(straightforwardComplexity.refined.steps[6], {
  tile: 7, slot: 2, technique: "elimination", remaining: 2, options: 2, slotOptions: 2, forcedMoves: 0,
  distractors: 2, distractionCost: 1, hiddenSingleCost: 0, scanningCost: 2, reasoningCost: 4
});

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
    const refined = analysis.complexity.refined;
    assert.strictEqual(analysis.complexity.score, refined.score, `${name} primary score is refined`);
    assert.ok(Number.isFinite(refined.score) && refined.score >= 0, `${name} has a refined score`);
    refined.steps.forEach((step) => {
      if (step.technique === "single") {
        assert.ok(step.scanningCost >= 1 && step.scanningCost <= 2 + Math.log2(step.remaining),
          `${name} forced cost is positive and bounded`);
        assert.strictEqual(step.reasoningCost, 0);
      }
    });

    const puzzle = rules.parseCode(code);
    const board = rules.composeBoard(puzzle.tiles, analysis.solution);
    forms.push(canonical.canonicalForm(board));
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

const normalForms = window.CrosspathLevels.map(({ code }) => canonical.canonicalForm(canonical.solvedBoard(code)));
forms.forEach((form, index) => {
  normalForms.forEach((normal, other) => {
    assert.ok(canonical.isDistinct(form, normal), `crowded level ${index + 1} differs from normal level ${other + 1}`);
  });
  forms.slice(index + 1).forEach((other, offset) => {
    assert.ok(canonical.isDistinct(form, other), `crowded levels ${index + 1} and ${index + offset + 2} differ`);
  });
});

console.log(`Crosspath crowded level tests passed (${levels.length} levels).`);

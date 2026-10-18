// Copyright (C) 2026 Pelagic Games
/**
 * Standalone regression suite: node lightdiscs/solver.test.js
 * Reads parser, maths, solver and both catalogue scripts via Node's VM into a
 * window shim. Uses built-in assertions; writes only the success log, and throws
 * on failure. Does not write analysis files.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = {};
[
  "puzzle-code.js",
  "puzzle-math.js",
  "solver.js",
  "puzzle-levels.js",
  "xor-puzzle-levels.js"
].forEach((file) => {
  vm.runInThisContext(
    fs.readFileSync(path.join(__dirname, file), "utf8"),
    { filename: file }
  );
});

// Fixed authored cases pin raw/grouped solution counts, cheapest reset costs,
// difficulty metrics and deterministic representative shorthand.
const authoredPuzzles = [
  {
    code: "R: nr nr nr G: ng ng ng B: nb nb nb T: nr ng nb",
    rawSolutions: 729,
    solutions: 27,
    resetPath: 3,
    complexity: "Very easy",
    score: 9,
    minimumSnaps: 3,
    first: "T1:R3 T2:G3 T3:B2"
  },
  {
    code: "R: nm nc nm G: ny ny nm B: nc nc ny T: nr nb ng",
    rawSolutions: 105,
    solutions: 57,
    resetPath: 8,
    complexity: "Easy",
    score: 37,
    minimumSnaps: 6,
    first: "T1:R3+B3 T2:G3+B1 T3:G2+B2"
  },
  {
    code: "R: nc nm nw G: ny ny nm B: nc nc ny T: nr nb ng",
    rawSolutions: 42,
    solutions: 26,
    resetPath: 8,
    complexity: "Easy",
    score: 37,
    minimumSnaps: 6,
    first: "T1:R2+G1 T2:R3+G3+B1 T3:R1+B3"
  },
  {
    code: "R: twr t'rw twr G: twg t'gw tkg B: twb t'bw xkb T: twr t'wk xkb",
    rawSolutions: 4,
    solutions: 2,
    resetPath: 6,
    complexity: "Very easy",
    score: 14,
    minimumSnaps: 4,
    first: "T1:R3 T2:G1'+B1' T3:B3"
  },
  {
    code: "R: dbk nc aym G: drk sbg lbm B: vbk lyr vgk T: lkr nk vbk",
    rawSolutions: 58,
    solutions: 24,
    resetPath: 6,
    complexity: "Easy",
    score: 35,
    minimumSnaps: 5,
    first: "T1:G3+B2 T2:R1+B3 T3:B1"
  },
  {
    code: "R: nr ny tgk G: akg lmw dmw B: dbm xmk dcb T: akg nk xrk",
    rawSolutions: 26,
    solutions: 16,
    resetPath: 8,
    complexity: "Easy",
    score: 35,
    minimumSnaps: 5,
    first: "T1:G1 T2:R3'+G3 T3:R2+B2"
  },
  {
    code: "R: lkg sbk lbg G: drg swg vbc B: sbc ary ny T: lkg vbc lkg",
    rawSolutions: 12,
    solutions: 2,
    resetPath: 6,
    complexity: "Very easy",
    score: 14,
    minimumSnaps: 4,
    first: "T1:R3+B3 T2:G3 T3:R1"
  },
  {
    code: "R: tcy dwy dcr G: vmy ayw trg B: acm nc lwg T: vbg ayw trg",
    rawSolutions: 27,
    solutions: 3,
    resetPath: 7,
    complexity: "Easy",
    score: 35,
    minimumSnaps: 5,
    first: "T1:R2+G1+B2 T2:G2 T3:G3"
  },
  {
    code: "R: s''mw dmc xbw G: t'rg s''cy vky B: s'kb tgm s''yc T: s''yc s''mw s''cy",
    rawSolutions: 1,
    solutions: 1,
    resetPath: 3,
    complexity: "Very easy",
    score: 9,
    minimumSnaps: 3,
    first: "T1:B3'' T2:R1'' T3:G2''"
  },
  {
    code: "R: s'by vmg s''cb G: xcm vmc s''mg B: t'yw s'ck s'rc T: s'rc s'by vmc",
    rawSolutions: 3,
    solutions: 1,
    resetPath: 3,
    complexity: "Very easy",
    score: 9,
    minimumSnaps: 3,
    first: "T1:B3' T2:R1' T3:G2"
  },
  {
    code: "R: xbm vmb vcm G: vbg t'cy tgb B: vry arc drm T: drm xbm t'cy",
    rawSolutions: 18,
    solutions: 1,
    resetPath: 3,
    complexity: "Very easy",
    score: 9,
    minimumSnaps: 3,
    first: "T1:B3 T2:R1 T3:G2'"
  },
  {
    code: "R: dkc s'rc lwy G: dgy vbr s'gm B: drc swy nm T: dkg vbr drc",
    rawSolutions: 9,
    solutions: 1,
    resetPath: 10,
    complexity: "Hard",
    score: 84,
    minimumSnaps: 5,
    first: "T1:R1+B2'' T2:G2+B3 T3:B1"
  },
  {
    code: "R: amw t'wy vgk G: vgm s'mg t'cy B: xrb s'wy s''bc T: swy nk nk",
    rawSolutions: 2,
    solutions: 1,
    resetPath: 11,
    complexity: "Very hard",
    score: 86,
    minimumSnaps: 6,
    first: "T1:B2 T2:R3+B3' T3:R2+G3'+B1"
  },
  {
    code: "R: tgr s'ky lwk G: nc ayk lyb B: tyk nr t'wb T: dkr lck twb",
    rawSolutions: 1,
    solutions: 1,
    resetPath: 10,
    complexity: "Very hard",
    score: 89,
    minimumSnaps: 6,
    first: "T1:R1'+G2+B2 T2:R3+G1 T3:B3"
  }
];

// Catalogue/pose invariants ensure unique codes and retention of authored fixtures.
assert.strictEqual(window.LightDiscSolver.poseTemplates.length, 39);
assert.strictEqual(window.LightDiscLevels.length, 60);
assert.strictEqual(new Set(window.LightDiscLevels.map(({ code }) => code)).size, 60);
const catalogCodes = new Set(window.LightDiscLevels.map(({ code }) => code));
authoredPuzzles.forEach(({ code }) => assert.strictEqual(catalogCodes.has(code), true));
// Reuse full analyses when the subsequent catalogue sweep reaches the same code.
const analyses = new Map();

// Check fixture metrics, vector structure, zero distances for all equivalent
// solved states, and consistency between route costs and their listed moves.
authoredPuzzles.forEach(({
  code,
  rawSolutions,
  solutions,
  resetPath,
  complexity,
  score,
  minimumSnaps,
  first
}, index) => {
  const analysis = window.LightDiscSolver.analyzePuzzle(code);
  analyses.set(code, analysis);
  assert.strictEqual(analysis.solvable, true, `Puzzle ${index + 1} should be solvable`);
  assert.strictEqual(analysis.stats.rawSolutionCount, rawSolutions);
  assert.strictEqual(analysis.solutionCount, solutions);
  assert.strictEqual(analysis.complexity.label, complexity);
  assert.strictEqual(analysis.complexity.minimumSnappedCircles, minimumSnaps);
  assert.strictEqual(analysis.complexity.resetPathDistance, resetPath);
  assert.strictEqual(analysis.complexity.score, score);
  assert.strictEqual(analysis.solutions[0].shorthand, first);

  const firstSolution = analysis.solutions[0];
  assert.strictEqual(firstSolution.vector.placements.length, 3);
  assert.strictEqual(firstSolution.vector.circles.length, 3);
  assert.strictEqual(firstSolution.vector.snappedTriangleCount, 3);
  assert.strictEqual(
    window.LightDiscSolver.solutionDistance(analysis.definition, firstSolution.vector),
    0
  );
  assert.strictEqual(
    window.LightDiscSolver.pathDistance(firstSolution.vector, analysis),
    0
  );
  assert.strictEqual(
    firstSolution.moves.reduce((total, move) => total + move.cost, 0),
    firstSolution.pathDistance
  );
  firstSolution.equivalentPoseIds.forEach((poseIds) => {
    assert.strictEqual(
      window.LightDiscSolver.pathDistance(poseIds, analysis),
      0,
      `Puzzle ${index + 1} equivalent solved pose should have zero path-distance`
    );
  });
});

// Every catalogue entry must solve in its own campaign and match its difficulty.
// XOR designs must require XOR logic and cover all three targets in authored poses.
window.LightDiscLevels.forEach((level, index) => {
  const analysis = analyses.get(level.code)
    || window.LightDiscSolver.analyzePuzzle(level.code, {
      combination: level.combination
    });
  analyses.set(level.code, analysis);
  assert.strictEqual(analysis.solvable, true, `Catalog puzzle ${index + 1} should be solvable`);
  assert.strictEqual(
    analysis.complexity.label.toLowerCase().replace(" ", "-"),
    level.difficulty,
    `Catalog puzzle ${index + 1} should match its difficulty band`
  );
  if (level.combination === "xor") {
    assert.ok(
      analysis.minimumXorCombinations > 0,
      `XOR puzzle ${index + 1} should require an XOR-specific combination`
    );
    assert.strictEqual(level.designPoseIds.length, 3);
    assert.strictEqual(
      window.LightDiscSolver.solutionDistance(
        analysis.definition,
        level.designPoseIds
      ),
      0,
      `XOR puzzle ${index + 1} authored poses should solve the puzzle`
    );
    const designPoses = level.designPoseIds.map((poseId) => (
      window.LightDiscSolver.poseTemplates.find(({ id }) => id === poseId)
    ));
    [0, 1, 2].forEach((targetIndex) => {
      assert.ok(
        designPoses.some(({ mapping }) => mapping.includes(targetIndex)),
        `XOR puzzle ${index + 1} authored design should use target ${
          targetIndex + 1
        }`
      );
    });
  }
});

/**
 * @param {number} mask - RGB channel bits.
 * @returns {Object} Shape-free test filter with identical foreground/background.
 */
const solid = (mask) => ({
  background: { mask },
  foreground: { mask },
  shape: { value: "none" }
});
/**
 * @param {...number} masks - Solid filter masks.
 * @returns {number} XOR result for a formation with no shape predicates.
 */
const xorMask = (...masks) => window.LightDiscMath.formationMask(
  masks.map((mask) => ({ filter: solid(mask), angle: 0 })),
  new Map(),
  "xor"
);
// Equal channels cancel; black is neutral; mixed masks toggle independently.
assert.strictEqual(xorMask(4, 4), 0);
assert.strictEqual(xorMask(4, 0), 4);
assert.strictEqual(xorMask(4, 6), 2);
assert.strictEqual(xorMask(3, 5), 6);

// A target colour absent from every available filter must be rejected locally.
const impossible = window.LightDiscSolver.analyzePuzzle(
  "R: nr nr nr G: nr nr nr B: nr nr nr T: nb nb nb"
);
assert.strictEqual(impossible.solvable, false);
assert.strictEqual(impossible.diagnostics[0].type, "target-unreachable");

console.log("Light Disc solver tests passed.");

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = {};
[
  "puzzle-code.js",
  "puzzle-math.js",
  "solver.js",
  "puzzle-levels.js"
].forEach((file) => {
  vm.runInThisContext(
    fs.readFileSync(path.join(__dirname, file), "utf8"),
    { filename: file }
  );
});

const authoredPuzzles = [
  {
    code: "R: nr nr nr G: ng ng ng B: nb nb nb T: nr ng nb",
    rawSolutions: 729,
    solutions: 27,
    resetPath: 3,
    first: "T1:R3 T2:G3 T3:B2"
  },
  {
    code: "R: nm nc nm G: ny ny nm B: nc nc ny T: nr nb ng",
    rawSolutions: 105,
    solutions: 57,
    resetPath: 8,
    first: "T1:R3+B3 T2:G3+B1 T3:G2+B2"
  },
  {
    code: "R: nc nm nw G: ny ny nm B: nc nc ny T: nr nb ng",
    rawSolutions: 42,
    solutions: 26,
    resetPath: 8,
    first: "T1:R2+G1 T2:R3+G3+B1 T3:R1+B3"
  },
  {
    code: "R: twr t'rw twr G: twg t'gw tkg B: twb t'bw xkb T: twr t'wk xkb",
    rawSolutions: 4,
    solutions: 2,
    resetPath: 6,
    first: "T1:R3 T2:G1'+B1' T3:B3"
  },
  {
    code: "R: dbk nc aym G: drk sbg lbm B: vbk lyr vgk T: lkr nk vbk",
    rawSolutions: 58,
    solutions: 24,
    resetPath: 6,
    first: "T1:G3+B2 T2:R1+B3 T3:B1"
  },
  {
    code: "R: nr ny tgk G: akg lmw dmw B: dbm xmk dcb T: akg nk xrk",
    rawSolutions: 26,
    solutions: 16,
    resetPath: 8,
    first: "T1:G1 T2:R3'+G3 T3:R2+B2"
  },
  {
    code: "R: lkg sbk lbg G: drg swg vbc B: sbc ary ny T: lkg vbc lkg",
    rawSolutions: 12,
    solutions: 2,
    resetPath: 6,
    first: "T1:R3+B3 T2:G3 T3:R1"
  },
  {
    code: "R: tcy dwy dcr G: vmy ayw trg B: acm nc lwg T: vbg ayw trg",
    rawSolutions: 27,
    solutions: 3,
    resetPath: 7,
    first: "T1:R2+G1+B2 T2:G2 T3:G3"
  },
  {
    code: "R: s''mw dmc xbw G: t'rg s''cy vky B: s'kb tgm s''yc T: s''yc s''mw s''cy",
    rawSolutions: 1,
    solutions: 1,
    resetPath: 3,
    complexity: "Moderate",
    score: 59,
    first: "T1:B3'' T2:R1'' T3:G2''"
  },
  {
    code: "R: s'by vmg s''cb G: xcm vmc s''mg B: t'yw s'ck s'rc T: s'rc s'by vmc",
    rawSolutions: 3,
    solutions: 1,
    resetPath: 3,
    complexity: "Moderate",
    score: 54,
    first: "T1:B3' T2:R1' T3:G2"
  },
  {
    code: "R: xbm vmb vcm G: vbg t'cy tgb B: vry arc drm T: drm xbm t'cy",
    rawSolutions: 18,
    solutions: 1,
    resetPath: 3,
    complexity: "Moderate",
    score: 54,
    first: "T1:B3 T2:R1 T3:G2'"
  },
  {
    code: "R: dkc s'rc lwy G: dgy vbr s'gm B: drc swy nm T: dkg vbr drc",
    rawSolutions: 9,
    solutions: 1,
    resetPath: 10,
    complexity: "Very high",
    score: 94,
    first: "T1:R1+B2'' T2:G2+B3 T3:B1"
  },
  {
    code: "R: amw t'wy vgk G: vgm s'mg t'cy B: xrb s'wy s''bc T: swy nk nk",
    rawSolutions: 2,
    solutions: 1,
    resetPath: 11,
    complexity: "Very high",
    score: 86,
    first: "T1:B2 T2:R3+B3' T3:R2+G3'+B1"
  },
  {
    code: "R: tgr s'ky lwk G: nc ayk lyb B: tyk nr t'wb T: dkr lck twb",
    rawSolutions: 1,
    solutions: 1,
    resetPath: 10,
    complexity: "Very high",
    score: 89,
    first: "T1:R1'+G2+B2 T2:R3+G1 T3:B3"
  }
];

assert.strictEqual(window.LightDiscSolver.poseTemplates.length, 39);
assert.deepStrictEqual(
  window.LightDiscLevels.map(({ code }) => code),
  authoredPuzzles.map(({ code }) => code)
);

authoredPuzzles.forEach(({
  code,
  rawSolutions,
  solutions,
  resetPath,
  complexity = "Very low",
  score,
  first
}, index) => {
  const analysis = window.LightDiscSolver.analyzePuzzle(code);
  assert.strictEqual(analysis.solvable, true, `Puzzle ${index + 1} should be solvable`);
  assert.strictEqual(analysis.stats.rawSolutionCount, rawSolutions);
  assert.strictEqual(analysis.solutionCount, solutions);
  assert.strictEqual(analysis.complexity.label, complexity);
  assert.strictEqual(analysis.complexity.resetPathDistance, resetPath);
  if (score !== undefined) assert.strictEqual(analysis.complexity.score, score);
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

const impossible = window.LightDiscSolver.analyzePuzzle(
  "R: nr nr nr G: nr nr nr B: nr nr nr T: nb nb nb"
);
assert.strictEqual(impossible.solvable, false);
assert.strictEqual(impossible.diagnostics[0].type, "target-unreachable");

console.log("Light Disc solver tests passed.");

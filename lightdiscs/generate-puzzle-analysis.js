// Copyright (C) 2026 Pelagic Games
/**
 * Offline report CLI: node lightdiscs/generate-puzzle-analysis.js
 * Reads parser, maths, solver and both catalogue scripts beside this file using
 * Node's VM and a window shim. Analyses every level and overwrites
 * lightdiscs/puzzle-analysis.local.json with counts, metrics, examples and diagnostics.
 * Logs the output path; it neither rewrites catalogues nor runs in browser pages.
 */

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

// designPoseIds describe an authored construction, whereas solver solutions may
// include alternatives. Contribution counts check which targets that design uses.
const puzzles = window.LightDiscLevels.map(({
  title,
  difficulty,
  combination,
  designPoseIds,
  code
}) => {
  const analysis = window.LightDiscSolver.analyzePuzzle(code, { combination });
  const designTargetContributions = designPoseIds
    ? [0, 1, 2].map((targetIndex) => (
      designPoseIds.reduce((total, poseId) => {
        const pose = window.LightDiscSolver.poseTemplates.find(
          ({ id }) => id === poseId
        );
        return total + Number(pose.mapping.includes(targetIndex));
      }, 0)
    ))
    : null;
  return {
    title,
    difficulty,
    combination,
    designPoseIds: designPoseIds || null,
    designTargetContributions,
    code,
    solvable: analysis.solvable,
    rawPoseSolutions: analysis.stats.rawSolutionCount,
    uniqueSolutions: analysis.solutionCount,
    minimumXorCombinations: analysis.minimumXorCombinations,
    complexity: analysis.complexity,
    examples: analysis.solutions.slice(0, 5).map(({ shorthand }) => shorthand),
    diagnostics: analysis.diagnostics
  };
});
const report = {
  _copyright: "Copyright (C) 2026 Pelagic Games",
  generatedAt: new Date().toISOString(),
  puzzles
};
const outputPath = path.join(__dirname, "puzzle-analysis.local.json");

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote offline analysis for ${puzzles.length} puzzles to ${outputPath}`);

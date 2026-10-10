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

const puzzles = window.LightDiscLevels.map(({ title, difficulty, code }) => {
  const analysis = window.LightDiscSolver.analyzePuzzle(code);
  return {
    title,
    difficulty,
    code,
    solvable: analysis.solvable,
    rawPoseSolutions: analysis.stats.rawSolutionCount,
    uniqueSolutions: analysis.solutionCount,
    complexity: analysis.complexity,
    examples: analysis.solutions.slice(0, 5).map(({ shorthand }) => shorthand),
    diagnostics: analysis.diagnostics
  };
});
const report = {
  generatedAt: new Date().toISOString(),
  puzzles
};
const outputPath = path.join(__dirname, "puzzle-analysis.local.json");

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote offline analysis for ${puzzles.length} puzzles to ${outputPath}`);

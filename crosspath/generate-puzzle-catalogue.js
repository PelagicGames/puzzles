// Copyright (C) 2026 Pelagic Games
//
// Writes the gitignored crosspath/puzzle-catalogue.local.json report containing the
// unique solution and complexity details of every authored level.
//
//   node crosspath/generate-puzzle-catalogue.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = global.window || {};
["crosspath-rules.js", "solver.js", "puzzle-levels.js"].forEach((file) => {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), "utf8"), { filename: file });
});

const rules = window.CrosspathRules;
// Optional summary written by the generator's calibrate mode.
const surveyPath = path.join(__dirname, "complexity-survey.local.json");
const puzzles = window.CrosspathLevels.map(({ title, difficulty, code }, index) => {
  const analysis = window.CrosspathSolver.analyseCode(code);
  const parsed = rules.parseCode(code);
  return {
    level: index + 1,
    title,
    difficulty,
    code,
    valid: analysis.valid,
    fixedTiles: parsed.fixed.length,
    markedEnds: parsed.markers.length,
    solution: analysis.solutionText,
    solutionGrid: analysis.solution
      ? [0, 1, 2].map((row) => analysis.solution.slice(row * 3, row * 3 + 3).map((tile) => tile + 1).join(" "))
      : null,
    complexity: analysis.complexity,
    computedDifficultyMatches: analysis.complexity ? analysis.complexity.difficulty === difficulty : false,
    searchNodes: analysis.searchNodes,
    diagnostics: analysis.diagnostics
  };
});

const report = {
  _copyright: "Copyright (C) 2026 Pelagic Games",
  generatedAt: new Date().toISOString(),
  bands: window.CrosspathSolver.COMPLEXITY_BANDS,
  calibration: fs.existsSync(surveyPath) ? JSON.parse(fs.readFileSync(surveyPath, "utf8")) : null,
  puzzles
};
const outputPath = path.join(__dirname, "puzzle-catalogue.local.json");
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
const invalid = puzzles.filter(({ valid }) => !valid);
console.log(`Wrote catalogue for ${puzzles.length} puzzles to ${outputPath}`);
if (invalid.length) {
  console.log(`Invalid puzzles: ${invalid.map(({ level }) => level).join(", ")}`);
  process.exitCode = 1;
}

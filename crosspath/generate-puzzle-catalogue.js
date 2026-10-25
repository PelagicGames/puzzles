// Copyright (C) 2026 Pelagic Games
//
// Writes the gitignored crosspath/puzzle-catalogue.local.json report containing the
// unique solution, complexity and canonical-form details of every authored level.
//
//   node crosspath/generate-puzzle-catalogue.js

/**
 * Loads rules, solver and committed levels through a Node window shim. Includes
 * complexity-survey.local.json when present, then overwrites the local catalogue
 * report. Invalid puzzles are reported and set a failing process exit code.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = global.window || {};
["crosspath-rules.js", "solver.js", "puzzle-levels.js", "puzzle-canonical.js"].forEach((file) => {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), "utf8"), { filename: file });
});

const rules = window.CrosspathRules;
const canonical = window.CrosspathCanonical;
// Optional complexity survey summary included alongside per-level analysis.
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

// Nearest other level by canonical distance; levels closer than the distinct distance are flagged.
const forms = puzzles.map(({ valid, code }) => (valid ? canonical.canonicalForm(canonical.solvedBoard(code)) : null));
puzzles.forEach((entry, index) => {
  const form = forms[index];
  if (!form) return;
  let nearest = null;
  forms.forEach((other, otherIndex) => {
    if (!other || otherIndex === index) return;
    const measured = canonical.distance(form, other);
    if (!nearest || measured.total < nearest.total) nearest = { level: otherIndex + 1, ...measured };
  });
  const round = (value) => Number(value.toFixed(3));
  entry.canonical = { start: form.startKey, end: form.endKey, rotation: form.rotation, reflected: form.reflected };
  entry.nearest = nearest && {
    level: nearest.level,
    total: round(nearest.total),
    endpoints: round(nearest.endpoints),
    squares: round(nearest.squares),
    cells: round(nearest.cells),
    distinct: nearest.total >= canonical.DISTINCT_DISTANCE
  };
});

// Human-readable solution grids use one-based tile numbers; solver arrays remain zero-based.
const report = {
  _copyright: "Copyright (C) 2026 Pelagic Games",
  generatedAt: new Date().toISOString(),
  bands: window.CrosspathSolver.COMPLEXITY_BANDS,
  distinctDistance: canonical.DISTINCT_DISTANCE,
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

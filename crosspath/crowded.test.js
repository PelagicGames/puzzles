// Copyright (C) 2026 Pelagic Games

// node crosspath/crowded.test.js
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

const { SIZE, N, E, S, W } = rules;
const crowded = { crowded: true };
const snake = new Array(SIZE * SIZE).fill(E | W);
for (let row = 0; row < SIZE; row += 1) {
  if (row > 0) snake[row * SIZE + (row % 2 ? SIZE - 1 : 0)] = N | (row % 2 ? W : E);
  if (row < SIZE - 1) snake[row * SIZE + (row % 2 ? 0 : SIZE - 1)] = S | (row % 2 ? E : W);
}
assert.strictEqual(rules.crowdedness(snake), 64);
assert.ok(rules.analyseBoard(snake).issues.includes("touching-paths"));
assert.ok(rules.analyseBoard(snake, [], crowded).solved);
canonical.ORIENTATIONS.forEach((orientation) => {
  const transformed = canonical.transformBoard(snake, orientation);
  assert.strictEqual(rules.crowdedness(transformed), 64);
  assert.deepStrictEqual(canonical.canonicalForm(transformed).board, canonical.canonicalForm(snake).board);
});
const broken = snake.slice();
broken[1] = N | S;
assert.ok(rules.analyseBoard(broken, [], crowded).issues.includes("broken-connection"));
const partial = snake.slice();
partial[0] = null;
assert.ok(!rules.analyseBoard(partial, [], crowded).solved);
const disconnected = new Array(81).fill(0);
disconnected[10] = N | S;
disconnected[11] = N | S;
assert.strictEqual(rules.crowdedness(disconnected), 1);
disconnected[11] = 0;
disconnected[20] = N | S;
assert.strictEqual(rules.crowdedness(disconnected), 0, "diagonals do not count");
assert.ok(!rules.analyseBoard(disconnected, [], crowded).solved, "crowded does not allow unvisited paths");
const tileA = [0, 0, N | S, 0, 0, 0, 0, 0, 0];
const tileB = [N | S, 0, 0, 0, 0, 0, 0, 0, 0];
assert.ok(!solver.edgeCompatible(tileA, E, tileB));
assert.ok(solver.edgeCompatible(tileA, E, tileB, crowded));
tileA[2] = E | S;
assert.ok(!solver.edgeCompatible(tileA, E, tileB, crowded), "half-connections remain illegal");

// Committed crowded puzzles supply real boards with disconnected touching paths.
window.CrosspathCrowdedLevels.forEach(({ code, crowdedness }, index) => {
  const solved = solver.analyseCode(code, crowded);
  const parsed = rules.parseCode(code);
  const board = {
    grid: rules.composeBoard(parsed.tiles, solved.solution),
    tiles: solved.solution.map((tile) => parsed.tiles[tile])
  };
  assert.strictEqual(rules.crowdedness(board.grid), crowdedness);
  assert.strictEqual(solved.complexity.crowdedness, crowdedness);
  assert.deepStrictEqual(canonical.canonicalForm(canonical.solvedBoard(code, crowded)).board,
    canonical.canonicalForm(board.grid).board);
  assert.strictEqual(canonical.distance(code, board.grid, crowded).total, 0);
  // Exhaustive parity is slow, so it samples one board from each of three bands.
  if (index % 10 !== 5) return;
  const puzzle = {
    tiles: board.tiles, fixed: [{ tile: 0, slot: 0 }, { tile: 4, slot: 4 }, { tile: 8, slot: 8 }], markers: []
  };
  for (const options of [{ crowded: false }, crowded]) {
    const expected = [];
    const placement = [0, null, null, null, 4, null, null, null, 8];
    function permute(remaining, slots) {
      if (!slots.length) {
        if (rules.analyseBoard(rules.composeBoard(puzzle.tiles, placement), [], options).solved) {
          expected.push(placement.join(","));
        }
        return;
      }
      for (const tile of remaining) {
        placement[slots[0]] = tile;
        permute(remaining.filter((other) => other !== tile), slots.slice(1));
      }
      placement[slots[0]] = null;
    }
    permute([1, 2, 3, 5, 6, 7], [1, 2, 3, 5, 6, 7]);
    const actual = solver.solve(puzzle, { ...options, limit: 1000 });
    assert.ok(actual.complete);
    assert.deepStrictEqual(actual.solutions.map((solution) => solution.join(",")).sort(), expected.sort());
  }
});

let noLongerUnique = 0;
let replayChanged = 0;
window.CrosspathLevels.forEach(({ code }) => {
  const normal = solver.analyseCode(code);
  const board = rules.composeBoard(rules.parseCode(code).tiles, normal.solution);
  assert.strictEqual(rules.crowdedness(board), 0);
  const relaxed = solver.analyseCode(code, crowded);
  if (!relaxed.unique) noLongerUnique += 1;
  else if (relaxed.complexity.distractorsByStep.join() !== normal.complexity.distractorsByStep.join()) replayChanged += 1;
});
assert.ok(noLongerUnique > 0, "existing levels must be rechecked, not assumed unique");
assert.ok(replayChanged > 0, "zero-crowdedness boards still need crowded-mode move calculations");

solver.CROWDED_COMPLEXITY_BANDS.forEach((band, index) => {
  assert.strictEqual(solver.bandFor(band.minimum, crowded).id, band.id);
  if (index > 0) assert.strictEqual(solver.bandFor(band.minimum - 1, crowded).id,
    solver.CROWDED_COMPLEXITY_BANDS[index - 1].id);
});
assert.strictEqual(solver.bandFor(197).id, "hard", "normal-mode thresholds stay unchanged");
assert.strictEqual(solver.bandFor(197, crowded).id, "very-hard");
console.log("Crosspath crowded tests passed (metric, rules, symmetry, exhaustive solver parity, replay, band edges).");

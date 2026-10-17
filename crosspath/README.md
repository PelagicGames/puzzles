<!-- Copyright (C) 2026 Pelagic Games -->

# Crosspath

Crosspath is a newspaper-style browser puzzle. Nine 3x3 path squares must be dragged into the nine 3x3 slots of a 9x9 board. Squares cannot be rotated or flipped. When they are all placed correctly, they form one unbroken path from one edge of the board to another.

This is a unique puzzle idea I came up with, because I like newspaper puzzles, and I thought this would be a kind of game that might fit alongside some of those.
I checked for any existing games with the same premise and found games with similarities, but nothing quite like this one.

## Pages

- **Tutorial** explains the rules with small worked examples of allowed and disallowed placements.
- **Puzzles** groups the levels into five difficulty bands and tracks completed puzzle codes in local browser storage.
- **Puzzle** (`puzzle.html?level=N`) is the game board. Pieces can be dragged or tapped into place. Holding a dragged piece near the top or bottom of the viewport scrolls the page, so the tray and board can both be reached on small screens. The key under the board appears only when the puzzle has fixed tiles or marked path ends.

## Rules

- Each small square is either empty, a straight (│ ─), a right-angled corner (└ ┌ ┐ ┘) or a crossroads (┼). T-junctions and diagonals do not exist.
- Every 3x3 piece contains at least one path square, and every piece in a puzzle is different.
- Path squares next to each other must be joined. Paths that run side by side, or that do not line up where two pieces meet, are not allowed.
- Exactly two path squares lead off the board: the start and the end of the route.
- The path goes straight over a crossroads. Each crossroads is crossed twice, once in each direction, and every path square must be visited.
- Fixed pieces (shaded like the board) and marked path ends are clues that make the solution unique.

When the last piece is placed, the route is traced from start to finish. If the placement is wrong, the trace stops where the route breaks, and anything wrong is marked in red. This includes unvisited path squares, extra exits, pieces that do not join up, and marked ends the path misses.

## Puzzle codes

```
T: <nine tiles> F: <tile@slot ...|-> X: <ends ...|->
```

- A tile is nine hex digits in row order. Each digit is a mask of the connected sides: N=1, E=2, S=4, W=8. The valid digits are `0 5 a 3 6 c 9 f`.
- `F:` lists the fixed pieces as `tile@slot`, both 1-based. Slots run in row order across the board.
- `X:` lists up to two marked path ends as a side and a 1-based position, for example `N4` or `E9`.

## Solver and complexity

`solver.js` (`window.CrosspathSolver`) backtracks over the slots. It uses precomputed edge compatibility between pieces and prunes on boundary exits. `analyseCode(code)` searches for up to two solutions, and the puzzle is valid only if exactly one is found.

To measure complexity, the solver replays the unique solution the way a person would. At each step it uses the simplest technique that finds the next placement:

1. **Single**: a slot that only one piece fits, or a piece that fits only one slot.
2. **Elimination**: try each candidate placement and rule out any that leave a slot or piece with no options, then look for a single again.
3. **Guess**: make the least ambiguous trial placement.

At each step it counts the *distractors*: placements that are valid locally but not part of the solution. Each step's distractors are weighted by the technique that step needed: ×1 for a single, ×2 for elimination, and ×(3 + log2 options) for a guess. The score is the rounded total.

The bands are calibrated on about 200,000 unique generated puzzles from 50,000 boards (`calibrate` below):

| Band | Score | Share of generated puzzles | Typical reasoning |
|------|-------|----------------------------|-------------------|
| Very easy | 0–9 | 44% | Singles, almost no distractors |
| Easy | 10–39 | 19% | Singles |
| Medium | 40–119 | 17% | Singles with long scans, or light elimination |
| Hard | 120–299 | 6% | Elimination (91%) |
| Very hard | 300+ | 14% | At least one trial placement (99.6%) |

Each band's share varies by less than ±0.5 percentage points between independent seed batches. Puzzles scored 300 or more effectively all need a guess, and there is a natural gap in the score distribution just below 300.

## Generator and catalogue

The generator and the catalogue output are local tools and are gitignored.

```sh
node crosspath/generate-puzzle-levels.local.js survey 200 1         # quick score distribution
node crosspath/generate-puzzle-levels.local.js calibrate 5000 10 1  # parallel survey (families/worker, workers, seed)
node crosspath/generate-puzzle-levels.local.js rebalance 6          # re-band levels, fill gaps from the survey pool
node crosspath/generate-puzzle-levels.local.js write 6 2026         # regenerate puzzle-levels.js from scratch
node crosspath/generate-puzzle-catalogue.js                         # rebuild puzzle-catalogue.local.json
```

`calibrate` runs one worker process per CPU by default. It writes the deduplicated pool to `$TMPDIR/crosspath-survey-pool.jsonl` and a gitignored summary to `complexity-survey.local.json`, which includes score quantiles, band shares, the spread between seeds, and the mix of reasoning techniques in each band. The catalogue includes this summary. `rebalance` keeps existing levels whose band still fits, then adds pool puzzles from unused boards to fill the largest score gaps in each band.

The generator works in three stages:

1. It takes a random self-avoiding walk between two edges. The walk may cross itself at right angles to make crossroads.
2. It discards boards that have an empty piece or duplicate pieces.
3. It adds clues (fixed pieces or path ends) until the solution is unique, then removes any clue that is not needed.

The catalogue records each level's code, solution and complexity details.

## Tests

```sh
node crosspath/solver.test.js
node crosspath/puzzle-progress.test.js
```

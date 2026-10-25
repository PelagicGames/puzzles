<!-- Copyright (C) 2026 Pelagic Games -->

# Crosspath

Crosspath is a newspaper-style browser puzzle. Nine 3x3 path squares must be dragged into the nine 3x3 slots of a 9x9 board. Squares cannot be rotated or flipped. When they are all placed correctly, they form one unbroken path from one edge of the board to another.

## Background

This is a unique puzzle idea I came up with, because I like newspaper puzzles, and was trying to think of the kinds of game that might fit alongside some of those.

I think I was likely inspired by [Tsuro](https://boardgamegeek.com/boardgame/16992/tsuro), because at one point I was thinking about having multiple paths traversed simultaneously, which I recognised afterwards as something I would have come across playing Tsuro at MCM ComicCon.

Before the initial implementation, I came up with various variants and different rules with added complexity (other than the simultaneous multi-path traversal), such as collecting keys to pass through doors (which would enable T-junctions to be a valid piece). I eventually took a step back and realised I have a tendancy to underestimate the subjective difficulty of solving puzzles (I generally consider any puzzle where the next move can be determined by just working things out in my head are easy, but I can also solve entire crosswords and codewords in my head, without filling in the grids, so I make puzzles too hard for other people), so those variants are being held back for potential future puzzles (like the unlockable XOR mode I added in [Light Discs](https://pelagicgames.github.io/puzzles/lightdiscs/index.html)).

Once I had settled on the current design, I checked for any existing games with the same premise and found games with similarities, but nothing quite like this one.

The name was originally going to be Crossrail, as a sort of pun (see [Crossrail](https://en.wikipedia.org/wiki/Crossrail)), and then I would have used train tracks, but that was too similar to the [Train Tracks puzzle game](https://traintrackspuzzle.com/), and this also was not how I had originally envisioned the game (I had thought of a character walking a path, rather than any kind of vehicle).

## Pages

- **Tutorial** explains the rules with small worked examples of allowed and disallowed placements.
- **Puzzles** groups the levels into five difficulty bands and tracks completed puzzle codes in local browser storage. If the browser blocks storage, the game still plays but progress is not saved: solved puzzles are remembered only until the page is left, and a focusable "Not saved" pill beside the tally explains why.
- **Puzzle** (`puzzle.html?level=N`) is the game board. Pieces can be dragged or tapped into place. Swipe an empty space or fixed tile to scroll, or hold a dragged piece near the top or bottom of the viewport to scroll while dragging. The key under the board appears only when the puzzle has fixed tiles or marked path ends. Failed attempts show a separate key for the correction marks present on the board; moving a piece clears those marks and their key. A solved puzzle offers a prominent next-unsolved-puzzle button below the board, as well as the bottom navigation link.

## Rules

- Each small square is either empty, a straight (│ ─), a right-angled corner (└ ┌ ┐ ┘) or a crossroads (┼). T-junctions and diagonals do not exist.
- Every 3x3 piece contains at least one path square, and every piece in a puzzle is different.
- Path squares next to each other must be joined. Path squares that touch without joining (two straights, a straight and a corner, or two corners), or paths that do not line up where two pieces meet, are not allowed.
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

The bands are calibrated on about 200,000 unique puzzles from 50,000 boards:

| Band | Score | Share of sampled puzzles | Typical reasoning |
|------|-------|----------------------------|-------------------|
| Very easy | 0–9 | 44% | Singles, almost no distractors |
| Easy | 10–39 | 19% | Singles |
| Medium | 40–119 | 17% | Singles with long scans, or light elimination |
| Hard | 120–299 | 6% | Elimination (91%) |
| Very hard | 300+ | 14% | At least one trial placement (99.6%) |

Each band's share varies by less than ±0.5 percentage points between independent seed batches. Puzzles scored 300 or more effectively all need a guess, and there is a natural gap in the score distribution just below 300.

## Canonical form and similarity

`puzzle-canonical.js` (`window.CrosspathCanonical`) compares solved boards regardless of how they are turned or mirrored.

Boundary positions are counted clockwise from the top-left corner: N1 to N9, E1 to E9, S9 to S1, then W9 to W1. Cells are ordered in concentric squares from the outside in, each read clockwise from its top-left corner.

Boards are ordered by:

1. the start's boundary position;
2. the end's boundary position;
3. the route from start to end, step by step: at the first step where two routes differ, the board whose cell comes first in the concentric-square order comes first.

The **canonical form** is the earliest of a board's sixteen variants (four rotations, each optionally mirrored, travelled in either direction). Its start is therefore as close to N1 as possible and, after that, its end as close to N3.

`distance(a, b)` compares two canonical forms (puzzle codes or solved boards are also accepted). Each part is scaled from 0 to 1 and weighted, most significant first:

| Part | Weight | Measures |
|------|--------|----------|
| 3x3 squares | 4 | For each 3x3 square, the difference in path connections across its edge and in crossroads, relative to both boards' totals |
| Endpoints | 2 | Gaps between the starts and between the ends, around the 36 boundary positions |
| Path squares | 1 | Cells whose path shape differs, relative to cells used by either board |

A total of 0 means the boards match up to rotation and reflection; 7 is the maximum. Boards at least `DISTINCT_DISTANCE` (1.0) apart count as different puzzles. Levels 31 to 60 were each chosen to be at least this far from every other level, and are published in the orientation they were generated in rather than in canonical form. Of the original thirty levels, only levels 10 and 15 are closer (0.95) and they are unchanged.

## Puzzle analysis catalogue

The analysis script reads the committed levels and writes a gitignored catalogue report.

```sh
node crosspath/generate-puzzle-catalogue.js
```

The `puzzle-catalogue.local.json` report records each level's code, solution, complexity details, canonical start and end, and nearest other level by canonical distance. If `complexity-survey.local.json` is present, its summary is included in the catalogue.

## Tests

```sh
node crosspath/solver.test.js
node crosspath/puzzle-canonical.test.js
node crosspath/puzzle-progress.test.js
```

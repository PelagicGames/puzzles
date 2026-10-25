// Copyright (C) 2026 Pelagic Games

/**
 * Canonical forms, ordering and a similarity metric for solved Crosspath boards.
 * A board has eight orientations (four rotations, each optionally mirrored) and two
 * travel directions; the canonical form is the first of these sixteen variants in
 * the board ordering below. Load after crosspath-rules.js and solver.js; publishes
 * CrosspathCanonical in browsers and exports it under Node. Pure functions only.
 *
 * Board ordering compares, in turn:
 * 1. the start's boundary position, counted clockwise from N1 (N1-N9, E1-E9, S9-S1, W9-W1);
 * 2. the end's boundary position, counted the same way;
 * 3. the cells visited along the route from start to end, one step at a time: at the
 *    first step where the routes part, the earlier board is the one whose cell comes
 *    first when the board is read in concentric squares from the outside in, each
 *    clockwise from its top-left corner.
 */

(() => {
  const root = typeof window !== "undefined" ? window : globalThis;
  const rules = root.CrosspathRules;
  const { SIZE, TILE, N, E, S, W, CROSSROADS } = rules;
  const LAST = SIZE - 1;
  const PERIMETER = SIZE * 4;
  const DIRECTION_BITS = [N, E, S, W];
  const STEP = { [N]: [-1, 0], [E]: [0, 1], [S]: [1, 0], [W]: [0, -1] };
  // Weights put 3x3 square changes above endpoint changes, and those above path squares.
  const WEIGHTS = { squares: 4, endpoints: 2, cells: 1 };
  // Boards closer than this are treated as variations of one another.
  const DISTINCT_DISTANCE = 1;

  /**
   * @param {number} row - Board row.
   * @param {number} col - Board column.
   * @returns {number} Position when reading concentric squares from the outside in,
   * each clockwise from its top-left corner.
   */
  function cellRank(row, col) {
    const ring = Math.min(row, col, LAST - row, LAST - col);
    const side = SIZE - ring * 2;
    let before = 0;
    for (let outer = 0; outer < ring; outer += 1) before += (SIZE - outer * 2) * 4 - 4;
    const top = ring;
    const right = LAST - ring;
    if (row === top) return before + col - ring;
    if (col === right) return before + (side - 1) + row - ring;
    if (row === right) return before + (side - 1) * 2 + right - col;
    return before + (side - 1) * 3 + right - row;
  }

  /**
   * @param {{row: number, col: number, dir: number}} exit - Boundary cell and outward bit.
   * @returns {number} Clockwise boundary position from N1 (0) to W1 (35).
   */
  function perimeterIndex({ row, col, dir }) {
    if (dir === N) return col;
    if (dir === E) return SIZE + row;
    if (dir === S) return SIZE * 2 + LAST - col;
    return SIZE * 3 + LAST - row;
  }

  /**
   * @param {number} index - Clockwise boundary position.
   * @returns {string} Marker key such as N1 or W9.
   */
  function perimeterKey(index) {
    const side = Math.floor(index / SIZE);
    const offset = index % SIZE;
    return ["N", "E", "S", "W"][side] + (side < 2 ? offset + 1 : SIZE - offset);
  }

  /**
   * @param {number} rotation - Clockwise quarter turns, 0-3.
   * @param {boolean} reflected - Whether to mirror left-right before rotating.
   * @returns {Object} Cell and direction mappings for the orientation.
   */
  function orientation(rotation, reflected) {
    /**
     * @param {number} row - Source row (or row offset for directions).
     * @param {number} col - Source column (or column offset).
     * @param {boolean} vector - Whether to map an offset rather than a cell.
     * @returns {number[]} Mapped row and column.
     */
    const map = (row, col, vector) => {
      let r = row;
      let c = reflected ? (vector ? -col : LAST - col) : col;
      for (let turn = 0; turn < rotation; turn += 1) [r, c] = [c, vector ? -r : LAST - r];
      return [r, c];
    };
    const direction = new Map(DIRECTION_BITS.map((bit) => {
      const [dr, dc] = map(...STEP[bit], true);
      return [bit, DIRECTION_BITS.find((other) => STEP[other][0] === dr && STEP[other][1] === dc)];
    }));
    return {
      rotation,
      reflected,
      cell: (row, col) => map(row, col, false),
      mask: (mask) => DIRECTION_BITS.reduce((out, bit) => (mask & bit ? out | direction.get(bit) : out), 0)
    };
  }

  const ORIENTATIONS = [false, true].flatMap((reflected) => [0, 1, 2, 3].map((turns) => orientation(turns, reflected)));

  /**
   * @param {number[]} board - Row-major cell masks.
   * @param {Object} orient - Entry from ORIENTATIONS.
   * @returns {number[]} New board seen in that orientation.
   */
  function transformBoard(board, orient) {
    const out = new Array(SIZE * SIZE).fill(0);
    board.forEach((mask, index) => {
      const [row, col] = orient.cell(Math.floor(index / SIZE), index % SIZE);
      out[row * SIZE + col] = orient.mask(mask || 0);
    });
    return out;
  }

  /**
   * @param {number[]} board - Row-major masks of a solved board.
   * @returns {Object[]} The route traced from each of the two exits, with clockwise
   * start/end positions and the cell rank of every step; throws unless the board
   * holds exactly one complete route.
   */
  function routes(board) {
    const exits = rules.findExits(board);
    if (exits.length !== 2) throw new Error("A solved board has exactly two exits.");
    return exits.map((start) => {
      const trace = rules.tracePath(board, start);
      if (!trace.end || trace.end.type !== "exit") throw new Error("The route does not reach an exit.");
      return {
        start: perimeterIndex(start),
        end: perimeterIndex(trace.end),
        ranks: trace.steps.map(({ row, col }) => cellRank(row, col))
      };
    });
  }

  /**
   * @param {Object} left - Route from routes().
   * @param {Object} right - Route from routes().
   * @returns {number} Negative when left comes first in board order, positive when
   * right does, zero for the same route.
   */
  function compareRoutes(left, right) {
    if (left.start !== right.start) return left.start - right.start;
    if (left.end !== right.end) return left.end - right.end;
    const length = Math.min(left.ranks.length, right.ranks.length);
    for (let step = 0; step < length; step += 1) {
      if (left.ranks[step] !== right.ranks[step]) return left.ranks[step] - right.ranks[step];
    }
    return left.ranks.length - right.ranks.length;
  }

  /**
   * @param {number[]} board - Row-major masks of a solved board.
   * @returns {Object} The board's canonical orientation: board, orientation (rotation
   * and reflection that produce it), clockwise start/end positions and keys, and the
   * route's cell ranks.
   */
  function canonicalForm(board) {
    let best = null;
    ORIENTATIONS.forEach((orient) => {
      const oriented = transformBoard(board, orient);
      routes(oriented).forEach((route) => {
        if (!best || compareRoutes(route, best.route) < 0) best = { orient, board: oriented, route };
      });
    });
    return {
      board: best.board,
      rotation: best.orient.rotation,
      reflected: best.orient.reflected,
      start: best.route.start,
      end: best.route.end,
      startKey: perimeterKey(best.route.start),
      endKey: perimeterKey(best.route.end),
      ranks: best.route.ranks
    };
  }

  /**
   * @param {number[]} left - Solved board.
   * @param {number[]} right - Solved board.
   * @returns {number} Sign of their canonical forms' order; zero when one board is a
   * rotation or reflection of the other.
   */
  function compareBoards(left, right) {
    const a = canonicalForm(left);
    const b = canonicalForm(right);
    return compareRoutes(a, b);
  }

  /**
   * @param {string} code - Puzzle code with a unique solution.
   * @returns {number[]} Row-major solved board; throws if the code is not unique.
   */
  function solvedBoard(code) {
    const analysis = root.CrosspathSolver.analyseCode(code);
    if (!analysis.unique) throw new Error(`Puzzle has no unique solution: ${code}`);
    return rules.composeBoard(rules.parseCode(code).tiles, analysis.solution);
  }

  /**
   * @param {number[]} board - Row-major masks.
   * @returns {Object[]} For each 3x3 square in slot order, the number of path
   * connections crossing its edge (including the board edge) and of crossroads inside.
   */
  function squareProfile(board) {
    return Array.from({ length: 9 }, (_, slot) => {
      const origin = rules.slotOrigin(slot);
      let exits = 0;
      let crossings = 0;
      for (let row = origin.row; row < origin.row + TILE; row += 1) {
        for (let col = origin.col; col < origin.col + TILE; col += 1) {
          const mask = board[row * SIZE + col] || 0;
          if (mask === CROSSROADS) crossings += 1;
          DIRECTION_BITS.forEach((bit) => {
            const nextRow = row + STEP[bit][0];
            const nextCol = col + STEP[bit][1];
            const leaves = nextRow < origin.row || nextRow >= origin.row + TILE
              || nextCol < origin.col || nextCol >= origin.col + TILE;
            if ((mask & bit) && leaves) exits += 1;
          });
        }
      }
      return { exits, crossings };
    });
  }

  /**
   * @param {number} left - Clockwise boundary position.
   * @param {number} right - Clockwise boundary position.
   * @returns {number} Steps between them around the board edge, 0-18.
   */
  function boundaryGap(left, right) {
    const gap = Math.abs(left - right);
    return Math.min(gap, PERIMETER - gap);
  }

  /**
   * @param {number[]|string|Object} item - Solved board, puzzle code, or canonicalForm result.
   * @returns {Object} Canonical form of the item.
   */
  function formOf(item) {
    if (typeof item === "string") return canonicalForm(solvedBoard(item));
    if (Array.isArray(item)) return canonicalForm(item);
    return item;
  }

  /**
   * Compares the canonical forms of two puzzles. Each component is scaled to 0-1:
   * - squares: per 3x3 square, the differences in edge connections and crossroads,
   *   relative to the two boards' combined totals;
   * - endpoints: start and end gaps around the board edge, out of the 36 positions;
   * - cells: path squares whose shape differs, relative to cells used by either board.
   * The total weights squares, endpoints and cells 4:2:1, so 0 means identical up to symmetry and 7 is the maximum.
   * @param {number[]|string|Object} left - Solved board, puzzle code or canonical form.
   * @param {number[]|string|Object} right - Solved board, puzzle code or canonical form.
   * @returns {{total: number, endpoints: number, squares: number, cells: number}} Distance.
   */
  function distance(left, right) {
    const a = formOf(left);
    const b = formOf(right);
    const endpoints = (boundaryGap(a.start, b.start) + boundaryGap(a.end, b.end)) / PERIMETER;
    const squaresA = squareProfile(a.board);
    const squaresB = squareProfile(b.board);
    let squareDifference = 0;
    let squareTotal = 0;
    squaresA.forEach((square, slot) => {
      const other = squaresB[slot];
      squareDifference += Math.abs(square.exits - other.exits) + Math.abs(square.crossings - other.crossings);
      squareTotal += square.exits + other.exits + square.crossings + other.crossings;
    });
    const squares = squareTotal ? squareDifference / squareTotal : 0;
    let cellDifference = 0;
    let cellsUsed = 0;
    a.board.forEach((mask, index) => {
      const other = b.board[index] || 0;
      if (mask || other) cellsUsed += 1;
      if ((mask || 0) !== other) cellDifference += 1;
    });
    const cells = cellsUsed ? cellDifference / cellsUsed : 0;
    const total = WEIGHTS.endpoints * endpoints + WEIGHTS.squares * squares + WEIGHTS.cells * cells;
    return { total, endpoints, squares, cells };
  }

  /**
   * @param {number[]|string|Object} left - Solved board, puzzle code or canonical form.
   * @param {number[]|string|Object} right - Solved board, puzzle code or canonical form.
   * @returns {boolean} Whether the two are far enough apart to count as different puzzles.
   */
  function isDistinct(left, right) {
    return distance(left, right).total >= DISTINCT_DISTANCE;
  }

  root.CrosspathCanonical = {
    DISTINCT_DISTANCE,
    ORIENTATIONS,
    WEIGHTS,
    canonicalForm,
    cellRank,
    compareBoards,
    distance,
    isDistinct,
    perimeterIndex,
    perimeterKey,
    solvedBoard,
    squareProfile,
    transformBoard
  };
  if (typeof module !== "undefined") module.exports = root.CrosspathCanonical;
})();

// Copyright (C) 2026 Pelagic Games

(() => {
  const SIZE = 9;
  const TILE = 3;
  const N = 1;
  const E = 2;
  const S = 4;
  const W = 8;
  const DIRECTIONS = [
    { bit: N, dr: -1, dc: 0, side: "N" },
    { bit: E, dr: 0, dc: 1, side: "E" },
    { bit: S, dr: 1, dc: 0, side: "S" },
    { bit: W, dr: 0, dc: -1, side: "W" }
  ];
  const BY_BIT = new Map(DIRECTIONS.map((direction) => [direction.bit, direction]));
  const BY_SIDE = new Map(DIRECTIONS.map((direction) => [direction.side, direction]));
  const OPPOSITE = { [N]: S, [E]: W, [S]: N, [W]: E };
  const CROSSROADS = N | E | S | W;
  const VALID_MASKS = new Set([0, N | S, E | W, N | E, E | S, S | W, N | W, CROSSROADS]);

  function unitsForMask(mask) {
    if (!mask) return 0;
    return mask === CROSSROADS ? 2 : 1;
  }

  function parseTile(text) {
    if (!/^[0-9a-f]{9}$/.test(text)) {
      throw new Error(`Tile "${text}" must contain nine hexadecimal cells.`);
    }
    const cells = [...text].map((character) => parseInt(character, 16));
    cells.forEach((mask) => {
      if (!VALID_MASKS.has(mask)) {
        throw new Error(`Tile "${text}" contains an invalid path element.`);
      }
    });
    if (cells.every((mask) => mask === 0)) {
      throw new Error(`Tile "${text}" has no path elements.`);
    }
    return cells;
  }

  function formatTile(cells) {
    return cells.map((mask) => mask.toString(16)).join("");
  }

  function parseMarker(text) {
    const match = /^([NESW])([1-9])$/.exec(text);
    if (!match) throw new Error(`Path end "${text}" must be a side and position, such as N4.`);
    return { side: match[1], index: Number(match[2]) - 1 };
  }

  function formatMarker({ side, index }) {
    return `${side}${index + 1}`;
  }

  // Code format: "T: <nine tiles> F: <tile@slot ...|-> X: <side+position ...|->".
  function parseCode(code) {
    const match = /^T:\s+(.+?)\s+F:\s+(.+?)\s+X:\s+(.+)$/.exec(code.trim());
    if (!match) throw new Error(`Invalid Crosspath code "${code}".`);
    const tileTexts = match[1].split(/\s+/);
    if (tileTexts.length !== 9) throw new Error("A Crosspath code needs exactly nine tiles.");
    const tiles = tileTexts.map(parseTile);
    if (new Set(tileTexts).size !== tileTexts.length) {
      throw new Error("Every tile in a Crosspath puzzle must be unique.");
    }
    const fixed = match[2] === "-" ? [] : match[2].split(/\s+/).map((entry) => {
      const fixedMatch = /^([1-9])@([1-9])$/.exec(entry);
      if (!fixedMatch) throw new Error(`Fixed tile "${entry}" must look like 3@5.`);
      return { tile: Number(fixedMatch[1]) - 1, slot: Number(fixedMatch[2]) - 1 };
    });
    if (new Set(fixed.map(({ tile }) => tile)).size !== fixed.length
      || new Set(fixed.map(({ slot }) => slot)).size !== fixed.length) {
      throw new Error("Fixed tiles must use distinct tiles and slots.");
    }
    const markers = match[3] === "-" ? [] : match[3].split(/\s+/).map(parseMarker);
    if (markers.length > 2) throw new Error("At most two path ends can be marked.");
    if (new Set(markers.map(formatMarker)).size !== markers.length) {
      throw new Error("Path end markers must be distinct.");
    }
    return { tiles, fixed, markers };
  }

  function formatCode({ tiles, fixed = [], markers = [] }) {
    const fixedText = fixed.length
      ? fixed.map(({ tile, slot }) => `${tile + 1}@${slot + 1}`).join(" ")
      : "-";
    const markerText = markers.length ? markers.map(formatMarker).join(" ") : "-";
    return `T: ${tiles.map(formatTile).join(" ")} F: ${fixedText} X: ${markerText}`;
  }

  // Boundary position of a marker: the board cell and its outward direction.
  function markerCell({ side, index }) {
    if (side === "N") return { row: 0, col: index, dir: N };
    if (side === "S") return { row: SIZE - 1, col: index, dir: S };
    if (side === "W") return { row: index, col: 0, dir: W };
    return { row: index, col: SIZE - 1, dir: E };
  }

  function boundaryKey(row, col, dir) {
    const side = BY_BIT.get(dir).side;
    const index = side === "N" || side === "S" ? col : row;
    return `${side}${index + 1}`;
  }

  function slotOrigin(slot) {
    return { row: Math.floor(slot / 3) * TILE, col: (slot % 3) * TILE };
  }

  function slotForCell(row, col) {
    return Math.floor(row / TILE) * 3 + Math.floor(col / TILE);
  }

  // placement[slot] = tile index or null. Returns 81 masks, with null for cells in empty slots.
  function composeBoard(tiles, placement) {
    const board = new Array(SIZE * SIZE).fill(null);
    placement.forEach((tileIndex, slot) => {
      if (tileIndex === null || tileIndex === undefined) return;
      const origin = slotOrigin(slot);
      tiles[tileIndex].forEach((mask, cell) => {
        const row = origin.row + Math.floor(cell / TILE);
        const col = origin.col + (cell % TILE);
        board[row * SIZE + col] = mask;
      });
    });
    return board;
  }

  function inside(row, col) {
    return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
  }

  function findExits(board) {
    const exits = [];
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const mask = board[row * SIZE + col];
        if (!mask) continue;
        DIRECTIONS.forEach(({ bit, dr, dc }) => {
          if ((mask & bit) && !inside(row + dr, col + dc)) {
            exits.push({ row, col, dir: bit, key: boundaryKey(row, col, bit) });
          }
        });
      }
    }
    return exits;
  }

  // Follows the path from a boundary exit, going straight through crossroads.
  function tracePath(board, start) {
    const steps = [];
    const visited = new Set();
    let row = start.row;
    let col = start.col;
    let travel = OPPOSITE[start.dir];
    let end = null;
    for (let guard = 0; guard < SIZE * SIZE * 2 + 2; guard += 1) {
      const mask = board[row * SIZE + col];
      const entry = OPPOSITE[travel];
      if (!mask || !(mask & entry)) {
        end = { type: "break", row, col, from: entry };
        break;
      }
      const out = mask === CROSSROADS ? travel : mask & ~entry;
      const unit = mask === CROSSROADS
        ? `${row},${col},${travel === N || travel === S ? "v" : "h"}`
        : `${row},${col}`;
      if (visited.has(unit)) {
        end = { type: "loop", row, col };
        break;
      }
      visited.add(unit);
      steps.push({ row, col, entry, exit: out });
      const direction = BY_BIT.get(out);
      const nextRow = row + direction.dr;
      const nextCol = col + direction.dc;
      if (!inside(nextRow, nextCol)) {
        end = { type: "exit", row, col, dir: out, key: boundaryKey(row, col, out) };
        break;
      }
      row = nextRow;
      col = nextCol;
      travel = out;
    }
    return { start, steps, visited, end };
  }

  function allUnits(board) {
    const units = [];
    board.forEach((mask, cell) => {
      if (!mask) return;
      const row = Math.floor(cell / SIZE);
      const col = cell % SIZE;
      if (mask === CROSSROADS) {
        units.push({ key: `${row},${col},v`, row, col, axis: "v" });
        units.push({ key: `${row},${col},h`, row, col, axis: "h" });
      } else {
        units.push({ key: `${row},${col}`, row, col, axis: null });
      }
    });
    return units;
  }

  // Adjacent cell pairs that either half-connect (mismatches) or touch without connecting.
  function connectionProblems(board) {
    const mismatches = [];
    const touching = [];
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const mask = board[row * SIZE + col];
        [{ bit: E, dr: 0, dc: 1 }, { bit: S, dr: 1, dc: 0 }].forEach(({ bit, dr, dc }) => {
          const nextRow = row + dr;
          const nextCol = col + dc;
          if (!inside(nextRow, nextCol)) return;
          const other = board[nextRow * SIZE + nextCol];
          if (mask === null || other === null) return;
          const out = Boolean(mask & bit);
          const back = Boolean(other & OPPOSITE[bit]);
          const pair = { a: { row, col }, b: { row: nextRow, col: nextCol }, dir: bit };
          if (out !== back) mismatches.push(pair);
          else if (!out && mask && other) touching.push(pair);
        });
      }
    }
    return { mismatches, touching };
  }

  function chooseTraceStart(exits, markers) {
    for (const marker of markers) {
      const exit = exits.find(({ key }) => key === formatMarker(marker));
      if (exit) return exit;
    }
    return exits[0] || null;
  }

  // Full rule check of a (possibly incomplete) board. Shared by the game, tutorial, solver and tests.
  function analyseBoard(board, markers = []) {
    const complete = board.every((mask) => mask !== null);
    const exits = findExits(board);
    const markerKeys = markers.map(formatMarker);
    const exitKeys = exits.map(({ key }) => key);
    const missingMarkers = markers.filter((marker) => !exitKeys.includes(formatMarker(marker)));
    const { mismatches, touching } = connectionProblems(board);
    const start = chooseTraceStart(exits, markers);
    const trace = start ? tracePath(board, start) : null;
    const traceEndKey = trace && trace.end.type === "exit" ? trace.end.key : null;
    let extraExits = [];
    if (markers.length === 2) {
      extraExits = exits.filter(({ key }) => !markerKeys.includes(key));
    } else if (exits.length > 2) {
      extraExits = exits.filter(({ key }) => (
        !markerKeys.includes(key) && key !== start.key && key !== traceEndKey
      ));
    }
    const units = allUnits(board);
    const unvisited = units.filter(({ key }) => !trace || !trace.visited.has(key));
    const issues = [];
    if (!complete) issues.push("incomplete");
    if (exits.length < 2) issues.push("too-few-ends");
    if (exits.length > 2) issues.push("too-many-ends");
    if (missingMarkers.length) issues.push("missing-marked-end");
    if (extraExits.length) issues.push("unmarked-end");
    if (mismatches.length) issues.push("broken-connection");
    if (touching.length) issues.push("touching-paths");
    if (!trace || trace.end.type !== "exit") issues.push("path-not-complete");
    if (unvisited.length) issues.push("unvisited-elements");
    return {
      solved: issues.length === 0,
      complete,
      exits,
      missingMarkers,
      extraExits,
      mismatches,
      touching,
      trace,
      unvisited,
      unitCount: units.length,
      issues
    };
  }

  window.CrosspathRules = {
    SIZE,
    TILE,
    N,
    E,
    S,
    W,
    CROSSROADS,
    DIRECTIONS,
    BY_BIT,
    BY_SIDE,
    OPPOSITE,
    VALID_MASKS,
    analyseBoard,
    boundaryKey,
    composeBoard,
    findExits,
    formatCode,
    formatMarker,
    formatTile,
    markerCell,
    parseCode,
    parseMarker,
    parseTile,
    slotForCell,
    slotOrigin,
    tracePath,
    unitsForMask
  };
})();

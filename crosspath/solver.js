// Copyright (C) 2026 Pelagic Games

(() => {
  const rules = window.CrosspathRules;
  const { N, E, S, W, OPPOSITE } = rules;
  const SIDE_CELLS = {
    [N]: [0, 1, 2],
    [S]: [6, 7, 8],
    [W]: [0, 3, 6],
    [E]: [2, 5, 8]
  };
  const SIDE_NAMES = { [N]: "N", [E]: "E", [S]: "S", [W]: "W" };
  const NEIGHBOURS = [
    { dir: N, dr: -1, dc: 0 },
    { dir: E, dr: 0, dc: 1 },
    { dir: S, dr: 1, dc: 0 },
    { dir: W, dr: 0, dc: -1 }
  ];

  // Complexity score thresholds (inclusive lower bounds), calibrated on ~200,000 generated puzzles.
  // Very hard puzzles need a trial placement; hard ones need elimination (see README).
  const COMPLEXITY_BANDS = [
    { id: "very-easy", label: "Very easy", minimum: 0 },
    { id: "easy", label: "Easy", minimum: 10 },
    { id: "medium", label: "Medium", minimum: 40 },
    { id: "hard", label: "Hard", minimum: 120 },
    { id: "very-hard", label: "Very hard", minimum: 300 }
  ];

  function edgeCompatible(tileA, dir, tileB) {
    const opposite = OPPOSITE[dir];
    for (let index = 0; index < 3; index += 1) {
      const a = tileA[SIDE_CELLS[dir][index]];
      const b = tileB[SIDE_CELLS[opposite][index]];
      const out = Boolean(a & dir);
      const back = Boolean(b & opposite);
      if (out !== back) return false;
      if (!out && a && b) return false;
    }
    return true;
  }

  function prepare(puzzle) {
    const { tiles, fixed, markers } = puzzle;
    const count = tiles.length;
    const compatible = {};
    [N, E, S, W].forEach((dir) => {
      compatible[dir] = tiles.map((tileA) => tiles.map((tileB) => edgeCompatible(tileA, dir, tileB)));
    });
    const markerKeys = new Set(markers.map(rules.formatMarker));
    // boundary[tile][slot] = null when impossible, otherwise the number of unmarked exits it adds.
    const boundary = tiles.map((tile) => Array.from({ length: 9 }, (_, slot) => {
      const slotRow = Math.floor(slot / 3);
      const slotCol = slot % 3;
      const sides = [];
      if (slotRow === 0) sides.push(N);
      if (slotRow === 2) sides.push(S);
      if (slotCol === 0) sides.push(W);
      if (slotCol === 2) sides.push(E);
      let unmarked = 0;
      for (const dir of sides) {
        for (let index = 0; index < 3; index += 1) {
          const position = dir === N || dir === S ? slotCol * 3 + index : slotRow * 3 + index;
          const key = `${SIDE_NAMES[dir]}${position + 1}`;
          const isExit = Boolean(tile[SIDE_CELLS[dir][index]] & dir);
          const marked = markerKeys.has(key);
          if (marked && !isExit) return null;
          if (isExit && !marked) unmarked += 1;
        }
      }
      return unmarked;
    }));
    const fixedSlots = new Array(9).fill(null);
    fixed.forEach(({ tile, slot }) => {
      fixedSlots[slot] = tile;
    });
    return { puzzle, count, compatible, boundary, fixedSlots, exitAllowance: 2 - markers.length };
  }

  function neighbourOk(prep, placement, tile, slot) {
    const row = Math.floor(slot / 3);
    const col = slot % 3;
    for (const { dir, dr, dc } of NEIGHBOURS) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow < 0 || nextRow > 2 || nextCol < 0 || nextCol > 2) continue;
      const other = placement[nextRow * 3 + nextCol];
      if (other !== null && !prep.compatible[dir][tile][other]) return false;
    }
    return true;
  }

  function unmarkedExitTotal(prep, placement) {
    return placement.reduce((total, tile, slot) => (
      tile === null ? total : total + prep.boundary[tile][slot]
    ), 0);
  }

  // A placement is locally valid if it agrees with every placed neighbour and the board boundary.
  function locallyValid(prep, placement, tile, slot, unmarkedSoFar) {
    const extra = prep.boundary[tile][slot];
    if (extra === null) return false;
    if (unmarkedSoFar + extra > prep.exitAllowance) return false;
    return neighbourOk(prep, placement, tile, slot);
  }

  function initialPlacement(prep) {
    return prep.fixedSlots.slice();
  }

  function fixedConsistent(prep) {
    const placement = new Array(9).fill(null);
    let unmarked = 0;
    for (let slot = 0; slot < 9; slot += 1) {
      const tile = prep.fixedSlots[slot];
      if (tile === null) continue;
      if (!locallyValid(prep, placement, tile, slot, unmarked)) return false;
      unmarked += prep.boundary[tile][slot];
      placement[slot] = tile;
    }
    return true;
  }

  function isSolution(puzzle, placement) {
    const board = rules.composeBoard(puzzle.tiles, placement);
    return rules.analyseBoard(board, puzzle.markers).solved;
  }

  // Exhaustive backtracking over tile-to-slot assignments, stopping after `limit` solutions.
  function solve(puzzle, { limit = 2 } = {}) {
    const prep = prepare(puzzle);
    const solutions = [];
    let nodes = 0;
    if (!fixedConsistent(prep)) return { solutions, count: 0, complete: true, nodes };
    const placement = initialPlacement(prep);
    const used = new Array(prep.count).fill(false);
    prep.fixedSlots.forEach((tile) => {
      if (tile !== null) used[tile] = true;
    });
    const openSlots = [];
    for (let slot = 0; slot < 9; slot += 1) if (placement[slot] === null) openSlots.push(slot);

    function search(depth, unmarked) {
      if (solutions.length >= limit) return;
      if (depth === openSlots.length) {
        if (isSolution(puzzle, placement)) solutions.push(placement.slice());
        return;
      }
      const slot = openSlots[depth];
      for (let tile = 0; tile < prep.count; tile += 1) {
        if (used[tile]) continue;
        nodes += 1;
        if (!locallyValid(prep, placement, tile, slot, unmarked)) continue;
        used[tile] = true;
        placement[slot] = tile;
        search(depth + 1, unmarked + prep.boundary[tile][slot]);
        placement[slot] = null;
        used[tile] = false;
        if (solutions.length >= limit) return;
      }
    }

    search(0, unmarkedExitTotal(prep, placement));
    return { solutions, count: solutions.length, complete: solutions.length < limit, nodes };
  }

  function bandFor(score) {
    let band = COMPLEXITY_BANDS[0];
    COMPLEXITY_BANDS.forEach((candidate) => {
      if (score >= candidate.minimum) band = candidate;
    });
    return band;
  }

  function validPlacements(prep, placement) {
    const placedTiles = new Set(placement.filter((tile) => tile !== null));
    const unmarked = unmarkedExitTotal(prep, placement);
    const valid = [];
    for (let slot = 0; slot < 9; slot += 1) {
      if (placement[slot] !== null) continue;
      for (let tile = 0; tile < prep.count; tile += 1) {
        if (placedTiles.has(tile)) continue;
        if (locallyValid(prep, placement, tile, slot, unmarked)) valid.push({ tile, slot });
      }
    }
    return valid;
  }

  // Counts the options for every open slot and unplaced tile. `dead` means one has none left.
  function optionCounts(prep, placement, moves) {
    const bySlot = new Array(9).fill(0);
    const byTile = new Array(prep.count).fill(0);
    moves.forEach(({ tile, slot }) => {
      bySlot[slot] += 1;
      byTile[tile] += 1;
    });
    const placedTiles = new Set(placement.filter((tile) => tile !== null));
    const dead = bySlot.some((count, slot) => placement[slot] === null && count === 0)
      || byTile.some((count, tile) => !placedTiles.has(tile) && count === 0);
    return { bySlot, byTile, dead };
  }

  const choiceOf = (counts, { tile, slot }) => Math.min(counts.bySlot[slot], counts.byTile[tile]);

  // Step weights for the reasoning needed to find the next placement (see README).
  const TECHNIQUE_WEIGHT = { single: 1, elimination: 2, guess: 3 };

  // Replays a solve the way a person would: place a single (a slot with one possible piece, or a
  // piece with one possible slot) when there is one; otherwise rule out placements that leave some
  // slot or piece with no options and look again; otherwise make the least ambiguous trial
  // placement. Each step's distractors (locally valid placements not in the solution) are weighted
  // by the technique that step needed, plus log2 of the options for a trial placement.
  function complexity(puzzle, solution) {
    const prep = prepare(puzzle);
    const placement = initialPlacement(prep);
    const steps = [];
    while (placement.some((tile) => tile === null)) {
      const valid = validPlacements(prep, placement);
      const correct = valid.filter(({ tile, slot }) => solution[slot] === tile);
      if (!correct.length) throw new Error("The supplied solution is not locally valid.");
      let technique = "single";
      let moves = valid;
      let counts = optionCounts(prep, placement, moves);
      let forced = correct.filter((move) => choiceOf(counts, move) === 1);
      if (!forced.length) {
        technique = "elimination";
        moves = valid.filter(({ tile, slot }) => {
          placement[slot] = tile;
          const dead = optionCounts(prep, placement, validPlacements(prep, placement)).dead;
          placement[slot] = null;
          return !dead;
        });
        counts = optionCounts(prep, placement, moves);
        forced = correct.filter((move) => choiceOf(counts, move) === 1);
      }
      if (!forced.length) technique = "guess";
      const chosen = (forced.length ? forced : correct).map((move) => ({ ...move, choice: choiceOf(counts, move) }))
        .sort((left, right) => left.choice - right.choice || left.slot - right.slot)[0];
      const distractors = valid.length - correct.length;
      const weight = TECHNIQUE_WEIGHT[technique] + (technique === "guess" ? Math.log2(chosen.choice) : 0);
      steps.push({
        valid: valid.length,
        distractors,
        technique,
        choice: chosen.choice,
        weighted: distractors * weight,
        tile: chosen.tile,
        slot: chosen.slot
      });
      placement[chosen.slot] = chosen.tile;
    }
    const distractorTotal = steps.reduce((total, { distractors }) => total + distractors, 0);
    const score = Math.round(steps.reduce((total, { weighted }) => total + weighted, 0));
    const band = bandFor(score);
    const techniqueCount = (name) => steps.filter(({ technique }) => technique === name).length;
    return {
      score,
      difficulty: band.id,
      label: band.label,
      placements: steps.length,
      distractorTotal,
      peakDistractors: steps.reduce((peak, { distractors }) => Math.max(peak, distractors), 0),
      averageDistractors: steps.length ? Number((distractorTotal / steps.length).toFixed(2)) : 0,
      unforcedSteps: steps.filter(({ technique }) => technique !== "single").length,
      eliminationSteps: techniqueCount("elimination"),
      guessSteps: techniqueCount("guess"),
      guessBits: Number(steps.reduce((total, { technique, choice }) => (
        technique === "guess" ? total + Math.log2(choice) : total
      ), 0).toFixed(2)),
      distractorsByStep: steps.map(({ distractors }) => distractors),
      techniquesByStep: steps.map(({ technique }) => technique)
    };
  }

  function describePlacement(placement) {
    return placement.map((tile, slot) => `${tile + 1}@${slot + 1}`).join(" ");
  }

  function analyseCode(code) {
    const diagnostics = [];
    let puzzle;
    try {
      puzzle = rules.parseCode(code);
    } catch (error) {
      return { valid: false, unique: false, solutionCount: 0, diagnostics: [error.message] };
    }
    const result = solve(puzzle, { limit: 2 });
    if (result.count === 0) diagnostics.push("No solution.");
    if (result.count > 1) diagnostics.push("More than one solution.");
    const unique = result.count === 1;
    return {
      valid: unique,
      unique,
      solutionCount: result.count,
      solution: result.solutions[0] || null,
      solutionText: result.solutions[0] ? describePlacement(result.solutions[0]) : null,
      alternativeText: result.solutions[1] ? describePlacement(result.solutions[1]) : null,
      complexity: unique ? complexity(puzzle, result.solutions[0]) : null,
      searchNodes: result.nodes,
      diagnostics
    };
  }

  window.CrosspathSolver = {
    COMPLEXITY_BANDS,
    analyseCode,
    bandFor,
    complexity,
    describePlacement,
    edgeCompatible,
    isSolution,
    prepare,
    solve
  };
})();

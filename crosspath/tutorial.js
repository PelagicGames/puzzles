// Copyright (C) 2026 Pelagic Games

(() => {
  const rules = window.CrosspathRules;
  const render = window.CrosspathRender;
  const { N, E, S, W, OPPOSITE, BY_BIT, CROSSROADS } = rules;
  const { svgElement, drawCells, edgePoint, centrePoint, pointsToPath, crossMark } = render;
  const CELL = 40;
  const PAD = 14;
  const LEAD = 20;
  const WORKED_TILES = "0066af505 c00900000 006005005 5035003c0 c005003c0 069690500 050afc039 05005003a 3c0050a90"
    .split(" ")
    .map(rules.parseTile);
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const hex = (text) => text.replace(/\s+/g, "").split("").map((digit) => (digit === "." ? null : parseInt(digit, 16)));

  function figure(containerId, { verdict = null, caption, width, height, label }) {
    const element = document.createElement("figure");
    element.className = `example${verdict ? ` is-${verdict}` : ""}`;
    const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": label || caption });
    element.append(svg);
    const figcaption = document.createElement("figcaption");
    if (verdict) {
      const tag = document.createElement("span");
      tag.className = "verdict";
      tag.textContent = verdict === "valid" ? "\u2713 Allowed" : "\u2717 Not allowed";
      figcaption.append(tag);
    }
    figcaption.append(caption);
    element.append(figcaption);
    document.getElementById(containerId).append(element);
    return { element, svg };
  }

  // A block of cells on a paper (movable) or newsprint (fixed/board) background, outlined as pieces.
  function drawGrid(svg, cells, { columns, x = PAD, y = PAD, fixed = false, pieces = true, frame = false }) {
    const rows = Math.ceil(cells.length / columns);
    const width = columns * CELL;
    const height = rows * CELL;
    svgElement("rect", { class: fixed ? "slot-empty" : "tile-face", x, y, width, height }, svg);
    drawCells(svg, cells, { columns, x, y, cell: CELL });
    if (pieces) {
      let data = "";
      for (let col = 3; col < columns; col += 3) data += `M${x + col * CELL} ${y}V${y + height}`;
      for (let row = 3; row < rows; row += 3) data += `M${x} ${y + row * CELL}H${x + width}`;
      if (data) svgElement("path", { class: "block-rules", d: data }, svg);
    }
    svgElement("rect", { class: frame ? "board-frame" : "piece-outline", x, y, width, height }, svg);
    return { x, y, columns, rows };
  }

  const inside = (grid, row, col) => row >= 0 && row < grid.rows && col >= 0 && col < grid.columns;
  const maskAt = (cells, grid, row, col) => cells[row * grid.columns + col];

  // Small-grid equivalent of CrosspathRules.tracePath, for figures smaller than the full board.
  function traceSmall(cells, grid, start, { turnAtCrossroads = null } = {}) {
    const steps = [];
    let { row, col } = start;
    let travel = OPPOSITE[start.dir];
    for (let guard = 0; guard < 200; guard += 1) {
      const mask = maskAt(cells, grid, row, col);
      const entry = OPPOSITE[travel];
      if (!mask || !(mask & entry)) return { start, steps, end: { type: "break" } };
      let out = mask === CROSSROADS ? travel : mask & ~entry;
      if (mask === CROSSROADS && turnAtCrossroads) out = turnAtCrossroads;
      steps.push({ row, col, entry, exit: out });
      const direction = BY_BIT.get(out);
      if (!inside(grid, row + direction.dr, col + direction.dc)) {
        return { start, steps, end: { type: "exit", dir: out } };
      }
      row += direction.dr;
      col += direction.dc;
      travel = out;
    }
    return { start, steps, end: { type: "loop" } };
  }

  // Joins that half-connect, and path squares that touch side by side without joining.
  function joinProblems(cells, grid) {
    const mismatches = [];
    const touching = [];
    for (let row = 0; row < grid.rows; row += 1) {
      for (let col = 0; col < grid.columns; col += 1) {
        const mask = maskAt(cells, grid, row, col);
        [{ bit: E, dr: 0, dc: 1 }, { bit: S, dr: 1, dc: 0 }].forEach(({ bit, dr, dc }) => {
          if (!inside(grid, row + dr, col + dc)) return;
          const other = maskAt(cells, grid, row + dr, col + dc);
          const out = Boolean(mask & bit);
          const back = Boolean(other & OPPOSITE[bit]);
          if (out !== back) mismatches.push({ row, col, dir: bit });
          else if (!out && mask && other) touching.push({ row, col, dir: bit });
        });
      }
    }
    return { mismatches, touching };
  }

  function geometryFor(grid) {
    return { cell: CELL, originX: grid.x, originY: grid.y, lead: LEAD };
  }

  function drawTrace(svg, trace, grid, className = "pen-trace") {
    const points = render.tracePoints(trace, geometryFor(grid));
    return svgElement("path", { class: className, d: pointsToPath(points) }, svg);
  }

  function markProblems(svg, cells, grid) {
    const { mismatches, touching } = joinProblems(cells, grid);
    mismatches.forEach(({ row, col, dir }) => {
      const [x, y] = edgePoint(row, col, dir, CELL, grid.x, grid.y);
      crossMark(svg, x, y, 7);
    });
    touching.forEach(({ row, col, dir }) => {
      const [x, y] = edgePoint(row, col, dir, CELL, grid.x, grid.y);
      const half = CELL * 0.32;
      svgElement("path", {
        class: "correction-line",
        d: dir === E
          ? `M${x} ${y - half}L${x - 4} ${y - half / 3}L${x + 4} ${y + half / 3}L${x} ${y + half}`
          : `M${x - half} ${y}L${x - half / 3} ${y - 4}L${x + half / 3} ${y + 4}L${x + half} ${y}`
      }, svg);
    });
  }

  function markUnvisited(svg, grid, list) {
    list.forEach(({ row, col, mask }) => {
      const x = grid.x + col * CELL;
      const y = grid.y + row * CELL;
      svgElement("rect", { class: "unvisited-wash", x: x + 2, y: y + 2, width: CELL - 4, height: CELL - 4 }, svg);
      svgElement("path", { class: "unvisited-ink", d: render.cellPathData(mask, x, y, CELL) }, svg);
    });
  }

  function outward(grid, row, col, dir, distance) {
    const [x, y] = edgePoint(row, col, dir, CELL, grid.x, grid.y);
    const [ex, ey] = render.EDGE[dir];
    return [x + (ex - 0.5) * 2 * distance, y + (ey - 0.5) * 2 * distance];
  }

  function drawEndMarker(svg, grid, row, col, dir) {
    const edge = edgePoint(row, col, dir, CELL, grid.x, grid.y);
    const outer = outward(grid, row, col, dir, LEAD);
    svgElement("path", { class: "marker-stub", d: `M${edge[0]} ${edge[1]}L${outer[0]} ${outer[1]}` }, svg);
    svgElement("circle", { class: "marker-dot", cx: outer[0], cy: outer[1], r: 6.5 }, svg);
    return outer;
  }

  function size(columns, rows, margin = PAD) {
    return { width: columns * CELL + margin * 2, height: rows * CELL + margin * 2 };
  }

  // ---- 1. The goal ----------------------------------------------------------

  function goalFigures() {
    const trayOrder = [4, 8, 1, 6, 0, 3, 7, 2, 5];
    const gap = 16;
    const tileSize = 3 * CELL;
    const width = 3 * tileSize + 2 * gap + PAD * 2;
    const tray = figure("figures-goal", {
      caption: "Nine tiles, all different, each with some path on it.",
      label: "Nine separate three-by-three tiles",
      width,
      height: width
    });
    trayOrder.forEach((tileIndex, position) => {
      drawGrid(tray.svg, WORKED_TILES[tileIndex], {
        columns: 3,
        x: PAD + (position % 3) * (tileSize + gap),
        y: PAD + Math.floor(position / 3) * (tileSize + gap)
      });
    });

    const board = rules.composeBoard(WORKED_TILES, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const margin = LEAD + 8;
    const solved = figure("figures-goal", {
      caption: "\u2026placed to make one path from edge to edge, through every path square.",
      label: "The tiles placed on the board, with the path traced in blue",
      ...size(9, 9, margin)
    });
    svgElement("rect", { class: "board-margin", x: 0, y: 0, width: 9 * CELL + margin * 2, height: 9 * CELL + margin * 2 }, solved.svg);
    const grid = drawGrid(solved.svg, board, { columns: 9, x: margin, y: margin, frame: true });
    const result = rules.analyseBoard(board);
    svgElement("path", {
      class: "pen-trace",
      d: pointsToPath(render.tracePoints(result.trace, geometryFor(grid)))
    }, solved.svg);
  }

  // ---- 2. Path squares ------------------------------------------------------

  function squareFigures() {
    const gap = 12;
    const span = 2 * CELL + gap;
    const dims = { width: span + PAD * 2, height: span + PAD * 2 };
    [
      ["A straight, horizontal or vertical.", [0xa, 0x5]],
      ["A right-angled corner, turning any way.", [0x6, 0xc, 0x3, 0x9]],
      ["A crossroads, where two straights cross.", [0xf]]
    ].forEach(([caption, masks]) => {
      const { svg } = figure("figures-squares", { caption, ...dims });
      const rows = Math.ceil(masks.length / 2);
      masks.forEach((mask, index) => {
        const inRow = masks.length === 1 ? 1 : 2;
        const row = Math.floor(index / 2);
        const col = index % 2;
        const x = PAD + (span - (inRow * CELL + (inRow - 1) * gap)) / 2 + col * (CELL + gap);
        const y = PAD + (span - (rows * CELL + (rows - 1) * gap)) / 2 + row * (CELL + gap);
        svgElement("rect", { class: "square-outline", x, y, width: CELL, height: CELL }, svg);
        drawCells(svg, [mask], { columns: 1, x, y, cell: CELL });
      });
    });
  }

  // ---- 3. The pieces --------------------------------------------------------

  function pieceFigures() {
    let fig = figure("figures-pieces", {
      caption: "A moveable tile: printed on a lighter background, ready to move. It is placed exactly as printed.",
      ...size(3, 3)
    });
    drawGrid(fig.svg, hex("06c af9 050"), { columns: 3 });

    fig = figure("figures-pieces", {
      caption: "A fixed tile: printed in the board colour. It is already in place and cannot be moved.",
      ...size(3, 3)
    });
    drawGrid(fig.svg, WORKED_TILES[4], { columns: 3, fixed: true });
  }

  // ---- 4. Joining pieces ----------------------------------------------------

  function joinFigure(verdict, caption, text, extras = () => {}) {
    const cells = hex(text);
    const { svg } = figure("figures-joins", { verdict, caption, ...size(6, 3) });
    const grid = drawGrid(svg, cells, { columns: 6 });
    if (verdict === "invalid") markProblems(svg, cells, grid);
    extras(svg, grid, cells);
  }

  function joinFigures() {
    joinFigure("valid", "The path leaves one tile and enters the next at the same point.", "000000 aaaaaa 000000");
    joinFigure("invalid", "Unaligned: the path leaves the left tile on the top row, but the right tile continues on the middle row.", "aaa000 000aaa 000000");
    joinFigure("invalid", "Unaligned: the path runs into the next tile where it has no path to continue it.", "000050 aaa050 000050");
    joinFigure("invalid", "Parallel paths: two path squares sit side by side without being joined.", "005500 005500 005500");
    joinFigure("valid", "Paths can run near each other with a gap between them.", "050500 050500 050500");
    joinFigure("valid", "Path squares only touch where the path turns from one into the other.", "000000 aaac00 000500");
  }

  // ---- 5. Crossroads --------------------------------------------------------

  function crossroadsFigures() {
    const columns = 6;
    const rows = 5;
    const margin = LEAD + 14;
    const dims = size(columns, rows, margin);
    const start = { row: 2, col: 0, dir: W };
    const markers = [start, { row: 4, col: 3, dir: S }];

    const board = (verdict, caption, text) => {
      const cells = hex(text);
      const { svg } = figure("figures-crossroads", { verdict, caption, ...dims });
      svgElement("rect", { class: "board-margin", x: 0, y: 0, width: dims.width, height: dims.height }, svg);
      const grid = drawGrid(svg, cells, { columns, x: margin, y: margin, frame: true, pieces: false });
      markers.forEach(({ row, col, dir }) => drawEndMarker(svg, grid, row, col, dir));
      return { svg, grid, cells };
    };

    let fig = board("valid",
      "Straight over the crossroads, round the loop, then straight over again to the marked end.",
      "000000 0006c0 aaaf90 000500 000500");
    drawTrace(fig.svg, traceSmall(fig.cells, fig.grid, start), fig.grid);

    const crossing = "000500 000500 aaafaa 000500 000500";
    fig = board("invalid",
      "Going straight on, the path leaves by an unmarked edge. There are four ends, and the vertical path is never travelled.",
      crossing);
    let trace = traceSmall(fig.cells, fig.grid, start);
    markTraceFailures(fig.svg, fig.grid, fig.cells, trace, markers);
    drawTrace(fig.svg, trace, fig.grid);

    fig = board("invalid",
      "Turning at the crossroads would join the two marked ends, but the path cannot turn there, and two arms would be left over anyway.",
      crossing);
    trace = traceSmall(fig.cells, fig.grid, start, { turnAtCrossroads: S });
    markTraceFailures(fig.svg, fig.grid, fig.cells, trace, markers);
    drawTrace(fig.svg, trace, fig.grid, "pen-trace is-wrong");
    const turnPoint = centrePoint(2, 3, CELL, fig.grid.x, fig.grid.y);
    crossMark(fig.svg, turnPoint[0] - 12, turnPoint[1] + 12, 7);
  }

  // ---- 6. Two ends, one path ------------------------------------------------

  function endsFigure(verdict, caption, text, start, decorate) {
    const cells = hex(text);
    const margin = LEAD + 8;
    const { svg } = figure("figures-ends", { verdict, caption, ...size(6, 6, margin) });
    svgElement("rect", { class: "board-margin", x: 0, y: 0, width: 6 * CELL + margin * 2, height: 6 * CELL + margin * 2 }, svg);
    const grid = drawGrid(svg, cells, { columns: 6, x: margin, y: margin, frame: true });
    const trace = traceSmall(cells, grid, start);
    decorate(svg, grid, cells, trace);
    drawTrace(svg, trace, grid);
  }

  // Red marks for path squares the trace never reached, edge exits it did not use or that are
  // not marked ends, and marked ends it missed.
  function markTraceFailures(svg, grid, cells, trace, markers = []) {
    const visited = new Map();
    trace.steps.forEach(({ row, col, entry, exit }) => {
      const key = `${row},${col}`;
      visited.set(key, (visited.get(key) || 0) | entry | exit);
    });
    const missed = [];
    cells.forEach((mask, index) => {
      if (!mask) return;
      const row = Math.floor(index / grid.columns);
      const col = index % grid.columns;
      const left = mask & ~(visited.get(`${row},${col}`) || 0);
      if (left) missed.push({ row, col, mask: left });
    });
    markUnvisited(svg, grid, missed);
    const last = trace.steps[trace.steps.length - 1];
    const used = new Set([`${trace.start.row},${trace.start.col},${trace.start.dir}`]);
    if (trace.end.type === "exit") used.add(`${last.row},${last.col},${trace.end.dir}`);
    const marked = new Set(markers.map(({ row, col, dir }) => `${row},${col},${dir}`));
    cells.forEach((mask, index) => {
      const row = Math.floor(index / grid.columns);
      const col = index % grid.columns;
      [N, E, S, W].forEach((dir) => {
        const { dr, dc } = BY_BIT.get(dir);
        const key = `${row},${col},${dir}`;
        if (!(mask & dir) || inside(grid, row + dr, col + dc)) return;
        if (marked.has(key)) {
          if (!used.has(key)) {
            const [x, y] = outward(grid, row, col, dir, LEAD);
            svgElement("circle", { class: "correction-ring", cx: x, cy: y, r: 12 }, svg);
          }
          return;
        }
        if (used.has(key) && (markers.length < 2)) return;
        const [x, y] = outward(grid, row, col, dir, LEAD * 0.7);
        crossMark(svg, x, y, 6);
      });
    });
  }

  function endsFigures() {
    const decorate = (verdict) => (svg, grid, cells, trace) => {
      if (verdict === "invalid") markTraceFailures(svg, grid, cells, trace);
    };
    endsFigure("valid", "One path, two ends, every path square visited.",
      "aac000 005000 003ac0 000050 000050 000050",
      { row: 0, col: 0, dir: W },
      decorate("valid"));
    endsFigure("invalid", "A closed loop: it has no ends, so it can never be part of the route.",
      "06ac00 050500 03a900 000000 aaaaaa 000000",
      { row: 4, col: 0, dir: W },
      decorate("invalid"));
    endsFigure("invalid", "Two separate paths: four ends, and the second path is never travelled.",
      "000000 aaaaaa 000000 000000 aaaaaa 000000",
      { row: 1, col: 0, dir: W },
      decorate("invalid"));
  }

  // ---- 7. Clues -------------------------------------------------------------

  function cluesFigures() {
    const margin = LEAD + 10;
    const dims = { width: 6 * CELL + margin * 2, height: 3 * CELL + margin * 2 };

    const cells = hex("000000 aaaaaa 000000");
    let fig = figure("figures-clues", {
      verdict: "valid",
      caption: "A dot beside the board marks a path end. The path must reach the edge there.",
      ...dims
    });
    svgElement("rect", { class: "board-margin", x: 0, y: 0, width: dims.width, height: dims.height }, fig.svg);
    let grid = drawGrid(fig.svg, cells, { columns: 6, x: margin, y: margin, frame: true });
    drawEndMarker(fig.svg, grid, 1, 0, W);

    fig = figure("figures-clues", {
      verdict: "invalid",
      caption: "The path misses the marked end, so the answer is wrong.",
      ...dims
    });
    svgElement("rect", { class: "board-margin", x: 0, y: 0, width: dims.width, height: dims.height }, fig.svg);
    grid = drawGrid(fig.svg, cells, { columns: 6, x: margin, y: margin, frame: true });
    const [mx, my] = drawEndMarker(fig.svg, grid, 0, 0, W);
    svgElement("circle", { class: "correction-ring", cx: mx, cy: my, r: 12 }, fig.svg);
  }

  // ---- 8. Checking ----------------------------------------------------------

  function boardFigure(caption, verdict, placement) {
    const margin = LEAD + 12;
    const full = 9 * CELL + margin * 2;
    const { element, svg } = figure("figures-check", { verdict, caption, width: full, height: full });
    svgElement("rect", { class: "board-margin", x: 0, y: 0, width: full, height: full }, svg);
    const board = rules.composeBoard(WORKED_TILES, placement);
    const grid = drawGrid(svg, board, { columns: 9, x: margin, y: margin, frame: true });
    const result = rules.analyseBoard(board);
    const geometry = geometryFor(grid);
    const marksLayer = svgElement("g", { class: "marks-layer" }, svg);
    const trace = svgElement("path", { class: "pen-trace", d: pointsToPath(render.tracePoints(result.trace, geometry)) }, svg);
    const nib = svgElement("circle", { class: "pen-nib", r: 5, cx: -20, cy: -20 }, svg);
    const replay = document.createElement("button");
    replay.type = "button";
    replay.className = "replay-button";
    replay.textContent = "Replay";
    element.querySelector("figcaption").append(" ", replay);

    function play() {
      marksLayer.replaceChildren();
      const length = trace.getTotalLength();
      trace.style.strokeDasharray = `${length} ${length}`;
      const duration = reduceMotion ? 0 : Math.min(4200, 700 + length * 2.2);
      const begun = performance.now();
      const finish = () => {
        trace.style.strokeDashoffset = "0";
        nib.setAttribute("cx", -20);
        if (!result.solved) {
          render.correctionElements(result, board, geometry).forEach((mark, index) => {
            mark.style.animationDelay = `${index * 90}ms`;
            marksLayer.append(mark);
          });
        }
      };
      if (!duration) {
        finish();
        return;
      }
      const frame = (now) => {
        const progress = Math.min(1, (now - begun) / duration);
        const drawn = length * progress;
        trace.style.strokeDashoffset = `${length - drawn}`;
        const point = trace.getPointAtLength(drawn);
        nib.setAttribute("cx", point.x);
        nib.setAttribute("cy", point.y);
        if (progress < 1) requestAnimationFrame(frame);
        else finish();
      };
      requestAnimationFrame(frame);
    }

    replay.addEventListener("click", play);
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          play();
        }
      }, { threshold: 0.5 });
      observer.observe(svg);
    } else {
      play();
    }
  }

  function checkFigures() {
    boardFigure("Correct: the pen runs from one end to the other, through every path square.", "valid", [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    boardFigure("Wrong: two tiles in the top row are swapped. The pen stops at a broken join, and red marks show the extra ends and the squares it never reached.", "invalid", [2, 1, 0, 3, 4, 5, 6, 7, 8]);
  }

  goalFigures();
  squareFigures();
  pieceFigures();
  joinFigures();
  crossroadsFigures();
  endsFigures();
  cluesFigures();
  checkFigures();
})();

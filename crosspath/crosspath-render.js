// Copyright (C) 2026 Pelagic Games

(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const { N, E, S, W, TILE } = window.CrosspathRules;
  const EDGE = {
    [N]: [0.5, 0],
    [E]: [1, 0.5],
    [S]: [0.5, 1],
    [W]: [0, 0.5]
  };

  function svgElement(name, attributes = {}, parent = null) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (parent) parent.append(element);
    return element;
  }

  function cellPathData(mask, x, y, size) {
    if (!mask) return "";
    const centreX = x + size / 2;
    const centreY = y + size / 2;
    return [N, E, S, W]
      .filter((bit) => mask & bit)
      .map((bit) => `M${centreX} ${centreY}L${x + EDGE[bit][0] * size} ${y + EDGE[bit][1] * size}`)
      .join("");
  }

  // Draws a rectangular block of cells: background, faint cell rules and path ink.
  function drawCells(parent, cells, { columns, x = 0, y = 0, cell = 40, className = "" } = {}) {
    const rows = Math.ceil(cells.length / columns);
    const group = svgElement("g", { class: `cell-block ${className}`.trim() }, parent);
    let gridData = "";
    for (let index = 1; index < columns; index += 1) {
      gridData += `M${x + index * cell} ${y}V${y + rows * cell}`;
    }
    for (let index = 1; index < rows; index += 1) {
      gridData += `M${x} ${y + index * cell}H${x + columns * cell}`;
    }
    if (gridData) svgElement("path", { class: "cell-rules", d: gridData }, group);
    let inkData = "";
    cells.forEach((mask, index) => {
      if (mask === null || mask === undefined) return;
      inkData += cellPathData(mask, x + (index % columns) * cell, y + Math.floor(index / columns) * cell, cell);
    });
    if (inkData) svgElement("path", { class: "path-ink", d: inkData }, group);
    return group;
  }

  // A standalone 3x3 tile drawing for the tray, drag ghost and tutorial.
  function tileSvg(tile, { fixed = false, label = "" } = {}) {
    const size = TILE * 40;
    const svg = svgElement("svg", {
      class: `tile-svg ${fixed ? "is-fixed" : "is-movable"}`,
      viewBox: `-2 -2 ${size + 4} ${size + 4}`,
      role: "img",
      "aria-label": label || "Path tile"
    });
    svgElement("rect", { class: "tile-face", x: 0, y: 0, width: size, height: size }, svg);
    drawCells(svg, tile, { columns: TILE });
    svgElement("rect", { class: "tile-outline", x: 0, y: 0, width: size, height: size }, svg);
    return svg;
  }

  function edgePoint(row, col, bit, cell, originX, originY) {
    return [originX + (col + EDGE[bit][0]) * cell, originY + (row + EDGE[bit][1]) * cell];
  }

  function centrePoint(row, col, cell, originX, originY) {
    return [originX + (col + 0.5) * cell, originY + (row + 0.5) * cell];
  }

  // Polyline through edge midpoints and cell centres for an analysed trace.
  function tracePoints(trace, { cell, originX, originY, lead = 0 }) {
    if (!trace || !trace.steps.length) return [];
    const points = [];
    const first = trace.steps[0];
    const [startX, startY] = edgePoint(first.row, first.col, first.entry, cell, originX, originY);
    const outward = EDGE[first.entry];
    points.push([startX + (outward[0] - 0.5) * 2 * lead, startY + (outward[1] - 0.5) * 2 * lead]);
    points.push([startX, startY]);
    trace.steps.forEach((step) => {
      points.push(centrePoint(step.row, step.col, cell, originX, originY));
      points.push(edgePoint(step.row, step.col, step.exit, cell, originX, originY));
    });
    if (trace.end.type === "exit") {
      const last = points[points.length - 1];
      const direction = EDGE[trace.end.dir];
      points.push([last[0] + (direction[0] - 0.5) * 2 * lead, last[1] + (direction[1] - 0.5) * 2 * lead]);
    }
    return points;
  }

  function pointsToPath(points) {
    return points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join("");
  }

  function crossMark(parent, x, y, size, className = "correction-mark") {
    return svgElement("path", {
      class: className,
      d: `M${x - size} ${y - size}L${x + size} ${y + size}M${x + size} ${y - size}L${x - size} ${y + size}`
    }, parent);
  }

  function outwardPoint(row, col, dir, distance, { cell, originX, originY }) {
    const [x, y] = edgePoint(row, col, dir, cell, originX, originY);
    const [ex, ey] = EDGE[dir];
    return [x + (ex - 0.5) * 2 * distance, y + (ey - 0.5) * 2 * distance];
  }

  // Red correction marks for a failed analysis, in the order they should appear.
  function correctionElements(result, board, geometry) {
    const { cell, originX, originY, lead } = geometry;
    const rules = window.CrosspathRules;
    const marks = [];
    const group = (className = "correction") => {
      const element = svgElement("g", { class: className });
      marks.push(element);
      return element;
    };
    const trace = result.trace;
    if (trace && trace.end.type === "break") {
      const last = trace.steps[trace.steps.length - 1];
      const [x, y] = last
        ? edgePoint(last.row, last.col, last.exit, cell, originX, originY)
        : edgePoint(trace.start.row, trace.start.col, trace.start.dir, cell, originX, originY);
      crossMark(group(), x, y, 8);
    }
    result.mismatches.forEach(({ a, dir }) => {
      const [x, y] = edgePoint(a.row, a.col, dir, cell, originX, originY);
      crossMark(group(), x, y, 6);
    });
    result.touching.forEach(({ a, dir }) => {
      const [x, y] = edgePoint(a.row, a.col, dir, cell, originX, originY);
      const half = cell * 0.32;
      svgElement("path", {
        class: "correction-line",
        d: dir === E
          ? `M${x} ${y - half}L${x - 4} ${y - half / 3}L${x + 4} ${y + half / 3}L${x} ${y + half}`
          : `M${x - half} ${y}L${x - half / 3} ${y - 4}L${x + half / 3} ${y + 4}L${x + half} ${y}`
      }, group());
    });
    const unvisitedCells = new Map();
    result.unvisited.forEach((unit) => {
      const key = `${unit.row},${unit.col}`;
      if (!unvisitedCells.has(key)) unvisitedCells.set(key, { row: unit.row, col: unit.col, mask: 0 });
      const entry = unvisitedCells.get(key);
      if (unit.axis === "v") entry.mask |= N | S;
      else if (unit.axis === "h") entry.mask |= E | W;
      else entry.mask = board[unit.row * rules.SIZE + unit.col];
    });
    unvisitedCells.forEach(({ row, col, mask }) => {
      const element = group("correction unvisited");
      const x = originX + col * cell;
      const y = originY + row * cell;
      svgElement("rect", { class: "unvisited-wash", x: x + 2, y: y + 2, width: cell - 4, height: cell - 4 }, element);
      svgElement("path", { class: "unvisited-ink", d: cellPathData(mask, x, y, cell) }, element);
    });
    result.missingMarkers.forEach((marker) => {
      const { row, col, dir } = rules.markerCell(marker);
      const [x, y] = outwardPoint(row, col, dir, lead, geometry);
      svgElement("circle", { class: "correction-ring", cx: x, cy: y, r: 12 }, group());
    });
    result.extraExits.forEach(({ row, col, dir }) => {
      const [x, y] = outwardPoint(row, col, dir, lead * 0.7, geometry);
      crossMark(group(), x, y, 6);
    });
    if (!trace) {
      result.exits.forEach(({ row, col, dir }) => {
        const [x, y] = outwardPoint(row, col, dir, lead * 0.7, geometry);
        svgElement("circle", { class: "correction-ring", cx: x, cy: y, r: 9 }, group());
      });
    }
    return marks;
  }

  // Board-edge stub and dot marking a required path end.
  function drawMarker(parent, marker, geometry) {
    const { row, col, dir } = window.CrosspathRules.markerCell(marker);
    const edge = edgePoint(row, col, dir, geometry.cell, geometry.originX, geometry.originY);
    const outer = outwardPoint(row, col, dir, geometry.lead, geometry);
    const group = svgElement("g", { class: "end-marker" }, parent);
    svgElement("path", { class: "marker-stub", d: `M${edge[0]} ${edge[1]}L${outer[0]} ${outer[1]}` }, group);
    svgElement("circle", { class: "marker-dot", cx: outer[0], cy: outer[1], r: 6.5 }, group);
    svgElement("title", {}, group).textContent = "A path end";
    return { group, outer };
  }

  window.CrosspathRender = {
    EDGE,
    SVG_NS,
    cellPathData,
    centrePoint,
    correctionElements,
    crossMark,
    drawCells,
    drawMarker,
    edgePoint,
    outwardPoint,
    pointsToPath,
    svgElement,
    tileSvg,
    tracePoints
  };
})();

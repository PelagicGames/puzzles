// Copyright (C) 2026 Pelagic Games

(() => {
  const rules = window.CrosspathRules;
  const render = window.CrosspathRender;
  const progress = window.CrosspathProgress;
  const levels = window.CrosspathLevels;
  const { svgElement } = render;

  const requested = Number(new URLSearchParams(window.location.search).get("level") || 1);
  const levelNumber = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const level = levels[levelNumber - 1];
  if (!level) {
    window.location.replace("./puzzles.html");
    return;
  }

  const CELL = 40;
  const TILE_SIZE = CELL * rules.TILE;
  const GRID = CELL * rules.SIZE;
  const MARGIN = 34;
  const VIEW = GRID + MARGIN * 2;
  const LEAD = MARGIN * 0.62;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const difficulty = progress.difficulties.find(({ id }) => id === level.difficulty);
  const bandLevels = levels.filter(({ difficulty: id }) => id === level.difficulty);
  const bandNumber = bandLevels.findIndex(({ code }) => code === level.code) + 1;
  const displayTitle = `${difficulty.label} No. ${bandNumber}`;
  document.title = `${displayTitle} | Crosspath`;
  document.querySelector("#puzzle-title").textContent = displayTitle;
  document.querySelector("#puzzle-number").textContent = `Puzzle ${levelNumber} of ${levels.length}`;
  document.querySelector("#puzzle-position").textContent = `${bandNumber} / ${bandLevels.length}`;

  const puzzle = rules.parseCode(level.code);
  const fixedTileSlot = new Map(puzzle.fixed.map(({ tile, slot }) => [tile, slot]));
  const fixedSlots = new Set(puzzle.fixed.map(({ slot }) => slot));
  const movableTiles = puzzle.tiles.map((_, index) => index).filter((index) => !fixedTileSlot.has(index));
  const startingPlacement = () => {
    const placement = new Array(9).fill(null);
    puzzle.fixed.forEach(({ tile, slot }) => {
      placement[slot] = tile;
    });
    return placement;
  };

  let placement = startingPlacement();
  let selectedTile = null;
  let press = null;
  let animation = { frame: null, timers: [] };

  const board = document.querySelector("#board");
  const tray = document.querySelector("#tray");
  const status = document.querySelector("#status");
  const detail = document.querySelector("#status-detail");
  const boardWrap = document.querySelector("#board-wrap");
  const nextLink = document.querySelector("#next-puzzle");
  // The movable swatch only means something next to the fixed one.
  document.querySelector("#marker-legend").hidden = puzzle.markers.length === 0;
  document.querySelector("#fixed-legend").hidden = puzzle.fixed.length === 0;
  document.querySelector("#movable-legend").hidden = puzzle.fixed.length === 0;
  document.querySelector("#legend").hidden = puzzle.fixed.length === 0 && puzzle.markers.length === 0;

  board.setAttribute("viewBox", `0 0 ${VIEW} ${VIEW}`);
  const defs = svgElement("defs", {}, board);
  const hatch = svgElement("pattern", {
    id: "empty-hatch",
    width: 8,
    height: 8,
    patternUnits: "userSpaceOnUse",
    patternTransform: "rotate(45)"
  }, defs);
  svgElement("line", { class: "hatch-line", x1: 0, y1: 0, x2: 0, y2: 8 }, hatch);
  svgElement("rect", { class: "board-margin", x: 0, y: 0, width: VIEW, height: VIEW }, board);
  const tickData = Array.from({ length: rules.SIZE + 1 }, (_, index) => {
    const offset = MARGIN + index * CELL;
    return `M${offset} ${MARGIN - 6}V${MARGIN}M${offset} ${MARGIN + GRID}V${MARGIN + GRID + 6}`
      + `M${MARGIN - 6} ${offset}H${MARGIN}M${MARGIN + GRID} ${offset}H${MARGIN + GRID + 6}`;
  }).join("");
  svgElement("path", { class: "boundary-ticks", d: tickData }, board);
  const slotLayer = svgElement("g", { class: "slot-layer" }, board);
  const blockData = [1, 2].map((index) => {
    const offset = MARGIN + index * TILE_SIZE;
    return `M${offset} ${MARGIN}V${MARGIN + GRID}M${MARGIN} ${offset}H${MARGIN + GRID}`;
  }).join("");
  svgElement("path", { class: "block-rules", d: blockData }, board);
  svgElement("rect", { class: "board-frame", x: MARGIN, y: MARGIN, width: GRID, height: GRID }, board);
  const markerLayer = svgElement("g", { class: "marker-layer" }, board);
  // Drawn in SVG rather than as a CSS outline so it sits on top of the board rules, matches the
  // slot exactly and ignores path stubs that overhang the slot's bounding box.
  const focusRing = svgElement("rect", {
    class: "slot-focus-ring",
    width: TILE_SIZE,
    height: TILE_SIZE,
    visibility: "hidden"
  }, board);
  const dropTarget = svgElement("rect", {
    class: "drop-target",
    width: TILE_SIZE,
    height: TILE_SIZE,
    visibility: "hidden"
  }, board);
  const traceLayer = svgElement("g", { class: "trace-layer" }, board);
  const marksLayer = svgElement("g", { class: "marks-layer" }, board);

  const slotGroups = Array.from({ length: 9 }, (_, slot) => {
    const origin = rules.slotOrigin(slot);
    const group = svgElement("g", {
      class: "slot",
      "data-slot": slot,
      transform: `translate(${MARGIN + origin.col * CELL} ${MARGIN + origin.row * CELL})`
    }, slotLayer);
    if (!fixedSlots.has(slot)) {
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
    }
    return group;
  });

  const geometry = { cell: CELL, originX: MARGIN, originY: MARGIN, lead: LEAD };
  const markerElements = puzzle.markers.map((marker) => ({
    marker,
    ...render.drawMarker(markerLayer, marker, geometry)
  }));

  function slotOfTile(tile) {
    const slot = placement.indexOf(tile);
    return slot < 0 ? null : slot;
  }

  function tileLabel(tile) {
    return `Tile ${movableTiles.indexOf(tile) + 1}`;
  }

  function renderSlots() {
    slotGroups.forEach((group, slot) => {
      group.replaceChildren();
      const tile = placement[slot];
      const fixed = fixedSlots.has(slot);
      group.classList.toggle("is-empty", tile === null);
      group.classList.toggle("is-fixed", fixed);
      group.classList.toggle("is-movable", tile !== null && !fixed);
      group.classList.toggle("is-selected", tile !== null && tile === selectedTile);
      if (tile === null) {
        svgElement("rect", { class: "slot-empty", width: TILE_SIZE, height: TILE_SIZE }, group);
        svgElement("rect", { class: "slot-hatch", width: TILE_SIZE, height: TILE_SIZE, fill: "url(#empty-hatch)" }, group);
        render.drawCells(group, new Array(9).fill(null), { columns: 3, cell: CELL });
        group.setAttribute("aria-label", `Slot ${slot + 1}, empty${selectedTile !== null ? `. Place ${tileLabel(selectedTile)} here` : ""}`);
        return;
      }
      svgElement("rect", { class: "tile-face", width: TILE_SIZE, height: TILE_SIZE }, group);
      render.drawCells(group, puzzle.tiles[tile], { columns: 3, cell: CELL });
      if (fixed) {
        svgElement("title", {}, group).textContent = "Fixed tile";
      } else {
        group.setAttribute("aria-label", `Slot ${slot + 1}, ${tileLabel(tile)}${tile === selectedTile ? ", selected" : ""}`);
      }
    });
  }

  function renderTray() {
    const focused = document.activeElement && document.activeElement.closest
      ? document.activeElement.closest(".tray-tile")
      : null;
    const focusedTile = focused ? focused.dataset.tile : null;
    tray.replaceChildren();
    movableTiles.forEach((tile) => {
      const hole = document.createElement("div");
      hole.className = "tray-hole";
      if (slotOfTile(tile) === null) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tray-tile";
        button.dataset.tile = tile;
        button.classList.toggle("is-selected", selectedTile === tile);
        button.setAttribute("aria-pressed", String(selectedTile === tile));
        button.setAttribute("aria-label", `${tileLabel(tile)}${selectedTile === tile ? ", selected" : ""}`);
        button.append(render.tileSvg(puzzle.tiles[tile], { label: tileLabel(tile) }));
        hole.append(button);
      }
      tray.append(hole);
    });
    if (focusedTile !== null) {
      const restored = tray.querySelector(`[data-tile="${focusedTile}"]`);
      if (restored) restored.focus();
    }
  }

  function placedCount() {
    return movableTiles.filter((tile) => slotOfTile(tile) !== null).length;
  }

  function renderAll() {
    renderSlots();
    renderTray();
    document.querySelector("#return-button").disabled = selectedTile === null || slotOfTile(selectedTile) === null;
  }

  function setStatus(text, tone = "neutral", lines = []) {
    status.textContent = text;
    status.dataset.tone = tone;
    detail.replaceChildren(...lines.map((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      return item;
    }));
    detail.hidden = lines.length === 0;
  }

  function cancelAnimation() {
    if (animation.frame !== null) window.cancelAnimationFrame(animation.frame);
    animation.timers.forEach((timer) => window.clearTimeout(timer));
    animation = { frame: null, timers: [] };
    traceLayer.replaceChildren();
    marksLayer.replaceChildren();
    boardWrap.classList.remove("is-solved", "has-errors", "is-checking");
    markerElements.forEach(({ group }) => group.classList.remove("is-missing"));
  }

  function moveTile(tile, target) {
    const from = slotOfTile(tile);
    if (target !== null && fixedSlots.has(target)) return false;
    if (target === from) return false;
    if (target === null) {
      if (from === null) return false;
      placement[from] = null;
    } else {
      const occupant = placement[target];
      placement[target] = tile;
      if (from !== null) placement[from] = occupant;
    }
    selectedTile = null;
    afterChange();
    return true;
  }

  function afterChange() {
    cancelAnimation();
    renderAll();
    const placed = placedCount();
    if (placed === movableTiles.length) {
      checkBoard();
    } else {
      setStatus(`${placed} of ${movableTiles.length} tiles placed.`);
    }
  }

  function flashLocked(slot) {
    const group = slotGroups[slot];
    group.classList.remove("is-locked");
    void group.getBoundingClientRect();
    group.classList.add("is-locked");
    setStatus("That tile is fixed in place.", "neutral");
  }

  function select(tile) {
    selectedTile = selectedTile === tile ? null : tile;
    renderAll();
    if (selectedTile !== null) {
      setStatus(`${tileLabel(selectedTile)} selected. Choose a space on the board${slotOfTile(selectedTile) !== null ? ", or the tray to remove it" : ""}.`);
    } else {
      setStatus(`${placedCount()} of ${movableTiles.length} tiles placed.`);
    }
  }

  function tapSlot(slot) {
    if (fixedSlots.has(slot)) {
      flashLocked(slot);
      return;
    }
    const occupant = placement[slot];
    if (selectedTile !== null && selectedTile !== occupant) {
      moveTile(selectedTile, slot);
      return;
    }
    if (occupant !== null) select(occupant);
  }

  // ---- Pointer dragging -------------------------------------------------

  function slotAtPoint(clientX, clientY) {
    const rect = board.getBoundingClientRect();
    const scale = VIEW / rect.width;
    const x = (clientX - rect.left) * scale - MARGIN;
    const y = (clientY - rect.top) * scale - MARGIN;
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return null;
    return Math.floor(y / TILE_SIZE) * 3 + Math.floor(x / TILE_SIZE);
  }

  function overTray(clientX, clientY) {
    const rect = document.querySelector("#tray-panel").getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function beginPress(event, info) {
    if (event.button !== undefined && event.button !== 0) return;
    press = { ...info, x: event.clientX, y: event.clientY, pointerId: event.pointerId, dragging: false, ghost: null, scrollFrame: null };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startDrag() {
    press.dragging = true;
    const size = board.getBoundingClientRect().width * (TILE_SIZE / VIEW);
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.style.width = `${size}px`;
    ghost.style.height = `${size}px`;
    ghost.append(render.tileSvg(puzzle.tiles[press.tile]));
    document.body.append(ghost);
    press.ghost = ghost;
    press.size = size;
    document.body.classList.add("is-dragging");
    const source = slotOfTile(press.tile);
    if (source !== null) slotGroups[source].classList.add("is-drag-source");
    const button = tray.querySelector(`[data-tile="${press.tile}"]`);
    if (button) button.classList.add("is-drag-source");
  }

  function updateDrag(event) {
    press.lastX = event.clientX;
    press.lastY = event.clientY;
    const { ghost, size } = press;
    ghost.style.transform = `translate(${event.clientX - size / 2}px, ${event.clientY - size / 2}px) rotate(-2deg)`;
    updateDropTarget();
    if (press.scrollFrame === null) press.scrollFrame = requestAnimationFrame(autoScroll);
  }

  function updateDropTarget() {
    const slot = slotAtPoint(press.lastX, press.lastY);
    if (slot === null) {
      dropTarget.setAttribute("visibility", "hidden");
      return;
    }
    const origin = rules.slotOrigin(slot);
    dropTarget.setAttribute("x", MARGIN + origin.col * CELL);
    dropTarget.setAttribute("y", MARGIN + origin.row * CELL);
    dropTarget.setAttribute("visibility", "visible");
    dropTarget.classList.toggle("is-blocked", fixedSlots.has(slot));
  }

  // Scrolls the page while a dragged piece is held near the top or bottom of the viewport, so
  // pieces can be dragged between the tray and the board on small screens.
  const SCROLL_EDGE = 72;
  const SCROLL_MAX_SPEED = 18;

  function autoScroll() {
    if (!press || !press.dragging) return;
    press.scrollFrame = null;
    const viewport = window.visualViewport;
    const top = viewport ? viewport.offsetTop : 0;
    const height = viewport ? viewport.height : window.innerHeight;
    const edge = Math.min(SCROLL_EDGE, height / 5);
    const fromTop = press.lastY - top;
    const fromBottom = top + height - press.lastY;
    let speed = 0;
    if (fromTop < edge) speed = -SCROLL_MAX_SPEED * Math.min(1, (edge - fromTop) / edge);
    else if (fromBottom < edge) speed = SCROLL_MAX_SPEED * Math.min(1, (edge - fromBottom) / edge);
    if (!speed) return;
    const before = window.scrollY;
    window.scrollBy(0, Math.round(speed) || Math.sign(speed));
    if (window.scrollY === before) return;
    updateDropTarget();
    press.scrollFrame = requestAnimationFrame(autoScroll);
  }

  function endDrag() {
    if (press && press.scrollFrame) cancelAnimationFrame(press.scrollFrame);
    if (press && press.ghost) press.ghost.remove();
    document.body.classList.remove("is-dragging");
    dropTarget.setAttribute("visibility", "hidden");
    document.querySelectorAll(".is-drag-source").forEach((element) => element.classList.remove("is-drag-source"));
  }

  function handlePointerMove(event) {
    if (!press || event.pointerId !== press.pointerId) return;
    if (!press.dragging) {
      if (press.tile === null) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < 6) return;
      startDrag();
    }
    event.preventDefault();
    updateDrag(event);
  }

  function handlePointerUp(event) {
    if (!press || event.pointerId !== press.pointerId) return;
    const current = press;
    endDrag();
    press = null;
    if (current.dragging) {
      const slot = slotAtPoint(event.clientX, event.clientY);
      if (slot !== null) {
        if (fixedSlots.has(slot)) flashLocked(slot);
        else moveTile(current.tile, slot);
      } else if (slotOfTile(current.tile) !== null) {
        moveTile(current.tile, null);
      }
      return;
    }
    if (current.source === "tray") select(current.tile);
    else if (current.source === "board") tapSlot(current.slot);
  }

  function handlePointerCancel(event) {
    if (!press || event.pointerId !== press.pointerId) return;
    endDrag();
    press = null;
  }

  board.addEventListener("pointerdown", (event) => {
    const slot = slotAtPoint(event.clientX, event.clientY);
    if (slot === null) return;
    const tile = placement[slot];
    const movable = tile !== null && !fixedSlots.has(slot);
    beginPress(event, { source: "board", slot, tile: movable ? tile : null });
  });
  tray.addEventListener("pointerdown", (event) => {
    const button = event.target.closest(".tray-tile");
    if (!button) return;
    beginPress(event, { source: "tray", tile: Number(button.dataset.tile) });
  });
  [board, tray].forEach((element) => {
    element.addEventListener("pointermove", handlePointerMove);
    element.addEventListener("pointerup", handlePointerUp);
    element.addEventListener("pointercancel", handlePointerCancel);
    element.addEventListener("lostpointercapture", handlePointerCancel);
  });

  // Keyboard activation (pointer taps are handled on pointerup).
  tray.addEventListener("click", (event) => {
    if (event.detail !== 0) return;
    const button = event.target.closest(".tray-tile");
    if (button) select(Number(button.dataset.tile));
  });
  // Tapping an empty part of the tray returns a selected board tile to the tray.
  document.querySelector("#tray-panel").addEventListener("pointerup", (event) => {
    if (event.target === tray || event.target.closest(".tray-tile, button") || selectedTile === null) return;
    if (slotOfTile(selectedTile) !== null) moveTile(selectedTile, null);
  });
  document.querySelector("#return-button").addEventListener("click", () => {
    if (selectedTile !== null && slotOfTile(selectedTile) !== null) moveTile(selectedTile, null);
  });
  board.addEventListener("focusin", (event) => {
    const group = event.target.closest(".slot");
    if (!group || !group.matches(":focus-visible")) return;
    const origin = rules.slotOrigin(Number(group.dataset.slot));
    focusRing.setAttribute("x", MARGIN + origin.col * CELL);
    focusRing.setAttribute("y", MARGIN + origin.row * CELL);
    focusRing.setAttribute("visibility", "visible");
  });
  board.addEventListener("focusout", () => {
    focusRing.setAttribute("visibility", "hidden");
  });
  board.addEventListener("keydown", (event) => {
    const group = event.target.closest(".slot");
    if (!group) return;
    const slot = Number(group.dataset.slot);
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      tapSlot(slot);
    } else if ((event.key === "Delete" || event.key === "Backspace") && placement[slot] !== null && !fixedSlots.has(slot)) {
      event.preventDefault();
      moveTile(placement[slot], null);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selectedTile !== null) select(selectedTile);
  });
  document.querySelector("#reset-button").addEventListener("click", () => {
    placement = startingPlacement();
    selectedTile = null;
    afterChange();
  });

  // ---- Checking and animation -------------------------------------------

  function issueLines(result) {
    const lines = [];
    const exitCount = result.exits.length;
    if (exitCount === 0) lines.push("The path never reaches the edge of the board.");
    else if (exitCount === 1) lines.push("The path reaches the edge only once; it needs a start and an end.");
    else if (exitCount > 2) lines.push(`The path reaches the edge ${exitCount} times; it must reach it exactly twice.`);
    if (result.missingMarkers.length) {
      lines.push(result.missingMarkers.length === 1
        ? "The path does not reach the marked end."
        : "The path does not reach either marked end.");
    }
    if (result.extraExits.length && puzzle.markers.length === 2 && exitCount <= 2) {
      lines.push("The path reaches the edge away from the marked ends.");
    }
    if (result.trace && result.trace.end.type === "break") {
      lines.push("The trace runs into a dead end where the path does not line up.");
    } else if (result.mismatches.length) {
      lines.push("Some path elements do not line up across a tile edge.");
    }
    if (result.touching.length) {
      lines.push("Paths run side by side without connecting.");
    }
    if (result.unvisited.length) {
      const count = new Set(result.unvisited.map(({ row, col }) => `${row},${col}`)).size;
      lines.push(`${count} path ${count === 1 ? "square is" : "squares are"} not on the route between the two ends.`);
    }
    return lines;
  }

  function showCorrections(result) {
    boardWrap.classList.add("has-errors");
    const composed = rules.composeBoard(puzzle.tiles, placement);
    const step = reducedMotion ? 0 : 80;
    render.correctionElements(result, composed, geometry).forEach((element, index) => {
      element.style.animationDelay = `${index * step}ms`;
      marksLayer.append(element);
    });
    result.missingMarkers.forEach((marker) => {
      const key = rules.formatMarker(marker);
      const element = markerElements.find(({ marker: other }) => rules.formatMarker(other) === key);
      if (element) element.group.classList.add("is-missing");
    });
    setStatus("Not quite. The red marks show where the path goes wrong; move a tile to try again.", "error", issueLines(result));
  }

  function celebrate(result) {
    boardWrap.classList.add("is-solved");
    const wasCompleted = progress.isCompleted(level.code);
    progress.markCompleted(level.code);
    const length = result.trace.steps.length;
    setStatus(
      `Solved! The path runs ${length} squares from ${result.trace.start.key} to ${result.trace.end.key}.`,
      "success",
      wasCompleted ? [] : ["Puzzle recorded as complete."]
    );
    updateNextLink();
  }

  function drawTrace(result, onDone) {
    const points = render.tracePoints(result.trace, { cell: CELL, originX: MARGIN, originY: MARGIN, lead: LEAD });
    if (points.length < 2) {
      onDone();
      return;
    }
    const pathElement = svgElement("path", {
      class: `pen-trace ${result.solved ? "is-success" : "is-attempt"}`,
      d: render.pointsToPath(points)
    }, traceLayer);
    const nib = svgElement("circle", { class: "pen-nib", r: 4.5 }, traceLayer);
    const total = pathElement.getTotalLength();
    pathElement.style.strokeDasharray = `${total} ${total}`;
    const duration = reducedMotion ? 0 : Math.min(5200, Math.max(1400, result.trace.steps.length * 75));
    const started = performance.now();
    function frame(now) {
      const progressRatio = duration === 0 ? 1 : Math.min(1, (now - started) / duration);
      const drawn = total * progressRatio;
      pathElement.style.strokeDashoffset = String(total - drawn);
      const tip = pathElement.getPointAtLength(drawn);
      nib.setAttribute("cx", tip.x);
      nib.setAttribute("cy", tip.y);
      if (progressRatio < 1) {
        animation.frame = window.requestAnimationFrame(frame);
        return;
      }
      animation.frame = null;
      nib.remove();
      onDone();
    }
    animation.frame = window.requestAnimationFrame(frame);
  }

  function checkBoard() {
    const composed = rules.composeBoard(puzzle.tiles, placement);
    const result = rules.analyseBoard(composed, puzzle.markers);
    boardWrap.classList.add("is-checking");
    setStatus(result.trace ? "All tiles placed. Tracing the path\u2026" : "All tiles placed. Checking\u2026");
    drawTrace(result, () => {
      boardWrap.classList.remove("is-checking");
      if (result.solved) celebrate(result);
      else showCorrections(result);
    });
  }

  function updateNextLink() {
    if (!progress.isCompleted(level.code)) {
      nextLink.hidden = true;
      return;
    }
    const next = progress.nextUnsolved(levels, level.code);
    if (!next) {
      nextLink.hidden = true;
      return;
    }
    nextLink.href = `./puzzle.html?level=${next.index + 1}`;
    nextLink.hidden = false;
  }

  renderAll();
  setStatus(`0 of ${movableTiles.length} tiles placed.`);
  updateNextLink();
})();

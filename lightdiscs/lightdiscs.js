// Copyright (C) 2026 Pelagic Games
/**
 * Interactive SVG board for random.html, design.html and catalogue puzzle.html.
 * Requires filter-composition.js, game-geometry.js, puzzle-code.js and puzzle-math.js
 * plus the board DOM; puzzle.js injects this file after configuring body data.
 * Reads data-puzzle-code/data-combination, mutates SVG/UI and publishes
 * LightDiscGame. Emits lightdiscs:solved with {code}; persistence is the page
 * controller's responsibility. No CLI or direct file/storage writes.
 */

(() => {
  const svg = document.querySelector(".interaction-board");
  const resetButton = document.querySelector("#reset-button");
  const successIndicator = document.querySelector("#success-indicator");
  const piecesLayer = document.querySelector("#pieces");
  const pieceDiscsLayer = document.querySelector("#piece-discs");
  const filterRender = document.querySelector("#filter-render");
  const targetDiscsLayer = document.querySelector("#target-discs");
  const progressIndicator = document.querySelector("#progress-indicator");
  const targetInspector = document.querySelector("#target-inspector");
  const targetInspectorTitle = document.querySelector("#target-inspector-title");
  const targetInspectorStatus = document.querySelector("#target-inspector-status");
  const targetPreview = document.querySelector("#target-preview");
  const currentPreview = document.querySelector("#current-preview");
  const boardScroll = document.querySelector(".board-scroll");
  const boardSurface = document.querySelector(".board-surface");
  const namespace = "http://www.w3.org/2000/svg";
  const {
    contrastOutlineColour,
    filterCompositionMarkup,
    needsContrastOutline
  } = window.LightDiscRendering;
  const {
    expandedTrianglesOverlap,
    nearestValidPlacement
  } = window.LightDiscGeometry;
  const { parsePuzzleCode } = window.LightDiscPuzzleCode;
  const {
    formationMask,
    formationsMatch,
    isPossibleAssignment,
    shapeExpression,
    shapeKeys
  } = window.LightDiscMath;
  let puzzleDefinition = document.body.dataset.puzzleCode
    ? parsePuzzleCode(document.body.dataset.puzzleCode)
    : null;
  const combination = document.body.dataset.combination || "standard";
  // Board coordinates remain fixed in SVG units; page zoom changes the CSS surface,
  // while pointer positions are transformed back through the screen matrix.
  const initialPixelRatio = window.devicePixelRatio || 1;
  const boardWidth = 1000;
  const boardHeight = 950;
  const cornerRadius = 105;
  const corners = [
    { x: 0, y: -cornerRadius },
    { x: -cornerRadius * Math.sqrt(3) / 2, y: cornerRadius / 2 },
    { x: cornerRadius * Math.sqrt(3) / 2, y: cornerRadius / 2 }
  ];
  const fixedPosition = { x: 500, y: 440 };
  // Smaller central target displays sit between the full-size fixed corner discs.
  const targetCornerRadius = 35;
  const targetCorners = [
    { x: 0, y: -targetCornerRadius },
    {
      x: -targetCornerRadius * Math.sqrt(3) / 2,
      y: targetCornerRadius / 2
    },
    {
      x: targetCornerRadius * Math.sqrt(3) / 2,
      y: targetCornerRadius / 2
    }
  ];
  const discRadius = 38;
  const targetRadius = 28;
  const largeShapeRadius = 30;
  const smallShapeRadius = 12;
  const squareHalfSize = 21;
  const triangleRadius = 28;
  const triangleHalfWidth = triangleRadius * Math.sqrt(3) / 2;
  const triangleBaseY = triangleRadius / 2;
  // Snap detection uses centre distance. Squared overlap thresholds avoid repeated
  // square roots during dragging; triangle padding reserves space for disc edges.
  const snapDistance = discRadius * 2;
  const filterOverlapCentreDistance = cornerRadius * 2 + discRadius * 2;
  const filterOverlapCentreDistanceSquared = filterOverlapCentreDistance ** 2;
  const filterOverlapDistanceSquared = (discRadius * 2) ** 2;
  const trianglePadding = discRadius + 5.5;
  const trianglePath = roundedTrianglePath(corners, discRadius + 4);
  // Array indices equal RGB bitmasks (red=4, green=2, blue=1).
  const filterColors = [
    { name: "black", value: "#000000", mask: 0 },
    { name: "blue", value: "#0000ff", mask: 1 },
    { name: "green", value: "#00ff00", mask: 2 },
    { name: "cyan", value: "#00ffff", mask: 3 },
    { name: "red", value: "#ff0000", mask: 4 },
    { name: "magenta", value: "#ff00ff", mask: 5 },
    { name: "yellow", value: "#ffff00", mask: 6 },
    { name: "white", value: "#ffffff", mask: 7 }
  ];
  const shapeTypes = [
    { name: "no shape", value: "none" },
    { name: "square", value: "square" },
    { name: "12-pointed star", value: "square-star" },
    { name: "equilateral triangle", value: "triangle" },
    { name: "six-pointed star", value: "triangle-star" },
    { name: "large disc", value: "large-disc" },
    { name: "small disc", value: "small-disc" },
    { name: "annulus", value: "annulus" }
  ];
  // Compact-code alphabets must agree with puzzle-code.js and the offline tools.
  const colourCodes = ["k", "b", "g", "c", "r", "m", "y", "w"];
  const shapeCodes = {
    none: "n",
    square: "s",
    triangle: "t",
    "large-disc": "l",
    "small-disc": "d",
    annulus: "a",
    "square-star": "v",
    "triangle-star": "x"
  };
  // Random target designs use at least five total snaps; player solutions need not.
  const snapDistributions = [
    [1, 1, 3],
    [1, 2, 2],
    [1, 2, 3],
    [1, 3, 3],
    [2, 2, 2],
    [2, 2, 3],
    [2, 3, 3],
    [3, 3, 3]
  ];
  const pieceDefinitions = [
    { name: "Red", color: "#ff3b4f", home: { x: 150, y: 160 } },
    { name: "Green", color: "#35e86f", home: { x: 850, y: 160 } },
    { name: "Blue", color: "#4285ff", home: { x: 300, y: 790 } }
  ];
  // Formations contain exact coincident {filter, angle} contributions for matching.
  // Visuals include nearby overlapping discs as {filter, angle, x, y} for previews.
  let targetFormations = [];
  let targetVisuals = [];
  let currentFormations = [];
  let currentVisuals = [];
  let inspectedTargetIndex = null;
  let inspectorPinned = false;
  // A drag snapshots pose, bounds, screen transform and stationary disc obstacles.
  // A pan instead snapshots scroll offsets. Pointer IDs keep their streams separate.
  let activeDrag = null;
  let activePan = null;
  let dragUpdateFrame = null;
  // Appearance signatures govern SVG rebuilds; geometry caches permit transform-only
  // updates. Cached element lists may contain several nodes for each logical layer.
  let renderedFilterSignature = "";
  let renderedFilterGeometry = [];
  let filterLayerCircles = [];
  let filterLayerMasks = [];
  let filterLayerOutlines = [];
  // Emit once per transition into solved, allowing a later unsolve/solve cycle.
  let reportedSolvedState = false;
  // Quality states trade boundary aids for drag throughput; timing evidence and
  // cooldown prevent rapid oscillation. XOR does not use this adaptive sampling.
  let contrastQuality = "targets-only";
  let dragCapabilitySamples = [];
  let previousDragFrameTime = null;
  let adaptationDirection = null;
  let adaptationEvidence = 0;
  let adaptationCooldown = 0;

  document.querySelector(".triangle-path").setAttribute("d", trianglePath);
  svg.dataset.contrastQuality = contrastQuality;
  addFixedDiscs();
  const targetDisplays = createTargetDisplays();

  /**
   * @param {string} tag - SVG element name.
   * @param {Object} attributes - Attribute values to set on creation.
   * @returns {SVGElement} Detached namespaced element.
   */
  function createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS(namespace, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    return element;
  }

  /**
   * Offset edges outwards and join them with circular arcs about each vertex.
   * @param {Object[]} vertices - Ordered local triangle corners.
   * @param {number} radius - Outward rounding radius.
   * @returns {string} Closed SVG path data.
   */
  function roundedTrianglePath(vertices, radius) {
    const segments = vertices.map((vertex, index) => {
      const previous = vertices[(index + vertices.length - 1) % vertices.length];
      const next = vertices[(index + 1) % vertices.length];
      const incoming = outwardNormal(previous, vertex);
      const outgoing = outwardNormal(vertex, next);
      return {
        start: {
          x: vertex.x + incoming.x * radius,
          y: vertex.y + incoming.y * radius
        },
        end: {
          x: vertex.x + outgoing.x * radius,
          y: vertex.y + outgoing.y * radius
        }
      };
    });
    const commands = [`M ${segments[0].start.x} ${segments[0].start.y}`];
    segments.forEach((segment, index) => {
      if (index > 0) commands.push(`L ${segment.start.x} ${segment.start.y}`);
      commands.push(`A ${radius} ${radius} 0 0 0 ${segment.end.x} ${segment.end.y}`);
    });
    commands.push("Z");
    return commands.join(" ");
  }

  /**
   * @param {Object} start - Directed edge start.
   * @param {Object} end - Directed edge end.
   * @returns {Object} Unit left normal, outward for the board's vertex order.
   */
  function outwardNormal(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    return { x: -dy / length, y: dx / length };
  }

  /**
   * Append full-size white reference discs to the fixed triangle layer.
   * @returns {void}
   */
  function addFixedDiscs() {
    const layer = document.querySelector(".fixed-discs");
    corners.forEach((corner) => {
      layer.append(createSvgElement("circle", {
        class: "fixed-disc filter-disc",
        cx: corner.x,
        cy: corner.y,
        r: discRadius
      }));
    });
  }

  /**
   * Append keyboard-focusable target controls and register preview/pinning listeners.
   * @returns {Object[]} Display records containing root, image and cached imageUrl.
   */
  function createTargetDisplays() {
    return targetCorners.map((position, index) => {
      const root = createSvgElement("g", {
        class: "target-pattern is-unmatched",
        transform: `translate(${position.x} ${position.y})`,
        role: "button",
        tabindex: "0",
        "aria-label": `Target pattern ${index + 1}, not matched`
      });
      const image = createSvgElement("image", {
        class: "target-image",
        x: -targetRadius,
        y: -targetRadius,
        width: targetRadius * 2,
        height: targetRadius * 2
      });
      const hitArea = createSvgElement("circle", {
        class: "target-hit-area",
        r: targetRadius + 4
      });
      const outline = createSvgElement("circle", {
        class: "target-disc",
        r: targetRadius
      });
      root.append(image, hitArea, outline);
      targetDiscsLayer.append(root);
      // Hover/focus previews are transient; click or activation keys pin them.
      // Escape dismisses, and propagation is stopped so pinning is not an outside click.
      root.addEventListener("pointerenter", () => showTargetInspector(index));
      root.addEventListener("pointerleave", () => {
        if (!inspectorPinned) hideTargetInspector();
      });
      root.addEventListener("focus", () => showTargetInspector(index));
      root.addEventListener("blur", () => {
        if (!inspectorPinned) hideTargetInspector();
      });
      root.addEventListener("click", (event) => {
        event.stopPropagation();
        if (inspectorPinned && inspectedTargetIndex === index) {
          hideTargetInspector();
          return;
        }
        inspectorPinned = true;
        showTargetInspector(index);
      });
      root.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          hideTargetInspector();
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inspectorPinned = !inspectorPinned || inspectedTargetIndex !== index;
          if (inspectorPinned) showTargetInspector(index);
          else hideTargetInspector();
        }
      });
      return { root, image, imageUrl: "" };
    });
  }

  /**
   * Append separate hit-body, disc and rotation-control layers and attach input handlers.
   * @param {Object} definition - Name, colour and home position.
   * @param {number} index - Piece index used by controls and filter-layer ordering.
   * @returns {Object} Mutable piece state and its SVG element references.
   */
  function createPiece(definition, index) {
    const root = createSvgElement("g", {
      class: "piece",
      style: `--piece-color: ${definition.color}`
    });
    const shape = createSvgElement("g", {
      class: "piece-shape",
      role: "button",
      tabindex: "0",
      "aria-label": `Drag the ${definition.name.toLowerCase()} triangle`
    });
    shape.append(createSvgElement("path", { class: "piece-triangle", d: trianglePath }));

    const discs = createSvgElement("g", { class: "piece-disc-set" });
    const discElements = corners.map((corner) => createPatternDisc(discs, corner));
    const controls = createSvgElement("g", {
      class: "rotation-controls",
      "aria-label": `${definition.name} triangle rotation controls`
    });
    controls.append(
      createRotateButton(index, -1, -31, "Rotate anticlockwise"),
      createRotateButton(index, 1, 31, "Rotate clockwise")
    );
    root.append(shape, controls);
    piecesLayer.append(root);
    pieceDiscsLayer.append(discs);

    // position/angle/snapped are the live pose; discFilters are logical filters.
    // Body and disc groups are separated so the combined filter SVG can sit between.
    const piece = {
      root,
      shape,
      discs,
      discElements,
      discFilters: [],
      controls,
      home: definition.home,
      index,
      position: { ...definition.home },
      angle: 0,
      snapped: false
    };
    shape.addEventListener("pointerdown", (event) => beginDrag(event, piece));
    shape.addEventListener("keydown", (event) => movePieceWithKeyboard(event, piece));
    updatePiece(piece);
    return piece;
  }

  /**
   * @param {SVGElement} parent - Disc group to append into.
   * @param {Object} corner - Local disc centre.
   * @returns {Object} Appended root, background circle and pattern group references.
   */
  function createPatternDisc(parent, corner) {
    const root = createSvgElement("g", {
      class: "piece-filter filter-disc",
      transform: `translate(${corner.x} ${corner.y})`
    });
    const background = createSvgElement("circle", {
      class: "piece-disc",
      r: discRadius
    });
    const pattern = createSvgElement("g", { class: "filter-pattern" });
    root.append(background, pattern);
    parent.append(root);
    return { root, background, pattern };
  }

  /**
   * Build a focusable SVG control with click and Enter/Space activation.
   * @param {number} pieceIndex - Controlled piece.
   * @param {number} direction - Signed 60-degree step.
   * @param {number} x - Local horizontal control offset.
   * @param {string} label - Accessible action name.
   * @returns {SVGElement} Detached rotation button.
   */
  function createRotateButton(pieceIndex, direction, x, label) {
    const button = createSvgElement("g", {
      class: "rotate-button",
      role: "button",
      tabindex: "0",
      transform: `translate(${x} 0)`,
      "aria-label": label,
      "data-piece": pieceIndex,
      "data-direction": direction
    });
    button.append(
      createSvgElement("circle", { r: 24 }),
      createSvgElement("text", {
        x: direction < 0 ? -1 : 1,
        y: 11,
        "text-anchor": "middle"
      })
    );
    button.querySelector("text").textContent = direction < 0 ? "\u21B6" : "\u21B7";
    button.addEventListener("click", rotatePiece);
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      rotatePiece.call(button);
    });
    return button;
  }

  const pieces = pieceDefinitions.map(createPiece);

  /**
   * Arrow keys move a free piece; a snapped piece first returns home. Shift enlarges
   * the step. Invalid central overlap restores the prior pose; refreshes status.
   * @param {KeyboardEvent} event - Keydown event, consumed for recognised arrows.
   * @param {Object} piece - Mutable piece.
   * @returns {void}
   */
  function movePieceWithKeyboard(event, piece) {
    const step = event.shiftKey ? 20 : 8;
    const movement = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step }
    }[event.key];
    if (!movement) return;
    event.preventDefault();
    const previous = pieceState(piece);
    if (piece.snapped) piece.position = { ...piece.home };
    piece.snapped = false;
    piece.position.x += movement.x;
    piece.position.y += movement.y;
    constrainPiecePosition(piece);
    if (!isSafeFreePlacement(piece)) restorePieceState(piece, previous);
    updatePiece(piece);
    updateSuccess();
  }

  /**
   * Rotate only a free triangle, reverting unsafe placements and refreshing the UI.
   * Uses the event's currentTarget or a button supplied as this for keyboard calls.
   * @param {Event} [event] - Optional click event whose propagation is stopped.
   * @returns {void}
   */
  function rotatePiece(event) {
    event?.stopPropagation();
    const button = event?.currentTarget || this;
    const piece = pieces[Number(button.dataset.piece)];
    if (piece.snapped) return;
    const previous = pieceState(piece);
    piece.angle = (piece.angle + Number(button.dataset.direction) * 60 + 360) % 360;
    constrainPiecePosition(piece);
    if (!isSafeFreePlacement(piece)) restorePieceState(piece, previous);
    updatePiece(piece);
    updateSuccess();
  }

  /**
   * Capture a primary pointer and cache invariant geometry for cheap drag frames.
   * Unsnaps the piece, hides its composited filters and switches drag display state.
   * @param {PointerEvent} event - Pointer-down event.
   * @param {Object} piece - Mutable dragged piece.
   * @returns {void}
   */
  function beginDrag(event, piece) {
    if (event.button !== 0) return;
    event.preventDefault();
    const inverseScreenMatrix = svg.getScreenCTM().inverse();
    const pointer = svgPoint(event, inverseScreenMatrix);
    activeDrag = {
      piece,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      previous: pieceState(piece),
      bounds: piecePositionBounds(piece),
      composing: false,
      cornerOffsets: corners.map((corner) => rotatePoint(corner, piece.angle)),
      filterObstacles: pieces
        .filter((other) => other !== piece)
        .map((other) => ({
          position: { ...other.position },
          discCentres: corners.map((corner) => transformedCorner(other, corner))
        })),
      inverseScreenMatrix,
      offset: {
        x: pointer.x - piece.position.x,
        y: pointer.y - piece.position.y
      }
    };
    piece.snapped = false;
    piece.root.classList.remove("is-snapped");
    piece.discs.classList.add("is-dragging");
    svg.classList.add("is-dragging-piece");
    dragCapabilitySamples = [];
    previousDragFrameTime = null;
    hideDraggedFilterLayers(piece);
    svg.setPointerCapture(event.pointerId);
  }

  /**
   * Capture touch gestures on empty board space for manual horizontal/page scrolling.
   * Interactive pieces, rotation controls and targets retain their own gestures.
   * @param {PointerEvent} event - Pointer-down event.
   * @returns {void}
   */
  function beginBoardPan(event) {
    if (event.pointerType !== "touch"
      || event.target.closest(".piece-shape, .rotate-button, .target-pattern")) return;
    activePan = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: boardScroll.scrollLeft,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    };
    svg.setPointerCapture(event.pointerId);
  }

  /**
   * @param {PointerEvent} event - Client-coordinate pointer sample.
   * @param {DOMMatrix} inverseScreenMatrix - Cached inverse screen transform.
   * @returns {DOMPoint} Pointer position in board coordinates.
   */
  function svgPoint(event, inverseScreenMatrix = svg.getScreenCTM().inverse()) {
    const point = new DOMPoint(event.clientX, event.clientY);
    return point.matrixTransform(inverseScreenMatrix);
  }

  /**
   * @param {Object} point - Local x/y coordinate.
   * @param {number} angle - Rotation in degrees.
   * @returns {Object} Rotated coordinate about the origin.
   */
  function rotatePoint(point, angle) {
    const radians = angle * Math.PI / 180;
    return {
      x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
      y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
    };
  }

  /**
   * @param {Object} pose - Position and angle.
   * @param {Object} corner - Local corner.
   * @returns {Object} World-space corner centre.
   */
  function transformedCorner(pose, corner) {
    const rotated = rotatePoint(corner, pose.angle);
    return {
      x: pose.position.x + rotated.x,
      y: pose.position.y + rotated.y
    };
  }

  /**
   * @param {Object} piece - Current piece pose.
   * @returns {Object|null} Closest eligible movingCorner/target/distance record.
   */
  function findSnap(piece) {
    let closest = null;
    corners.forEach((corner) => {
      const movingCorner = transformedCorner(piece, corner);
      corners.forEach((fixedCorner) => {
        const target = {
          x: fixedPosition.x + fixedCorner.x,
          y: fixedPosition.y + fixedCorner.y
        };
        const distance = Math.hypot(target.x - movingCorner.x, target.y - movingCorner.y);
        if (distance <= snapDistance && (!closest || distance < closest.distance)) {
          closest = { movingCorner, target, distance };
        }
      });
    });
    return closest;
  }

  /**
   * Commit a matching drag: snap, accept a free position, bump safely, or restore.
   * Also moves obscured free pieces, cancels queued rendering and updates success.
   * Pointer cancellation follows the same placement policy as release.
   * @param {PointerEvent} event - Release or cancellation event.
   * @returns {void}
   */
  function finishDrag(event) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    const { piece } = activeDrag;
    const snap = findSnap(piece);
    if (snap) {
      piece.position.x += snap.target.x - snap.movingCorner.x;
      piece.position.y += snap.target.y - snap.movingCorner.y;
      piece.snapped = true;
      moveObscuredFreePieces(piece);
    } else if (isSafeFreePlacement(piece)) {
      piece.snapped = false;
    } else if (bumpToSafeFreePlacement(piece)) {
      piece.snapped = false;
    } else {
      restorePieceState(piece, activeDrag.previous);
    }
    svg.classList.remove("is-dragging-piece");
    dragCapabilitySamples = [];
    previousDragFrameTime = null;
    piece.discs.classList.remove("is-dragging");
    updatePiece(piece);
    activeDrag = null;
    if (dragUpdateFrame !== null) {
      cancelAnimationFrame(dragUpdateFrame);
      dragUpdateFrame = null;
    }
    updateSuccess();
  }

  /**
   * Clear only the pan belonging to this pointer.
   * @param {PointerEvent} event - Release or cancellation event.
   * @returns {void}
   */
  function finishBoardPan(event) {
    if (!activePan || event.pointerId !== activePan.pointerId) return;
    activePan = null;
  }

  /**
   * Synchronise body/disc transforms, control position and snapped CSS state.
   * @param {Object} piece - Live piece state.
   * @returns {void}
   */
  function updatePiece(piece) {
    const transform = `translate(${piece.position.x} ${piece.position.y}) rotate(${piece.angle})`;
    piece.shape.setAttribute("transform", transform);
    piece.discs.setAttribute("transform", transform);
    piece.controls.setAttribute("transform", `translate(${piece.position.x} ${piece.position.y})`);
    piece.root.classList.toggle("is-snapped", piece.snapped);
  }

  /**
   * Update only body/disc transforms; rotation controls are hidden during dragging.
   * @param {Object} piece - Dragged piece.
   * @returns {void}
   */
  function updateDraggedPiece(piece) {
    const transform = `translate(${piece.position.x} ${piece.position.y}) rotate(${piece.angle})`;
    piece.shape.setAttribute("transform", transform);
    piece.discs.setAttribute("transform", transform);
  }

  /**
   * Move a piece's composited nodes off-board and invalidate its cached geometry.
   * Standalone disc groups then supply the inexpensive non-overlapping drag visual.
   * @param {Object} piece - Piece whose three layer indices are contiguous.
   * @returns {void}
   */
  function hideDraggedFilterLayers(piece) {
    const firstLayer = piece.index * corners.length;
    const hiddenLayers = new Set(
      corners.map((_, index) => firstLayer + index)
    );
    filterLayerCircles.forEach((circle) => {
      const index = Number(circle.dataset.filterLayer);
      if (!hiddenLayers.has(index)) return;
      circle.setAttribute("cx", -5000);
      circle.setAttribute("cy", -5000);
    });
    filterLayerMasks.forEach((mask) => {
      const index = Number(mask.dataset.filterMaskLayer);
      if (hiddenLayers.has(index)) {
        mask.setAttribute("transform", "translate(-5000 -5000)");
      }
    });
    filterLayerOutlines.forEach((outline) => {
      const index = Number(outline.dataset.filterOutlineLayer);
      if (hiddenLayers.has(index)) {
        outline.setAttribute("transform", "translate(-5000 -5000)");
      }
    });
    hiddenLayers.forEach((index) => {
      renderedFilterGeometry[index] = "";
    });
  }

  /**
   * Test cached stationary discs, rejecting distant triangle centres first.
   * Requires an active drag; does not alter its cached obstacle geometry.
   * @returns {boolean} Whether any dragged disc overlaps another piece's disc.
   */
  function draggedPieceHasFilterOverlap() {
    const { piece, cornerOffsets, filterObstacles } = activeDrag;
    return filterObstacles.some((obstacle) => {
      const centreDx = piece.position.x - obstacle.position.x;
      const centreDy = piece.position.y - obstacle.position.y;
      if (centreDx * centreDx + centreDy * centreDy
        > filterOverlapCentreDistanceSquared) {
        return false;
      }
      return cornerOffsets.some((corner) => {
        const x = piece.position.x + corner.x;
        const y = piece.position.y + corner.y;
        return obstacle.discCentres.some((centre) => {
          const dx = x - centre.x;
          const dy = y - centre.y;
          return dx * dx + dy * dy < filterOverlapDistanceSquared;
        });
      });
    });
  }

  /**
   * Switch between standalone and composited drag visuals as discs overlap.
   * Samples standard-mode frame capability after updating SVG transforms.
   * @param {number} frameTime - Animation-frame timestamp in milliseconds.
   * @returns {void}
   */
  function updateDragRendering(frameTime) {
    const { piece } = activeDrag;
    updateDraggedPiece(piece);
    const composing = draggedPieceHasFilterOverlap();
    if (composing) {
      piece.discs.classList.remove("is-dragging");
      renderFilterLayer(pieces);
    } else if (activeDrag.composing) {
      piece.discs.classList.add("is-dragging");
      hideDraggedFilterLayers(piece);
    }
    activeDrag.composing = composing;
    if (combination !== "xor") recordDragCapability(frameTime);
  }

  /**
   * @param {Object} piece - Live piece.
   * @returns {Object} Pose snapshot with a copied position.
   */
  function pieceState(piece) {
    return {
      position: { ...piece.position },
      angle: piece.angle,
      snapped: piece.snapped
    };
  }

  /**
   * Restore logical pose only; callers synchronise the SVG separately.
   * @param {Object} piece - Mutable piece.
   * @param {Object} state - Previously saved pose.
   * @returns {void}
   */
  function restorePieceState(piece, state) {
    piece.position = { ...state.position };
    piece.angle = state.angle;
    piece.snapped = state.snapped;
  }

  /**
   * @param {Object} piece - Candidate pose.
   * @returns {boolean} Whether the padded pose avoids the fixed central triangle.
   */
  function isSafeFreePlacement(piece) {
    return !trianglesOverlap(
      piece,
      { position: fixedPosition, angle: 0 }
    );
  }

  /**
   * @param {Object} left - First pose.
   * @param {Object} right - Second pose.
   * @returns {boolean} Overlap including the board's disc-clearance padding.
   */
  function trianglesOverlap(left, right) {
    return expandedTrianglesOverlap(
      left.position,
      left.angle,
      right.position,
      right.angle,
      corners,
      trianglePadding
    );
  }

  /**
   * Sample a nearby bounded centre avoiding the fixed triangle and supplied pieces.
   * Updates position only on success; leaves angle and snapped state to the caller.
   * @param {Object} piece - Mutable candidate piece.
   * @param {Object[]} avoidedPieces - Additional forbidden poses.
   * @returns {boolean} Whether a sampled safe position was found.
   */
  function bumpToSafeFreePlacement(piece, avoidedPieces = []) {
    const position = nearestValidPlacement(
      piece.position,
      piecePositionBounds(piece),
      (candidate) => {
        const pose = { position: candidate, angle: piece.angle };
        return isSafeFreePlacement(pose)
          && avoidedPieces.every((other) => !trianglesOverlap(pose, other));
      }
    );
    if (!position) return false;
    piece.position = position;
    return true;
  }

  /**
   * Bump free pieces hidden by a new snap, falling back home if no sample succeeds.
   * Mutates affected positions and SVG transforms.
   * @param {Object} snappedPiece - Newly snapped piece.
   * @returns {void}
   */
  function moveObscuredFreePieces(snappedPiece) {
    const snappedPieces = pieces.filter((piece) => piece.snapped);
    pieces.filter((piece) => !piece.snapped).forEach((piece) => {
      if (!trianglesOverlap(piece, snappedPiece)) return;
      if (!bumpToSafeFreePlacement(piece, snappedPieces)) {
        piece.position = { ...piece.home };
      }
      updatePiece(piece);
    });
  }

  /**
   * @param {Object} piece - Piece with a rotation angle.
   * @returns {Object} Centre bounds that keep every full disc inside the board.
   */
  function piecePositionBounds(piece) {
    const rotatedCorners = corners.map((corner) => rotatePoint(corner, piece.angle));
    const minX = Math.min(...rotatedCorners.map((corner) => corner.x)) - discRadius;
    const maxX = Math.max(...rotatedCorners.map((corner) => corner.x)) + discRadius;
    const minY = Math.min(...rotatedCorners.map((corner) => corner.y)) - discRadius;
    const maxY = Math.max(...rotatedCorners.map((corner) => corner.y)) + discRadius;
    return {
      minX: -minX,
      maxX: boardWidth - maxX,
      minY: -minY,
      maxY: boardHeight - maxY
    };
  }

  /**
   * Clamp the mutable centre without testing overlap.
   * @param {Object} piece - Mutable piece.
   * @param {Object} bounds - Allowed minX/maxX/minY/maxY centre extents.
   * @returns {void}
   */
  function constrainPiecePosition(piece, bounds = piecePositionBounds(piece)) {
    piece.position.x = Math.min(
      bounds.maxX,
      Math.max(bounds.minX, piece.position.x)
    );
    piece.position.y = Math.min(
      bounds.maxY,
      Math.max(bounds.minY, piece.position.y)
    );
  }

  /**
   * End pointer activity, return pieces home and repopulate filters/targets.
   * Encoded puzzles retain their definition; random mode creates new filters.
   * Refreshes status/previews and schedules horizontal board centring.
   * @returns {void}
   */
  function resetPieces() {
    if (activeDrag && svg.hasPointerCapture(activeDrag.pointerId)) {
      svg.releasePointerCapture(activeDrag.pointerId);
    }
    if (activePan && svg.hasPointerCapture(activePan.pointerId)) {
      svg.releasePointerCapture(activePan.pointerId);
    }
    activeDrag = null;
    activePan = null;
    svg.classList.remove("is-dragging-piece");
    pieces.forEach((piece) => piece.discs.classList.remove("is-dragging"));
    if (dragUpdateFrame !== null) {
      cancelAnimationFrame(dragUpdateFrame);
      dragUpdateFrame = null;
    }
    hideTargetInspector();
    pieces.forEach((piece, pieceIndex) => {
      piece.position = { ...piece.home };
      piece.angle = 0;
      piece.snapped = false;
      piece.discFilters = piece.discElements.map((disc, discIndex) => {
        const filter = puzzleDefinition
          ? puzzleDefinition.pieces[pieceIndex][discIndex]
          : randomFilter();
        renderPatternDisc(disc, filter);
        return filter;
      });
      updatePiece(piece);
    });
    if (puzzleDefinition) setEncodedTargets(puzzleDefinition.targets);
    else randomizeTargets();
    updateSuccess();
    requestAnimationFrame(centerBoard);
  }

  /**
   * Replace filters/targets and body code while preserving every piece's pose.
   * Invalid input throws before changing the current definition.
   * @param {string} code - Complete level code.
   * @returns {void}
   */
  function applyPuzzleCode(code) {
    puzzleDefinition = parsePuzzleCode(code);
    document.body.dataset.puzzleCode = puzzleDefinition.code;
    pieces.forEach((piece, pieceIndex) => {
      piece.discFilters = piece.discElements.map((disc, discIndex) => {
        const filter = puzzleDefinition.pieces[pieceIndex][discIndex];
        renderPatternDisc(disc, filter);
        return filter;
      });
    });
    setEncodedTargets(puzzleDefinition.targets);
    updateSuccess();
  }

  /**
   * @returns {string} Loaded canonical code or an encoding of the current random design.
   */
  function levelCode() {
    if (puzzleDefinition) return puzzleDefinition.code;
    const sections = pieces.map((piece, index) => (
      `${["R", "G", "B"][index]}: ${piece.discFilters.map(filterCode).join(" ")}`
    ));
    sections.push(`T: ${targetFormations.map(formationCode).join(" ")}`);
    return sections.join(" ");
  }

  /**
   * @param {Object} filter - Filter with masks, shape and optional rotation.
   * @returns {string} Compact component token with 60-degree rotation marks.
   */
  function filterCode(filter) {
    const shapeCode = shapeCodes[filter.shape.value];
    const backgroundCode = colourCodes[filter.background.mask];
    if (shapeCode === "n") return `${shapeCode}${backgroundCode}`;
    const rotationMarks = "'".repeat((filter.rotation || 0) / 60);
    return `${shapeCode}${rotationMarks}${backgroundCode}${colourCodes[filter.foreground.mask]}`;
  }

  /**
   * Try representable shapes against all accepted symbolic assignments. Each side
   * of a candidate must have a single RGB result; no pixel sampling is involved.
   * @param {Object[]} formation - Filter/angle contributions to encode.
   * @returns {string} Equivalent component token, or "?" when none is representable.
   */
  function formationCode(formation) {
    const keys = [...new Set(
      formation.flatMap(({ filter, angle }) => shapeKeys(filter.shape.value, angle))
    )];
    const assignments = [];
    for (let bits = 0; bits < 2 ** keys.length; bits += 1) {
      const assignment = new Map(
        keys.map((key, index) => [key, Boolean(bits & (2 ** index))])
      );
      if (isPossibleAssignment(assignment)) {
        assignments.push({
          assignment,
          mask: formationMask(formation, assignment, combination)
        });
      }
    }

    for (const candidate of encodedShapeCandidates()) {
      const candidateKeys = shapeKeys(candidate.shape.value, candidate.rotation);
      if (candidateKeys.some((key) => !keys.includes(key))) continue;
      let backgroundMask = null;
      let foregroundMask = null;
      let valid = true;
      assignments.forEach(({ assignment, mask }) => {
        const inside = shapeExpression(
          candidate.shape.value,
          candidate.rotation,
          assignment
        );
        if (inside) {
          if (foregroundMask === null) foregroundMask = mask;
          else if (foregroundMask !== mask) valid = false;
        } else {
          if (backgroundMask === null) backgroundMask = mask;
          else if (backgroundMask !== mask) valid = false;
        }
      });
      if (!valid || backgroundMask === null
        || (candidate.shape.value !== "none" && foregroundMask === null)) continue;
      const filter = {
        background: filterColors[backgroundMask],
        foreground: filterColors[
          foregroundMask === null ? backgroundMask : foregroundMask
        ],
        shape: candidate.shape,
        rotation: candidate.rotation
      };
      return filterCode(filter);
    }
    return "?";
  }

  /**
   * @returns {Object[]} Ordered shape/rotation candidates supported by the code alphabet.
   */
  function encodedShapeCandidates() {
    /**
     * @param {string} value - Shape value.
     * @returns {Object|undefined} Shared shape descriptor.
     */
    const shape = (value) => shapeTypes.find((candidate) => candidate.value === value);
    return [
      { shape: shape("none"), rotation: 0 },
      { shape: shape("square"), rotation: 0 },
      { shape: shape("square"), rotation: 60 },
      { shape: shape("square"), rotation: 120 },
      { shape: shape("triangle"), rotation: 0 },
      { shape: shape("triangle"), rotation: 60 },
      { shape: shape("large-disc"), rotation: 0 },
      { shape: shape("small-disc"), rotation: 0 },
      { shape: shape("annulus"), rotation: 0 },
      { shape: shape("square-star"), rotation: 0 },
      { shape: shape("triangle-star"), rotation: 0 }
    ];
  }

  /**
   * Centre the board within its horizontal scroll viewport.
   * @returns {void}
   */
  function centerBoard() {
    boardScroll.scrollLeft = (boardScroll.scrollWidth - boardScroll.clientWidth) / 2;
  }

  /**
   * Set the CSS zoom compensation relative to initial pixel ratio, then re-centre.
   * @returns {void}
   */
  function updateBoardZoom() {
    const pixelRatio = window.devicePixelRatio || 1;
    const pageZoom = Math.max(1, pixelRatio / initialPixelRatio);
    boardSurface.style.setProperty("--page-zoom", pageZoom);
    requestAnimationFrame(centerBoard);
  }

  /**
   * Choose colours with distinct masks and an unrotated shape, consuming randomness.
   * @returns {Object} Background, foreground, shape and zero rotation.
   */
  function randomFilter() {
    const background = randomItem(filterColors);
    const shape = randomItem(shapeTypes);
    let foreground = randomItem(filterColors);
    while (foreground.mask === background.mask) foreground = randomItem(filterColors);
    return { background, shape, foreground, rotation: 0 };
  }

  /**
   * @param {Array} items - Non-empty candidate collection.
   * @returns {*} Uniformly selected element using randomValue.
   */
  function randomItem(items) {
    return items[Math.floor(randomValue() * items.length)];
  }

  /**
   * Replace a standalone disc's pattern, colours, boundary aid and accessible label.
   * @param {Object} disc - Root/background/pattern element references.
   * @param {Object} filter - Logical filter.
   * @returns {void}
   */
  function renderPatternDisc(disc, filter) {
    disc.background.style.fill = filter.background.value;
    disc.pattern.replaceChildren();
    disc.pattern.style.fill = filter.foreground.value;
    disc.pattern.style.stroke = needsContrastOutline(filter)
      ? contrastOutlineColour(filter)
      : "none";
    disc.pattern.style.strokeWidth = needsContrastOutline(filter) ? "1.5" : "0";
    disc.pattern.style.strokeLinejoin = "round";
    disc.pattern.style.strokeLinecap = "round";
    disc.pattern.setAttribute("transform", `rotate(${filter.rotation || 0})`);
    createShapeElements(filter.shape.value).forEach((element) => disc.pattern.append(element));
    const description = filter.shape.value === "none"
      ? `${filter.background.name} disc`
      : `${filter.foreground.name} ${filter.shape.name} on ${filter.background.name}`;
    disc.root.setAttribute("aria-label", description);
  }

  /**
   * @param {string} shape - Shape value; final fallback is an annulus.
   * @returns {SVGElement[]} Detached local primitives for the requested shape.
   */
  function createShapeElements(shape) {
    if (shape === "none") return [];
    if (shape === "square") return [createSquare()];
    if (shape === "square-star") {
      return [0, 60, 120].map((angle) => createSquare(angle));
    }
    if (shape === "triangle") return [createTriangle(false)];
    if (shape === "triangle-star") return [createTriangle(false), createTriangle(true)];
    if (shape === "large-disc") return [createSvgElement("circle", { r: largeShapeRadius })];
    if (shape === "small-disc") return [createSvgElement("circle", { r: smallShapeRadius })];
    return [createSvgElement("path", {
      d: `M ${largeShapeRadius} 0 A ${largeShapeRadius} ${largeShapeRadius} 0 1 0 ${-largeShapeRadius} 0 A ${largeShapeRadius} ${largeShapeRadius} 0 1 0 ${largeShapeRadius} 0 M ${smallShapeRadius} 0 A ${smallShapeRadius} ${smallShapeRadius} 0 1 1 ${-smallShapeRadius} 0 A ${smallShapeRadius} ${smallShapeRadius} 0 1 1 ${smallShapeRadius} 0`,
      "fill-rule": "evenodd"
    })];
  }

  /**
   * @param {number} angle - Local rotation in degrees.
   * @returns {SVGElement} Detached square centred at the origin.
   */
  function createSquare(angle = 0) {
    return createSvgElement("rect", {
      x: -squareHalfSize,
      y: -squareHalfSize,
      width: squareHalfSize * 2,
      height: squareHalfSize * 2,
      transform: `rotate(${angle})`
    });
  }

  /**
   * @param {boolean} reflected - Whether the triangle points down rather than up.
   * @returns {SVGElement} Detached equilateral shape polygon.
   */
  function createTriangle(reflected) {
    const points = reflected
      ? `0,${triangleRadius} ${-triangleHalfWidth},${-triangleBaseY} ${triangleHalfWidth},${-triangleBaseY}`
      : `0,${-triangleRadius} ${-triangleHalfWidth},${triangleBaseY} ${triangleHalfWidth},${triangleBaseY}`;
    return createSvgElement("polygon", { points });
  }

  /**
   * Construct target formations/visuals from randomly chosen solvable design poses.
   * Updates target images but does not move the visible pieces.
   * @returns {void}
   */
  function randomizeTargets() {
    const snapCounts = shuffle([...randomItem(snapDistributions)]);
    const solutionPoses = pieces.map(
      (piece, index) => randomPoseWithMatchCount(piece, snapCounts[index])
    );
    targetFormations = formationsForPoses(solutionPoses);
    targetVisuals = visualsForPoses(solutionPoses);
    targetVisuals.forEach((visual, index) => renderTarget(targetDisplays[index], visual));
  }

  /**
   * Replace targets with single centred encoded filters and update their images.
   * @param {Object[]} targets - Three decoded target filters.
   * @returns {void}
   */
  function setEncodedTargets(targets) {
    targetFormations = targets.map((filter) => [
      { filter, angle: filter.rotation || 0 }
    ]);
    targetVisuals = targets.map((filter) => [
      { filter, angle: filter.rotation || 0, x: 0, y: 0 }
    ]);
    targetVisuals.forEach((visual, index) => renderTarget(targetDisplays[index], visual));
  }

  /**
   * Enumerate corner alignments at six rotations, then select a pose of the requested size.
   * @param {Object} piece - Piece referenced by the design pose.
   * @param {number} requiredMatches - Desired coincident-corner count.
   * @returns {Object} Random eligible pose for supported counts one through three.
   */
  function randomPoseWithMatchCount(piece, requiredMatches) {
    const candidates = [];
    for (let angle = 0; angle < 360; angle += 60) {
      corners.forEach((_, movingIndex) => {
        corners.forEach((__, fixedIndex) => {
          const pose = poseForSnap(piece, movingIndex, fixedIndex, angle);
          if (countFixedMatches(pose) === requiredMatches) candidates.push(pose);
        });
      });
    }
    return randomItem(candidates);
  }

  /**
   * Shuffle in place using Fisher-Yates, consuming randomValue samples.
   * @param {Array} items - Mutable collection.
   * @returns {Array} The same shuffled array.
   */
  function shuffle(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(randomValue() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
  }

  /**
   * @param {Object} piece - Referenced piece.
   * @param {number} movingIndex - Moving corner to align.
   * @param {number} fixedIndex - Fixed corner to align with.
   * @param {number} angle - Triangle rotation in degrees.
   * @returns {Object} Piece, angle and translated centre; does not move the live piece.
   */
  function poseForSnap(piece, movingIndex, fixedIndex, angle) {
    const movingCorner = rotatePoint(corners[movingIndex], angle);
    const fixedCorner = corners[fixedIndex];
    return {
      piece,
      angle,
      position: {
        x: fixedPosition.x + fixedCorner.x - movingCorner.x,
        y: fixedPosition.y + fixedCorner.y - movingCorner.y
      }
    };
  }

  /**
   * @param {Object} pose - Position and angle.
   * @returns {number} Corner pairs coincident within half a board unit.
   */
  function countFixedMatches(pose) {
    return corners.reduce((total, corner) => {
      const moving = transformedCorner(pose, corner);
      return total + corners.filter((fixedCorner) => (
        Math.hypot(
          fixedPosition.x + fixedCorner.x - moving.x,
          fixedPosition.y + fixedCorner.y - moving.y
        ) < 0.5
      )).length;
    }, 0);
  }

  /**
   * Collect only coincident discs; near overlaps affect visuals but not matching.
   * @param {Object[]} poses - Live pieces or design poses referencing a piece.
   * @returns {Object[][]} Filter/total-angle contributions per fixed corner.
   */
  function formationsForPoses(poses) {
    return corners.map((fixedCorner) => {
      const target = {
        x: fixedPosition.x + fixedCorner.x,
        y: fixedPosition.y + fixedCorner.y
      };
      const filters = [];
      poses.forEach((pose) => {
        const piece = pose.piece || pose;
        corners.forEach((corner, discIndex) => {
          const centre = transformedCorner(pose, corner);
          if (Math.hypot(target.x - centre.x, target.y - centre.y) < 0.5) {
            const filter = piece.discFilters[discIndex];
            filters.push({ filter, angle: pose.angle + (filter.rotation || 0) });
          }
        });
      });
      return filters;
    });
  }

  /**
   * Include every disc intersecting each fixed disc, expressed in target-local units.
   * @param {Object[]} poses - Live pieces or design poses referencing a piece.
   * @returns {Object[][]} Filter/angle/x/y layers per fixed corner.
   */
  function visualsForPoses(poses) {
    return corners.map((fixedCorner) => {
      const target = {
        x: fixedPosition.x + fixedCorner.x,
        y: fixedPosition.y + fixedCorner.y
      };
      const layers = [];
      poses.forEach((pose) => {
        const piece = pose.piece || pose;
        corners.forEach((corner, discIndex) => {
          const centre = transformedCorner(pose, corner);
          const x = centre.x - target.x;
          const y = centre.y - target.y;
          const distance = Math.hypot(x, y);
          if (distance < discRadius * 2) {
            const filter = piece.discFilters[discIndex];
            layers.push({
              filter,
              angle: pose.angle + (filter.rotation || 0),
              x: distance < 0.5 ? 0 : x,
              y: distance < 0.5 ? 0 : y
            });
          }
        });
      });
      return layers;
    });
  }

  /**
   * @param {Object} filter - Logical filter.
   * @param {number} x - Disc-relative horizontal position.
   * @param {number} y - Disc-relative vertical position.
   * @param {number} angle - Total filter rotation.
   * @returns {number} Foreground/background RGB mask at the point.
   */
  function filterMaskAt(filter, x, y, angle) {
    const local = rotatePoint({ x, y }, -angle);
    return shapeContains(filter.shape.value, local.x, local.y)
      ? filter.foreground.mask
      : filter.background.mask;
  }

  /**
   * Test local unrotated shape geometry; compound stars use polygon unions.
   * @param {string} shape - Shape value; final fallback is an annulus.
   * @param {number} x - Local horizontal coordinate.
   * @param {number} y - Local vertical coordinate.
   * @returns {boolean} Whether the shape includes the point.
   */
  function shapeContains(shape, x, y) {
    if (shape === "none") return false;
    if (shape === "square") return insideSquare(x, y);
    if (shape === "square-star") {
      return [0, 60, 120].some((angle) => {
        const local = rotatePoint({ x, y }, -angle);
        return insideSquare(local.x, local.y);
      });
    }
    if (shape === "triangle") return insideTriangle(x, y, false);
    if (shape === "triangle-star") {
      return insideTriangle(x, y, false) || insideTriangle(x, y, true);
    }
    const distanceSquared = x * x + y * y;
    if (shape === "large-disc") return distanceSquared <= largeShapeRadius * largeShapeRadius;
    if (shape === "small-disc") return distanceSquared <= smallShapeRadius * smallShapeRadius;
    return distanceSquared <= largeShapeRadius * largeShapeRadius
      && distanceSquared >= smallShapeRadius * smallShapeRadius;
  }

  /**
   * @param {number} x - Local horizontal coordinate.
   * @param {number} y - Local vertical coordinate.
   * @returns {boolean} Whether the point lies in the closed axis-aligned square.
   */
  function insideSquare(x, y) {
    return Math.abs(x) <= squareHalfSize && Math.abs(y) <= squareHalfSize;
  }

  /**
   * Compare edge cross-product signs, including points on an edge.
   * @param {number} x - Local horizontal coordinate.
   * @param {number} y - Local vertical coordinate.
   * @param {boolean} reflected - Whether to use the downward-pointing triangle.
   * @returns {boolean} Closed-triangle containment.
   */
  function insideTriangle(x, y, reflected) {
    const vertices = reflected
      ? [
        { x: 0, y: triangleRadius },
        { x: -triangleHalfWidth, y: -triangleBaseY },
        { x: triangleHalfWidth, y: -triangleBaseY }
      ]
      : [
        { x: 0, y: -triangleRadius },
        { x: -triangleHalfWidth, y: triangleBaseY },
        { x: triangleHalfWidth, y: triangleBaseY }
      ];
    const signs = vertices.map((vertex, index) => {
      const next = vertices[(index + 1) % vertices.length];
      return (x - next.x) * (vertex.y - next.y) - (vertex.x - next.x) * (y - next.y);
    });
    return signs.every((value) => value >= 0) || signs.every((value) => value <= 0);
  }

  /**
   * Encode and cache a target image URL, then update the displayed SVG image.
   * @param {Object} display - Target image/cache record.
   * @param {Object[]} visual - Target-local filter layers.
   * @returns {void}
   */
  function renderTarget(display, visual) {
    const imageUrl = visualDataUrl(visual);
    display.imageUrl = imageUrl;
    display.image.setAttribute("href", imageUrl);
  }

  /**
   * Clip a composed SVG to one disc; contrast aids follow preview quality/mode.
   * @param {Object[]} layers - Target-local filter layers.
   * @returns {string} URI-encoded SVG data URL.
   */
  function visualDataUrl(layers) {
    const markup = `<svg xmlns="${namespace}" viewBox="${-discRadius} ${-discRadius} ${discRadius * 2} ${discRadius * 2}" shape-rendering="crispEdges">`
      + `<defs><clipPath id="disc"><circle r="${discRadius}"/></clipPath></defs>`
      + `<g clip-path="url(#disc)">${filterCompositionMarkup(
        layers,
        "preview",
        discRadius,
        {
          combination,
          includeContrastOutlines: combination !== "xor"
            && contrastQuality !== "none"
        }
      )}</g>`
      + "</svg>";
    return `data:image/svg+xml,${encodeURIComponent(markup)}`;
  }

  /**
   * @param {Object[]} layers - World-space filter layers.
   * @returns {string} Board composition SVG with the active quality/mode options.
   */
  function boardCompositionMarkup(layers) {
    return filterCompositionMarkup(layers, "board", discRadius, {
      combination,
      includeContrastOutlines: combination !== "xor"
        && (contrastQuality === "full" || contrastQuality === "drag-hidden")
    });
  }

  /**
   * @param {Object[]} poses - Live pieces or poses referencing a piece.
   * @returns {Object[]} World-space filter layers ordered by piece then corner.
   */
  function filterLayersForPoses(poses) {
    const layers = [];
    poses.forEach((pose) => {
      const piece = pose.piece || pose;
      corners.forEach((corner, discIndex) => {
        const centre = transformedCorner(pose, corner);
        const filter = piece.discFilters[discIndex];
        layers.push({
          filter,
          angle: pose.angle + (filter.rotation || 0),
          x: centre.x,
          y: centre.y
        });
      });
    });
    return layers;
  }

  /**
   * Rebuild definitions when appearance changes; otherwise update only changed
   * layer centres/transforms. XOR overlap topology joins the signature because it
   * determines cluster parity definitions, unlike ordinary intersection masks.
   * Mutates SVG markup and all filter-render caches.
   * @param {Object[]} poses - Poses to display.
   * @returns {void}
   */
  function renderFilterLayer(poses) {
    const layers = filterLayersForPoses(poses);
    const appearanceSignature = `${contrastOutlinesOnBoard()}:` + layers.map(({ filter }) => (
      `${filter.background.mask}:${filter.foreground.mask}:${filter.shape.value}`
    )).join("|");
    const geometry = layers.map(({ x, y, angle }) => `${x}:${y}:${angle}`);
    const signature = combination === "xor"
      ? `${appearanceSignature}:${xorOverlapSignature(layers)}`
      : appearanceSignature;
    if (signature !== renderedFilterSignature) {
      filterRender.innerHTML = boardCompositionMarkup(layers);
      renderedFilterSignature = signature;
      renderedFilterGeometry = geometry;
      filterLayerCircles = [...filterRender.querySelectorAll("[data-filter-layer]")];
      filterLayerMasks = [...filterRender.querySelectorAll("[data-filter-mask-layer]")];
      filterLayerOutlines = [...filterRender.querySelectorAll("[data-filter-outline-layer]")];
      return;
    }
    const changedLayers = new Set();
    geometry.forEach((value, index) => {
      if (value !== renderedFilterGeometry[index]) changedLayers.add(index);
    });
    filterLayerCircles.forEach((circle) => {
      const index = Number(circle.dataset.filterLayer);
      if (!changedLayers.has(index)) return;
      const layer = layers[index];
      circle.setAttribute("cx", layer.x);
      circle.setAttribute("cy", layer.y);
    });
    filterLayerMasks.forEach((mask) => {
      const index = Number(mask.dataset.filterMaskLayer);
      if (!changedLayers.has(index)) return;
      const layer = layers[index];
      mask.setAttribute(
        "transform",
        `translate(${layer.x} ${layer.y}) rotate(${layer.angle})`
      );
    });
    filterLayerOutlines.forEach((outline) => {
      const index = Number(outline.dataset.filterOutlineLayer);
      if (!changedLayers.has(index)) return;
      const layer = layers[index];
      outline.setAttribute(
        "transform",
        `translate(${layer.x} ${layer.y}) rotate(${layer.angle})`
      );
    });
    renderedFilterGeometry = geometry;
  }

  /**
   * @param {Object[]} layers - World-space disc centres.
   * @returns {string} Ordered intersecting-index pairs for topology invalidation.
   */
  function xorOverlapSignature(layers) {
    const overlappingPairs = [];
    const maximumDistanceSquared = (discRadius * 2) ** 2;
    layers.forEach((left, leftIndex) => {
      layers.slice(leftIndex + 1).forEach((right, offset) => {
        const distanceSquared = (left.x - right.x) ** 2
          + (left.y - right.y) ** 2;
        if (distanceSquared < maximumDistanceSquared) {
          overlappingPairs.push(`${leftIndex}-${leftIndex + offset + 1}`);
        }
      });
    });
    return overlappingPairs.join(",");
  }

  /**
   * Refresh composition, symbolic matching, accessible progress and open previews.
   * Success requires every triangle snapped as well as all targets matching;
   * dispatches lightdiscs:solved only on a transition into that state.
   * @returns {void}
   */
  function updateSuccess() {
    renderFilterLayer(pieces);
    currentFormations = formationsForPoses(pieces);
    if (inspectedTargetIndex !== null) currentVisuals = visualsForPoses(pieces);
    const allPiecesSnapped = pieces.every((piece) => piece.snapped);
    const snappedCircleCount = pieces.reduce(
      (count, piece) => count + countFixedMatches(piece),
      0
    );
    const targetMatches = currentFormations.map(
      (formation, index) => formationsMatch(
        formation,
        targetFormations[index],
        combination
      )
    );
    const targetsMatch = targetMatches.every(Boolean);
    targetMatches.forEach((matches, index) => updateTargetStatus(index, matches));
    progressIndicator.textContent = `Targets ${targetMatches.filter(Boolean).length}/3 \u00b7 Triangles ${pieces.filter((piece) => piece.snapped).length}/3 \u00b7 Snapped circles ${snappedCircleCount}`;
    if (inspectedTargetIndex !== null) refreshTargetInspector();
    const solved = allPiecesSnapped && targetsMatch;
    successIndicator.hidden = !solved;
    if (solved && !reportedSolvedState) {
      reportedSolvedState = true;
      document.dispatchEvent(new CustomEvent("lightdiscs:solved", {
        detail: { code: puzzleDefinition?.code || null }
      }));
    } else if (!solved) {
      reportedSolvedState = false;
    }
  }

  /**
   * Update a target's state classes and accessible button label.
   * @param {number} index - Target display index.
   * @param {boolean} matches - Symbolic match result.
   * @returns {void}
   */
  function updateTargetStatus(index, matches) {
    const display = targetDisplays[index];
    display.root.classList.toggle("is-matched", matches);
    display.root.classList.toggle("is-unmatched", !matches);
    display.root.setAttribute(
      "aria-label",
      `Target pattern ${index + 1}, ${matches ? "matched" : "not matched"}`
    );
  }

  /**
   * Select a target, expose the inspector and refresh its current overlap visual.
   * @param {number} index - Target index.
   * @returns {void}
   */
  function showTargetInspector(index) {
    inspectedTargetIndex = index;
    targetInspector.classList.toggle("is-pinned", inspectorPinned);
    targetInspector.hidden = false;
    currentVisuals = visualsForPoses(pieces);
    refreshTargetInspector();
  }

  /**
   * Coalesce pointer samples into at most one queued animation-frame SVG update.
   * @returns {void}
   */
  function scheduleDragUpdate() {
    if (dragUpdateFrame !== null) return;
    dragUpdateFrame = requestAnimationFrame((frameTime) => {
      dragUpdateFrame = null;
      if (activeDrag) updateDragRendering(frameTime);
    });
  }

  /**
   * @returns {boolean} Whether the adaptive drag-hidden board-outline tier is active.
   */
  function contrastOutlinesOnBoard() {
    return contrastQuality === "drag-hidden";
  }

  /**
   * @param {number[]} values - Non-empty timing samples, not changed.
   * @param {number} fraction - Quantile fraction from zero to one.
   * @returns {number} Selected sorted sample without interpolation.
   */
  function percentile(values, fraction) {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  }

  /**
   * Switch quality, reset timing evidence and force SVG recomposition. Rebuild
   * target/inspector images only if preview boundary visibility changes.
   * @param {string} quality - drag-hidden, targets-only or none.
   * @param {boolean} useCooldown - Whether to defer adaptation for two sample batches.
   * @returns {void}
   */
  function setContrastQuality(quality, useCooldown = true) {
    if (quality === contrastQuality) return;
    const previewsChanged = (contrastQuality === "none") !== (quality === "none");
    contrastQuality = quality;
    svg.dataset.contrastQuality = quality;
    adaptationDirection = null;
    adaptationEvidence = 0;
    adaptationCooldown = useCooldown ? 2 : 0;
    renderedFilterSignature = "";
    renderFilterLayer(pieces);
    if (activeDrag && !activeDrag.composing) {
      hideDraggedFilterLayers(activeDrag.piece);
    }
    if (previewsChanged) {
      targetVisuals.forEach((visual, index) => {
        renderTarget(targetDisplays[index], visual);
      });
      if (inspectedTargetIndex !== null) refreshTargetInspector();
    }
  }

  /**
   * Adapt quality using 12-sample upper-quartile frame intervals. Long pauses are
   * discarded; upgrades require three agreeing batches, downgrades one, with
   * different thresholds and cooldown to avoid quality oscillation.
   * @param {number} frameTime - Animation-frame timestamp in milliseconds.
   * @returns {void}
   */
  function recordDragCapability(frameTime) {
    if (previousDragFrameTime !== null) {
      const interval = frameTime - previousDragFrameTime;
      if (interval <= 250) dragCapabilitySamples.push(interval);
      else dragCapabilitySamples = [];
    }
    previousDragFrameTime = frameTime;
    if (dragCapabilitySamples.length < 12) return;
    const interval = percentile(dragCapabilitySamples, 0.75);
    dragCapabilitySamples = [];
    if (adaptationCooldown > 0) {
      adaptationCooldown -= 1;
      return;
    }
    const qualities = ["drag-hidden", "targets-only", "none"];
    const qualityIndex = qualities.indexOf(contrastQuality);
    const downgradeThresholds = [32, 45];
    const upgradeThresholds = [null, 24, 34];
    let direction = null;
    if (qualityIndex < qualities.length - 1
      && interval > downgradeThresholds[qualityIndex]) {
      direction = "down";
    } else if (qualityIndex > 0
      && interval < upgradeThresholds[qualityIndex]) {
      direction = "up";
    }
    if (direction === null) {
      adaptationDirection = null;
      adaptationEvidence = 0;
      return;
    }
    if (direction !== adaptationDirection) {
      adaptationDirection = direction;
      adaptationEvidence = 0;
    }
    adaptationEvidence += 1;
    const requiredEvidence = direction === "up" ? 3 : 1;
    if (adaptationEvidence >= requiredEvidence) {
      const nextIndex = qualityIndex + (direction === "down" ? 1 : -1);
      setContrastQuality(qualities[nextIndex]);
      previousDragFrameTime = null;
    }
  }

  /**
   * @returns {number} Pseudorandom sample in [0, 1) for random filter/pose selection.
   */
  function randomValue() {
    return Math.random();
  }

  /**
   * Reset the board through the shared reset routine when the button is activated.
   * @returns {void}
   */
  function resetPuzzle() {
    resetPieces();
  }

  /**
   * Refresh the selected target's title, match state and enlarged image sources.
   * @returns {void}
   */
  function refreshTargetInspector() {
    if (inspectedTargetIndex === null) return;
    const display = targetDisplays[inspectedTargetIndex];
    const matches = display.root.classList.contains("is-matched");
    targetInspectorTitle.textContent = `Target ${inspectedTargetIndex + 1}`;
    targetInspectorStatus.textContent = matches ? "Matched" : "Not matched";
    targetInspectorStatus.classList.toggle("is-matched", matches);
    targetInspectorStatus.classList.toggle("is-unmatched", !matches);
    targetPreview.src = display.imageUrl;
    currentPreview.src = visualDataUrl(currentVisuals[inspectedTargetIndex]);
  }

  /**
   * Clear selection/pinning and hide the comparison without changing board state.
   * @returns {void}
   */
  function hideTargetInspector() {
    inspectedTargetIndex = null;
    inspectorPinned = false;
    targetInspector.classList.remove("is-pinned");
    targetInspector.hidden = true;
  }

  // Capture-phase outside dismissal runs before target click handling; target
  // controls are exempt so the later click can toggle their pin state.
  resetButton.addEventListener("click", resetPuzzle);
  targetInspector.addEventListener("click", hideTargetInspector);
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (targetInspector.hidden
      || (target instanceof Element && target.closest(".target-pattern"))) return;
    hideTargetInspector();
  }, true);
  // Use the newest coalesced sample and cache coordinates, not intermediate frames.
  // Empty-board touch drags instead scroll the board horizontally and page vertically.
  svg.addEventListener("pointermove", (event) => {
    if (activeDrag && event.pointerId === activeDrag.pointerId) {
      const coalescedEvents = event.getCoalescedEvents
        ? event.getCoalescedEvents()
        : [];
      const latestEvent = coalescedEvents[coalescedEvents.length - 1] || event;
      const pointer = svgPoint(latestEvent, activeDrag.inverseScreenMatrix);
      activeDrag.piece.position = {
        x: pointer.x - activeDrag.offset.x,
        y: pointer.y - activeDrag.offset.y
      };
      constrainPiecePosition(activeDrag.piece, activeDrag.bounds);
      scheduleDragUpdate();
      return;
    }
    if (activePan && event.pointerId === activePan.pointerId) {
      boardScroll.scrollLeft = activePan.scrollLeft - (event.clientX - activePan.clientX);
      window.scrollTo(
        activePan.scrollX,
        activePan.scrollY - (event.clientY - activePan.clientY)
      );
    }
  });
  // Both release and cancellation finalise the active gesture; zoom/resize changes
  // resynchronise the board's scroll surface after browser layout.
  svg.addEventListener("pointerdown", beginBoardPan);
  svg.addEventListener("pointerup", finishDrag);
  svg.addEventListener("pointerup", finishBoardPan);
  svg.addEventListener("pointercancel", finishDrag);
  svg.addEventListener("pointercancel", finishBoardPan);
  window.addEventListener("pageshow", updateBoardZoom);
  window.addEventListener("resize", updateBoardZoom);
  window.LightDiscGame = {
    applyPuzzleCode,
    levelCode
  };
  resetPieces();
})();

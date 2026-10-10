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
  const { filterCompositionMarkup } = window.LightDiscRendering;
  const { parsePuzzleCode } = window.LightDiscPuzzleCode;
  let puzzleDefinition = document.body.dataset.puzzleCode
    ? parsePuzzleCode(document.body.dataset.puzzleCode)
    : null;
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
  const targetCorners = [
    { x: 0, y: -28 },
    { x: -24, y: 14 },
    { x: 24, y: 14 }
  ];
  const discRadius = 38;
  const targetRadius = 16;
  const largeShapeRadius = 30;
  const smallShapeRadius = 12;
  const squareHalfSize = 21;
  const triangleRadius = 28;
  const triangleHalfWidth = triangleRadius * Math.sqrt(3) / 2;
  const triangleBaseY = triangleRadius / 2;
  const snapDistance = discRadius * 2;
  const trianglePath = roundedTrianglePath(corners, discRadius + 4);
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
    { name: "Red", color: "#ff3b4f", home: { x: 240, y: 270 } },
    { name: "Green", color: "#35e86f", home: { x: 760, y: 270 } },
    { name: "Blue", color: "#4285ff", home: { x: 500, y: 740 } }
  ];
  let targetFormations = [];
  let targetVisuals = [];
  let currentFormations = [];
  let currentVisuals = [];
  let inspectedTargetIndex = null;
  let inspectorPinned = false;
  let activeDrag = null;
  let activePan = null;
  let dragUpdateFrame = null;
  let renderedFilterSignature = "";
  let renderedFilterGeometry = [];
  let filterLayerCircles = [];
  let filterLayerMasks = [];

  document.querySelector(".triangle-path").setAttribute("d", trianglePath);
  addFixedDiscs();
  const targetDisplays = createTargetDisplays();

  function createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS(namespace, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    return element;
  }

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

  function outwardNormal(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    return { x: -dy / length, y: dx / length };
  }

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
        r: 22
      });
      const outline = createSvgElement("circle", {
        class: "target-disc",
        r: targetRadius
      });
      root.append(image, hitArea, outline);
      targetDiscsLayer.append(root);
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

    const piece = {
      root,
      shape,
      discs,
      discElements,
      discFilters: [],
      controls,
      home: definition.home,
      position: { ...definition.home },
      angle: 0,
      snapped: false
    };
    shape.addEventListener("pointerdown", (event) => beginDrag(event, piece));
    shape.addEventListener("keydown", (event) => movePieceWithKeyboard(event, piece));
    updatePiece(piece);
    return piece;
  }

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
    piece.snapped = false;
    piece.position.x += movement.x;
    piece.position.y += movement.y;
    constrainPiecePosition(piece);
    updatePiece(piece);
    updateSuccess();
  }

  function rotatePiece(event) {
    event?.stopPropagation();
    const button = event?.currentTarget || this;
    const piece = pieces[Number(button.dataset.piece)];
    if (piece.snapped) return;
    piece.angle = (piece.angle + Number(button.dataset.direction) * 60 + 360) % 360;
    constrainPiecePosition(piece);
    updatePiece(piece);
    updateSuccess();
  }

  function beginDrag(event, piece) {
    if (event.button !== 0) return;
    event.preventDefault();
    const pointer = svgPoint(event);
    activeDrag = {
      piece,
      pointerId: event.pointerId,
      offset: {
        x: pointer.x - piece.position.x,
        y: pointer.y - piece.position.y
      }
    };
    piece.snapped = false;
    piece.root.classList.remove("is-snapped");
    svg.setPointerCapture(event.pointerId);
  }

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

  function svgPoint(event) {
    const point = new DOMPoint(event.clientX, event.clientY);
    return point.matrixTransform(svg.getScreenCTM().inverse());
  }

  function rotatePoint(point, angle) {
    const radians = angle * Math.PI / 180;
    return {
      x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
      y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
    };
  }

  function transformedCorner(pose, corner) {
    const rotated = rotatePoint(corner, pose.angle);
    return {
      x: pose.position.x + rotated.x,
      y: pose.position.y + rotated.y
    };
  }

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

  function finishDrag(event) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    const { piece } = activeDrag;
    const snap = findSnap(piece);
    if (snap) {
      piece.position.x += snap.target.x - snap.movingCorner.x;
      piece.position.y += snap.target.y - snap.movingCorner.y;
      piece.snapped = true;
    } else {
      piece.position = { ...piece.home };
      piece.snapped = false;
    }
    updatePiece(piece);
    activeDrag = null;
    if (dragUpdateFrame !== null) {
      cancelAnimationFrame(dragUpdateFrame);
      dragUpdateFrame = null;
    }
    updateSuccess();
  }

  function finishBoardPan(event) {
    if (!activePan || event.pointerId !== activePan.pointerId) return;
    activePan = null;
  }

  function updatePiece(piece) {
    const transform = `translate(${piece.position.x} ${piece.position.y}) rotate(${piece.angle})`;
    piece.shape.setAttribute("transform", transform);
    piece.discs.setAttribute("transform", transform);
    piece.controls.setAttribute("transform", `translate(${piece.position.x} ${piece.position.y})`);
    piece.root.classList.toggle("is-snapped", piece.snapped);
  }

  function constrainPiecePosition(piece) {
    const rotatedCorners = corners.map((corner) => rotatePoint(corner, piece.angle));
    const minX = Math.min(...rotatedCorners.map((corner) => corner.x)) - discRadius;
    const maxX = Math.max(...rotatedCorners.map((corner) => corner.x)) + discRadius;
    const minY = Math.min(...rotatedCorners.map((corner) => corner.y)) - discRadius;
    const maxY = Math.max(...rotatedCorners.map((corner) => corner.y)) + discRadius;
    piece.position.x = Math.min(
      boardWidth - maxX,
      Math.max(-minX, piece.position.x)
    );
    piece.position.y = Math.min(
      boardHeight - maxY,
      Math.max(-minY, piece.position.y)
    );
  }

  function resetPieces() {
    if (activeDrag && svg.hasPointerCapture(activeDrag.pointerId)) {
      svg.releasePointerCapture(activeDrag.pointerId);
    }
    if (activePan && svg.hasPointerCapture(activePan.pointerId)) {
      svg.releasePointerCapture(activePan.pointerId);
    }
    activeDrag = null;
    activePan = null;
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

  function levelCode() {
    if (puzzleDefinition) return puzzleDefinition.code;
    const sections = pieces.map((piece, index) => (
      `${["R", "G", "B"][index]}: ${piece.discFilters.map(filterCode).join(" ")}`
    ));
    sections.push(`T: ${targetFormations.map(formationCode).join(" ")}`);
    return sections.join(" ");
  }

  function filterCode(filter) {
    const shapeCode = shapeCodes[filter.shape.value];
    const backgroundCode = colourCodes[filter.background.mask];
    if (shapeCode === "n") return `${shapeCode}${backgroundCode}`;
    const rotationMarks = "'".repeat((filter.rotation || 0) / 60);
    return `${shapeCode}${rotationMarks}${backgroundCode}${colourCodes[filter.foreground.mask]}`;
  }

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
        assignments.push({ assignment, mask: formationMask(formation, assignment) });
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

  function encodedShapeCandidates() {
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

  function centerBoard() {
    boardScroll.scrollLeft = (boardScroll.scrollWidth - boardScroll.clientWidth) / 2;
  }

  function updateBoardZoom() {
    const pixelRatio = window.devicePixelRatio || 1;
    const pageZoom = Math.max(1, pixelRatio / initialPixelRatio);
    boardSurface.style.setProperty("--page-zoom", pageZoom);
    requestAnimationFrame(centerBoard);
  }

  function randomFilter() {
    const background = randomItem(filterColors);
    const shape = randomItem(shapeTypes);
    let foreground = randomItem(filterColors);
    while (foreground.mask === background.mask) foreground = randomItem(filterColors);
    return { background, shape, foreground, rotation: 0 };
  }

  function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function renderPatternDisc(disc, filter) {
    disc.background.style.fill = filter.background.value;
    disc.pattern.replaceChildren();
    disc.pattern.style.fill = filter.foreground.value;
    disc.pattern.setAttribute("transform", `rotate(${filter.rotation || 0})`);
    createShapeElements(filter.shape.value).forEach((element) => disc.pattern.append(element));
    const description = filter.shape.value === "none"
      ? `${filter.background.name} disc`
      : `${filter.foreground.name} ${filter.shape.name} on ${filter.background.name}`;
    disc.root.setAttribute("aria-label", description);
  }

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

  function createSquare(angle = 0) {
    return createSvgElement("rect", {
      x: -squareHalfSize,
      y: -squareHalfSize,
      width: squareHalfSize * 2,
      height: squareHalfSize * 2,
      transform: `rotate(${angle})`
    });
  }

  function createTriangle(reflected) {
    const points = reflected
      ? `0,${triangleRadius} ${-triangleHalfWidth},${-triangleBaseY} ${triangleHalfWidth},${-triangleBaseY}`
      : `0,${-triangleRadius} ${-triangleHalfWidth},${triangleBaseY} ${triangleHalfWidth},${triangleBaseY}`;
    return createSvgElement("polygon", { points });
  }

  function randomizeTargets() {
    const snapCounts = shuffle([...randomItem(snapDistributions)]);
    const solutionPoses = pieces.map(
      (piece, index) => randomPoseWithMatchCount(piece, snapCounts[index])
    );
    targetFormations = formationsForPoses(solutionPoses);
    targetVisuals = visualsForPoses(solutionPoses);
    targetVisuals.forEach((visual, index) => renderTarget(targetDisplays[index], visual));
  }

  function setEncodedTargets(targets) {
    targetFormations = targets.map((filter) => [
      { filter, angle: filter.rotation || 0 }
    ]);
    targetVisuals = targets.map((filter) => [
      { filter, angle: filter.rotation || 0, x: 0, y: 0 }
    ]);
    targetVisuals.forEach((visual, index) => renderTarget(targetDisplays[index], visual));
  }

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

  function shuffle(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
  }

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

  function filterMaskAt(filter, x, y, angle) {
    const local = rotatePoint({ x, y }, -angle);
    return shapeContains(filter.shape.value, local.x, local.y)
      ? filter.foreground.mask
      : filter.background.mask;
  }

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

  function insideSquare(x, y) {
    return Math.abs(x) <= squareHalfSize && Math.abs(y) <= squareHalfSize;
  }

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

  function renderTarget(display, visual) {
    const imageUrl = visualDataUrl(visual);
    display.imageUrl = imageUrl;
    display.image.setAttribute("href", imageUrl);
  }

  function visualDataUrl(layers) {
    const markup = `<svg xmlns="${namespace}" viewBox="${-discRadius} ${-discRadius} ${discRadius * 2} ${discRadius * 2}" shape-rendering="crispEdges">`
      + `<defs><clipPath id="disc"><circle r="${discRadius}"/></clipPath></defs>`
      + `<g clip-path="url(#disc)">${filterCompositionMarkup(layers, "preview")}</g>`
      + "</svg>";
    return `data:image/svg+xml,${encodeURIComponent(markup)}`;
  }

  function formationsMatch(left, right) {
    const keys = [...new Set(
      [...left, ...right].flatMap(({ filter, angle }) => shapeKeys(filter.shape.value, angle))
    )];
    const assignmentCount = 2 ** keys.length;
    for (let bits = 0; bits < assignmentCount; bits += 1) {
      const assignment = new Map(
        keys.map((key, index) => [key, Boolean(bits & (2 ** index))])
      );
      if (!isPossibleAssignment(assignment)) continue;
      if (formationMask(left, assignment) !== formationMask(right, assignment)) return false;
    }
    return true;
  }

  function formationMask(formation, assignment) {
    return formation.reduce((mask, { filter, angle }) => {
      const inside = shapeExpression(filter.shape.value, angle, assignment);
      return mask & (inside ? filter.foreground.mask : filter.background.mask);
    }, 7);
  }

  function shapeKeys(shape, angle) {
    if (shape === "none") return [];
    if (shape === "square") return [squareKey(angle)];
    if (shape === "square-star") return [0, 60, 120].map((offset) => squareKey(angle + offset));
    if (shape === "triangle") return [triangleKey(angle)];
    if (shape === "triangle-star") return [triangleKey(angle), triangleKey(angle + 180)];
    if (shape === "large-disc") return ["circle:large"];
    if (shape === "small-disc") return ["circle:small"];
    return ["circle:large", "circle:small"];
  }

  function shapeExpression(shape, angle, assignment) {
    if (shape === "none") return false;
    if (shape === "square") return assignment.get(squareKey(angle));
    if (shape === "square-star") {
      return [0, 60, 120].some((offset) => assignment.get(squareKey(angle + offset)));
    }
    if (shape === "triangle") return assignment.get(triangleKey(angle));
    if (shape === "triangle-star") {
      return assignment.get(triangleKey(angle)) || assignment.get(triangleKey(angle + 180));
    }
    if (shape === "large-disc") return assignment.get("circle:large");
    if (shape === "small-disc") return assignment.get("circle:small");
    return assignment.get("circle:large") && !assignment.get("circle:small");
  }

  function squareKey(angle) {
    return `square:${normalizeAngle(angle, 90)}`;
  }

  function triangleKey(angle) {
    return `triangle:${normalizeAngle(angle, 120)}`;
  }

  function normalizeAngle(angle, period) {
    return ((angle % period) + period) % period;
  }

  function isPossibleAssignment(assignment) {
    const shapeEntries = [...assignment.entries()].filter(
      ([key]) => key.startsWith("square:") || key.startsWith("triangle:")
    );
    if (assignment.get("circle:small") && assignment.has("circle:large")
      && !assignment.get("circle:large")) return false;
    if (assignment.get("circle:small")
      && shapeEntries.some(([, inside]) => !inside)) return false;
    if (assignment.has("circle:large") && !assignment.get("circle:large")
      && shapeEntries.some(([, inside]) => inside)) return false;
    return true;
  }

  function renderFilterLayer(poses) {
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
    const signature = layers.map(({ filter }) => (
      `${filter.background.mask}:${filter.foreground.mask}:${filter.shape.value}`
    )).join("|");
    const geometry = layers.map(({ x, y, angle }) => `${x}:${y}:${angle}`);
    if (signature !== renderedFilterSignature) {
      filterRender.innerHTML = filterCompositionMarkup(layers, "board");
      renderedFilterSignature = signature;
      renderedFilterGeometry = geometry;
      filterLayerCircles = [...filterRender.querySelectorAll("[data-filter-layer]")];
      filterLayerMasks = [...filterRender.querySelectorAll("[data-filter-mask-layer]")];
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
    renderedFilterGeometry = geometry;
  }

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
      (formation, index) => formationsMatch(formation, targetFormations[index])
    );
    const targetsMatch = targetMatches.every(Boolean);
    targetMatches.forEach((matches, index) => updateTargetStatus(index, matches));
    progressIndicator.textContent = `Targets ${targetMatches.filter(Boolean).length}/3 \u00b7 Triangles ${pieces.filter((piece) => piece.snapped).length}/3 \u00b7 Snapped circles ${snappedCircleCount}`;
    if (inspectedTargetIndex !== null) refreshTargetInspector();
    successIndicator.hidden = !allPiecesSnapped || !targetsMatch;
  }

  function updateTargetStatus(index, matches) {
    const display = targetDisplays[index];
    display.root.classList.toggle("is-matched", matches);
    display.root.classList.toggle("is-unmatched", !matches);
    display.root.setAttribute(
      "aria-label",
      `Target pattern ${index + 1}, ${matches ? "matched" : "not matched"}`
    );
  }

  function showTargetInspector(index) {
    inspectedTargetIndex = index;
    targetInspector.classList.toggle("is-pinned", inspectorPinned);
    targetInspector.hidden = false;
    currentVisuals = visualsForPoses(pieces);
    refreshTargetInspector();
  }

  function scheduleDragUpdate() {
    if (dragUpdateFrame !== null) return;
    dragUpdateFrame = requestAnimationFrame(() => {
      dragUpdateFrame = null;
      updateSuccess();
    });
  }

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

  function hideTargetInspector() {
    inspectedTargetIndex = null;
    inspectorPinned = false;
    targetInspector.classList.remove("is-pinned");
    targetInspector.hidden = true;
  }

  resetButton.addEventListener("click", resetPieces);
  targetInspector.addEventListener("click", hideTargetInspector);
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (targetInspector.hidden
      || (target instanceof Element && target.closest(".target-pattern"))) return;
    hideTargetInspector();
  }, true);
  svg.addEventListener("pointermove", (event) => {
    if (activeDrag && event.pointerId === activeDrag.pointerId) {
      const coalescedEvents = event.getCoalescedEvents
        ? event.getCoalescedEvents()
        : [];
      const latestEvent = coalescedEvents[coalescedEvents.length - 1] || event;
      const pointer = svgPoint(latestEvent);
      activeDrag.piece.position = {
        x: pointer.x - activeDrag.offset.x,
        y: pointer.y - activeDrag.offset.y
      };
      constrainPiecePosition(activeDrag.piece);
      updatePiece(activeDrag.piece);
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
  svg.addEventListener("pointerdown", beginBoardPan);
  svg.addEventListener("pointerup", finishDrag);
  svg.addEventListener("pointerup", finishBoardPan);
  svg.addEventListener("pointercancel", finishDrag);
  svg.addEventListener("pointercancel", finishBoardPan);
  window.addEventListener("pageshow", updateBoardZoom);
  window.addEventListener("resize", updateBoardZoom);
  window.LightDiscGame = { applyPuzzleCode, levelCode };
  resetPieces();
})();

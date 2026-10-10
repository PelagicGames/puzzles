(() => {
  const {
    bitCount,
    formationDifference,
    formationKeys,
    formationMask,
    formationsMatch,
    forEachPossibleAssignment,
    normalizeAngle,
    shapeKeys
  } = window.LightDiscMath;
  const shapeOrder = [
    "none",
    "square",
    "triangle",
    "large-disc",
    "small-disc",
    "annulus",
    "square-star",
    "triangle-star"
  ];
  const pieceNames = ["red", "green", "blue"];
  const targetNames = ["top", "left", "right"];
  const rootThree = Math.sqrt(3);
  const cornerCoordinates = [
    { x: 0, y: -2 },
    { x: -rootThree, y: 1 },
    { x: rootThree, y: 1 }
  ];
  const poseTemplates = enumeratePoseTemplates();
  const poseById = new Map(poseTemplates.map((pose) => [pose.id, pose]));
  const unsnappedPoses = Array.from({ length: 6 }, (_, angleStep) => ({
    id: `u${angleStep}`,
    angleStep,
    angle: angleStep * 60,
    mapping: [-1, -1, -1],
    movingMask: 0,
    targetMask: 0,
    snapCount: 0
  }));
  const graphPoses = [...unsnappedPoses, ...poseTemplates];
  const graphPoseById = new Map(graphPoses.map((pose) => [pose.id, pose]));
  const poseGraph = buildPoseGraph();
  const shortestPaths = buildShortestPaths();

  function analyzePuzzle(codeOrDefinition) {
    const definition = typeof codeOrDefinition === "string"
      ? window.LightDiscPuzzleCode.parsePuzzleCode(codeOrDefinition)
      : codeOrDefinition;
    const targetFormations = definition.targets.map(targetFormation);
    const diagnostics = [];
    const stats = {
      initialCombinations: poseTemplates.length ** 3,
      localWays: [],
      arcRevisions: 0,
      searchNodes: 0,
      rawSolutionCount: 0
    };
    const matchesTarget = createTargetMatcher(definition, targetFormations);
    let domains = Array.from(
      { length: 3 },
      () => poseTemplates.map(({ id }) => id)
    );

    for (let targetIndex = 0; targetIndex < 3; targetIndex += 1) {
      const ways = localTargetWays(definition, targetFormations, targetIndex);
      stats.localWays.push(ways.length);
      if (ways.length === 0) {
        diagnostics.push({
          type: "target-unreachable",
          targetIndex,
          message: `The ${targetNames[targetIndex]} target cannot be formed by any combination of zero to three movable circles.`
        });
        return unsolvableAnalysis(definition, diagnostics, stats);
      }
      if (ways.length === 1) {
        domains = domains.map((domain, pieceIndex) => (
          domain.filter((poseId) => (
            localContributionKey(
              definition,
              pieceIndex,
              poseById.get(poseId),
              targetIndex
            ) === ways[0][pieceIndex]
          ))
        ));
        diagnostics.push({
          type: "forced-target",
          targetIndex,
          message: `The ${targetNames[targetIndex]} target has one local construction, so its contributing circles and orientations are forced.`
        });
      }
    }

    domains = enforceArcConsistency(
      matchesTarget,
      domains,
      stats
    );
    if (domains.some((domain) => domain.length === 0)) {
      diagnostics.push({
        type: "incompatible-targets",
        message: "Individually achievable targets impose incompatible triangle placements."
      });
      return unsolvableAnalysis(definition, diagnostics, stats);
    }

    const solutionIds = [];
    searchSolutions(
      matchesTarget,
      domains,
      stats,
      solutionIds,
      new Set()
    );
    if (solutionIds.length === 0) {
      diagnostics.push({
        type: "incompatible-targets",
        message: "No globally consistent placement satisfies all three targets."
      });
      return unsolvableAnalysis(definition, diagnostics, stats);
    }

    stats.rawSolutionCount = solutionIds.length;
    const solutionGroups = new Map();
    solutionIds.forEach((poseIds) => {
      const signature = solutionSignature(definition, poseIds);
      if (!solutionGroups.has(signature)) solutionGroups.set(signature, []);
      solutionGroups.get(signature).push(poseIds);
    });
    const solutions = [...solutionGroups.values()].map((equivalentPoseIds) => {
      const representative = [...equivalentPoseIds].sort(
        (left, right) => resetDistance(left) - resetDistance(right)
      )[0];
      return formulateSolution(definition, representative, equivalentPoseIds);
    });
    const analysis = {
      definition,
      solvable: true,
      diagnostics,
      domains,
      solutions,
      solutionCount: solutions.length,
      stats
    };
    analysis.complexity = calculateComplexity(analysis);
    return analysis;
  }

  function unsolvableAnalysis(definition, diagnostics, stats) {
    return {
      definition,
      solvable: false,
      diagnostics,
      domains: [[], [], []],
      solutions: [],
      solutionCount: 0,
      stats,
      complexity: {
        label: "Unsolvable",
        score: null,
        solutionCount: 0,
        resetPathDistance: Infinity,
        nearTrapCount: 0,
        maximumDetour: 0
      }
    };
  }

  function enumeratePoseTemplates() {
    const poses = new Map();
    for (let angleStep = 0; angleStep < 6; angleStep += 1) {
      const rotated = cornerCoordinates.map(
        (corner) => rotatePoint(corner, angleStep * 60)
      );
      for (let movingIndex = 0; movingIndex < 3; movingIndex += 1) {
        for (let targetIndex = 0; targetIndex < 3; targetIndex += 1) {
          const translation = {
            x: cornerCoordinates[targetIndex].x - rotated[movingIndex].x,
            y: cornerCoordinates[targetIndex].y - rotated[movingIndex].y
          };
          const mapping = rotated.map((corner) => {
            const point = {
              x: corner.x + translation.x,
              y: corner.y + translation.y
            };
            return cornerCoordinates.findIndex(
              (target) => Math.hypot(target.x - point.x, target.y - point.y) < 1e-6
            );
          });
          const snapCount = mapping.filter((value) => value >= 0).length;
          const key = `${angleStep}:${mapping.join(",")}`;
          if (poses.has(key)) continue;
          const movingMask = mapping.reduce(
            (mask, value, index) => mask | (value >= 0 ? 1 << index : 0),
            0
          );
          const targetMask = mapping.reduce(
            (mask, value) => mask | (value >= 0 ? 1 << value : 0),
            0
          );
          poses.set(key, {
            id: `p${poses.size}`,
            angleStep,
            angle: angleStep * 60,
            mapping,
            movingMask,
            targetMask,
            snapCount
          });
        }
      }
    }
    return [...poses.values()].sort((left, right) => (
      left.snapCount - right.snapCount
      || left.angleStep - right.angleStep
      || left.mapping.join("").localeCompare(right.mapping.join(""))
    )).map((pose, index) => ({ ...pose, id: `p${index}` }));
  }

  function rotatePoint(point, angle) {
    const radians = angle * Math.PI / 180;
    return {
      x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
      y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
    };
  }

  function targetFormation(filter) {
    return [{ filter, angle: filter.rotation || 0 }];
  }

  function contributionForTarget(definition, pieceIndex, pose, targetIndex) {
    if (!pose || pose.snapCount === 0) return null;
    const discIndex = pose.mapping.indexOf(targetIndex);
    if (discIndex < 0) return null;
    const filter = definition.pieces[pieceIndex][discIndex];
    return {
      filter,
      angle: pose.angle + (filter.rotation || 0),
      discIndex,
      pieceIndex
    };
  }

  function formationForTarget(definition, poseIds, targetIndex) {
    return poseIds.flatMap((poseId, pieceIndex) => {
      const contribution = contributionForTarget(
        definition,
        pieceIndex,
        graphPoseById.get(poseId),
        targetIndex
      );
      return contribution ? [contribution] : [];
    });
  }

  function localContributionKey(definition, pieceIndex, pose, targetIndex) {
    const contribution = contributionForTarget(
      definition,
      pieceIndex,
      pose,
      targetIndex
    );
    if (!contribution) return "-";
    return `${contribution.discIndex}@${normalizeAngle(contribution.angle, 360)}`;
  }

  function localTargetWays(definition, targetFormations, targetIndex) {
    const options = definition.pieces.map((_, pieceIndex) => (
      [...new Set(poseTemplates.map((pose) => (
        localContributionKey(definition, pieceIndex, pose, targetIndex)
      )))]
    ));
    const ways = [];
    options[0].forEach((red) => {
      options[1].forEach((green) => {
        options[2].forEach((blue) => {
          const keys = [red, green, blue];
          const formation = keys.flatMap((key, pieceIndex) => {
            if (key === "-") return [];
            const [discText, angleText] = key.split("@");
            const filter = definition.pieces[pieceIndex][Number(discText)];
            return [{ filter, angle: Number(angleText) }];
          });
          if (formationsMatch(formation, targetFormations[targetIndex])) {
            ways.push(keys);
          }
        });
      });
    });
    return ways;
  }

  function createTargetMatcher(definition, targets) {
    const caches = targets.map(() => new Map());
    return (targetIndex, poseIds) => {
      const key = poseIds.map((poseId, pieceIndex) => (
        localContributionKey(
          definition,
          pieceIndex,
          poseById.get(poseId),
          targetIndex
        )
      )).join("|");
      if (!caches[targetIndex].has(key)) {
        caches[targetIndex].set(
          key,
          formationsMatch(
            formationForTarget(definition, poseIds, targetIndex),
            targets[targetIndex]
          )
        );
      }
      return caches[targetIndex].get(key);
    };
  }

  function enforceArcConsistency(matchesTarget, sourceDomains, stats) {
    const domains = sourceDomains.map((domain) => [...domain]);
    let changed = true;
    while (changed) {
      changed = false;
      for (let targetIndex = 0; targetIndex < 3; targetIndex += 1) {
        for (let pieceIndex = 0; pieceIndex < 3; pieceIndex += 1) {
          const supported = domains[pieceIndex].filter((poseId) => (
            hasTargetSupport(
              matchesTarget,
              targetIndex,
              pieceIndex,
              poseId,
              domains
            )
          ));
          if (supported.length !== domains[pieceIndex].length) {
            stats.arcRevisions += domains[pieceIndex].length - supported.length;
            domains[pieceIndex] = supported;
            changed = true;
            if (supported.length === 0) return domains;
          }
        }
      }
    }
    return domains;
  }

  function hasTargetSupport(
    matchesTarget,
    targetIndex,
    fixedPiece,
    fixedPose,
    domains
  ) {
    const chosen = [null, null, null];
    chosen[fixedPiece] = fixedPose;
    const remaining = [0, 1, 2].filter((index) => index !== fixedPiece);
    for (const first of domains[remaining[0]]) {
      chosen[remaining[0]] = first;
      for (const second of domains[remaining[1]]) {
        chosen[remaining[1]] = second;
        if (matchesTarget(targetIndex, chosen)) return true;
      }
    }
    return false;
  }

  function searchSolutions(
    matchesTarget,
    sourceDomains,
    stats,
    solutions,
    visited
  ) {
    const domains = enforceArcConsistency(
      matchesTarget,
      sourceDomains,
      stats
    );
    if (domains.some((domain) => domain.length === 0)) return;
    const signature = domains.map((domain) => domain.join(",")).join("|");
    if (visited.has(signature)) return;
    visited.add(signature);
    stats.searchNodes += 1;
    const branchPiece = domains
      .map((domain, pieceIndex) => ({ pieceIndex, size: domain.length }))
      .filter(({ size }) => size > 1)
      .sort((left, right) => left.size - right.size)[0];
    if (!branchPiece) {
      const poseIds = domains.map(([poseId]) => poseId);
      if ([0, 1, 2].every((targetIndex) => (
        matchesTarget(targetIndex, poseIds)
      ))) solutions.push(poseIds);
      return;
    }
    domains[branchPiece.pieceIndex].forEach((poseId) => {
      const branch = domains.map((domain) => [...domain]);
      branch[branchPiece.pieceIndex] = [poseId];
      searchSolutions(
        matchesTarget,
        branch,
        stats,
        solutions,
        visited
      );
    });
  }

  function createStateVector(definition, poseIds) {
    const placements = poseIds.map((poseId) => {
      const pose = graphPoseById.get(poseId);
      if (!pose) throw new Error(`Unknown pose "${poseId}".`);
      return [
        pose.snapCount,
        pose.movingMask,
        pose.targetMask,
        pose.angleStep,
        ...pose.mapping
      ];
    });
    const circles = [0, 1, 2].map((targetIndex) => (
      poseIds.flatMap((poseId, pieceIndex) => {
        const contribution = contributionForTarget(
          definition,
          pieceIndex,
          graphPoseById.get(poseId),
          targetIndex
        );
        return contribution ? [componentVector(contribution)] : [];
      })
    ));
    const snappedTriangleCount = placements.filter(([snapCount]) => snapCount > 0).length;
    return {
      poseIds: [...poseIds],
      placements,
      circles,
      snappedTriangleCount,
      tuple: [placements, circles, snappedTriangleCount]
    };
  }

  function componentVector({ filter, angle }) {
    return [
      filter.background.mask,
      filter.foreground.mask,
      shapeOrder.indexOf(filter.shape.value),
      normalizeAngle(angle, 360) / 60
    ];
  }

  function solutionDistance(definition, stateOrPoseIds) {
    const state = Array.isArray(stateOrPoseIds)
      ? createStateVector(definition, stateOrPoseIds)
      : stateOrPoseIds;
    const targetFormations = definition.targets.map(targetFormation);
    const targetDistance = targetFormations.reduce((total, target, targetIndex) => (
      total + targetCircleDistance(
        formationForTarget(definition, state.poseIds, targetIndex),
        target
      )
    ), 0);
    return targetDistance + (3 - state.snappedTriangleCount);
  }

  function targetCircleDistance(current, target) {
    if (formationsMatch(current, target)) return 0;
    const keys = formationKeys([...current, ...target]);
    const outside = new Map(keys.map((key) => [key, false]));
    const inside = new Map(keys.map((key) => [key, true]));
    const backgroundDistance = bitCount(
      formationMask(current, outside) ^ formationMask(target, outside)
    );
    const foregroundDistance = bitCount(
      formationMask(current, inside) ^ formationMask(target, inside)
    );
    const currentKeys = new Set(formationKeys(current));
    const targetKeys = new Set(formationKeys(target));
    const shapeDistance = new Set([...currentKeys, ...targetKeys]).size
      - [...currentKeys].filter((key) => targetKeys.has(key)).length;
    const rotationDistance = orientationDistance(currentKeys, targetKeys);
    const semanticDistance = Math.ceil(formationDifference(current, target) / 3);
    return backgroundDistance
      + foregroundDistance
      + shapeDistance
      + rotationDistance
      + semanticDistance;
  }

  function orientationDistance(currentKeys, targetKeys) {
    const current = [...currentKeys].filter(
      (key) => key.startsWith("square:") || key.startsWith("triangle:")
    );
    const target = [...targetKeys].filter(
      (key) => key.startsWith("square:") || key.startsWith("triangle:")
    );
    if (current.length !== 1 || target.length !== 1) return 0;
    const [currentShape, currentAngle] = current[0].split(":");
    const [targetShape, targetAngle] = target[0].split(":");
    if (currentShape !== targetShape) return 0;
    const period = currentShape === "square" ? 90 : 120;
    const difference = Math.abs(Number(currentAngle) - Number(targetAngle));
    return Math.min(difference, period - difference) / 30;
  }

  function pathDistance(stateOrPoseIds, analysis) {
    if (!analysis.solvable) return Infinity;
    const poseIds = Array.isArray(stateOrPoseIds)
      ? stateOrPoseIds
      : stateOrPoseIds.poseIds;
    return Math.min(...analysis.solutions.flatMap((solution) => (
      solution.equivalentPoseIds.map((solutionPoseIds) => (
        poseIds.reduce((total, poseId, pieceIndex) => (
          total + shortestPaths.distances.get(poseId).get(solutionPoseIds[pieceIndex])
        ), 0)
      ))
    )));
  }

  function solutionSignature(definition, poseIds) {
    return [0, 1, 2].map((targetIndex) => (
      formationForTarget(definition, poseIds, targetIndex)
        .map(({ filter, angle, discIndex, pieceIndex }) => (
          `${pieceIndex}:${discIndex}:${shapeKeys(filter.shape.value, angle).sort().join("+")}`
        ))
        .join(",")
    )).join("|");
  }

  function solutionShorthand(definition, poseIds) {
    const pieceCodes = ["R", "G", "B"];
    return [0, 1, 2].map((targetIndex) => {
      const contributors = formationForTarget(definition, poseIds, targetIndex)
        .map(({ filter, angle, discIndex, pieceIndex }) => (
          `${pieceCodes[pieceIndex]}${discIndex + 1}${rotationMarks(filter, angle)}`
        ));
      return `T${targetIndex + 1}:${contributors.join("+") || "-"}`;
    }).join(" ");
  }

  function rotationMarks(filter, angle) {
    if (filter.shape.value === "triangle") {
      return "'".repeat(normalizeAngle(angle, 120) / 60);
    }
    if (filter.shape.value === "square") {
      const canonicalAngle = normalizeAngle(angle, 90);
      const markCount = canonicalAngle === 0 ? 0 : canonicalAngle === 60 ? 1 : 2;
      return "'".repeat(markCount);
    }
    return "";
  }

  function resetDistance(poseIds) {
    return poseIds.reduce((total, poseId) => (
      total + shortestPaths.distances.get("u0").get(poseId)
    ), 0);
  }

  function formulateSolution(definition, poseIds, equivalentPoseIds) {
    const moves = [];
    let distance = 0;
    poseIds.forEach((poseId, pieceIndex) => {
      const path = shortestPath("u0", poseId);
      for (let index = 1; index < path.length; index += 1) {
        const from = graphPoseById.get(path[index - 1]);
        const to = graphPoseById.get(path[index]);
        const cost = transitionCost(from, to);
        distance += cost;
        moves.push({
          pieceIndex,
          piece: pieceNames[pieceIndex],
          from: path[index - 1],
          to: path[index],
          cost,
          instruction: describeTransition(pieceNames[pieceIndex], from, to)
        });
      }
    });
    return {
      poseIds: [...poseIds],
      equivalentPoseIds: equivalentPoseIds.map((ids) => [...ids]),
      shorthand: solutionShorthand(definition, poseIds),
      vector: createStateVector(definition, poseIds),
      pathDistance: distance,
      moves
    };
  }

  function buildPoseGraph() {
    const adjacency = new Map(graphPoses.map(({ id }) => [id, []]));
    graphPoses.forEach((left, leftIndex) => {
      graphPoses.slice(leftIndex + 1).forEach((right) => {
        const cost = transitionCost(left, right);
        if (!Number.isFinite(cost)) return;
        adjacency.get(left.id).push({ id: right.id, cost });
        adjacency.get(right.id).push({ id: left.id, cost });
      });
    });
    return adjacency;
  }

  function transitionCost(left, right) {
    if (left.snapCount === 0 && right.snapCount === 0) {
      return cyclicStepDistance(left.angleStep, right.angleStep, 6);
    }
    if (left.snapCount === 0 || right.snapCount === 0) {
      const free = left.snapCount === 0 ? left : right;
      const snapped = left.snapCount === 0 ? right : left;
      return snapped.snapCount === 1
        ? cyclicStepDistance(free.angleStep, snapped.angleStep, 6) + 1
        : Infinity;
    }
    if (Math.abs(left.snapCount - right.snapCount) === 1) {
      const smaller = left.snapCount < right.snapCount ? left : right;
      const larger = left.snapCount < right.snapCount ? right : left;
      if (smaller.snapCount === 1) {
        return 1 + Math.min(...larger.mapping.flatMap((target, movingIndex) => {
          if (target < 0) return [];
          const retained = {
            angleStep: larger.angleStep,
            mapping: [-1, -1, -1]
          };
          retained.mapping[movingIndex] = target;
          return [singleSnapMoveCost(smaller, retained)];
        }));
      }
      return 1 + Math.min(...larger.mapping.map((target, movingIndex) => {
        const retained = {
          mapping: [...larger.mapping],
          targetMask: larger.targetMask & ~(1 << target)
        };
        retained.mapping[movingIndex] = -1;
        return doubleSnapMoveCost(smaller, retained);
      }));
    }
    if (left.snapCount !== right.snapCount) return Infinity;
    if (left.snapCount === 1) {
      return singleSnapMoveCost(left, right);
    }
    if (left.snapCount === 2) {
      return doubleSnapMoveCost(left, right);
    }
    return cyclicStepDistance(left.angleStep / 2, right.angleStep / 2, 3);
  }

  function singleSnapMoveCost(left, right) {
    return Number(left.mapping.findIndex((value) => value >= 0)
        !== right.mapping.findIndex((value) => value >= 0))
      + Number(left.mapping.find((value) => value >= 0)
        !== right.mapping.find((value) => value >= 0))
      + cyclicStepDistance(left.angleStep, right.angleStep, 6);
  }

  function doubleSnapMoveCost(left, right) {
    return Number(left.mapping.indexOf(-1) !== right.mapping.indexOf(-1))
      + Number(missingIndex(left.targetMask) !== missingIndex(right.targetMask));
  }

  function missingIndex(mask) {
    return [0, 1, 2].find((index) => !(mask & (1 << index)));
  }

  function cyclicStepDistance(left, right, period) {
    const difference = Math.abs(left - right);
    return Math.min(difference, period - difference);
  }

  function buildShortestPaths() {
    const distances = new Map();
    const previous = new Map();
    graphPoses.forEach(({ id: source }) => {
      const sourceDistances = new Map([[source, 0]]);
      const sourcePrevious = new Map();
      const unsettled = new Set(graphPoses.map(({ id }) => id));
      while (unsettled.size) {
        const current = [...unsettled].reduce((best, candidate) => (
          (sourceDistances.get(candidate) ?? Infinity)
            < (sourceDistances.get(best) ?? Infinity)
            ? candidate
            : best
        ));
        if (!sourceDistances.has(current)) break;
        unsettled.delete(current);
        poseGraph.get(current).forEach(({ id: next, cost }) => {
          if (!unsettled.has(next)) return;
          const candidateDistance = sourceDistances.get(current) + cost;
          if (candidateDistance >= (sourceDistances.get(next) ?? Infinity)) return;
          sourceDistances.set(next, candidateDistance);
          sourcePrevious.set(next, current);
        });
      }
      distances.set(source, sourceDistances);
      previous.set(source, sourcePrevious);
    });
    return { distances, previous };
  }

  function shortestPath(source, target) {
    const previous = shortestPaths.previous.get(source);
    if (!shortestPaths.distances.get(source).has(target)) return [];
    const path = [target];
    while (path[0] !== source) path.unshift(previous.get(path[0]));
    return path;
  }

  function describeTransition(pieceName, from, to) {
    if (from.snapCount === 0 && to.snapCount === 0) {
      return `Rotate the ${pieceName} triangle by 60 degrees.`;
    }
    if (from.snapCount !== to.snapCount) {
      const action = to.snapCount > from.snapCount ? "Snap" : "Unsnap";
      const reconfigurationMoves = transitionCost(from, to) - 1;
      return reconfigurationMoves
        ? `Reconfigure the ${pieceName} triangle (${reconfigurationMoves} ${reconfigurationMoves === 1 ? "move" : "moves"}), then ${action.toLowerCase()} one circle.`
        : `${action} one circle on the ${pieceName} triangle.`;
    }
    if (to.snapCount === 1) {
      if (from.angleStep !== to.angleStep) {
        return `Rotate the snapped ${pieceName} circle by 60 degrees.`;
      }
      if (from.mapping.indexOf(-1) !== to.mapping.indexOf(-1)) {
        return `Change which ${pieceName} circle is snapped.`;
      }
      return `Move the snapped ${pieceName} circle to another target position.`;
    }
    if (to.snapCount === 2) {
      if (from.mapping.indexOf(-1) !== to.mapping.indexOf(-1)) {
        return `Change the free circle on the ${pieceName} triangle.`;
      }
      return `Change the free target position for the ${pieceName} triangle.`;
    }
    return `Rotate the fully snapped ${pieceName} triangle by 120 degrees.`;
  }

  function calculateComplexity(analysis) {
    const resetPathDistance = pathDistance(["u0", "u0", "u0"], analysis);
    if (analysis.solutionCount > 1) {
      return {
        label: "Very low",
        score: Math.max(
          1,
          24 - Math.ceil(Math.log2(analysis.solutionCount + 1)) * 2
        ),
        solutionCount: analysis.solutionCount,
        resetPathDistance,
        nearTrapCount: 0,
        maximumDetour: 0
      };
    }

    let nearTrapCount = 0;
    let maximumDetour = 0;
    poseTemplates.forEach((red) => {
      poseTemplates.forEach((green) => {
        poseTemplates.forEach((blue) => {
          const poseIds = [red.id, green.id, blue.id];
          const distance = solutionDistance(analysis.definition, poseIds);
          if (distance === 0 || distance > 6) return;
          const route = pathDistance(poseIds, analysis);
          const detour = Math.max(0, route - distance);
          if (detour > 0) {
            nearTrapCount += 1;
            maximumDetour = Math.max(maximumDetour, detour);
          }
        });
      });
    });
    const score = Math.min(
      100,
      48
        + Math.min(20, resetPathDistance * 2)
        + Math.min(20, maximumDetour * 3)
        + Math.min(12, Math.ceil(Math.log2(nearTrapCount + 1)))
    );
    const label = score >= 85 ? "Very high" : score >= 68 ? "High" : "Moderate";
    return {
      label,
      score,
      solutionCount: 1,
      resetPathDistance,
      nearTrapCount,
      maximumDetour
    };
  }

  function poseIdFor(angle, mapping, snapped) {
    const angleStep = normalizeAngle(angle, 360) / 60;
    if (!snapped) return `u${angleStep}`;
    const pose = poseTemplates.find((candidate) => (
      candidate.angleStep === angleStep
      && candidate.mapping.every((target, index) => target === mapping[index])
    ));
    return pose?.id || null;
  }

  window.LightDiscSolver = {
    analyzePuzzle,
    createStateVector,
    pathDistance,
    poseIdFor,
    poseTemplates,
    solutionDistance,
    targetCircleDistance
  };
})();

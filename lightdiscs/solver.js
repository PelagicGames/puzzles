// Copyright (C) 2026 Pelagic Games
/**
 * Symbolic placement solver and difficulty estimator, loaded after puzzle-code.js
 * and puzzle-math.js by Node tests/offline tools. Publishes LightDiscSolver; no DOM,
 * storage or file access. Analysis accepts code or a definition and sets the
 * definition's combination field, including when the caller supplied that object.
 * Pose search reasons about snapped circle mappings, not arbitrary board collisions.
 */

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
  // Stable shape indices form the component-vector encoding, not display ordering.
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
  // Scale-free equilateral coordinates suffice for enumerating coincident corners.
  const cornerCoordinates = [
    { x: 0, y: -2 },
    { x: -rootThree, y: 1 },
    { x: rootThree, y: 1 }
  ];
  // Poses carry id, 60-degree angleStep/angle, three moving-to-target indices
  // (-1 for a free corner), movingMask/targetMask bitsets and snapCount.
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
  // Search domains use snapped poses; movement distances also include six free poses.
  const graphPoses = [...unsnappedPoses, ...poseTemplates];
  const graphPoseById = new Map(graphPoses.map((pose) => [pose.id, pose]));
  const poseGraph = buildPoseGraph();
  const shortestPaths = buildShortestPaths();

  /**
   * Find solutions with local pruning, arc consistency and smallest-domain search.
   * Symmetric constructions are grouped before optional heuristic difficulty scoring.
   * @param {string|Object} codeOrDefinition - Encoded or parsed puzzle.
   * @param {Object} options - combination override and includeComplexity switch.
   * @returns {Object} Definition, diagnostics, domains, solutions, statistics and complexity.
   */
  function analyzePuzzle(codeOrDefinition, options = {}) {
    const definition = typeof codeOrDefinition === "string"
      ? window.LightDiscPuzzleCode.parsePuzzleCode(codeOrDefinition)
      : codeOrDefinition;
    definition.combination = options.combination
      || definition.combination
      || "standard";
    const targetFormations = definition.targets.map(targetFormation);
    const diagnostics = [];
    // Counters distinguish initial Cartesian size, local constructions, removed
    // domain values, visited branches and ungrouped complete pose assignments.
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
    // Key by contributing disc identities and canonical shape predicates, ignoring
    // orientation changes that leave each shape unchanged.
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
    analysis.minimumXorCombinations = definition.combination === "xor"
      ? Math.min(...solutions.map(({ xorCombinationCount }) => xorCombinationCount))
      : 0;
    analysis.complexity = options.includeComplexity === false
      ? null
      : definition.combination === "xor"
        ? calculateXorComplexity(analysis)
        : calculateComplexity(analysis);
    return analysis;
  }

  /**
   * @param {Object} definition - Analysed puzzle.
   * @param {Object[]} diagnostics - Reasons accumulated so far.
   * @param {Object} stats - Search counters retained by reference.
   * @returns {Object} Uniform failure result with empty domains and infinite reset distance.
   */
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
        minimumSnappedCircles: null,
        resetPathDistance: Infinity,
        nearTrapCount: 0,
        maximumDetour: 0
      }
    };
  }

  /**
   * Align each moving/fixed corner at six orientations and deduplicate mappings.
   * Sorting fixes public pose IDs independently of enumeration duplicates.
   * @returns {Object[]} All distinct poses with at least one coincident corner.
   */
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

  /**
   * @param {Object} point - Local x/y coordinate.
   * @param {number} angle - Rotation in degrees.
   * @returns {Object} Rotated point about the origin.
   */
  function rotatePoint(point, angle) {
    const radians = angle * Math.PI / 180;
    return {
      x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
      y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
    };
  }

  /**
   * @param {Object} filter - Target filter with optional rotation.
   * @returns {Object[]} Single-filter symbolic formation.
   */
  function targetFormation(filter) {
    return [{ filter, angle: filter.rotation || 0 }];
  }

  /**
   * @param {Object} definition - Puzzle pieces.
   * @param {number} pieceIndex - Moving triangle index.
   * @param {Object|undefined} pose - Candidate pose.
   * @param {number} targetIndex - Fixed corner index.
   * @returns {Object|null} Filter, total angle and source indices, or no contribution.
   */
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

  /**
   * @param {Object} definition - Puzzle pieces.
   * @param {string[]} poseIds - One graph pose ID per triangle.
   * @param {number} targetIndex - Fixed corner index.
   * @returns {Object[]} Contributions from all triangles at that corner.
   */
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

  /**
   * @param {Object} definition - Puzzle pieces.
   * @param {number} pieceIndex - Moving triangle index.
   * @param {Object|undefined} pose - Candidate pose.
   * @param {number} targetIndex - Fixed corner index.
   * @returns {string} Disc index and angle identity, or "-" for no contribution.
   */
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

  /**
   * Enumerate unique local contributions independently of other target constraints.
   * @param {Object} definition - Puzzle and combination rule.
   * @param {Object[][]} targetFormations - One desired formation per fixed corner.
   * @param {number} targetIndex - Corner to construct.
   * @returns {string[][]} Matching triples of local contribution keys.
   */
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
          if (formationsMatch(
            formation,
            targetFormations[targetIndex],
            definition.combination
          )) {
            ways.push(keys);
          }
        });
      });
    });
    return ways;
  }

  /**
   * Build a per-target cache keyed by local contribution triples, not full poses.
   * The returned matcher mutates only its private caches.
   * @param {Object} definition - Puzzle and combination rule.
   * @param {Object[][]} targets - Desired formations.
   * @returns {function(number, string[]): boolean} Target-index/pose-ID matcher.
   */
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
            targets[targetIndex],
            definition.combination
          )
        );
      }
      return caches[targetIndex].get(key);
    };
  }

  /**
   * Repeatedly remove poses with no supporting pair for any target constraint.
   * Copies domains but increments the supplied arcRevisions counter.
   * @param {Function} matchesTarget - Cached target matcher.
   * @param {string[][]} sourceDomains - Allowed poses per triangle.
   * @param {Object} stats - Mutable search counters.
   * @returns {string[][]} Pruned domains, possibly containing an empty domain.
   */
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

  /**
   * @param {Function} matchesTarget - Target matcher.
   * @param {number} targetIndex - Constraint to check.
   * @param {number} fixedPiece - Triangle whose pose is held fixed.
   * @param {string} fixedPose - Pose ID for that triangle.
   * @param {string[][]} domains - Available poses for the remaining triangles.
   * @returns {boolean} Whether some remaining pair satisfies this target.
   */
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

  /**
   * Recursively branch on the smallest non-singleton domain after pruning.
   * Mutates stats, appends complete solutions and records visited domain signatures.
   * @param {Function} matchesTarget - Target matcher.
   * @param {string[][]} sourceDomains - Current allowed poses.
   * @param {Object} stats - Mutable counters.
   * @param {string[][]} solutions - Output pose triples.
   * @param {Set<string>} visited - Already searched domain signatures.
   * @returns {void}
   */
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

  /**
   * Encode placements and target contributions; throws for unknown graph poses.
   * placements contain snap count, bitsets, angle step and mapping; circles contain
   * component vectors. tuple repeats those arrays and the snapped-triangle count.
   * @param {Object} definition - Puzzle pieces.
   * @param {string[]} poseIds - One pose per triangle.
   * @returns {Object} Structured state vector with copied pose IDs.
   */
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

  /**
   * @param {Object} contribution - Filter and total angle.
   * @returns {number[]} Background mask, foreground mask, shape index and angle step.
   */
  function componentVector({ filter, angle }) {
    return [
      filter.background.mask,
      filter.foreground.mask,
      shapeOrder.indexOf(filter.shape.value),
      normalizeAngle(angle, 360) / 60
    ];
  }

  /**
   * Sum target mismatch heuristics and a penalty for each unsnapped triangle.
   * @param {Object} definition - Puzzle and combination rule.
   * @param {Object|string[]} stateOrPoseIds - State vector or pose IDs.
   * @returns {number} Semantic mismatch score, not a shortest movement distance.
   */
  function solutionDistance(definition, stateOrPoseIds) {
    const state = Array.isArray(stateOrPoseIds)
      ? createStateVector(definition, stateOrPoseIds)
      : stateOrPoseIds;
    const targetFormations = definition.targets.map(targetFormation);
    const targetDistance = targetFormations.reduce((total, target, targetIndex) => (
      total + targetCircleDistance(
        formationForTarget(definition, state.poseIds, targetIndex),
        target,
        definition.combination
      )
    ), 0);
    return targetDistance + (3 - state.snappedTriangleCount);
  }

  /**
   * Combine channel, predicate, orientation and symbolic differences; exact matches
   * bypass the heuristic. Used for trap scoring rather than search pruning.
   * @param {Object[]} current - Current formation.
   * @param {Object[]} target - Desired formation.
   * @param {string} combination - Channel combination rule.
   * @returns {number} Non-negative mismatch score.
   */
  function targetCircleDistance(current, target, combination = "standard") {
    if (formationsMatch(current, target, combination)) return 0;
    const keys = formationKeys([...current, ...target]);
    const outside = new Map(keys.map((key) => [key, false]));
    const inside = new Map(keys.map((key) => [key, true]));
    const backgroundDistance = bitCount(
      formationMask(current, outside, combination)
        ^ formationMask(target, outside, combination)
    );
    const foregroundDistance = bitCount(
      formationMask(current, inside, combination)
        ^ formationMask(target, inside, combination)
    );
    const currentKeys = new Set(formationKeys(current));
    const targetKeys = new Set(formationKeys(target));
    const shapeDistance = new Set([...currentKeys, ...targetKeys]).size
      - [...currentKeys].filter((key) => targetKeys.has(key)).length;
    const rotationDistance = orientationDistance(currentKeys, targetKeys);
    const semanticDistance = Math.ceil(
      formationDifference(current, target, combination) / 3
    );
    return backgroundDistance
      + foregroundDistance
      + shapeDistance
      + rotationDistance
      + semanticDistance;
  }

  /**
   * @param {Set<string>} currentKeys - Current primitive predicates.
   * @param {Set<string>} targetKeys - Desired primitive predicates.
   * @returns {number} Symmetry-aware 30-degree steps for single like polygon keys, else zero.
   */
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

  /**
   * Minimise summed independent-triangle graph costs over every equivalent solution.
   * @param {Object|string[]} stateOrPoseIds - State vector or graph pose IDs.
   * @param {Object} analysis - Completed solver analysis.
   * @returns {number} Minimum movement cost, or Infinity for an unsolvable puzzle.
   */
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

  /**
   * @param {Object} definition - Puzzle pieces.
   * @param {string[]} poseIds - Candidate solved poses.
   * @returns {string} Contributor/shape-symmetry key used to group equivalent solutions.
   */
  function solutionSignature(definition, poseIds) {
    return [0, 1, 2].map((targetIndex) => (
      formationForTarget(definition, poseIds, targetIndex)
        .map(({ filter, angle, discIndex, pieceIndex }) => (
          `${pieceIndex}:${discIndex}:${shapeKeys(filter.shape.value, angle).sort().join("+")}`
        ))
        .join(",")
    )).join("|");
  }

  /**
   * @param {Object} definition - Puzzle pieces.
   * @param {string[]} poseIds - Solved poses.
   * @returns {string} Target-by-target contributor labels with canonical rotation marks.
   */
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

  /**
   * @param {Object} filter - Filter whose shape determines rotational symmetry.
   * @param {number} angle - Total rotation in degrees.
   * @returns {string} Canonical apostrophe suffix for triangle/square orientations.
   */
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

  /**
   * @param {string[]} poseIds - Destination poses.
   * @returns {number} Sum of graph costs from the upright free pose u0.
   */
  function resetDistance(poseIds) {
    return poseIds.reduce((total, poseId) => (
      total + shortestPaths.distances.get("u0").get(poseId)
    ), 0);
  }

  /**
   * Build representative vectors and reset instructions using precomputed paths.
   * @param {Object} definition - Puzzle and combination rule.
   * @param {string[]} poseIds - Chosen representative.
   * @param {string[][]} equivalentPoseIds - Symmetry-equivalent solved triples.
   * @returns {Object} Solution record with copied IDs, shorthand, vector, moves and costs.
   */
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
      xorCombinationCount: definition.combination === "xor"
        ? xorCombinationCount(definition, poseIds)
        : 0,
      moves
    };
  }

  /**
   * @param {Object} definition - Puzzle pieces.
   * @param {string[]} poseIds - Solved poses.
   * @returns {number} Targets with multiple contributors whose XOR differs from intersection.
   */
  function xorCombinationCount(definition, poseIds) {
    return [0, 1, 2].filter((targetIndex) => {
      const formation = formationForTarget(definition, poseIds, targetIndex);
      if (formation.length < 2) return false;
      const keys = formationKeys(formation);
      let differs = false;
      forEachPossibleAssignment(keys, (assignment) => {
        if (formationMask(formation, assignment, "xor")
          !== formationMask(formation, assignment, "standard")) {
          differs = true;
        }
      });
      return differs;
    }).length;
  }

  /**
   * Connect finite-cost transitions in both directions.
   * @returns {Map<string, Object[]>} Pose ID to neighbouring {id, cost} records.
   */
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

  /**
   * Model rotations and snap reconfiguration, permitting only adjacent snap counts.
   * A weighted edge may summarise several actions; Infinity forbids an edge.
   * @param {Object} left - Source graph pose.
   * @param {Object} right - Destination graph pose.
   * @returns {number} Symmetric abstract movement cost.
   */
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

  /**
   * @param {Object} left - One-snap pose.
   * @param {Object} right - One-snap pose.
   * @returns {number} Cost of changing moving corner, target and orientation.
   */
  function singleSnapMoveCost(left, right) {
    return Number(left.mapping.findIndex((value) => value >= 0)
        !== right.mapping.findIndex((value) => value >= 0))
      + Number(left.mapping.find((value) => value >= 0)
        !== right.mapping.find((value) => value >= 0))
      + cyclicStepDistance(left.angleStep, right.angleStep, 6);
  }

  /**
   * @param {Object} left - Two-snap pose.
   * @param {Object} right - Two-snap pose.
   * @returns {number} Cost of changing the free moving corner and free target.
   */
  function doubleSnapMoveCost(left, right) {
    return Number(left.mapping.indexOf(-1) !== right.mapping.indexOf(-1))
      + Number(missingIndex(left.targetMask) !== missingIndex(right.targetMask));
  }

  /**
   * @param {number} mask - Three-bit target occupancy.
   * @returns {number|undefined} First unoccupied index, or undefined when full.
   */
  function missingIndex(mask) {
    return [0, 1, 2].find((index) => !(mask & (1 << index)));
  }

  /**
   * @param {number} left - First canonical cyclic value.
   * @param {number} right - Second canonical cyclic value.
   * @param {number} period - Cycle length.
   * @returns {number} Shorter distance around the cycle.
   */
  function cyclicStepDistance(left, right, period) {
    const difference = Math.abs(left - right);
    return Math.min(difference, period - difference);
  }

  /**
   * Run Dijkstra from every graph pose, retaining predecessor maps for instructions.
   * @returns {Object} Nested distances and previous Maps keyed by source/destination IDs.
   */
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

  /**
   * @param {string} source - Starting graph pose ID.
   * @param {string} target - Destination graph pose ID.
   * @returns {string[]} Inclusive shortest route, or empty when unreachable.
   */
  function shortestPath(source, target) {
    const previous = shortestPaths.previous.get(source);
    if (!shortestPaths.distances.get(source).has(target)) return [];
    const path = [target];
    while (path[0] !== source) path.unshift(previous.get(path[0]));
    return path;
  }

  /**
   * @param {string} pieceName - Triangle colour name.
   * @param {Object} from - Starting pose.
   * @param {Object} to - Destination pose.
   * @returns {string} Human-readable summary of an abstract graph transition.
   */
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

  /**
   * Assign heuristic difficulty from solution multiplicity, snap count and reset
   * cost. Harder unique solutions also enumerate near states whose route cost
   * exceeds their semantic distance; these are counted as apparent near traps.
   * @param {Object} analysis - Solvable analysis.
   * @returns {Object} Label, bounded score and supporting movement/trap metrics.
   */
  function calculateComplexity(analysis) {
    const resetPathDistance = pathDistance(["u0", "u0", "u0"], analysis);
    const minimumSnappedCircles = Math.min(
      ...analysis.solutions.flatMap(({ equivalentPoseIds }) => (
        equivalentPoseIds.map((poseIds) => poseIds.reduce((total, poseId) => (
          total + poseById.get(poseId).snapCount
        ), 0))
      ))
    );
    if (minimumSnappedCircles === 3) {
      return {
        label: "Very easy",
        score: Math.min(24, 6 + resetPathDistance),
        solutionCount: analysis.solutionCount,
        minimumSnappedCircles,
        resetPathDistance,
        nearTrapCount: 0,
        maximumDetour: 0
      };
    }

    if (analysis.solutionCount > 1) {
      const easy = minimumSnappedCircles >= 5;
      return {
        label: easy ? "Easy" : "Very easy",
        score: easy
          ? Math.min(47, 25 + minimumSnappedCircles * 2)
          : Math.min(24, 8 + resetPathDistance),
        solutionCount: analysis.solutionCount,
        minimumSnappedCircles,
        resetPathDistance,
        nearTrapCount: 0,
        maximumDetour: 0
      };
    }
    if (minimumSnappedCircles < 5) {
      return {
        label: "Easy",
        score: Math.min(47, 25 + resetPathDistance),
        solutionCount: 1,
        minimumSnappedCircles,
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
    const uncappedScore = Math.min(
      100,
      48
        + Math.min(20, resetPathDistance * 2)
        + Math.min(20, maximumDetour * 3)
        + Math.min(12, Math.ceil(Math.log2(nearTrapCount + 1)))
    );
    const score = minimumSnappedCircles >= 6
      ? uncappedScore
      : Math.min(84, uncappedScore);
    const label = score >= 85
      ? "Very hard"
      : score >= 76
        ? "Hard"
        : "Medium";
    return {
      label,
      score,
      solutionCount: 1,
      minimumSnappedCircles,
      resetPathDistance,
      nearTrapCount,
      maximumDetour
    };
  }

  /**
   * Extend the standard heuristic with a capped XOR-specific combination burden.
   * @param {Object} analysis - Solvable XOR analysis with minimumXorCombinations.
   * @returns {Object} Difficulty metrics with XOR-adjusted score and thresholds.
   */
  function calculateXorComplexity(analysis) {
    const standardScale = calculateComplexity(analysis);
    const xorBurden = Math.min(12, analysis.minimumXorCombinations * 4);
    const score = Math.min(100, standardScale.score + xorBurden);
    const label = score >= 95
      ? "Very hard"
      : score >= 85
        ? "Hard"
        : score >= 48
          ? "Medium"
          : score >= 25
            ? "Easy"
            : "Very easy";
    return {
      ...standardScale,
      label,
      score,
      xorCombinationCount: analysis.minimumXorCombinations
    };
  }

  /**
   * @param {number} angle - Rotation in degrees, expected in 60-degree steps.
   * @param {number[]} mapping - Moving-to-target indices, -1 for free corners.
   * @param {boolean} snapped - Whether at least one corner is snapped.
   * @returns {string|null} Free pose ID or matching snapped ID; null for unknown snapped poses.
   */
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

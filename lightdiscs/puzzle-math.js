// Copyright (C) 2026 Pelagic Games
/**
 * Symbolic RGB filter comparison for the board, solver and offline catalogue tools.
 * Load before lightdiscs.js or solver.js; publishes LightDiscMath without DOM or
 * storage access. A formation is an array of {filter, angle} entries; colour masks
 * use red=4, green=2 and blue=1. Assignments map canonical shape keys to booleans.
 */

(() => {
  /**
   * Compare channel results over the permitted symbolic regions.
   * @param {Object[]} left - First formation.
   * @param {Object[]} right - Second formation.
   * @param {string} combination - Standard intersection or XOR.
   * @returns {boolean} Whether the formations have no channel differences.
   */
  function formationsMatch(left, right, combination = "standard") {
    return formationDifference(left, right, combination) === 0;
  }

  /**
   * Sum differing RGB bits across permitted assignments, without changing inputs.
   * @param {Object[]} left - First formation.
   * @param {Object[]} right - Second formation.
   * @param {string} combination - Channel combination rule.
   * @returns {number} Symbolic channel-difference total, not a pixel-area measure.
   */
  function formationDifference(left, right, combination = "standard") {
    const keys = formationKeys([...left, ...right]);
    let difference = 0;
    forEachPossibleAssignment(keys, (assignment) => {
      difference += bitCount(
        formationMask(left, assignment, combination)
          ^ formationMask(right, assignment, combination)
      );
    });
    return difference;
  }

  /**
   * Collect the distinct primitive predicates needed by a formation.
   * @param {Object[]} formation - Filter and angle entries.
   * @returns {string[]} Sorted canonical keys.
   */
  function formationKeys(formation) {
    return [...new Set(
      formation.flatMap(({ filter, angle }) => shapeKeys(filter.shape.value, angle))
    )].sort();
  }

  /**
   * Enumerate bit patterns, excluding known impossible containment combinations.
   * Invokes the callback synchronously with a fresh Map for each accepted pattern.
   * @param {string[]} keys - Primitive shape predicates.
   * @param {function(Map<string, boolean>): void} callback - Assignment consumer.
   * @returns {void}
   */
  function forEachPossibleAssignment(keys, callback) {
    for (let bits = 0; bits < 2 ** keys.length; bits += 1) {
      const assignment = new Map(
        keys.map((key, index) => [key, Boolean(bits & (2 ** index))])
      );
      if (isPossibleAssignment(assignment)) callback(assignment);
    }
  }

  /**
   * Evaluate one symbolic region; empty standard/XOR formations yield white/black.
   * @param {Object[]} formation - Filter and angle entries.
   * @param {Map<string, boolean>} assignment - Predicate truth values.
   * @param {string} combination - Channel combination rule.
   * @returns {number} Three-bit RGB mask.
   */
  function formationMask(formation, assignment, combination = "standard") {
    const identity = combination === "xor" ? 0 : 7;
    return formation.reduce((mask, { filter, angle }) => {
      const inside = shapeExpression(filter.shape.value, angle, assignment);
      const filterMask = inside ? filter.foreground.mask : filter.background.mask;
      return combination === "xor" ? mask ^ filterMask : mask & filterMask;
    }, identity);
  }

  /**
   * Expand compound shapes into their primitive containment predicates.
   * @param {string} shape - Shape value.
   * @param {number} angle - Rotation in degrees.
   * @returns {string[]} Required assignment keys.
   */
  function shapeKeys(shape, angle) {
    if (shape === "none") return [];
    if (shape === "square") return [squareKey(angle)];
    if (shape === "square-star") {
      return [0, 60, 120].map((offset) => squareKey(angle + offset));
    }
    if (shape === "triangle") return [triangleKey(angle)];
    if (shape === "triangle-star") {
      return [triangleKey(angle), triangleKey(angle + 180)];
    }
    if (shape === "large-disc") return ["circle:large"];
    if (shape === "small-disc") return ["circle:small"];
    return ["circle:large", "circle:small"];
  }

  /**
   * Evaluate a shape using unions for stars and subtraction for the annulus.
   * @param {string} shape - Shape value.
   * @param {number} angle - Rotation in degrees.
   * @param {Map<string, boolean>} assignment - Values for the shape's keys.
   * @returns {boolean|undefined} Containment value; missing primitive keys stay undefined.
   */
  function shapeExpression(shape, angle, assignment) {
    if (shape === "none") return false;
    if (shape === "square") return assignment.get(squareKey(angle));
    if (shape === "square-star") {
      return [0, 60, 120].some((offset) => assignment.get(squareKey(angle + offset)));
    }
    if (shape === "triangle") return assignment.get(triangleKey(angle));
    if (shape === "triangle-star") {
      return assignment.get(triangleKey(angle))
        || assignment.get(triangleKey(angle + 180));
    }
    if (shape === "large-disc") return assignment.get("circle:large");
    if (shape === "small-disc") return assignment.get("circle:small");
    return assignment.get("circle:large") && !assignment.get("circle:small");
  }

  /**
   * @param {number} angle - Rotation in degrees.
   * @returns {string} Square key modulo its 90-degree symmetry.
   */
  function squareKey(angle) {
    return `square:${normalizeAngle(angle, 90)}`;
  }

  /**
   * @param {number} angle - Rotation in degrees.
   * @returns {string} Triangle key modulo its 120-degree symmetry.
   */
  function triangleKey(angle) {
    return `triangle:${normalizeAngle(angle, 120)}`;
  }

  /**
   * @param {number} angle - Signed rotation or cyclic value.
   * @param {number} period - Positive repeat interval.
   * @returns {number} Non-negative remainder within the period.
   */
  function normalizeAngle(angle, period) {
    return ((angle % period) + period) % period;
  }

  /**
   * Reject contradictions between small disc, polygons and enclosing large disc.
   * This models containment constraints, not a full geometric region arrangement.
   * @param {Map<string, boolean>} assignment - Partial set of primitive predicates.
   * @returns {boolean} Whether none of the implemented containment rules is violated.
   */
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

  /**
   * @param {number} value - Non-negative small integer mask.
   * @returns {number} Number of set bits.
   */
  function bitCount(value) {
    let remaining = value;
    let count = 0;
    while (remaining) {
      count += remaining & 1;
      remaining >>= 1;
    }
    return count;
  }

  window.LightDiscMath = {
    bitCount,
    formationDifference,
    formationKeys,
    formationMask,
    formationsMatch,
    forEachPossibleAssignment,
    isPossibleAssignment,
    normalizeAngle,
    shapeExpression,
    shapeKeys
  };
})();

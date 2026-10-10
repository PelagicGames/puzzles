(() => {
  function formationsMatch(left, right) {
    return formationDifference(left, right) === 0;
  }

  function formationDifference(left, right) {
    const keys = formationKeys([...left, ...right]);
    let difference = 0;
    forEachPossibleAssignment(keys, (assignment) => {
      difference += bitCount(
        formationMask(left, assignment) ^ formationMask(right, assignment)
      );
    });
    return difference;
  }

  function formationKeys(formation) {
    return [...new Set(
      formation.flatMap(({ filter, angle }) => shapeKeys(filter.shape.value, angle))
    )].sort();
  }

  function forEachPossibleAssignment(keys, callback) {
    for (let bits = 0; bits < 2 ** keys.length; bits += 1) {
      const assignment = new Map(
        keys.map((key, index) => [key, Boolean(bits & (2 ** index))])
      );
      if (isPossibleAssignment(assignment)) callback(assignment);
    }
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

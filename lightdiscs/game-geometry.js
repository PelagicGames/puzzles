// Copyright (C) 2026 Pelagic Games
/**
 * Pure board geometry, loaded before lightdiscs.js and by game-geometry.test.js.
 * Publishes LightDiscGeometry; no DOM, storage or file access. Points use {x, y},
 * bounds use {minX, maxX, minY, maxY}, and rotations are degrees.
 */

(() => {
  /**
   * @param {Object} left - First point.
   * @param {Object} right - Second point.
   * @returns {number} Euclidean separation.
   */
  function distance(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  /**
   * @param {Object[]} points - Point collection, left unchanged.
   * @returns {number} Smallest pair separation, or Infinity with fewer than two points.
   */
  function minimumPairDistance(points) {
    let minimum = Infinity;
    points.forEach((point, index) => {
      points.slice(index + 1).forEach((other) => {
        minimum = Math.min(minimum, distance(point, other));
      });
    });
    return minimum;
  }

  /**
   * Search expanding four-unit rings at ten-degree intervals after trying the
   * clamped start. This finds the first sampled valid point, not an exact optimum.
   * @param {Object} position - Desired centre.
   * @param {Object} bounds - Allowed centre extents.
   * @param {function(Object): boolean} isValid - Placement predicate, called repeatedly.
   * @returns {Object|null} First accepted bounded point, or null if sampling fails.
   */
  function nearestValidPlacement(position, bounds, isValid) {
    /**
     * @param {Object} point - Candidate centre.
     * @returns {Object} New point clamped to the enclosing bounds.
     */
    const clamp = (point) => ({
      x: Math.max(bounds.minX, Math.min(bounds.maxX, point.x)),
      y: Math.max(bounds.minY, Math.min(bounds.maxY, point.y))
    });
    const start = clamp(position);
    if (isValid(start)) return start;
    const sampledAngles = Array.from(
      { length: 36 },
      (_, index) => index * Math.PI / 18
    );
    const maximumRadius = Math.hypot(
      bounds.maxX - bounds.minX,
      bounds.maxY - bounds.minY
    );
    for (let radius = 4; radius <= maximumRadius; radius += 4) {
      for (const angle of sampledAngles) {
        const candidate = clamp({
          x: position.x + Math.cos(angle) * radius,
          y: position.y + Math.sin(angle) * radius
        });
        if (isValid(candidate)) return candidate;
      }
    }
    return null;
  }

  /**
   * Use circle bounds first, then polygon separation for padded triangle bodies.
   * @param {Object} leftPosition - First centre.
   * @param {number} leftAngle - First rotation.
   * @param {Object} rightPosition - Second centre.
   * @param {number} rightAngle - Second rotation.
   * @param {Object[]} corners - Equilateral triangle vertices relative to the centre.
   * @param {number} padding - Outward expansion of each triangle.
   * @returns {boolean} Whether separation is less than the combined padding.
   */
  function expandedTrianglesOverlap(
    leftPosition,
    leftAngle,
    rightPosition,
    rightAngle,
    corners,
    padding
  ) {
    const centreDistance = distance(leftPosition, rightPosition);
    const circumradius = Math.max(...corners.map(
      (corner) => Math.hypot(corner.x, corner.y)
    ));
    if (centreDistance >= (circumradius + padding) * 2) return false;
    if (centreDistance < (circumradius / 2 + padding) * 2) return true;
    const left = transformedPolygon(corners, leftPosition, leftAngle);
    const right = transformedPolygon(corners, rightPosition, rightAngle);
    return polygonDistance(left, right) < padding * 2;
  }

  /**
   * @param {Object[]} points - Local polygon vertices.
   * @param {Object} position - Translation.
   * @param {number} angle - Rotation in degrees.
   * @returns {Object[]} New world-space vertices.
   */
  function transformedPolygon(points, position, angle) {
    const radians = angle * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    return points.map((point) => {
      return {
        x: position.x + point.x * cosine - point.y * sine,
        y: position.y + point.x * sine + point.y * cosine
      };
    });
  }

  /**
   * Check containment and edge crossings before measuring vertex-to-edge distances.
   * @param {Object[]} left - First polygon.
   * @param {Object[]} right - Second polygon.
   * @returns {number} Zero for intersecting polygons, otherwise minimum separation.
   */
  function polygonDistance(left, right) {
    if (left.some((point) => pointInPolygon(point, right))
      || right.some((point) => pointInPolygon(point, left))
      || left.some((start, index) => {
        const end = left[(index + 1) % left.length];
        return right.some((otherStart, otherIndex) => segmentsIntersect(
          start,
          end,
          otherStart,
          right[(otherIndex + 1) % right.length]
        ));
      })) {
      return 0;
    }
    let minimum = Infinity;
    [left, right].forEach((polygon, polygonIndex) => {
      const other = polygonIndex === 0 ? right : left;
      polygon.forEach((point) => {
        other.forEach((start, index) => {
          const end = other[(index + 1) % other.length];
          minimum = Math.min(minimum, pointToSegmentDistance(point, start, end));
        });
      });
    });
    return minimum;
  }

  /**
   * Include collinear endpoint contact as well as proper crossings.
   * @param {Object} leftStart - First segment start.
   * @param {Object} leftEnd - First segment end.
   * @param {Object} rightStart - Second segment start.
   * @param {Object} rightEnd - Second segment end.
   * @returns {boolean} Whether the closed segments intersect.
   */
  function segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd) {
    /**
     * @param {Object} start - Directed segment start.
     * @param {Object} end - Directed segment end.
     * @param {Object} point - Test point.
     * @returns {number} Signed cross product for orientation.
     */
    const cross = (start, end, point) => (
      (end.x - start.x) * (point.y - start.y)
      - (end.y - start.y) * (point.x - start.x)
    );
    const leftRightStart = cross(leftStart, leftEnd, rightStart);
    const leftRightEnd = cross(leftStart, leftEnd, rightEnd);
    const rightLeftStart = cross(rightStart, rightEnd, leftStart);
    const rightLeftEnd = cross(rightStart, rightEnd, leftEnd);
    if (leftRightStart * leftRightEnd < 0
      && rightLeftStart * rightLeftEnd < 0) {
      return true;
    }
    /**
     * @param {Object} start - Segment start.
     * @param {Object} end - Segment end.
     * @param {Object} point - Test point.
     * @returns {boolean} Collinearity within tolerance and inclusion in the bounding box.
     */
    const onSegment = (start, end, point) => (
      Math.abs(cross(start, end, point)) < 1e-9
      && point.x >= Math.min(start.x, end.x)
      && point.x <= Math.max(start.x, end.x)
      && point.y >= Math.min(start.y, end.y)
      && point.y <= Math.max(start.y, end.y)
    );
    return onSegment(leftStart, leftEnd, rightStart)
      || onSegment(leftStart, leftEnd, rightEnd)
      || onSegment(rightStart, rightEnd, leftStart)
      || onSegment(rightStart, rightEnd, leftEnd);
  }

  /**
   * Toggle containment on horizontal ray crossings.
   * @param {Object} point - Test point.
   * @param {Object[]} polygon - Ordered polygon vertices.
   * @returns {boolean} Ray-crossing containment result.
   */
  function pointInPolygon(point, polygon) {
    let inside = false;
    polygon.forEach((start, index) => {
      const end = polygon[(index + 1) % polygon.length];
      if ((start.y > point.y) !== (end.y > point.y)
        && point.x < (end.x - start.x) * (point.y - start.y)
          / (end.y - start.y) + start.x) {
        inside = !inside;
      }
    });
    return inside;
  }

  /**
   * @param {Object} point - Test point.
   * @param {Object} start - Segment start.
   * @param {Object} end - Segment end.
   * @returns {number} Distance to a clamped projection, including zero-length edges.
   */
  function pointToSegmentDistance(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return distance(point, start);
    const amount = Math.max(0, Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared
    ));
    return distance(point, {
      x: start.x + amount * dx,
      y: start.y + amount * dy
    });
  }

  /**
   * @param {Object} point - Local point.
   * @param {number} angle - Rotation in degrees.
   * @returns {Object} Rotated copy about the origin.
   */
  function rotatePoint(point, angle) {
    const radians = angle * Math.PI / 180;
    return {
      x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
      y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
    };
  }

  /**
   * Enumerate six orientations and corner alignments, retaining exactly two snaps.
   * Pose keys deduplicate angle/mapping pairs; -1 marks the unsnapped moving corner.
   * @param {Object[]} corners - Shared local vertices for moving and fixed triangles.
   * @param {Object} fixedPosition - Fixed triangle centre.
   * @returns {Object[]} World positions of each retained pose's free corner.
   */
  function twoSnapFreeCirclePositions(corners, fixedPosition) {
    const poses = new Map();
    for (let angle = 0; angle < 360; angle += 60) {
      corners.forEach((_, movingIndex) => {
        corners.forEach((__, fixedIndex) => {
          const movingCorner = rotatePoint(corners[movingIndex], angle);
          const fixedCorner = corners[fixedIndex];
          const position = {
            x: fixedPosition.x + fixedCorner.x - movingCorner.x,
            y: fixedPosition.y + fixedCorner.y - movingCorner.y
          };
          const mapping = corners.map((corner) => {
            const rotated = rotatePoint(corner, angle);
            const centre = {
              x: position.x + rotated.x,
              y: position.y + rotated.y
            };
            return corners.findIndex((targetCorner) => distance(centre, {
              x: fixedPosition.x + targetCorner.x,
              y: fixedPosition.y + targetCorner.y
            }) < 0.5);
          });
          if (mapping.filter((target) => target >= 0).length === 2) {
            poses.set(`${angle}:${mapping.join(",")}`, {
              angle,
              mapping,
              position
            });
          }
        });
      });
    }
    return [...poses.values()].map(({ angle, mapping, position }) => {
      const rotated = rotatePoint(corners[mapping.indexOf(-1)], angle);
      return {
        x: position.x + rotated.x,
        y: position.y + rotated.y
      };
    });
  }

  window.LightDiscGeometry = {
    distance,
    expandedTrianglesOverlap,
    minimumPairDistance,
    nearestValidPlacement,
    twoSnapFreeCirclePositions
  };
})();

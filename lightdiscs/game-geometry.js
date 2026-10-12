// Copyright (C) 2026 Pelagic Games

(() => {
  function distance(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  function minimumPairDistance(points) {
    let minimum = Infinity;
    points.forEach((point, index) => {
      points.slice(index + 1).forEach((other) => {
        minimum = Math.min(minimum, distance(point, other));
      });
    });
    return minimum;
  }

  function nearestValidPlacement(position, bounds, isValid) {
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

  function segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd) {
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

  function rotatePoint(point, angle) {
    const radians = angle * Math.PI / 180;
    return {
      x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
      y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
    };
  }

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

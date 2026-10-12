// Copyright (C) 2026 Pelagic Games

(() => {
  const largeShapeRadius = 30;
  const smallShapeRadius = 12;
  const squareHalfSize = 21;
  const triangleRadius = 28;
  const triangleHalfWidth = triangleRadius * Math.sqrt(3) / 2;
  const triangleBaseY = triangleRadius / 2;

  const defaultMaskBounds = {
    x: -2000,
    y: -2000,
    width: 5000,
    height: 5000
  };

  function filterCompositionMarkup(
    layers,
    idPrefix,
    discRadius = 38,
    options = {}
  ) {
    const includeContrastOutlines = options.includeContrastOutlines !== false;
    const maskBounds = options.maskBounds || defaultMaskBounds;
    const maskMode = options.maskMode || "luminance";
    const channels = [
      { bit: 4, color: "#ff0000", name: "red" },
      { bit: 2, color: "#00ff00", name: "green" },
      { bit: 1, color: "#0000ff", name: "blue" }
    ];
    const discUnion = layers.map(
      ({ x, y }, index) => `<circle data-filter-layer="${index}" cx="${x}" cy="${y}" r="${discRadius}"/>`
    ).join("");
    const masks = [];
    const channelMaskIds = channels.map(() => []);
    const visibleMaskIds = [];
    const inverseVisibleMaskIds = [];
    const channelLayers = channels.map((channel, channelIndex) => {
      const maskIds = [];
      layers.forEach((layer, index) => {
        const maskContent = channelMaskMarkup(
          layer.filter,
          channel.bit,
          discRadius,
          maskMode,
          maskBounds
        );
        if (!maskContent) return;
        const id = `${idPrefix}-${channel.name}-${index}`;
        maskIds.push(id);
        channelMaskIds[channelIndex][index] = id;
        masks.push(`<mask id="${id}" maskUnits="userSpaceOnUse" ${maskBoundsMarkup(maskBounds)} style="mask-type:${maskMode}">`
          + (maskMode === "luminance"
            ? `<rect ${maskBoundsMarkup(maskBounds)} fill="#fff"/>`
            : "")
          + `<g data-filter-mask-layer="${index}" transform="translate(${layer.x} ${layer.y}) rotate(${layer.angle})">${maskContent}</g>`
          + "</mask>");
      });
      const visibleChannel = maskIds.reduce(
        (content, id) => `<g mask="url(#${id})">${content}</g>`,
        `<g fill="${channel.color}">${discUnion}</g>`
      );
      if (!includeContrastOutlines) {
        return `<g style="mix-blend-mode:screen">${visibleChannel}</g>`;
      }
      const visibleMaskId = `${idPrefix}-${channel.name}-visible`;
      const inverseVisibleMaskId = `${idPrefix}-${channel.name}-not-visible`;
      visibleMaskIds.push(visibleMaskId);
      inverseVisibleMaskIds.push(inverseVisibleMaskId);
      const visibleMaskContent = maskIds.reduce(
        (content, id) => `<g mask="url(#${id})">${content}</g>`,
        `<g fill="#fff">${discUnion}</g>`
      );
      masks.push(
        `<mask id="${visibleMaskId}" maskUnits="userSpaceOnUse" ${maskBoundsMarkup(maskBounds)}>${visibleMaskContent}</mask>`,
        `<mask id="${inverseVisibleMaskId}" maskUnits="userSpaceOnUse" ${maskBoundsMarkup(maskBounds)}>`
        + `<rect ${maskBoundsMarkup(maskBounds)} fill="#fff"/>`
        + `<rect ${maskBoundsMarkup(maskBounds)} fill="#000" mask="url(#${visibleMaskId})"/>`
        + "</mask>"
      );
      return `<g style="mix-blend-mode:screen">${visibleChannel}</g>`;
    }).join("");
    const contrastOutlines = includeContrastOutlines
      ? contrastBoundaryMarkup(
        layers,
        channels,
        channelMaskIds,
        visibleMaskIds,
        inverseVisibleMaskIds,
        idPrefix,
        masks
      )
      : "";
    return `<defs>${masks.join("")}</defs><g style="isolation:isolate">`
      + `<g fill="#000">${discUnion}</g>${channelLayers}${contrastOutlines}</g>`;
  }

  function multiplyCompositionMarkup(layers, discRadius = 38) {
    const images = layers.map(({ filter, x, y, angle }, index) => (
      `<image data-filter-image-layer="${index}" x="${-discRadius}" y="${-discRadius}" width="${discRadius * 2}" height="${discRadius * 2}" href="${filterImageDataUrl(filter, discRadius)}" transform="translate(${x} ${y}) rotate(${angle})" style="mix-blend-mode:multiply"/>`
    )).join("");
    return `<g style="isolation:isolate">${images}</g>`;
  }

  function filterImageDataUrl(filter, discRadius) {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-discRadius} ${-discRadius} ${discRadius * 2} ${discRadius * 2}" shape-rendering="crispEdges">`
      + `<defs><clipPath id="disc"><circle r="${discRadius}"/></clipPath></defs>`
      + `<g clip-path="url(#disc)"><circle r="${discRadius}" fill="${maskColour(filter.background.mask)}"/>`
      + `<g fill="${maskColour(filter.foreground.mask)}">${shapeMarkup(filter.shape.value)}</g></g></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(markup)}`;
  }

  function maskColour(mask) {
    const channel = (bit) => mask & bit ? "ff" : "00";
    return `#${channel(4)}${channel(2)}${channel(1)}`;
  }

  function maskBoundsMarkup(bounds) {
    return `x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}"`;
  }

  function contrastBoundaryMarkup(
    layers,
    channels,
    channelMaskIds,
    visibleMaskIds,
    inverseVisibleMaskIds,
    idPrefix,
    definitions
  ) {
    const outlines = [];
    const shapeBoundaryMaskIds = new Map();
    const shapeBoundaryMaskId = (shape) => {
      if (shapeBoundaryMaskIds.has(shape)) return shapeBoundaryMaskIds.get(shape);
      const maskId = `${idPrefix}-contrast-shape-${shape}`;
      const markup = shapeMarkup(shape);
      definitions.push(
        `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="-100" y="-100" width="200" height="200">`
        + `<g fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${markup}</g>`
        + `<g fill="#000">${markup}</g>`
        + "</mask>"
      );
      shapeBoundaryMaskIds.set(shape, maskId);
      return maskId;
    };
    const outlineLayers = layers.map(({ filter, x, y, angle }, index) => {
      if (!needsContrastOutline(filter)) return null;
      const changedBit = filter.background.mask ^ filter.foreground.mask;
      const boundaryMaskId = shapeBoundaryMaskId(filter.shape.value);
      const exclusionMaskId = `${idPrefix}-contrast-exclusion-${index}`;
      definitions.push(
        `<mask id="${exclusionMaskId}" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="5000" height="5000">`
        + '<rect x="-2000" y="-2000" width="5000" height="5000" fill="#fff"/>'
        + `<g data-filter-mask-layer="${index}" transform="translate(${x} ${y}) rotate(${angle})">`
        + `<rect x="-100" y="-100" width="200" height="200" fill="#000" mask="url(#${boundaryMaskId})"/>`
        + "</g></mask>"
      );
      return {
        angle,
        boundaryMaskId,
        changedBit,
        direction: Boolean(filter.foreground.mask & changedBit),
        exclusionMaskId,
        filter,
        index,
        x,
        y
      };
    }).filter(Boolean);
    outlineLayers.forEach((layer) => {
      const {
        angle,
        boundaryMaskId,
        changedBit,
        direction,
        filter,
        index,
        x,
        y
      } = layer;
      const changedIndex = channels.findIndex(({ bit }) => bit === changedBit);
      const stableIndices = [0, 1, 2].filter(
        (channelIndex) => channelIndex !== changedIndex
      );
      for (let stableMask = 0; stableMask < 4; stableMask += 1) {
        let lowerMask = 0;
        stableIndices.forEach((channelIndex, bitIndex) => {
          if (stableMask & (1 << bitIndex)) {
            lowerMask |= channels[channelIndex].bit;
          }
        });
        const colour = contrastOutlineColour({
          background: { mask: lowerMask },
          foreground: { mask: lowerMask | changedBit }
        });
        let content = `<g data-filter-outline-layer="${index}" transform="translate(${x} ${y}) rotate(${angle})"><rect x="-100" y="-100" width="200" height="200" fill="${colour}" mask="url(#${boundaryMaskId})"/></g>`;
        outlineLayers.forEach((other) => {
          if (other.index !== index
            && other.changedBit === changedBit
            && other.direction !== direction) {
            content = `<g mask="url(#${other.exclusionMaskId})">${content}</g>`;
          }
        });
        channelMaskIds[changedIndex].forEach((maskId, layerIndex) => {
          if (layerIndex !== index && maskId) {
            content = `<g mask="url(#${maskId})">${content}</g>`;
          }
        });
        stableIndices.forEach((channelIndex, bitIndex) => {
          const maskId = stableMask & (1 << bitIndex)
            ? visibleMaskIds[channelIndex]
            : inverseVisibleMaskIds[channelIndex];
          content = `<g mask="url(#${maskId})">${content}</g>`;
        });
        outlines.push(content);
      }
    });
    if (outlines.length === 0) return "";
    return `<g data-contrast-boundaries="true" pointer-events="none">${outlines.join("")}</g>`;
  }

  function needsContrastOutline(filter) {
    const difference = filter.background.mask ^ filter.foreground.mask;
    return filter.shape.value !== "none" && bitCount(difference) === 1;
  }

  function contrastOutlineColour(filter) {
    const averageLuminance = (
      maskLuminance(filter.background.mask)
      + maskLuminance(filter.foreground.mask)
    ) / 2;
    return averageLuminance > 0.35 ? "#000000" : "#ffffff";
  }

  function maskLuminance(mask) {
    return (mask & 4 ? 0.2126 : 0)
      + (mask & 2 ? 0.7152 : 0)
      + (mask & 1 ? 0.0722 : 0);
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

  function channelMaskMarkup(
    filter,
    channelBit,
    discRadius,
    maskMode,
    maskBounds
  ) {
    const backgroundPasses = Boolean(filter.background.mask & channelBit);
    const foregroundPasses = filter.shape.value === "none"
      ? backgroundPasses
      : Boolean(filter.foreground.mask & channelBit);
    if (backgroundPasses && foregroundPasses) return "";
    if (maskMode === "alpha") {
      return alphaChannelMaskMarkup(
        filter.shape.value,
        backgroundPasses,
        foregroundPasses,
        discRadius,
        maskBounds
      );
    }
    if (!backgroundPasses && !foregroundPasses) {
      return `<circle r="${discRadius}" fill="#000"/>`;
    }
    const shape = shapeMarkup(filter.shape.value);
    if (!backgroundPasses) {
      return `<circle r="${discRadius}" fill="#000"/><g fill="#fff">${shape}</g>`;
    }
    return `<g fill="#000">${shape}</g>`;
  }

  function alphaChannelMaskMarkup(
    shape,
    backgroundPasses,
    foregroundPasses,
    discRadius,
    bounds
  ) {
    const extent = Math.ceil(
      Math.hypot(bounds.width, bounds.height)
      + Math.hypot(bounds.x, bounds.y)
      + discRadius * 2
    );
    const outer = rectanglePath(extent);
    const disc = circlePath(discRadius);
    if (!backgroundPasses && !foregroundPasses) {
      return `<path d="${outer} ${disc}" fill="#fff" fill-rule="evenodd"/>`;
    }
    const shapePath = shapePathData(shape);
    if (!backgroundPasses) {
      return `<path d="${outer} ${disc}" fill="#fff" fill-rule="evenodd"/>`
        + `<path d="${shapePath}" fill="#fff" fill-rule="evenodd"/>`;
    }
    return `<path d="${outer} ${shapePath}" fill="#fff" fill-rule="evenodd"/>`;
  }

  function rectanglePath(extent) {
    return `M ${-extent} ${-extent} H ${extent} V ${extent} H ${-extent} Z`;
  }

  function circlePath(radius) {
    return `M ${radius} 0 A ${radius} ${radius} 0 1 0 ${-radius} 0 A ${radius} ${radius} 0 1 0 ${radius} 0 Z`;
  }

  function shapePathData(shape) {
    if (shape === "square") {
      return polygonPath(squareVertices());
    }
    if (shape === "square-star") {
      return polygonUnionPath([0, 60, 120].map(
        (angle) => rotateVertices(squareVertices(), angle)
      ));
    }
    if (shape === "triangle") {
      return polygonPath(triangleVertices(false));
    }
    if (shape === "triangle-star") {
      return polygonUnionPath([
        triangleVertices(false),
        triangleVertices(true)
      ]);
    }
    if (shape === "large-disc") return circlePath(largeShapeRadius);
    if (shape === "small-disc") return circlePath(smallShapeRadius);
    if (shape === "annulus") {
      return `${circlePath(largeShapeRadius)} ${circlePath(smallShapeRadius)}`;
    }
    return "";
  }

  function squareVertices() {
    return [
      { x: -squareHalfSize, y: -squareHalfSize },
      { x: squareHalfSize, y: -squareHalfSize },
      { x: squareHalfSize, y: squareHalfSize },
      { x: -squareHalfSize, y: squareHalfSize }
    ];
  }

  function triangleVertices(reflected) {
    return reflected
      ? [
        { x: 0, y: triangleRadius },
        { x: triangleHalfWidth, y: -triangleBaseY },
        { x: -triangleHalfWidth, y: -triangleBaseY }
      ]
      : [
        { x: 0, y: -triangleRadius },
        { x: -triangleHalfWidth, y: triangleBaseY },
        { x: triangleHalfWidth, y: triangleBaseY }
      ];
  }

  function rotateVertices(vertices, angle) {
    const radians = angle * Math.PI / 180;
    return vertices.map(({ x, y }) => ({
      x: x * Math.cos(radians) - y * Math.sin(radians),
      y: x * Math.sin(radians) + y * Math.cos(radians)
    }));
  }

  function polygonPath(vertices) {
    return vertices.map(
      ({ x, y }, index) => `${index === 0 ? "M" : "L"} ${formatNumber(x)} ${formatNumber(y)}`
    ).join(" ") + " Z";
  }

  function polygonUnionPath(polygons) {
    const segments = [];
    polygons.forEach((polygon, polygonIndex) => {
      polygon.forEach((start, vertexIndex) => {
        const end = polygon[(vertexIndex + 1) % polygon.length];
        const cuts = [0, 1];
        polygons.forEach((other, otherIndex) => {
          if (otherIndex === polygonIndex) return;
          other.forEach((otherStart, otherVertexIndex) => {
            const otherEnd = other[(otherVertexIndex + 1) % other.length];
            const intersection = segmentIntersection(
              start,
              end,
              otherStart,
              otherEnd
            );
            if (intersection !== null) cuts.push(intersection);
          });
        });
        const uniqueCuts = [...new Set(cuts.map((value) => formatNumber(value)))]
          .map(Number)
          .sort((left, right) => left - right);
        for (let index = 0; index < uniqueCuts.length - 1; index += 1) {
          const from = pointAlong(start, end, uniqueCuts[index]);
          const to = pointAlong(start, end, uniqueCuts[index + 1]);
          const midpoint = pointAlong(from, to, 0.5);
          const covered = polygons.some(
            (other, otherIndex) => otherIndex !== polygonIndex
              && pointInPolygon(midpoint, other)
          );
          if (!covered) segments.push({ start: from, end: to });
        }
      });
    });
    return connectBoundarySegments(segments)
      .map((vertices) => polygonPath(vertices))
      .join(" ");
  }

  function segmentIntersection(start, end, otherStart, otherEnd) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const otherDx = otherEnd.x - otherStart.x;
    const otherDy = otherEnd.y - otherStart.y;
    const denominator = dx * otherDy - dy * otherDx;
    if (Math.abs(denominator) < 1e-9) return null;
    const offsetX = otherStart.x - start.x;
    const offsetY = otherStart.y - start.y;
    const position = (offsetX * otherDy - offsetY * otherDx) / denominator;
    const otherPosition = (offsetX * dy - offsetY * dx) / denominator;
    if (position <= 1e-7 || position >= 1 - 1e-7
      || otherPosition < -1e-7 || otherPosition > 1 + 1e-7) {
      return null;
    }
    return position;
  }

  function pointAlong(start, end, position) {
    return {
      x: start.x + (end.x - start.x) * position,
      y: start.y + (end.y - start.y) * position
    };
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (
      let index = 0, previous = polygon.length - 1;
      index < polygon.length;
      previous = index, index += 1
    ) {
      const left = polygon[index];
      const right = polygon[previous];
      if ((left.y > point.y) !== (right.y > point.y)
        && point.x < (right.x - left.x) * (point.y - left.y)
          / (right.y - left.y) + left.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  function connectBoundarySegments(segments) {
    const remaining = [...segments];
    const loops = [];
    while (remaining.length > 0) {
      const segment = remaining.pop();
      const vertices = [segment.start, segment.end];
      while (!pointsEqual(vertices[vertices.length - 1], vertices[0])) {
        const end = vertices[vertices.length - 1];
        const nextIndex = remaining.findIndex(({ start }) => (
          pointsEqual(start, end)
        ));
        if (nextIndex < 0) break;
        const [next] = remaining.splice(nextIndex, 1);
        vertices.push(next.end);
      }
      if (vertices.length > 2) {
        if (pointsEqual(vertices[vertices.length - 1], vertices[0])) {
          vertices.pop();
        }
        loops.push(vertices);
      }
    }
    return loops;
  }

  function pointsEqual(left, right) {
    return Math.abs(left.x - right.x) < 1e-3
      && Math.abs(left.y - right.y) < 1e-3;
  }

  function formatNumber(value) {
    return Number(value.toFixed(5));
  }

  function shapeMarkup(shape) {
    if (shape === "none") return "";
    if (shape === "square") {
      return `<rect x="${-squareHalfSize}" y="${-squareHalfSize}" width="${squareHalfSize * 2}" height="${squareHalfSize * 2}"/>`;
    }
    if (shape === "square-star") {
      return [0, 60, 120].map(
        (angle) => `<rect x="${-squareHalfSize}" y="${-squareHalfSize}" width="${squareHalfSize * 2}" height="${squareHalfSize * 2}" transform="rotate(${angle})"/>`
      ).join("");
    }
    if (shape === "triangle" || shape === "triangle-star") {
      const upper = `0,${-triangleRadius} ${-triangleHalfWidth},${triangleBaseY} ${triangleHalfWidth},${triangleBaseY}`;
      const lower = `0,${triangleRadius} ${-triangleHalfWidth},${-triangleBaseY} ${triangleHalfWidth},${-triangleBaseY}`;
      return `<polygon points="${upper}"/>`
        + (shape === "triangle-star" ? `<polygon points="${lower}"/>` : "");
    }
    if (shape === "large-disc") return `<circle r="${largeShapeRadius}"/>`;
    if (shape === "small-disc") return `<circle r="${smallShapeRadius}"/>`;
    return `<path d="M ${largeShapeRadius} 0 A ${largeShapeRadius} ${largeShapeRadius} 0 1 0 ${-largeShapeRadius} 0 A ${largeShapeRadius} ${largeShapeRadius} 0 1 0 ${largeShapeRadius} 0 M ${smallShapeRadius} 0 A ${smallShapeRadius} ${smallShapeRadius} 0 1 1 ${-smallShapeRadius} 0 A ${smallShapeRadius} ${smallShapeRadius} 0 1 1 ${smallShapeRadius} 0" fill-rule="evenodd"/>`;
  }

  window.LightDiscRendering = {
    contrastOutlineColour,
    filterCompositionMarkup,
    multiplyCompositionMarkup,
    needsContrastOutline
  };
})();

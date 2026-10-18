// Copyright (C) 2026 Pelagic Games
/**
 * SVG string renderer shared by lightdiscs.js and Node rendering/geometry tests.
 * Load before the board; publishes LightDiscRendering without DOM or file writes.
 * Layers are {filter, x, y, angle}; filters have background/foreground colour
 * records with mask/value and a shape.value. Callers insert returned markup.
 * Prefixes must be unique within an SVG so generated mask references remain local.
 */

(() => {
  // Local SVG units agree with the board's shape geometry, independently of disc size.
  const largeShapeRadius = 30;
  const smallShapeRadius = 12;
  const squareHalfSize = 21;
  const triangleRadius = 28;
  const triangleHalfWidth = triangleRadius * Math.sqrt(3) / 2;
  const triangleBaseY = triangleRadius / 2;

  // Oversized user-space masks cover all board placements, including negative offsets.
  const defaultMaskBounds = {
    x: -2000,
    y: -2000,
    width: 5000,
    height: 5000
  };

  /**
   * Render standard intersection by masking blocked channels and screening RGB.
   * Contrast boundaries are a display aid, not additional filter contributions.
   * @param {Object[]} layers - Positioned and rotated filter records.
   * @param {string} idPrefix - Namespace for generated mask IDs.
   * @param {number} discRadius - Filter disc radius in SVG units.
   * @param {Object} options - combination, includeContrastOutlines and maskBounds.
   * @returns {string} Definitions and isolated compositing group.
   */
  function filterCompositionMarkup(
    layers,
    idPrefix,
    discRadius = 38,
    options = {}
  ) {
    if (options.combination === "xor") {
      return xorCompositionMarkup(layers, idPrefix, discRadius, options);
    }
    const includeContrastOutlines = options.includeContrastOutlines !== false;
    const maskBounds = options.maskBounds || defaultMaskBounds;
    const channels = [
      { bit: 4, color: "#ff0000", name: "red" },
      { bit: 2, color: "#00ff00", name: "green" },
      { bit: 1, color: "#0000ff", name: "blue" }
    ];
    const discUnion = layers.map(
      ({ x, y }, index) => `<circle data-filter-layer="${index}" cx="${x}" cy="${y}" r="${discRadius}"/>`
    ).join("");
    const masks = [];
    // Sparse per-channel arrays retain original layer indices for outline exclusions.
    const channelMaskIds = channels.map(() => []);
    const visibleMaskIds = [];
    const inverseVisibleMaskIds = [];
    const channelLayers = channels.map((channel, channelIndex) => {
      const maskIds = [];
      layers.forEach((layer, index) => {
        const maskContent = blockedChannelMarkup(
          layer.filter,
          channel.bit,
          discRadius
        );
        if (!maskContent) return;
        const id = `${idPrefix}-${channel.name}-${index}`;
        maskIds.push(id);
        channelMaskIds[channelIndex][index] = id;
        masks.push(`<mask id="${id}" maskUnits="userSpaceOnUse" ${maskBoundsMarkup(maskBounds)} style="mask-type:luminance">`
          + `<rect ${maskBoundsMarkup(maskBounds)} fill="#fff"/>`
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

  /**
   * Render exact per-channel parity with masks rather than colour blend arithmetic.
   * Connected overlap clusters bound the exponential odd-subset enumeration;
   * isolated discs bypass parity masks. RGB output regions are mutually exclusive.
   * @param {Object[]} layers - Positioned filter records.
   * @param {string} idPrefix - Mask namespace.
   * @param {number} discRadius - Disc radius.
   * @param {Object} options - includeContrastOutlines controls boundary aids.
   * @returns {string} XOR definitions and composited disc markup.
   */
  function xorCompositionMarkup(layers, idPrefix, discRadius, options) {
    const includeContrastOutlines = options.includeContrastOutlines !== false;
    const discUnion = layers.map(
      ({ x, y }, index) => `<circle data-filter-layer="${index}" cx="${x}" cy="${y}" r="${discRadius}"/>`
    ).join("");
    const channels = [
      { bit: 4, name: "red" },
      { bit: 2, name: "green" },
      { bit: 1, name: "blue" }
    ];
    const outputColours = [
      "#000000",
      "#0000ff",
      "#00ff00",
      "#00ffff",
      "#ff0000",
      "#ff00ff",
      "#ffff00",
      "#ffffff"
    ];
    const definitions = [];
    const output = [];
    const contrastOutput = [];
    overlappingLayerClusters(layers, discRadius).forEach(
      (cluster, clusterIndex) => {
        const clusterDiscs = cluster.map((layerIndex) => {
          const { x, y } = layers[layerIndex];
          return `<circle data-filter-layer="${layerIndex}" cx="${x}" cy="${y}" r="${discRadius}"/>`;
        }).join("");
        if (cluster.length === 1) {
          const layerIndex = cluster[0];
          const { filter, x, y, angle } = layers[layerIndex];
          const shape = shapeMarkup(filter.shape.value);
          output.push(
            `<g data-filter-mask-layer="${layerIndex}" transform="translate(${x} ${y}) rotate(${angle})">`
            + `<circle r="${discRadius}" fill="${filter.background.value}"/>`
            + (shape ? `<g fill="${filter.foreground.value}">${shape}</g>` : "")
            + "</g>"
          );
          if (includeContrastOutlines && needsContrastOutline(filter)) {
            contrastOutput.push(
              '<g data-contrast-boundaries="true" pointer-events="none">'
              + `<g data-filter-outline-layer="${layerIndex}" transform="translate(${x} ${y}) rotate(${angle})" fill="none" stroke="${contrastOutlineColour(filter)}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${shape}</g>`
              + "</g>"
            );
          }
          return;
        }
        const parityMasks = channels.map((channel) => {
          const masks = cluster.map((layerIndex) => {
            const { filter, x, y, angle } = layers[layerIndex];
            const shape = shapeMarkup(filter.shape.value);
            const visibleId = `${idPrefix}-xor-${channel.name}-${clusterIndex}-${layerIndex}`;
            const inverseId = `${visibleId}-inverse`;
            const background = filter.background.mask & channel.bit
              ? "#fff"
              : "#000";
            const foreground = filter.foreground.mask & channel.bit
              ? "#fff"
              : "#000";
            definitions.push(
              `<mask id="${visibleId}" maskUnits="userSpaceOnUse" ${maskBoundsMarkup(defaultMaskBounds)}>`
              + `<rect ${maskBoundsMarkup(defaultMaskBounds)} fill="#000"/>`
              + `<g data-filter-mask-layer="${layerIndex}" transform="translate(${x} ${y}) rotate(${angle})">`
              + `<circle r="${discRadius}" fill="${background}"/>`
              + (shape ? `<g fill="${foreground}">${shape}</g>` : "")
              + "</g></mask>",
              `<mask id="${inverseId}" maskUnits="userSpaceOnUse" ${maskBoundsMarkup(defaultMaskBounds)}>`
              + `<rect ${maskBoundsMarkup(defaultMaskBounds)} fill="#fff"/>`
              + `<rect ${maskBoundsMarkup(defaultMaskBounds)} fill="#000" mask="url(#${visibleId})"/>`
              + "</mask>"
            );
            return { inverseId, visibleId };
          });
          const parityId = `${idPrefix}-xor-${channel.name}-${clusterIndex}-parity`;
          const inverseParityId = `${parityId}-inverse`;
          const oddRegions = [];
          // An odd number of passing layers turns this channel on. Intersect
          // passing/inverse masks for each exact subset before taking their union.
          for (let bits = 1; bits < 2 ** cluster.length; bits += 1) {
            if (bitCount(bits) % 2 === 0) continue;
            let content = `<g fill="#fff">${clusterDiscs}</g>`;
            masks.forEach(({ inverseId, visibleId }, index) => {
              const maskId = bits & (1 << index) ? visibleId : inverseId;
              content = `<g mask="url(#${maskId})">${content}</g>`;
            });
            oddRegions.push(content);
          }
          definitions.push(
            `<mask id="${parityId}" maskUnits="userSpaceOnUse" ${maskBoundsMarkup(defaultMaskBounds)}>`
            + `<rect ${maskBoundsMarkup(defaultMaskBounds)} fill="#000"/>`
            + oddRegions.join("")
            + "</mask>",
            `<mask id="${inverseParityId}" maskUnits="userSpaceOnUse" ${maskBoundsMarkup(defaultMaskBounds)}>`
            + `<rect ${maskBoundsMarkup(defaultMaskBounds)} fill="#fff"/>`
            + `<rect ${maskBoundsMarkup(defaultMaskBounds)} fill="#000" mask="url(#${parityId})"/>`
            + "</mask>"
          );
          return { inverseParityId, parityId };
        });
        for (let mask = 1; mask < outputColours.length; mask += 1) {
          let content = `<g fill="${outputColours[mask]}">${clusterDiscs}</g>`;
          parityMasks.forEach(({ inverseParityId, parityId }, index) => {
            const maskId = mask & channels[index].bit
              ? parityId
              : inverseParityId;
            content = `<g mask="url(#${maskId})">${content}</g>`;
          });
          output.push(content);
        }
        if (includeContrastOutlines) {
          contrastOutput.push(xorContrastBoundaryMarkup(
            cluster,
            layers,
            channels,
            parityMasks,
            `${idPrefix}-xor-${clusterIndex}`,
            definitions
          ));
        }
      }
    );
    return `<defs>${definitions.join("")}</defs><g style="isolation:isolate">`
      + `<g fill="#000">${discUnion}</g>${output.join("")}${contrastOutput.join("")}</g>`;
  }

  /**
   * Outline one-channel boundaries using the other channels' parity to choose
   * contrast. Exclude coincident same-channel boundaries that cancel in XOR.
   * Appends reusable shape/exclusion masks to definitions.
   * @param {number[]} cluster - Indices into layers.
   * @param {Object[]} layers - All positioned filters.
   * @param {Object[]} channels - RGB bit/name records.
   * @param {Object[]} parityMasks - Channel parityId/inverseParityId records.
   * @param {string} idPrefix - Boundary mask namespace.
   * @param {string[]} definitions - Mutable SVG definition accumulator.
   * @returns {string} Non-interactive outline group, or empty text.
   */
  function xorContrastBoundaryMarkup(
    cluster,
    layers,
    channels,
    parityMasks,
    idPrefix,
    definitions
  ) {
    const shapeBoundaryMaskIds = new Map();
    /**
     * Cache an outward stroke ring per shape, appending its definition on first use.
     * @param {string} shape - Shape value.
     * @returns {string} Boundary mask ID.
     */
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
    const outlineLayers = cluster.map((layerIndex) => {
      const { filter, x, y, angle } = layers[layerIndex];
      if (!needsContrastOutline(filter)) return null;
      const boundaryMaskId = shapeBoundaryMaskId(filter.shape.value);
      const exclusionMaskId = `${idPrefix}-contrast-exclusion-${layerIndex}`;
      definitions.push(
        `<mask id="${exclusionMaskId}" maskUnits="userSpaceOnUse" ${maskBoundsMarkup(defaultMaskBounds)}>`
        + `<rect ${maskBoundsMarkup(defaultMaskBounds)} fill="#fff"/>`
        + `<g data-filter-mask-layer="${layerIndex}" transform="translate(${x} ${y}) rotate(${angle})">`
        + `<rect x="-100" y="-100" width="200" height="200" fill="#000" mask="url(#${boundaryMaskId})"/>`
        + "</g></mask>"
      );
      return {
        angle,
        boundaryMaskId,
        changedBit: filter.background.mask ^ filter.foreground.mask,
        exclusionMaskId,
        layerIndex,
        x,
        y
      };
    }).filter(Boolean);
    const outlines = [];
    outlineLayers.forEach((layer) => {
      const changedIndex = channels.findIndex(
        ({ bit }) => bit === layer.changedBit
      );
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
          foreground: { mask: lowerMask | layer.changedBit }
        });
        let content = `<g data-filter-outline-layer="${layer.layerIndex}" transform="translate(${layer.x} ${layer.y}) rotate(${layer.angle})"><rect x="-100" y="-100" width="200" height="200" fill="${colour}" mask="url(#${layer.boundaryMaskId})"/></g>`;
        outlineLayers.forEach((other) => {
          if (other.layerIndex !== layer.layerIndex
            && other.changedBit === layer.changedBit) {
            content = `<g mask="url(#${other.exclusionMaskId})">${content}</g>`;
          }
        });
        stableIndices.forEach((channelIndex, bitIndex) => {
          const parity = parityMasks[channelIndex];
          const maskId = stableMask & (1 << bitIndex)
            ? parity.parityId
            : parity.inverseParityId;
          content = `<g mask="url(#${maskId})">${content}</g>`;
        });
        outlines.push(content);
      }
    });
    if (outlines.length === 0) return "";
    return `<g data-contrast-boundaries="true" pointer-events="none">${outlines.join("")}</g>`;
  }

  /**
   * Flood-fill the disc-overlap graph; touching discs do not share a cluster.
   * The remaining set tracks unvisited indices without changing the input layers.
   * @param {Object[]} layers - Disc centres in x/y fields.
   * @param {number} discRadius - Shared disc radius.
   * @returns {number[][]} Connected components of original layer indices.
   */
  function overlappingLayerClusters(layers, discRadius) {
    const remaining = new Set(layers.map((_, index) => index));
    const maximumDistanceSquared = (discRadius * 2) ** 2;
    const clusters = [];
    while (remaining.size) {
      const cluster = [remaining.values().next().value];
      remaining.delete(cluster[0]);
      for (let index = 0; index < cluster.length; index += 1) {
        const current = layers[cluster[index]];
        [...remaining].forEach((candidateIndex) => {
          const candidate = layers[candidateIndex];
          const distanceSquared = (current.x - candidate.x) ** 2
            + (current.y - candidate.y) ** 2;
          if (distanceSquared >= maximumDistanceSquared) return;
          cluster.push(candidateIndex);
          remaining.delete(candidateIndex);
        });
      }
      clusters.push(cluster);
    }
    return clusters;
  }

  /**
   * @param {number} value - Small non-negative integer mask.
   * @returns {number} Set-bit count used for parity.
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

  /**
   * @param {Object} bounds - Numeric x, y, width and height fields.
   * @returns {string} SVG rectangle/mask extent attributes.
   */
  function maskBoundsMarkup(bounds) {
    return `x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}"`;
  }

  /**
   * Render standard-mode boundary aids only where the changed channel survives.
   * Stable-channel masks select contrasting ink; opposing same-channel boundaries
   * exclude hidden edges. Adds shape/exclusion masks to the definitions accumulator.
   * @param {Object[]} layers - Positioned filter records.
   * @param {Object[]} channels - RGB bit/name records.
   * @param {string[][]} channelMaskIds - Blocking masks by channel and layer.
   * @param {string[]} visibleMaskIds - Final passing-channel masks.
   * @param {string[]} inverseVisibleMaskIds - Complements of passing-channel masks.
   * @param {string} idPrefix - Mask namespace.
   * @param {string[]} definitions - Mutable SVG definition accumulator.
   * @returns {string} Non-interactive outline group, or empty text.
   */
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
    /**
     * Append and cache a shape's outward stroke ring on first use.
     * @param {string} shape - Shape value.
     * @returns {string} Boundary mask ID.
     */
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

  /**
   * @param {Object} filter - Background/foreground masks and shape.value.
   * @returns {boolean} Whether a shaped filter differs by exactly one RGB channel.
   */
  function needsContrastOutline(filter) {
    const difference = filter.background.mask ^ filter.foreground.mask;
    return filter.shape.value !== "none" && bitCount(difference) === 1;
  }

  /**
   * @param {Object} filter - Background and foreground colour masks.
   * @returns {string} Black or white chosen from mean channel-weighted luminance.
   */
  function contrastOutlineColour(filter) {
    const averageLuminance = (
      maskLuminance(filter.background.mask)
      + maskLuminance(filter.foreground.mask)
    ) / 2;
    return averageLuminance > 0.35 ? "#000000" : "#ffffff";
  }

  /**
   * @param {number} mask - RGB channel mask.
   * @returns {number} Weighted luminance using standard RGB channel coefficients.
   */
  function maskLuminance(mask) {
    return (mask & 4 ? 0.2126 : 0)
      + (mask & 2 ? 0.7152 : 0)
      + (mask & 1 ? 0.0722 : 0);
  }

  /**
   * @param {number} value - Small non-negative integer mask.
   * @returns {number} Set-bit count used to identify single-channel differences.
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

  /**
   * Express channel blocking as black regions, with white holes for passing shapes.
   * @param {Object} filter - Background/foreground masks and shape.value.
   * @param {number} channelBit - One RGB bit.
   * @param {number} discRadius - Disc radius.
   * @returns {string} Local luminance-mask content; empty when nothing is blocked.
   */
  function blockedChannelMarkup(filter, channelBit, discRadius) {
    const backgroundPasses = Boolean(filter.background.mask & channelBit);
    const foregroundPasses = filter.shape.value === "none"
      ? backgroundPasses
      : Boolean(filter.foreground.mask & channelBit);
    if (backgroundPasses && foregroundPasses) return "";
    if (!backgroundPasses && !foregroundPasses) {
      return `<circle r="${discRadius}" fill="#000"/>`;
    }
    const shape = shapeMarkup(filter.shape.value);
    if (!backgroundPasses) {
      return `<circle r="${discRadius}" fill="#000"/><g fill="#fff">${shape}</g>`;
    }
    return `<g fill="#000">${shape}</g>`;
  }

  /**
   * Build local shape geometry; enclosing groups supply fill and transforms.
   * @param {string} shape - Supported shape value; final fallback is the annulus.
   * @returns {string} SVG primitives, or empty text for no shape.
   */
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
    needsContrastOutline
  };
})();

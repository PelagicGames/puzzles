(() => {
  const largeShapeRadius = 30;
  const smallShapeRadius = 12;
  const squareHalfSize = 21;
  const triangleRadius = 28;
  const triangleHalfWidth = triangleRadius * Math.sqrt(3) / 2;
  const triangleBaseY = triangleRadius / 2;

  function filterCompositionMarkup(layers, idPrefix, discRadius = 38) {
    const channels = [
      { bit: 4, color: "#ff0000", name: "red" },
      { bit: 2, color: "#00ff00", name: "green" },
      { bit: 1, color: "#0000ff", name: "blue" }
    ];
    const discUnion = layers.map(
      ({ x, y }) => `<circle cx="${x}" cy="${y}" r="${discRadius}"/>`
    ).join("");
    const masks = [];
    const channelLayers = channels.map((channel) => {
      const maskIds = [];
      layers.forEach((layer, index) => {
        const blocked = blockedChannelMarkup(layer.filter, channel.bit, discRadius);
        if (!blocked) return;
        const id = `${idPrefix}-${channel.name}-${index}`;
        maskIds.push(id);
        masks.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="5000" height="5000" style="mask-type:luminance">`
          + '<rect x="-2000" y="-2000" width="5000" height="5000" fill="#fff"/>'
          + `<g transform="translate(${layer.x} ${layer.y}) rotate(${layer.angle})">${blocked}</g>`
          + "</mask>");
      });
      const visibleChannel = maskIds.reduce(
        (content, id) => `<g mask="url(#${id})">${content}</g>`,
        `<g fill="${channel.color}">${discUnion}</g>`
      );
      return `<g style="mix-blend-mode:screen">${visibleChannel}</g>`;
    }).join("");
    return `<defs>${masks.join("")}</defs><g style="isolation:isolate">`
      + `<g fill="#000">${discUnion}</g>${channelLayers}</g>`;
  }

  function blockedChannelMarkup(filter, channelBit, discRadius) {
    const backgroundPasses = Boolean(filter.background.mask & channelBit);
    const foregroundPasses = Boolean(filter.foreground.mask & channelBit);
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

  window.LightDiscRendering = { filterCompositionMarkup };
})();

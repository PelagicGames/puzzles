(() => {
  const namespace = "http://www.w3.org/2000/svg";
  const { filterCompositionMarkup } = window.LightDiscRendering;
  const colours = [
    { name: "white", value: "#ffffff", mask: 7 },
    { name: "black", value: "#000000", mask: 0 },
    { name: "cyan", value: "#00ffff", mask: 3 },
    { name: "yellow", value: "#ffff00", mask: 6 },
    { name: "magenta", value: "#ff00ff", mask: 5 },
    { name: "red", value: "#ff0000", mask: 4 },
    { name: "blue", value: "#0000ff", mask: 1 },
    { name: "green", value: "#00ff00", mask: 2 }
  ];
  const shapes = [
    { name: "No shape", value: "none" },
    { name: "Square", value: "square" },
    { name: "12-pointed star", value: "square-star" },
    { name: "Equilateral triangle", value: "triangle" },
    { name: "Six-pointed star", value: "triangle-star" },
    { name: "Large disc", value: "large-disc" },
    { name: "Small disc", value: "small-disc" },
    { name: "Annulus", value: "annulus" }
  ];

  const colourReference = document.querySelector("#colour-reference");
  const shapeReference = document.querySelector("#shape-reference");

  colours.forEach((left, leftIndex) => {
    colours.slice(leftIndex).forEach((right, offset) => {
      const rightIndex = leftIndex + offset;
      colourReference.append(createColourCard(left, right, rightIndex));
    });
  });
  shapes.forEach((shape) => shapeReference.append(createShapeCard(shape)));

  function createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS(namespace, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    return element;
  }

  function createColourCard(left, right, index) {
    const resultMask = left.mask & right.mask;
    const result = colours.find((colour) => colour.mask === resultMask);
    const card = document.createElement("article");
    card.className = "reference-card";
    const svg = createSvgElement("svg", {
      class: "colour-demo",
      viewBox: "0 0 112 68",
      role: "img",
      "aria-label": `${left.name} and ${right.name} combine to ${result.name}`
    });
    const noShape = { name: "no shape", value: "none" };
    svg.innerHTML = filterCompositionMarkup([
      {
        filter: { background: left, foreground: left, shape: noShape },
        angle: 0,
        x: 44,
        y: 34
      },
      {
        filter: { background: right, foreground: right, shape: noShape },
        angle: 0,
        x: 68,
        y: 34
      }
    ], `tutorial-${left.mask}-${right.mask}-${index}`, 28);
    const equation = document.createElement("p");
    equation.className = "reference-equation";
    equation.textContent = `${left.name} + ${right.name} = ${result.name}`;
    card.append(svg, equation);
    return card;
  }

  function createShapeCard(shape) {
    const card = document.createElement("article");
    card.className = "reference-card";
    const svg = createSvgElement("svg", {
      class: "shape-demo",
      viewBox: "-42 -42 84 84",
      role: "img",
      "aria-label": shape.name
    });
    svg.append(createSvgElement("circle", {
      class: "demo-disc",
      r: 38,
      fill: "#ffffff"
    }));
    createShapeElements(shape.value).forEach((element) => svg.append(element));
    const label = document.createElement("p");
    label.className = "reference-equation";
    label.textContent = shape.name;
    card.append(svg, label);
    return card;
  }

  function createShapeElements(shape) {
    if (shape === "none") return [];
    if (shape === "square") return [createSquare()];
    if (shape === "square-star") return [0, 60, 120].map(createSquare);
    if (shape === "triangle") return [createTriangle(false)];
    if (shape === "triangle-star") return [createTriangle(false), createTriangle(true)];
    if (shape === "large-disc") return [createSvgElement("circle", { r: 30, fill: "#000000" })];
    if (shape === "small-disc") return [createSvgElement("circle", { r: 12, fill: "#000000" })];
    return [createSvgElement("path", {
      d: "M 30 0 A 30 30 0 1 0 -30 0 A 30 30 0 1 0 30 0 M 12 0 A 12 12 0 1 1 -12 0 A 12 12 0 1 1 12 0",
      fill: "#000000",
      "fill-rule": "evenodd"
    })];
  }

  function createSquare(angle = 0) {
    return createSvgElement("rect", {
      x: -21,
      y: -21,
      width: 42,
      height: 42,
      fill: "#000000",
      transform: `rotate(${angle})`
    });
  }

  function createTriangle(reflected) {
    const halfWidth = 28 * Math.sqrt(3) / 2;
    const points = reflected
      ? `0,28 ${-halfWidth},-14 ${halfWidth},-14`
      : `0,-28 ${-halfWidth},14 ${halfWidth},14`;
    return createSvgElement("polygon", { points, fill: "#000000" });
  }
})();

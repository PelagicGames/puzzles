// Copyright (C) 2026 Pelagic Games

(() => {
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
  const xorTutorial = document.querySelector("#xor-tutorial");
  const xorColourReference = document.querySelector("#xor-colour-reference");

  const xorUnlocked = window.LightDiscProgress.xorUnlocked();
  xorTutorial.hidden = !xorUnlocked;

  colours.forEach((left, leftIndex) => {
    colours.slice(leftIndex).forEach((right, offset) => {
      const rightIndex = leftIndex + offset;
      colourReference.append(
        createColourCard(left, right, rightIndex, "standard")
      );
      if (xorUnlocked) {
        xorColourReference.append(
          createColourCard(left, right, rightIndex, "xor")
        );
      }
    });
  });
  shapes.forEach((shape) => shapeReference.append(createShapeCard(shape)));

  function createColourCard(left, right, index, combination) {
    const resultMask = combination === "xor"
      ? left.mask ^ right.mask
      : left.mask & right.mask;
    const result = colours.find((colour) => colour.mask === resultMask);
    const operator = combination === "xor" ? "XOR" : "+";
    const card = document.createElement("article");
    card.className = "reference-card";
    const image = document.createElement("img");
    image.className = "colour-demo";
    image.src = `./assets/tutorial/colour-${combination}-${left.mask}-${right.mask}.svg`;
    image.alt = `${left.name} ${operator} ${right.name} is ${result.name}`;
    image.width = 112;
    image.height = 68;
    const equation = document.createElement("p");
    equation.className = "reference-equation";
    equation.textContent = `${left.name} ${operator} ${right.name} = ${result.name}`;
    card.append(image, equation);
    return card;
  }

  function createShapeCard(shape) {
    const card = document.createElement("article");
    card.className = "reference-card";
    const image = document.createElement("img");
    image.className = "shape-demo";
    image.src = `./assets/tutorial/shape-${shape.value}.svg`;
    image.alt = shape.name;
    image.width = 96;
    image.height = 96;
    const label = document.createElement("p");
    label.className = "reference-equation";
    label.textContent = shape.name;
    card.append(image, label);
    return card;
  }
})();

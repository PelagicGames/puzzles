// Copyright (C) 2026 Pelagic Games
/**
 * Tutorial reference-card renderer for tutorial.html, after catalogues/progress.
 * Reads stored unlock status, exposes the XOR section when unlocked and populates
 * colour/shape grids with existing assets/tutorial SVGs. Does not generate files
 * or write completion state; image filenames encode the colour masks.
 */

(() => {
  // Colour masks encode RGB channels (4, 2, 1); order controls reference-card order.
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

  // Upper-triangular pairs include self-pairs once because both rules commute.
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

  /**
   * Create a labelled card for a pre-rendered interaction; caller appends it.
   * @param {Object} left - First colour record with name and mask.
   * @param {Object} right - Second colour record.
   * @param {number} index - Supplied reference index; not used in card construction.
   * @param {string} combination - Standard intersection or XOR.
   * @returns {HTMLElement} Detached article with image and equation.
   */
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

  /**
   * @param {Object} shape - Shape value for the asset path and accessible name.
   * @returns {HTMLElement} Detached article containing a shape image and label.
   */
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

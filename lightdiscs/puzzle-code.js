(() => {
  const colours = {
    w: { name: "white", value: "#ffffff", mask: 7 },
    r: { name: "red", value: "#ff0000", mask: 4 },
    g: { name: "green", value: "#00ff00", mask: 2 },
    b: { name: "blue", value: "#0000ff", mask: 1 },
    y: { name: "yellow", value: "#ffff00", mask: 6 },
    c: { name: "cyan", value: "#00ffff", mask: 3 },
    m: { name: "magenta", value: "#ff00ff", mask: 5 },
    k: { name: "black", value: "#000000", mask: 0 }
  };
  const shapes = {
    n: { name: "no shape", value: "none", rotations: 0 },
    s: { name: "square", value: "square", rotations: 2 },
    t: { name: "equilateral triangle", value: "triangle", rotations: 1 },
    l: { name: "large disc", value: "large-disc", rotations: 0 },
    d: { name: "small disc", value: "small-disc", rotations: 0 },
    a: { name: "annulus", value: "annulus", rotations: 0 },
    v: { name: "12-pointed star", value: "square-star", rotations: 0 },
    x: { name: "six-pointed star", value: "triangle-star", rotations: 0 }
  };

  function parsePuzzleCode(code) {
    const sections = /^R([^G]+)G([^B]+)B([^T]+)T(.+)$/.exec(code);
    if (!sections) {
      throw new Error("Puzzle code must contain R, G, B, and T sections in that order.");
    }
    return {
      code,
      pieces: [sections[1], sections[2], sections[3]].map(parseSection),
      targets: parseSection(sections[4])
    };
  }

  function parseSection(section) {
    const circles = [];
    let offset = 0;
    while (offset < section.length && circles.length < 3) {
      const shapeCode = section[offset];
      const shape = shapes[shapeCode];
      if (!shape) throw new Error(`Unknown shape indicator "${shapeCode}".`);
      offset += 1;

      let rotationCount = 0;
      while (section[offset] === "'") {
        rotationCount += 1;
        offset += 1;
      }
      if (rotationCount > shape.rotations) {
        throw new Error(`Shape "${shapeCode}" does not support ${rotationCount} rotation marks.`);
      }

      const background = readColour(section, offset);
      offset += 1;
      const foreground = shapeCode === "n" ? background : readColour(section, offset);
      if (shapeCode !== "n") offset += 1;
      circles.push({
        background,
        foreground,
        shape: { name: shape.name, value: shape.value },
        rotation: rotationCount * 60
      });
    }
    if (circles.length !== 3 || offset !== section.length) {
      throw new Error(`Section "${section}" must encode exactly three circles.`);
    }
    return circles;
  }

  function readColour(section, offset) {
    const code = section[offset];
    const colour = colours[code];
    if (!colour) throw new Error(`Unknown colour indicator "${code || ""}".`);
    return colour;
  }

  window.LightDiscPuzzleCode = { parsePuzzleCode };
})();

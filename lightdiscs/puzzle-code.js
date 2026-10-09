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
  const sectionNames = ["R", "G", "B", "T"];

  class PuzzleCodeError extends Error {
    constructor(diagnostics) {
      super(diagnostics.map(({ message }) => message).join(" "));
      this.name = "PuzzleCodeError";
      this.diagnostics = diagnostics;
    }
  }

  function formatPuzzleCode(code) {
    const source = String(code || "").replace(/\u00a0/g, " ").trim();
    const sectionPattern = /([RGBT])\s*:?\s*/g;
    const matches = [...source.matchAll(sectionPattern)];
    const sectionSequence = matches.map((match) => match[1]).join("");
    if (matches.length === 0
      || matches[0].index !== 0
      || sectionSequence !== sectionNames.slice(0, matches.length).join("")) {
      return source.replace(/\s+/g, " ");
    }

    return matches.map((match, index) => {
      const start = match.index + match[0].length;
      const end = matches[index + 1]?.index ?? source.length;
      const content = source.slice(start, end).replace(/:/g, "").trim();
      return `${match[1]}: ${formatSection(content)}`.trimEnd();
    }).join(" ");
  }

  function formatSection(section) {
    if (!section) return "";
    const explicitTokens = section.trim().split(/\s+/);
    if (explicitTokens.length > 1) return explicitTokens.join(" ");

    const compact = explicitTokens[0];
    const tokens = [];
    let offset = 0;
    while (offset < compact.length) {
      const start = offset;
      const shapeCode = compact[offset];
      offset += 1;
      while (compact[offset] === "'") offset += 1;
      const colourCount = shapeCode === "n" ? 1 : 2;
      offset = Math.min(compact.length, offset + colourCount);
      tokens.push(compact.slice(start, offset));
    }
    return tokens.join(" ");
  }

  function validatePuzzleCode(code) {
    const formattedCode = formatPuzzleCode(code);
    const sections = readSections(formattedCode);
    const diagnostics = [];
    const parsedSections = [];

    if (!sections) {
      diagnostics.push({
        start: 0,
        end: formattedCode.length,
        message: "Code must contain R:, G:, B:, and T: sections in that order."
      });
      return { code: formattedCode, diagnostics, definition: null };
    }

    sections.forEach((section) => {
      if (section.tokens.length !== 3) {
        diagnostics.push({
          start: section.contentStart,
          end: Math.max(section.contentStart + 1, section.contentEnd),
          message: `${section.name}: must contain exactly three circle components.`
        });
      }
      const parsed = section.tokens.slice(0, 3).map((token) => {
        try {
          return parseComponent(token.value);
        } catch (error) {
          diagnostics.push({
            start: token.start,
            end: token.end,
            message: `${section.name}: ${error.message}`
          });
          return null;
        }
      });
      parsedSections.push(parsed);
    });

    if (diagnostics.length > 0) {
      return { code: formattedCode, diagnostics, definition: null };
    }

    return {
      code: formattedCode,
      diagnostics,
      definition: {
        code: formattedCode,
        pieces: parsedSections.slice(0, 3),
        targets: parsedSections[3]
      }
    };
  }

  function readSections(code) {
    const sectionPattern = /([RGBT]):\s*/g;
    const matches = [...code.matchAll(sectionPattern)];
    if (matches.length !== 4
      || matches[0].index !== 0
      || matches.map((match) => match[1]).join("") !== sectionNames.join("")) {
      return null;
    }

    return matches.map((match, index) => {
      const contentStart = match.index + match[0].length;
      const contentEnd = matches[index + 1]?.index ?? code.length;
      const content = code.slice(contentStart, contentEnd);
      const tokens = [...content.matchAll(/\S+/g)].map((token) => ({
        value: token[0],
        start: contentStart + token.index,
        end: contentStart + token.index + token[0].length
      }));
      return { name: match[1], contentStart, contentEnd, tokens };
    });
  }

  function parseComponent(component) {
    const shapeCode = component[0];
    const shape = shapes[shapeCode];
    if (!shape) throw new Error(`unknown shape indicator "${shapeCode || ""}" in "${component}".`);

    let offset = 1;
    while (component[offset] === "'") offset += 1;
    const rotationCount = offset - 1;
    if (rotationCount > shape.rotations) {
      throw new Error(`shape "${shapeCode}" does not support ${rotationCount} rotation marks.`);
    }

    const expectedLength = offset + (shapeCode === "n" ? 1 : 2);
    if (component.length !== expectedLength) {
      throw new Error(`component "${component}" has the wrong number of colour indicators.`);
    }

    const background = readColour(component, offset);
    const foreground = shapeCode === "n"
      ? background
      : readColour(component, offset + 1);
    return {
      background,
      foreground,
      shape: { name: shape.name, value: shape.value },
      rotation: rotationCount * 60
    };
  }

  function readColour(component, offset) {
    const code = component[offset];
    const colour = colours[code];
    if (!colour) throw new Error(`unknown colour indicator "${code || ""}" in "${component}".`);
    return colour;
  }

  function parsePuzzleCode(code) {
    const result = validatePuzzleCode(code);
    if (!result.definition) throw new PuzzleCodeError(result.diagnostics);
    return result.definition;
  }

  window.LightDiscPuzzleCode = {
    formatPuzzleCode,
    parsePuzzleCode,
    validatePuzzleCode
  };
})();

// Copyright (C) 2026 Pelagic Games
/**
 * Browser level-code formatter, validator and parser, also loaded through Node's
 * VM by solver tests and offline tools. Publishes LightDiscPuzzleCode before the
 * board, design controller or solver uses it; performs no DOM or file writes.
 * Definitions contain three pieces of three filters and three target filters.
 * Diagnostic start/end offsets refer to the formatted code, with an exclusive end.
 */

(() => {
  // Code alphabet: colour records carry display data and red=4, green=2, blue=1.
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
  // Rotation limits count apostrophes, each representing 60 degrees.
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
    /**
     * Retain structured diagnostics while exposing their combined message.
     * @param {Object[]} diagnostics - Formatted-code ranges and error messages.
     * @returns {PuzzleCodeError} Error instance with a diagnostics property.
     */
    constructor(diagnostics) {
      super(diagnostics.map(({ message }) => message).join(" "));
      this.name = "PuzzleCodeError";
      this.diagnostics = diagnostics;
    }
  }

  /**
   * Normalise spacing and compact tokens without rejecting incomplete input.
   * @param {*} code - Value coerced to text, with falsy values treated as empty.
   * @returns {string} Display code; malformed section ordering only gets spacing normalisation.
   */
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

  /**
   * Split a compact section by shape, rotation marks and expected colour count.
   * @param {string} section - Component text without a section heading.
   * @returns {string} Space-separated components, including incomplete tokens.
   */
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

  /**
   * Format and validate all sections, collecting component errors without throwing.
   * @param {*} code - Source code to format.
   * @returns {{code: string, diagnostics: Object[], definition: Object|null}} Parse result.
   */
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

  /**
   * Locate ordered section contents and token offsets in formatted input.
   * @param {string} code - Formatted source.
   * @returns {Object[]|null} Section records or null for invalid headings/order.
   */
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

  /**
   * Decode a single filter, throwing for unknown symbols or invalid lengths/rotations.
   * @param {string} component - Shape, optional apostrophes and colour codes.
   * @returns {Object} Background, foreground, shape and rotation in degrees.
   */
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

  /**
   * Look up a colour; throws when its code is absent or unknown.
   * @param {string} component - Complete component token.
   * @param {number} offset - Colour character index.
   * @returns {Object} Shared colour record.
   */
  function readColour(component, offset) {
    const code = component[offset];
    const colour = colours[code];
    if (!colour) throw new Error(`unknown colour indicator "${code || ""}" in "${component}".`);
    return colour;
  }

  /**
   * Parse a complete definition or throw PuzzleCodeError with diagnostic ranges.
   * @param {*} code - Source level code.
   * @returns {Object} Validated definition containing canonical code, pieces and targets.
   */
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

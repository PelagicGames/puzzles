// Copyright (C) 2026 Pelagic Games
/**
 * Standalone SVG parity regression: node lightdiscs/filter-composition.test.js
 * Reads filter-composition.js into a Node VM window shim and asserts returned
 * markup for overlapping XOR filters, with and without boundary aids. Checks SVG
 * structure rather than rendered pixels; no writes beyond the success log.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = {};
vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, "filter-composition.js"), "utf8"),
  { filename: "filter-composition.js" }
);

/**
 * @param {number} mask - RGB channel mask from zero to seven.
 * @returns {Object} Matching numeric mask and hexadecimal SVG colour value.
 */
const colour = (mask) => ({
  mask,
  value: `#${[
    "000000",
    "0000ff",
    "00ff00",
    "00ffff",
    "ff0000",
    "ff00ff",
    "ffff00",
    "ffffff"
  ][mask]}`
});
// The triangle toggles blue against red, while the coincident solid contributes green.
const shapedFilter = {
  background: colour(4),
  foreground: colour(5),
  shape: { value: "triangle" }
};
const solidFilter = {
  background: colour(2),
  foreground: colour(2),
  shape: { value: "none" }
};
const layers = [
  { filter: shapedFilter, x: 50, y: 50, angle: 0 },
  { filter: solidFilter, x: 50, y: 50, angle: 0 }
];

// XOR outlines must coexist with explicit output colours, not difference blending.
const withOutlines = window.LightDiscRendering.filterCompositionMarkup(
  layers,
  "xor-test",
  38,
  { combination: "xor", includeContrastOutlines: true }
);
assert.ok(withOutlines.includes('data-contrast-boundaries="true"'));
assert.ok(withOutlines.includes("#ffff00"));
assert.ok(!withOutlines.includes("mix-blend-mode:difference"));

// The same parity render must omit boundary markup when the option is disabled.
const withoutOutlines = window.LightDiscRendering.filterCompositionMarkup(
  layers,
  "xor-test",
  38,
  { combination: "xor", includeContrastOutlines: false }
);
assert.ok(!withoutOutlines.includes("data-contrast-boundaries"));

console.log("Light Disc filter composition tests passed.");

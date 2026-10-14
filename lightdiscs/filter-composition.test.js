// Copyright (C) 2026 Pelagic Games

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = {};
vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, "filter-composition.js"), "utf8"),
  { filename: "filter-composition.js" }
);

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

const withOutlines = window.LightDiscRendering.filterCompositionMarkup(
  layers,
  "xor-test",
  38,
  { combination: "xor", includeContrastOutlines: true }
);
assert.ok(withOutlines.includes('data-contrast-boundaries="true"'));
assert.ok(withOutlines.includes("#ffff00"));
assert.ok(!withOutlines.includes("mix-blend-mode:difference"));

const withoutOutlines = window.LightDiscRendering.filterCompositionMarkup(
  layers,
  "xor-test",
  38,
  { combination: "xor", includeContrastOutlines: false }
);
assert.ok(!withoutOutlines.includes("data-contrast-boundaries"));

console.log("Light Disc filter composition tests passed.");

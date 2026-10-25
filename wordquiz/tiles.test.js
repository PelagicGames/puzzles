// Copyright (C) 2026 Pelagic Games

/**
 * Run with node wordquiz/tiles.test.js from the repository root.
 * Checks that every letter has a self-contained, scalable SVG tile face.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  const file = path.join(__dirname, "assets", "tiles", `${letter.toLowerCase()}.svg`);
  const svg = fs.readFileSync(file, "utf8");
  assert.match(svg, /^<!-- Copyright \(C\) 2026 Pelagic Games -->\n/);
  assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100">/);
  assert.match(svg, new RegExp(`<text\\b[^>]*>${letter}</text>`));
  assert.match(svg, /<\/svg>\s*$/);
  assert.strictEqual((svg.match(/<svg\b/g) || []).length, 1);
  assert.strictEqual((svg.match(/<text\b/g) || []).length, 1);
  assert.doesNotMatch(svg, /<(?:script|image|foreignObject)\b|\bhref=|\son\w+=/i);
  assert(svg.length < 2048, `${letter} should remain a small asset`);
}

console.log("All 26 SVG tile assets passed.");

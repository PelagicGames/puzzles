// Copyright (C) 2026 Pelagic Games
/**
 * Standalone geometry/rendering regressions: node lightdiscs/game-geometry.test.js
 * Reads geometry and composition scripts via Node's VM with a window shim.
 * Assertions cover board clearances, safe placement and SVG boundary structure,
 * not browser rasterisation. No file writes; failure throws, success logs.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = {};
["game-geometry.js", "filter-composition.js"].forEach((file) => {
  vm.runInThisContext(
    fs.readFileSync(path.join(__dirname, file), "utf8"),
    { filename: file }
  );
});

const {
  distance,
  expandedTrianglesOverlap,
  minimumPairDistance,
  nearestValidPlacement,
  twoSnapFreeCirclePositions
} = window.LightDiscGeometry;
const {
  contrastOutlineColour,
  filterCompositionMarkup,
  needsContrastOutline
} = window.LightDiscRendering;

// Mirror live board dimensions so clearance assertions cover its actual layout.
const cornerRadius = 105;
const discRadius = 38;
const targetRadius = 28;
const ringHalfWidth = 2;
const fixedPosition = { x: 500, y: 440 };
const corners = [
  { x: 0, y: -cornerRadius },
  { x: -cornerRadius * Math.sqrt(3) / 2, y: cornerRadius / 2 },
  { x: cornerRadius * Math.sqrt(3) / 2, y: cornerRadius / 2 }
];
const targetCornerRadius = 35;
const targetCorners = [
  { x: 0, y: -targetCornerRadius },
  {
    x: -targetCornerRadius * Math.sqrt(3) / 2,
    y: targetCornerRadius / 2
  },
  {
    x: targetCornerRadius * Math.sqrt(3) / 2,
    y: targetCornerRadius / 2
  }
];

// Central target rings must remain separate from each other and the corner discs.
assert(targetRadius <= discRadius);
assert(minimumPairDistance(targetCorners) > (targetRadius + ringHalfWidth) * 2);
targetCorners.forEach((target) => {
  corners.forEach((corner) => {
    assert(
      distance(target, corner) > targetRadius + ringHalfWidth + discRadius
    );
  });
});

// Every reset home stays clear of free corners on all enumerated two-snap poses.
const homes = [
  { x: 150, y: 160 },
  { x: 850, y: 160 },
  { x: 300, y: 790 }
];
const freeCircles = twoSnapFreeCirclePositions(corners, fixedPosition);
const freeCircleClearance = cornerRadius + discRadius * 2;
homes.forEach((home) => {
  freeCircles.forEach((freeCircle) => {
    assert(distance(home, freeCircle) > freeCircleClearance);
  });
});

const trianglePadding = discRadius + 5.5;
/**
 * @param {Object} position - Candidate triangle centre.
 * @param {number} angle - Candidate rotation in degrees.
 * @returns {boolean} Whether the padded candidate overlaps the fixed triangle.
 */
const overlapsFixed = (position, angle = 0) => expandedTrianglesOverlap(
  position,
  angle,
  fixedPosition,
  0,
  corners,
  trianglePadding
);
// Cover separated, near-edge and coincident poses, then a bounded nearby bump.
assert(!overlapsFixed({ x: 150, y: 160 }));
assert(!overlapsFixed({ x: 500, y: 700 }));
assert(overlapsFixed({ x: 500, y: 650 }));
assert(overlapsFixed({ x: 500, y: 440 }));
const bumped = nearestValidPlacement(
  { x: 500, y: 650 },
  { minX: 143, maxX: 857, minY: 143, maxY: 859 },
  (position) => !overlapsFixed(position)
);
assert(bumped);
assert(!overlapsFixed(bumped));
assert(distance(bumped, { x: 500, y: 650 }) <= 48);
// A free pose can avoid the fixed triangle yet still be obscured by a snapped one.
const snappedPose = { position: { x: 409.0673326, y: 597.5 }, angle: 0 };
const obscuredFreePose = { position: { x: 150, y: 580 }, angle: 0 };
assert(!overlapsFixed(obscuredFreePose.position));
assert(expandedTrianglesOverlap(
  obscuredFreePose.position,
  obscuredFreePose.angle,
  snappedPose.position,
  snappedPose.angle,
  corners,
  trianglePadding
));

/**
 * @param {number} background - Background channel mask.
 * @param {number} foreground - Foreground channel mask.
 * @param {string} shape - Shape value.
 * @returns {Object} Minimal filter for boundary-generation assertions.
 */
function filter(background, foreground, shape = "square") {
  return {
    background: { mask: background },
    foreground: { mask: foreground },
    shape: { value: shape }
  };
}

// Only shaped one-channel differences qualify; mean luminance picks black/white.
assert(needsContrastOutline(filter(7, 6)));
assert(needsContrastOutline(filter(3, 2)));
assert(needsContrastOutline(filter(4, 5)));
assert(!needsContrastOutline(filter(0, 7)));
assert(!needsContrastOutline(filter(6, 6)));
assert(!needsContrastOutline(filter(7, 6, "none")));
assert.strictEqual(contrastOutlineColour(filter(7, 6)), "#000000");
assert.strictEqual(contrastOutlineColour(filter(0, 1)), "#ffffff");
// Rotated union boundaries share shape definitions and avoid morphology filters.
const unionOutlineMarkup = filterCompositionMarkup([
  { filter: filter(7, 6, "triangle"), x: 0, y: 0, angle: 0 },
  { filter: filter(7, 6, "triangle"), x: 0, y: 0, angle: 60 }
], "outline-test");
assert.strictEqual(
  (unionOutlineMarkup.match(/data-contrast-boundaries=/g) || []).length,
  1
);
assert.strictEqual(
  (unionOutlineMarkup.match(/data-filter-outline-layer=/g) || []).length,
  8
);
assert(unionOutlineMarkup.includes('stroke-width="3"'));
assert(unionOutlineMarkup.includes("outline-test-contrast-shape-triangle"));
assert(!unionOutlineMarkup.includes("<feMorphology"));
// Blocking layers and opposing transitions must mask out inappropriate outlines.
const blockedOutlineMarkup = filterCompositionMarkup([
  { filter: filter(1, 3, "triangle-star"), x: 0, y: 0, angle: 0 },
  { filter: filter(5, 4, "triangle"), x: 0, y: 0, angle: 0 }
], "blocked-outline");
assert(blockedOutlineMarkup.includes('mask="url(#blocked-outline-green-1)"'));
const cancelledOutlineMarkup = filterCompositionMarkup([
  { filter: filter(2, 6, "triangle"), x: 0, y: 0, angle: 0 },
  { filter: filter(7, 3, "triangle"), x: 0, y: 0, angle: 0 }
], "cancelled-outline");
assert(cancelledOutlineMarkup.includes(
  'mask="url(#cancelled-outline-contrast-exclusion-1)"'
));
assert(cancelledOutlineMarkup.includes(
  'mask="url(#cancelled-outline-contrast-exclusion-0)"'
));
// Disabling aids removes boundary groups and auxiliary visible-channel masks.
const boardMarkup = filterCompositionMarkup([
  { filter: filter(7, 6, "triangle"), x: 100, y: 200, angle: 0 }
], "board-test", discRadius, { includeContrastOutlines: false });
assert(!boardMarkup.includes("data-contrast-boundaries"));
assert(!boardMarkup.includes("-visible"));

console.log("Game geometry tests passed.");

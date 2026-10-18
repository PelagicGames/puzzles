// Copyright (C) 2026 Pelagic Games

/**
 * Geometry helpers for finding valid interior anchors in the projected result map.
 * Loaded by solo.html, local.html and online.html before map-renderer.js; D3 supplies polygon containment.
 * A component is a Polygon coordinate array: its first ring is the exterior and later rings are holes.
 * Reads GeoJSON and projection functions; returns coordinates without changing
 * geometry or accessing page elements, storage or the network.
 */
(() => {
  "use strict";
  /** Flattens GeoJSON polygonal features to independent Polygon ring arrays.
   * @param {object} feature - GeoJSON Feature, FeatureCollection, Polygon or MultiPolygon.
   * @returns {Array<Array<Array<number[]>>>} Polygon components, each containing exterior and hole rings.
   */
  function components(feature) {
    if (!feature) return [];
    if (feature.type === "FeatureCollection") return feature.features.flatMap(components);
    const geometry = feature.type === "Feature" ? feature.geometry : feature;
    if (geometry.type === "Polygon") return [geometry.coordinates];
    if (geometry.type === "MultiPolygon") return geometry.coordinates;
    return [];
  }

  /** Returns signed distance to the nearest ring segment (positive inside, negative outside).
   * @param {number[]} point - Projected `[x, y]` test point.
   * @param {Array<number[][]>} rings - Projected exterior ring followed by hole rings.
   * @returns {number} Signed nearest-edge distance in projected SVG units.
   */
  function distance(point, rings) {
    const inside = window.d3.polygonContains(rings[0], point)
      && !rings.slice(1).some((ring) => window.d3.polygonContains(ring, point));
    // Project onto each finite segment, clamping the scalar to its endpoints, and keep the nearest squared distance.
    let squared = Infinity;
    rings.forEach((ring) => ring.forEach((end, index) => {
      const start = ring[(index + ring.length - 1) % ring.length];
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx
        + (point[1] - start[1]) * dy) / (dx * dx + dy * dy || 1)));
      squared = Math.min(squared, (point[0] - start[0] - t * dx) ** 2
        + (point[1] - start[1] - t * dy) ** 2);
    }));
    return (inside ? 1 : -1) * Math.sqrt(squared);
  }

  /** Finds a well-centred point strictly inside a polygon, including concavities and holes.
   * @param {Array<number[][]>} component - GeoJSON polygon rings in longitude/latitude.
   * @param {Function} projection - D3 projection from geographic coordinates to SVG coordinates.
   * @returns {number[]} Projected `[x, y]` anchor.
   */
  function interiorPoint(component, projection) {
    const rings = component.map((ring) => ring.map(projection));
    const xs = rings[0].map((point) => point[0]);
    const ys = rings[0].map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    /** Bounds the best possible signed clearance anywhere in a square search cell.
     * @param {number} x - Cell centre x coordinate.
     * @param {number} y - Cell centre y coordinate.
     * @param {number} half - Half-width and half-height.
     * @returns {{x: number, y: number, half: number, d: number, max: number}} Cell and clearance bound.
     */
    function cell(x, y, half) {
      const d = distance([x, y], rings);
      return { x, y, half, d, max: d + half * Math.SQRT2 };
    }
    let best = cell(...rings[0][0], 0);
    // Polylabel-style best-first subdivision narrows the search around cells that might improve interior clearance.
    const queue = [cell((minX + maxX) / 2, (minY + maxY) / 2,
      Math.max(maxX - minX, maxY - minY) / 2)];
    const precision = Math.max(0.00001, Math.max(maxX - minX, maxY - minY) / 1000);
    while (queue.length) {
      // The array is small enough to sort directly; popping selects the cell with the greatest upper bound.
      queue.sort((a, b) => a.max - b.max);
      const current = queue.pop();
      if (current.d > best.d) best = current;
      if (current.max - best.d <= precision && best.d > 0) continue;
      if (current.half < Number.EPSILON * Math.max(1, Math.abs(current.x), Math.abs(current.y))) continue;
      const half = current.half / 2;
      for (const dx of [-half, half]) {
        for (const dy of [-half, half]) queue.push(cell(current.x + dx, current.y + dy, half));
      }
    }
    return [best.x, best.y];
  }

  /** Chooses the polygon component nearest a projected link location, useful for curated sea crossings.
   * @param {object} feature - Polygonal GeoJSON geometry or feature.
   * @param {number[]} point - Projected location near the desired component.
   * @param {Function} projection - D3 geographic projection.
   * @returns {?Array<number[][]>} Closest component, or undefined when there are no polygon components.
   */
  function nearestComponent(feature, point, projection) {
    let best = null;
    components(feature).forEach((component) => {
      const rings = component.map((ring) => ring.map(projection));
      const separation = -distance(point, rings);
      if (!best || separation < best.separation) best = { component, separation };
    });
    return best?.component;
  }

  window.MapominoesGeometry = { components, distance, interiorPoint, nearestComponent };
})();

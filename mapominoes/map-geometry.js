// Copyright (C) 2026 Pelagic Games
(() => {
  "use strict";
  function components(feature) {
    if (!feature) return [];
    if (feature.type === "FeatureCollection") return feature.features.flatMap(components);
    const geometry = feature.type === "Feature" ? feature.geometry : feature;
    if (geometry.type === "Polygon") return [geometry.coordinates];
    if (geometry.type === "MultiPolygon") return geometry.coordinates;
    return [];
  }

  function distance(point, rings) {
    const inside = window.d3.polygonContains(rings[0], point)
      && !rings.slice(1).some((ring) => window.d3.polygonContains(ring, point));
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

  function interiorPoint(component, projection) {
    const rings = component.map((ring) => ring.map(projection));
    const xs = rings[0].map((point) => point[0]);
    const ys = rings[0].map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    function cell(x, y, half) {
      const d = distance([x, y], rings);
      return { x, y, half, d, max: d + half * Math.SQRT2 };
    }
    let best = cell(...rings[0][0], 0);
    const queue = [cell((minX + maxX) / 2, (minY + maxY) / 2,
      Math.max(maxX - minX, maxY - minY) / 2)];
    const precision = Math.max(0.00001, Math.max(maxX - minX, maxY - minY) / 1000);
    while (queue.length) {
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

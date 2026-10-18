// Copyright (C) 2026 Pelagic Games

/**
 * Builds the shared SVG result map, route strokes, counters, territory styles and zoom controls.
 * Loaded after map-geometry.js by solo.html, local.html and online.html; requires D3 and the selected map data.
 * Route layout returns SVG-space segments and markers; markers may be duplicated for separate exclaves.
 * Reads supplied route/map records and shared SVG/control IDs; render writes SVG
 * layers and event handlers, while layout helpers need no DOM or network access.
 */
(() => {
  "use strict";
  const { components, interiorPoint, nearestComponent } = window.MapominoesGeometry;
  // Curated crossings between connected regions that lack a shared land boundary; values are [longitude, latitude] anchors.
  const fixedLinks = {
    "BHR|SAU": { BHR: [50.45, 26.14], SAU: [50.21, 26.62] },
    "CYP|GBR": { CYP: [32.94, 34.62], GBR: [32.81, 34.64] },
    "DNK|SWE": { DNK: [12.64, 55.61], SWE: [12.91, 55.58] },
    "ESP|GBR": { ESP: [-5.35, 36.15], GBR: [-5.34, 36.13] },
    "FRA|GBR": { FRA: [1.57, 50.92], GBR: [-1.31, 51.1] },
    "FRA|NLD": { FRA: [-63.08, 18.08], NLD: [-63.05, 18.04] },
    "MYS|SGP": { MYS: [103.74, 1.46], SGP: [103.77, 1.34] }
  };
  // Map feature IDs from the bundled world topology to sovereign country codes when those features are not selectable.
  const owners = new Map([
    ["254", "FRA"], ["292", "GBR"], ["344", "CHN"], ["383", "SRB"],
    ["446", "CHN"], ["732", "MAR"], ["663", "FRA"], ["534", "NLD"]
  ]);
  // Named disputed/associated features are drawn under the selectable country that owns them in the game graph.
  const namedOwners = new Map([["Kosovo", "SRB"], ["N. Cyprus", "CYP"], ["Somaliland", "SOM"]]);
  const disputedNames = new Set(["Kosovo", "N. Cyprus", "Somaliland", "W. Sahara"]);

  /** Resolves a rendered feature to the selectable country/region code that owns it.
   * @param {object} feature - GeoJSON feature with optional properties.code, id or name.
   * @param {Array<object>} countries - Active selectable records, including numeric world IDs where applicable.
   * @returns {?string} Owning code, or undefined when the feature has no game owner.
   */
  function featureOwner(feature, countries) {
    if (feature.properties.code) return feature.properties.code;
    const numeric = String(Number(feature.id));
    return namedOwners.get(feature.properties.name) || owners.get(numeric)
      || countries.find((country) => country.numeric && String(Number(country.numeric)) === numeric)?.code;
  }

  /** Places route segments and hop counters on components nearest each travelled border/link.
   * @param {Array<object>} countries - Selectable regions and optional fallback coordinates.
   * @param {object} mapData - GeoJSON feature collection to associate with regions.
   * @param {Array<{code: string, valid: boolean}>} path - Ordered moves, including validity flags.
   * @param {Function} projection - D3 projection used for all SVG-space measurements.
   * @returns {{lines: Array<object>, markers: Array<object>}} Projected line endpoints and numbered marker locations.
   */
  function routeLayout(countries, mapData, path, projection) {
    const features = new Map();
    mapData.features.forEach((feature) => {
      const code = featureOwner(feature, countries);
      if (!code) return;
      if (!features.has(code)) features.set(code, []);
      features.get(code).push(feature);
    });
    // Cache polygon components by owner; component identity then keys the projected anchor/sample caches below.
    const regions = new Map([...features].map(([code, group]) => [
      code, components({ type: "FeatureCollection", features: group })
    ]));
    const points = new Map();
    const samples = new Map();
    /** Samples a large component exterior sparsely for efficient nearest-component comparisons.
     * @param {Array<number[][]>} component - Polygon rings in geographic coordinates.
     * @returns {number[][]} Projected boundary sample.
     */
    function sample(component) {
      if (!samples.has(component)) {
        const ring = component[0];
        const step = Math.max(1, Math.floor(ring.length / 400));
        samples.set(component, ring.filter((_, i) => i % step === 0).map(projection));
      }
      return samples.get(component);
    }
    /** Memoises the interior anchor of a polygon component.
     * @param {Array<number[][]>} component - Polygon rings.
     * @returns {number[]} Projected interior point.
     */
    function point(component) {
      if (!points.has(component)) points.set(component, interiorPoint(component, projection));
      return points.get(component);
    }
    /** Returns the largest projected polygon component belonging to a region.
     * @param {string} code - Selectable region code.
     * @returns {?Array<number[][]>} Largest component, or null if no mapped feature exists.
     */
    function main(code) {
      const all = regions.get(code) || [];
      return all.reduce((best, component) => {
        const area = Math.abs(window.d3.polygonArea(component[0].map(projection)));
        return !best || area > best.area ? { component, area } : best;
      }, null)?.component;
    }
    /** Chooses the two components nearest their common border, or the curated crossing anchors.
     * @param {string} leftCode - Region being left.
     * @param {string} rightCode - Region being entered.
     * @returns {Array<?Array<number[][]>>} Component pair corresponding to the two route endpoints.
     */
    function closest(leftCode, rightCode) {
      const manual = fixedLinks[[leftCode, rightCode].sort().join("|")];
      if (manual) {
        return [leftCode, rightCode].map((code) => nearestComponent({
          type: "MultiPolygon", coordinates: regions.get(code) || []
        }, projection(manual[code]), projection) || main(code));
      }
      // For ordinary borders, sparse boundary sampling avoids an expensive all-vertices comparison.
      let best = null;
      (regions.get(leftCode) || []).forEach((left) => {
        (regions.get(rightCode) || []).forEach((right) => {
          // Vertex sampling bounds work for detailed coastlines while preserving component selection.
          let distance = Infinity;
          sample(left).forEach((a) => sample(right).forEach((b) => {
            distance = Math.min(distance, (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
          }));
          if (!best || distance < best.distance) best = { left, right, distance };
        });
      });
      return best ? [best.left, best.right] : [main(leftCode), main(rightCode)];
    }
    /** Uses a catalogue coordinate if a region has no usable polygon component.
     * @param {string} code - Region code.
     * @returns {number[]} Projected fallback coordinate.
     * @throws {Error} If neither map geometry nor catalogue coordinates exist.
     */
    function fallback(code) {
      const country = countries.find((entry) => entry.code === code);
      if (!country?.coordinates) throw new Error(`No map geometry for ${code}.`);
      return projection(country.coordinates);
    }
    // Each hop can touch multiple islands/exclaves; a per-entry Set avoids duplicate counters on one component.
    const markerComponents = path.map(() => new Set());
    const lines = path.slice(1).map((entry, i) => {
      const pair = closest(path[i].code, entry.code);
      if (pair[0]) markerComponents[i].add(pair[0]);
      if (pair[1]) markerComponents[i + 1].add(pair[1]);
      return {
        start: pair[0] ? point(pair[0]) : fallback(path[i].code),
        end: pair[1] ? point(pair[1]) : fallback(entry.code),
        valid: entry.valid
      };
    });
    const markers = path.flatMap((entry, index) => {
      if (!markerComponents[index].size) {
        const component = main(entry.code);
        if (component) markerComponents[index].add(component);
      }
      const locations = [...markerComponents[index]].map(point);
      if (!locations.length) locations.push(fallback(entry.code));
      return locations.map((location) => ({ point: location, index, valid: entry.valid, code: entry.code }));
    });
    return { lines, markers };
  }

  /** Rebuilds the result SVG and attaches D3 zoom plus the page's explicit zoom buttons.
   * @param {object} result - Active countries, GeoJSON mapData, ordered path and legal choice codes.
   * @returns {void}
   * @sideEffects Replaces SVG child content, installs zoom handlers and assigns button click handlers.
   * @throws {Error} If the selected map data has not been loaded.
   */
  function render({ countries, mapData, path, choices }) {
    /** @param {string} id - Shared page element ID.
     * @returns {Element|null} Existing map layer or control.
     */
    const $ = (id) => document.getElementById(id);
    const land = $("map-countries");
    const routes = $("map-routes");
    const markers = $("map-markers");
    land.replaceChildren();
    routes.replaceChildren();
    markers.replaceChildren();
    if (!mapData) throw new Error("The selected map data was not loaded.");
    const d3 = window.d3;
    const projection = d3.geoEqualEarth().fitExtent([[12, 12], [988, 500]], mapData);
    const geoPath = d3.geoPath(projection);
    // Sets make repeated feature styling checks constant-time while the map can contain many polygons per region.
    const visited = new Set(path.map((entry) => entry.code));
    const invalid = new Set(path.filter((entry) => !entry.valid).map((entry) => entry.code));
    const available = new Set(choices);
    d3.select(land).selectAll("path").data(mapData.features).join("path")
      .attr("class", (feature) => {
        const code = featureOwner(feature, countries);
        return ["map-country",
          feature.properties.disputed || disputedNames.has(feature.properties.name) ? "is-disputed" : "",
          invalid.has(code) ? "is-invalid" : visited.has(code) ? "is-visited" : available.has(code) ? "is-choice" : ""
        ].filter(Boolean).join(" ");
      })
      .attr("d", geoPath)
      .append("title").text((feature) => `${feature.properties.name}${feature.properties.disputed || disputedNames.has(feature.properties.name) ? " (disputed region)" : ""}`);
    // Route elements are separate from land paths so D3 zoom can update their coordinates without resampling geography.
    const layout = routeLayout(countries, mapData, path, projection);
    const lineElements = layout.lines.map((line) => {
      const element = document.createElementNS("http://www.w3.org/2000/svg", "line");
      element.setAttribute("class", `route-segment${line.valid ? "" : " is-invalid"}`);
      routes.append(element);
      return { ...line, element };
    });
    const markerElements = layout.markers.map((marker) => {
      const element = document.createElementNS("http://www.w3.org/2000/svg", "g");
      element.setAttribute("class", `route-marker${marker.valid ? "" : " is-invalid"}`);
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", "11");
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.textContent = String(marker.index + 1);
      element.append(circle, label);
      markers.append(element);
      return { ...marker, element };
    });
    const svg = d3.select($("result-map"));
    // Dispute hatching is defined once per SVG; class-specific fills remain effective as visited/invalid states change.
    if (!svg.select("defs").node()) {
      const defs = svg.append("defs");
      [["land", "#365247", "#587266"], ["visited", "#e8c95a", "#fff0a1"],
        ["invalid", "#f26f5b", "#ffb0a4"], ["choice", "#75d99b", "#b9f2ce"]]
        .forEach(([name, background, stripe]) => {
          const pattern = defs.append("pattern").attr("id", `disputed-${name}`)
            .attr("width", 10).attr("height", 10).attr("patternUnits", "userSpaceOnUse")
            .attr("patternTransform", "rotate(45)");
          pattern.append("rect").attr("width", 10).attr("height", 10).attr("fill", background);
          pattern.append("rect").attr("width", 4).attr("height", 10).attr("fill", stripe);
        });
    }
    // Zoom land and route geometry together; counter radii/strokes are styled in screen space so remain legible.
    const zoom = d3.zoom().scaleExtent([1, 40]).extent([[0, 0], [1000, 520]])
      .translateExtent([[0, 0], [1000, 520]])
      // D3 transforms the land group; line endpoints and counter positions are transformed explicitly to keep their layers aligned.
      .on("zoom", ({ transform }) => {
        d3.select(land).attr("transform", transform);
        lineElements.forEach(({ start, end, element }) => {
          const a = transform.apply(start);
          const b = transform.apply(end);
          [["x1", a[0]], ["y1", a[1]], ["x2", b[0]], ["y2", b[1]]]
            .forEach(([key, value]) => element.setAttribute(key, value));
        });
        markerElements.forEach(({ point, element }) => {
          const location = transform.apply(point);
          element.setAttribute("transform", `translate(${location[0]} ${location[1]})`);
        });
      });
    svg.call(zoom).on("dblclick.zoom", null).call(zoom.transform, d3.zoomIdentity);
    // The HTML pages share these IDs; missing controls are allowed for compact layouts.
    [["map-zoom-in", 1.7], ["map-zoom-out", 1 / 1.7]].forEach(([id, scale]) => {
      if ($(id)) $(id).onclick = () => svg.transition().call(zoom.scaleBy, scale);
    });
    if ($("map-reset")) $("map-reset").onclick = () => svg.transition().call(zoom.transform, d3.zoomIdentity);
  }
  window.MapominoesRenderer = { render, routeLayout, featureOwner };
})();

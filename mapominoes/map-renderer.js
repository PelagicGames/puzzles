// Copyright (C) 2026 Pelagic Games
(() => {
  "use strict";
  const { components, interiorPoint, nearestComponent } = window.MapominoesGeometry;
  const fixedLinks = {
    "BHR|SAU": { BHR: [50.45, 26.14], SAU: [50.21, 26.62] },
    "CYP|GBR": { CYP: [32.94, 34.62], GBR: [32.81, 34.64] },
    "DNK|SWE": { DNK: [12.64, 55.61], SWE: [12.91, 55.58] },
    "ESP|GBR": { ESP: [-5.35, 36.15], GBR: [-5.34, 36.13] },
    "FRA|GBR": { FRA: [1.57, 50.92], GBR: [-1.31, 51.1] },
    "FRA|NLD": { FRA: [-63.08, 18.08], NLD: [-63.05, 18.04] },
    "MYS|SGP": { MYS: [103.74, 1.46], SGP: [103.77, 1.34] }
  };
  const owners = new Map([
    ["254", "FRA"], ["292", "GBR"], ["344", "CHN"], ["383", "SRB"],
    ["446", "CHN"], ["732", "MAR"], ["663", "FRA"], ["534", "NLD"]
  ]);
  const namedOwners = new Map([["Kosovo", "SRB"], ["N. Cyprus", "CYP"], ["Somaliland", "SOM"]]);
  const disputedNames = new Set(["Kosovo", "N. Cyprus", "Somaliland", "W. Sahara"]);

  function featureOwner(feature, countries) {
    if (feature.properties.code) return feature.properties.code;
    const numeric = String(Number(feature.id));
    return namedOwners.get(feature.properties.name) || owners.get(numeric)
      || countries.find((country) => country.numeric && String(Number(country.numeric)) === numeric)?.code;
  }

  function routeLayout(countries, mapData, path, projection) {
    const features = new Map();
    mapData.features.forEach((feature) => {
      const code = featureOwner(feature, countries);
      if (!code) return;
      if (!features.has(code)) features.set(code, []);
      features.get(code).push(feature);
    });
    const regions = new Map([...features].map(([code, group]) => [
      code, components({ type: "FeatureCollection", features: group })
    ]));
    const points = new Map();
    const samples = new Map();
    function sample(component) {
      if (!samples.has(component)) {
        const ring = component[0];
        const step = Math.max(1, Math.floor(ring.length / 400));
        samples.set(component, ring.filter((_, i) => i % step === 0).map(projection));
      }
      return samples.get(component);
    }
    function point(component) {
      if (!points.has(component)) points.set(component, interiorPoint(component, projection));
      return points.get(component);
    }
    function main(code) {
      const all = regions.get(code) || [];
      return all.reduce((best, component) => {
        const area = Math.abs(window.d3.polygonArea(component[0].map(projection)));
        return !best || area > best.area ? { component, area } : best;
      }, null)?.component;
    }
    function closest(leftCode, rightCode) {
      const manual = fixedLinks[[leftCode, rightCode].sort().join("|")];
      if (manual) {
        return [leftCode, rightCode].map((code) => nearestComponent({
          type: "MultiPolygon", coordinates: regions.get(code) || []
        }, projection(manual[code]), projection) || main(code));
      }
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
    function fallback(code) {
      const country = countries.find((entry) => entry.code === code);
      if (!country?.coordinates) throw new Error(`No map geometry for ${code}.`);
      return projection(country.coordinates);
    }
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

  function render({ countries, mapData, path, choices }) {
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
    const zoom = d3.zoom().scaleExtent([1, 40]).extent([[0, 0], [1000, 520]])
      .translateExtent([[0, 0], [1000, 520]])
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
    [["map-zoom-in", 1.7], ["map-zoom-out", 1 / 1.7]].forEach(([id, scale]) => {
      if ($(id)) $(id).onclick = () => svg.transition().call(zoom.scaleBy, scale);
    });
    if ($("map-reset")) $("map-reset").onclick = () => svg.transition().call(zoom.transform, d3.zoomIdentity);
  }
  window.MapominoesRenderer = { render, routeLayout, featureOwner };
})();

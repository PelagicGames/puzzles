// Copyright (C) 2026 Pelagic Games
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = vm.createContext({ window: {} });
function load(file) {
  vm.runInContext(fs.readFileSync(`${__dirname}/${file}`, "utf8"), context);
}
load("assets/d3.min.js");
load("assets/topojson-client.min.js");
context.window.d3 = context.d3;
context.window.topojson = context.topojson;
load("countries.js");
load("assets/countries-50m.js");
load("map-catalog.js");
load("maps.js");
load("game-rules.js");
load("map-geometry.js");
load("map-renderer.js");
const { window } = context;
const { components, interiorPoint, distance } = window.MapominoesGeometry;
const { routeLayout, featureOwner } = window.MapominoesRenderer;
const world = window.MapominoesMaps.get("world");
const projection = window.d3.geoEqualEarth().fitExtent([[12, 12], [988, 500]], world.mapData);
const path = ["AND", "FRA", "NLD"].map((code) => ({ code, valid: true }));
const layout = routeLayout(world.countries, world.mapData, path, projection);
const franceMarkers = layout.markers.filter((marker) => marker.code === "FRA");
assert.equal(franceMarkers.length, 2, "France needs mainland and Saint Martin counters");
assert(franceMarkers.every((marker) => marker.index === 1), "Both France counters must be hop 2");
assert.equal(new Set(franceMarkers.map((marker) => marker.point.join(","))).size, 2);
for (const marker of layout.markers) {
  const owned = world.mapData.features.filter((feature) => featureOwner(feature, world.countries) === marker.code);
  assert(owned.some((feature) => window.d3.geoContains(feature, projection.invert(marker.point))),
    `${marker.code} marker must be within its borders`);
}
assert(franceMarkers.some((marker) => window.d3.geoContains(
  world.mapData.features.find((feature) => feature.properties.name === "St-Martin"),
  projection.invert(marker.point))), "France's overseas counter must be in St-Martin");
assert(franceMarkers.some((marker) => projection.invert(marker.point)[0] > -10),
  "France's other counter must be on the mainland");
for (const code of ["HRV", "NOR", "GRC", "CHL", "VNM", "RUS", "IDN", "USA", "ZAF"]) {
  const markers = routeLayout(world.countries, world.mapData, [{ code, valid: true }], projection).markers;
  const owned = world.mapData.features.filter((feature) => featureOwner(feature, world.countries) === code);
  assert(markers.every((marker) => owned.some((feature) =>
    window.d3.geoContains(feature, projection.invert(marker.point)))), `${code}: anchor outside concave mainland`);
}

const identity = (point) => point;
for (const polygon of [
  [[[0, 0], [6, 0], [6, 1], [1, 1], [1, 6], [0, 6], [0, 0]]],
  [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[1, 1], [9, 1], [9, 9], [1, 9], [1, 1]]],
  [[[0, 0], [0.00001, 0], [0.00001, 10], [0, 10], [0, 0]]]
]) {
  assert(distance(interiorPoint(polygon, identity), polygon) > 0,
    "Concave, holed, and narrow polygons need strictly interior anchors");
}

assert.equal(window.MapominoesMapCatalog.length, 10);
for (const map of window.MapominoesMapCatalog) {
  load(`assets/maps/${map.id}.js`);
  const data = window.MapominoesMaps.get(map.id);
  assert.equal(data.countries.length, map.count);
  assert(map.count >= 20);
  assert(map.connectedCount >= (map.id === "italy" ? 18 : 20));
  const byCode = new Map(data.countries.map((country) => [country.code, country]));
  assert.equal(byCode.size, data.countries.length);
  data.countries.forEach((country) => {
    assert(country.code.startsWith(`${map.id}:`));
    country.borders.forEach((code) => {
      assert(byCode.has(code));
      assert(byCode.get(code).borders.includes(country.code), `${country.name}: asymmetric border`);
    });
  });
  data.mapData.features.forEach((feature) => {
    assert(byCode.has(feature.properties.code));
    assert(window.d3.geoArea(feature) < Math.PI * 2, `${map.id}: incorrect polygon winding`);
    assert(components(feature).length > 0);
  });
  const from = data.countries.find((country) => country.borders.length > 0);
  const to = byCode.get(from.borders[0]);
  assert(window.MapominoesRules.validateMove(data.countries, [{ code: from.code }], to.code, 1).valid);
  const p = window.d3.geoEqualEarth().fitExtent([[12, 12], [988, 500]], data.mapData);
  const regionalLayout = routeLayout(data.countries, data.mapData,
    [from, to].map((country) => ({ code: country.code, valid: true })), p);
  regionalLayout.markers.forEach((marker) => {
    const feature = data.mapData.features.find((feature) => feature.properties.code === marker.code);
    assert(window.d3.geoContains(feature, p.invert(marker.point)), `${map.id}: counter outside region`);
  });
}
const uk = window.MapominoesMaps.get("uk");
assert.equal(uk.countries.length, 92, "The UK map must contain historic counties, not council areas");
assert.equal(new Set(uk.countries.map((country) => country.name)).size, 92);
for (const name of ["Middlesex", "Sussex", "Yorkshire", "Caernarfonshire", "Antrim", "Aberdeenshire", "Shetland"]) {
  assert(uk.countries.some((country) => country.name === name), `Missing historic county ${name}`);
}
for (const name of ["Gwynedd", "Greater London", "Greater Manchester", "Dundee", "Plymouth", "Brighton and Hove"]) {
  assert(!uk.countries.some((country) => country.name === name), `Council/modern area ${name} must not be selectable`);
}
assert.equal(window.MapominoesRules.searchCountries(uk.countries, "County Derry")[0].country.name, "Londonderry");
assert.equal(window.MapominoesRules.searchCountries(uk.countries, "Kent")[0].country.name, "Kent");
assert(!uk.countries.some((country) => country.name === "India"));
assert(!world.countries.some((country) => country.name === "Kent"));
assert.equal(window.MapominoesMaps.text("Choose a country"), "Choose a country");
window.MapominoesMaps.selected = "uk";
assert.equal(window.MapominoesMaps.text("Country / countries"), "Region / regions");
const kent = uk.countries.find((country) => country.name === "Kent");
assert.equal(window.MapominoesRules.validateMove(uk.countries,
  [{ code: kent.code }], kent.code, 1).reasons[0], "That region has already been named.");
window.MapominoesMaps.selected = "world";
for (const name of ["Taiwan", "Tibet", "Hong Kong", "Macau"]) {
  assert(window.MapominoesMaps.get("china").mapData.features.some(
    (feature) => feature.properties.name.includes(name) && feature.properties.disputed), `${name} needs dispute shading`);
}
for (const name of ["Jammu", "Lad", "Arun"]) {
  assert(window.MapominoesMaps.get("india").mapData.features.some(
    (feature) => feature.properties.name.startsWith(name) && feature.properties.disputed), `${name} needs dispute shading`);
}
for (const [id, fromName, toName] of [
  ["uk", "Anglesey", "Caernarfonshire"],
  ["china", "Macau Special Administrative Region", "Guangdong Province"],
  ["japan", "Hokkaido", "Aomori"],
  ["japan", "Yamaguchi", "Fukuoka Prefecture"]
]) {
  const countries = window.MapominoesMaps.get(id).countries;
  const from = countries.find((country) => country.name === fromName);
  const to = countries.find((country) => country.name === toName);
  assert(window.MapominoesRules.validateMove(countries, [{ code: from.code }], to.code, 1).valid,
    `${fromName}/${toName}: missing fixed link`);
}
console.log("Map datasets, search isolation, concave anchors, and France exclave regression tests passed.");

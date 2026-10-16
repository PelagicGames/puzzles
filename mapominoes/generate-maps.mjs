// Copyright (C) 2026 Pelagic Games
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import vm from "node:vm";
import mapshaper from "mapshaper";

const context = vm.createContext({});
vm.runInContext(await readFile(new URL("./assets/topojson-client.min.js", import.meta.url), "utf8"), context);
const specs = [
  ["us", "US states and Washington, DC", "USA", 1],
  ["uk", "UK historic counties", "GBR", 2],
  ["switzerland", "Swiss cantons", "CHE", 1],
  ["italy", "Italian regions", "ITA", 2],
  ["india", "Indian states and union territories", "IND", 1],
  ["china", "Chinese provincial-level regions", "CHN", 1],
  ["france", "French metropolitan departments", "FRA", 2],
  ["spain", "Spanish provinces", "ESP", 2],
  ["brazil", "Brazilian states and federal district", "BRA", 1],
  ["japan", "Japanese prefectures", "JPN", 1]
];
const directory = new URL("./assets/maps/", import.meta.url);
await mkdir(directory, { recursive: true });
const additionalConnections = {
  uk: [["Anglesey", "Caernarfonshire"]],
  china: [
    ["Macau Special Administrative Region", "Guangdong Province"],
    ["Macau Special Administrative Region", "Hong Kong Special Administrative Region"]
  ],
  japan: [
    ["Hokkaido", "Aomori"],
    ["Hyogo Prefecture", "Tokushima Prefecture"],
    ["Okayama Prefecture", "Kagawa Prefecture"],
    ["Hiroshima", "Ehime Prefecture"],
    ["Yamaguchi", "Fukuoka Prefecture"]
  ]
};

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function mapGeometry(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const coordinates = polygons.map((polygon) => polygon.map((ring, index) => {
    const rounded = ring.map((point) => point.map((value) => Number(value.toFixed(5))));
    const area = rounded.reduce((sum, point, i) => {
      const next = rounded[(i + 1) % rounded.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0);
    return (index === 0 ? area > 0 : area < 0) ? rounded.reverse() : rounded;
  }));
  return { type: geometry.type, coordinates: geometry.type === "Polygon" ? coordinates[0] : coordinates };
}

const catalog = [];
for (const [id, name, iso, level] of specs) {
  let metadata;
  let topology;
  if (id === "uk") {
    const url = "https://county-borders.co.uk/UKDefinitionA_WG84_Simplified.zip";
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const output = await mapshaper.applyCommands("-i counties.zip -simplify 20% keep-shapes -o format=topojson", {
      "counties.zip": Buffer.from(await response.arrayBuffer())
    });
    if (!output["UKDefinitionA.json"]) throw new Error("The historic county source did not produce the expected layer.");
    topology = JSON.parse(output["UKDefinitionA.json"]);
    metadata = {
      tjDownloadURL: url,
      boundaryID: "HCT-UK-Definition-A",
      boundaryLicense: "Free personal, educational, non-commercial and commercial use",
      licenseSource: "https://county-borders.co.uk/",
      boundarySource: "Historic Counties Trust, Historic County Borders Project",
      boundaryYearRepresented: "Historic Counties Standard, Definition A"
    };
  } else {
    metadata = await json(`https://www.geoboundaries.org/api/current/gbOpen/${iso}/ADM${level}/`);
    topology = await json(metadata.tjDownloadURL);
  }
  const object = Object.values(topology.objects)[0];
  const sourceFeatures = context.topojson.feature(topology, object).features;
  if (id === "uk") {
    sourceFeatures.forEach((feature) => {
      feature.properties.shapeName = feature.properties.NAME;
      feature.properties.shapeID = feature.properties.HCS_CODE;
    });
    if (sourceFeatures.length !== 92) throw new Error(`Expected 92 historic counties, received ${sourceFeatures.length}.`);
  }
  const neighbors = context.topojson.neighbors(object.geometries);
  const geometry = id === "uk" ? { features: sourceFeatures } : await json(metadata.simplifiedGeometryGeoJSON);
  const simplified = new Map(geometry.features.map((feature) => [feature.properties.shapeID, feature]));
  const excluded = /American Samoa|Guam|Northern Mariana|Puerto Rico|Virgin Islands/i;
  const features = sourceFeatures.filter((feature) => iso !== "USA" || !excluded.test(feature.properties.shapeName));
  const codeFor = (feature) => `${id}:${feature.properties.shapeID}`;
  const nameFor = (feature) => iso === "CHN" && feature.properties.shapeName === "Guangzhou Province"
    ? "Guangdong Province" : feature.properties.shapeName;
  const included = new Set(features.map(codeFor));
  const countries = features.map((feature) => {
    const index = sourceFeatures.indexOf(feature);
    return {
      code: codeFor(feature),
      name: nameFor(feature),
      aliases: id === "uk" ? [...new Set([
        feature.properties.COUNTY,
        ...(["Antrim", "Armagh", "Down", "Fermanagh", "Londonderry", "Tyrone"].includes(nameFor(feature))
          ? [`County ${nameFor(feature)}`] : []),
        ...(nameFor(feature) === "Londonderry" ? ["Derry", "County Derry"] : []),
        ...(nameFor(feature) === "Anglesey" ? ["Isle of Anglesey", "Ynys Mon"] : []),
        ...(nameFor(feature) === "Caernarfonshire" ? ["Caernarvonshire"] : [])
      ].filter((alias) => alias && alias !== nameFor(feature)))]
        : iso === "CHN" && nameFor(feature) === "Guangdong Province" ? ["Guangdong", "Canton"] : [],
      borders: neighbors[index].map((i) => codeFor(sourceFeatures[i])).filter((code) => included.has(code))
    };
  });
  for (const [leftName, rightName] of additionalConnections[id] || []) {
    const left = countries.find((country) => country.name === leftName);
    const right = countries.find((country) => country.name === rightName);
    if (!left || !right) throw new Error(`${id}: unknown fixed-link endpoint ${leftName}/${rightName}`);
    if (!left.borders.includes(right.code)) left.borders.push(right.code);
    if (!right.borders.includes(left.code)) right.borders.push(left.code);
  }
  const outputFeatures = features.map((feature) => ({
    type: "Feature",
    properties: {
      code: codeFor(feature),
      name: nameFor(feature),
      disputed: iso === "CHN" && /Taiwan|Tibet|Xizang|Hong Kong|Macao|Macau/i.test(feature.properties.shapeName)
        || iso === "IND" && /Jammu|Kashmir|Ladakh|Arunachal/i.test(
          feature.properties.shapeName.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    },
    geometry: mapGeometry((simplified.get(feature.properties.shapeID) || feature).geometry)
  }));
  const byCode = new Map(countries.map((country) => [country.code, country]));
  let largest = 0;
  const seen = new Set();
  for (const country of countries) {
    if (seen.has(country.code)) continue;
    const pending = [country.code];
    let size = 0;
    while (pending.length) {
      const code = pending.pop();
      if (seen.has(code)) continue;
      seen.add(code);
      size += 1;
      pending.push(...byCode.get(code).borders.filter((border) => !seen.has(border)));
    }
    largest = Math.max(largest, size);
  }
  // Italy has exactly 20 regions; Sicily and Sardinia have no mainland land border.
  if (countries.length < 20 || largest < (id === "italy" ? 18 : 20)) {
    throw new Error(`${id}: insufficient connected subdivisions (${largest}/${countries.length})`);
  }
  const source = {
    url: metadata.tjDownloadURL,
    simplifiedUrl: metadata.simplifiedGeometryGeoJSON,
    boundaryID: metadata.boundaryID,
    license: metadata.boundaryLicense,
    licenseSource: metadata.licenseSource,
    source: metadata.boundarySource,
    year: metadata.boundaryYearRepresented
  };
  const asset = JSON.stringify({
    countries, mapData: { type: "FeatureCollection", features: outputFeatures }, source
  });
  await writeFile(new URL(`${id}.js`, directory),
    `// Generated by generate-maps.mjs; see ATTRIBUTION.md.\nwindow.MapominoesMapData[${JSON.stringify(id)}] = ${asset};\n`);
  catalog.push({
    id, name, count: countries.length, connectedCount: largest,
    ...(id === "uk" ? { revision: createHash("sha256").update(asset).digest("hex").slice(0, 12) } : {})
  });
  console.log(`${name}: ${countries.length} regions, ${largest} connected`);
}
await writeFile(new URL("./map-catalog.js", import.meta.url),
  `// Generated by generate-maps.mjs; see ATTRIBUTION.md.\nwindow.MapominoesMapCatalog = ${JSON.stringify(catalog, null, 2)};\n`);

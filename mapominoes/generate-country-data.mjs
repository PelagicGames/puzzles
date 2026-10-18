// Copyright (C) 2026 Pelagic Games

/**
 * Run node mapominoes/generate-country-data.mjs [source-countries.json].
 * Reads the supplied mledoze dataset or fetches its upstream JSON, then overwrites
 * countries.js beside this script with the browser global used by world-map rules.
 * Requires Node fetch and filesystem APIs. Curates 195 sovereign states, aliases
 * and reciprocal playable borders; rejects unexpected counts or unknown endpoints.
 */
import { readFile, writeFile } from "node:fs/promises";

const sourcePath = process.argv[2];
const outputPath = new URL("./countries.js", import.meta.url);
const sourceUrl = "https://raw.githubusercontent.com/mledoze/countries/master/dist/countries.json";
const countries = JSON.parse(
  sourcePath
    ? await readFile(sourcePath, "utf8")
    : await (await fetch(sourceUrl)).text()
);
// UN members plus Palestine and the Vatican define the selectable country set.
const includedCodes = new Set(
  countries
    .filter((country) => country.unMember || ["PSE", "VAT"].includes(country.cca3))
    .map((country) => country.cca3)
);
// Fold external territory border codes into the sovereign owner used by gameplay.
const dependencyOwners = {
  ESH: "MAR",
  GIB: "GBR",
  GUF: "FRA",
  HKG: "CHN",
  MAC: "CHN",
  UNK: "SRB"
};
// Supplement upstream spellings with common abbreviations and historical names.
const curatedAliases = {
  ARE: ["UAE", "United Arab Emirates"],
  BHS: ["The Bahamas"],
  BOL: ["Bolivia"],
  BRN: ["Brunei"],
  CIV: ["Ivory Coast", "Cote d'Ivoire"],
  COD: ["DR Congo", "DRC", "Congo-Kinshasa", "Democratic Republic of the Congo"],
  COG: ["Republic of the Congo", "Congo-Brazzaville"],
  CPV: ["Cape Verde"],
  CZE: ["Czech Republic", "Czechia"],
  FSM: ["Micronesia", "Federated States of Micronesia"],
  GBR: ["United Kingdom", "UK", "Great Britain", "Britain", "GB"],
  GMB: ["The Gambia"],
  IRN: ["Iran"],
  KNA: ["St Kitts and Nevis"],
  KOR: ["South Korea", "Republic of Korea"],
  LAO: ["Laos"],
  LCA: ["St Lucia"],
  MDA: ["Moldova"],
  MKD: ["Macedonia", "North Macedonia"],
  MMR: ["Burma", "Myanmar"],
  PRK: ["North Korea", "DPRK"],
  PSE: ["Palestine"],
  RUS: ["Russia"],
  STP: ["Sao Tome and Principe"],
  SWZ: ["Swaziland", "Eswatini"],
  SYR: ["Syria"],
  TLS: ["East Timor", "Timor-Leste"],
  TUR: ["Turkey", "Türkiye"],
  TZA: ["Tanzania"],
  USA: ["United States", "United States of America", "USA", "US", "America"],
  VAT: ["Vatican", "Vatican City", "Holy See"],
  VEN: ["Venezuela"],
  VCT: ["St Vincent and the Grenadines"],
  VNM: ["Vietnam"]
};
// Fixed crossings and territory connections not represented as upstream land borders.
const additionalConnections = [
  ["BHR", "SAU"],
  ["CYP", "GBR"],
  ["DNK", "SWE"],
  ["FRA", "GBR"],
  ["FRA", "NLD"],
  ["MYS", "SGP"]
];

// Intermediate borders are Sets so ownership folding and reciprocal edges deduplicate.
// Coordinates change source latitude/longitude into GeoJSON longitude/latitude order.
const selected = countries
  .filter((country) => includedCodes.has(country.cca3))
  .map((country) => {
    const borders = new Set();
    country.borders.forEach((border) => {
      const code = dependencyOwners[border] || border;
      if (includedCodes.has(code) && code !== country.cca3) borders.add(code);
    });
    return {
      aliases: [...new Set([
        country.name.common,
        ...country.altSpellings,
        ...(curatedAliases[country.cca3] || [])
      ])],
      borders,
      code: country.cca3,
      common: country.name.common,
      coordinates: [country.latlng[1], country.latlng[0]],
      name: country.name.official,
      numeric: country.ccn3
    };
  });
const byCode = new Map(selected.map((country) => [country.code, country]));

// Make every upstream and curated connection playable in both directions.
selected.forEach((country) => {
  country.borders.forEach((border) => byCode.get(border)?.borders.add(country.code));
});
additionalConnections.forEach(([left, right]) => {
  byCode.get(left).borders.add(right);
  byCode.get(right).borders.add(left);
});

// Convert Sets to deterministic sorted arrays before serialising the browser payload.
const output = selected
  .map((country) => ({
    ...country,
    borders: [...country.borders].sort()
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

// Fail before writing if the upstream selection or a curated endpoint has drifted.
if (output.length !== 195) {
  throw new Error(`Expected 195 sovereign states, received ${output.length}.`);
}
output.forEach((country) => {
  country.borders.forEach((border) => {
    if (!byCode.has(border)) {
      throw new Error(`${country.code} has unknown border ${border}.`);
    }
  });
});

const header = `// Generated from mledoze/countries (ODbL 1.0).\n`
  + "// See ATTRIBUTION.md. Do not edit by hand.\n\n";
await writeFile(
  outputPath,
  `${header}window.MapominoesCountries = ${JSON.stringify(output, null, 2)};\n`
);

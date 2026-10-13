// Copyright (C) 2026 Pelagic Games

import { readFile, writeFile } from "node:fs/promises";

const sourcePath = process.argv[2];
const outputPath = new URL("./countries.js", import.meta.url);
const sourceUrl = "https://raw.githubusercontent.com/mledoze/countries/master/dist/countries.json";
const countries = JSON.parse(
  sourcePath
    ? await readFile(sourcePath, "utf8")
    : await (await fetch(sourceUrl)).text()
);
const includedCodes = new Set(
  countries
    .filter((country) => country.unMember || ["PSE", "VAT"].includes(country.cca3))
    .map((country) => country.cca3)
);
const dependencyOwners = {
  ESH: "MAR",
  GIB: "GBR",
  GUF: "FRA",
  HKG: "CHN",
  MAC: "CHN",
  UNK: "SRB"
};
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
const additionalConnections = [
  ["BHR", "SAU"],
  ["CYP", "GBR"],
  ["DNK", "SWE"],
  ["FRA", "GBR"],
  ["FRA", "NLD"],
  ["MYS", "SGP"]
];

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

selected.forEach((country) => {
  country.borders.forEach((border) => byCode.get(border)?.borders.add(country.code));
});
additionalConnections.forEach(([left, right]) => {
  byCode.get(left).borders.add(right);
  byCode.get(right).borders.add(left);
});

const output = selected
  .map((country) => ({
    ...country,
    borders: [...country.borders].sort()
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

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

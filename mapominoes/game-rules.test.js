// Copyright (C) 2026 Pelagic Games

const assert = require("node:assert");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(`${__dirname}/game-rules.js`, "utf8"), context);
const {
  editDistance,
  searchCountries,
  validateMove,
  validChoices
} = context.window.MapominoesRules;

const countries = [
  {
    aliases: ["Alpha"],
    borders: ["BET"],
    code: "ALP",
    name: "Republic of Alpha"
  },
  {
    aliases: ["Beta", "B"],
    borders: ["ALP", "GAM"],
    code: "BET",
    name: "Kingdom of Beta"
  },
  {
    aliases: ["Gamma"],
    borders: ["BET"],
    code: "GAM",
    name: "State of Gamma"
  },
  {
    aliases: ["Island"],
    borders: [],
    code: "ISL",
    name: "Island Republic"
  }
];

assert.strictEqual(editDistance("britain", "britian"), 2);
assert.strictEqual(searchCountries(countries, "bta")[0].country.code, "BET");
assert.strictEqual(searchCountries(countries, "B")[0].alias, "B");
assert(validateMove(countries, [], "ALP", 3).valid);
assert(!validateMove(countries, [], "BET", 4).valid);
assert(!validateMove(countries, [], "ISL", 2).valid);
assert(validateMove(countries, [{ code: "ALP" }], "BET", 3).valid);
assert(!validateMove(countries, [{ code: "ALP" }], "GAM", 3).valid);
assert(!validateMove(
  countries,
  [{ code: "ALP" }, { code: "BET" }],
  "ALP",
  3
).valid);
assert.deepStrictEqual(
  validChoices(countries, [{ code: "ALP" }], 3).map((country) => country.code),
  ["BET"]
);

console.log("Mapominoes game rules tests passed.");

// Copyright (C) 2026 Pelagic Games

/**
 * Run with node wordquiz/bank.test.js from the repository root.
 * Loads the committed puzzle bank in Node and checks its structure: unique link
 * IDs, well-formed clues and tiles, and answer checks in the expected format,
 * with no plaintext answer fields.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = {};
const source = fs.readFileSync(path.join(__dirname, "puzzle-bank.js"), "utf8");
vm.runInThisContext(source, { filename: "puzzle-bank.js" });
const bank = window.WordQuizBank;

assert.ok(bank, "puzzle-bank.js should publish window.WordQuizBank");
assert.strictEqual(bank.decoys, 4);
assert.ok(Number.isInteger(bank.iterations) && bank.iterations >= 100000, "answer checks need deliberate key-stretching");
assert.ok(bank.puzzles.length >= 1000, "the bank should hold a large set of puzzles");

const ids = new Set();
bank.puzzles.forEach((puzzle) => {
  const label = `puzzle ${puzzle.id}`;
  assert.deepStrictEqual(Object.keys(puzzle).sort(), ["check", "clue", "id", "pos", "tiles"], `${label} has unexpected fields`);
  assert.match(puzzle.id, /^[0-9a-f]{10}$/, `${label} ID`);
  assert.ok(!ids.has(puzzle.id), `${label} is duplicated`);
  ids.add(puzzle.id);
  assert.ok(["n", "v", "a"].includes(puzzle.pos), `${label} part of speech`);
  assert.match(puzzle.tiles, /^[A-Z]+$/, `${label} tiles`);
  const answerLength = puzzle.tiles.length - bank.decoys;
  assert.ok(answerLength >= 4 && answerLength <= 20, `${label} answer length ${answerLength}`);
  assert.match(puzzle.check, /^[A-Za-z0-9+/]{22}==$/, `${label} check should be a 16-byte base64 digest`);
  assert.ok(puzzle.clue.trim().length >= 10, `${label} clue is too short`);
  // Braces only ever appear as the {} blank marker.
  assert.ok(!/[{}]/.test(puzzle.clue.replace(/\{\}/g, "")), `${label} clue has a stray brace`);
  assert.ok((puzzle.clue.match(/\{\}/g) || []).length <= 3, `${label} clue has too many blanks`);
});

assert.ok(!/"answer"/i.test(source), "the public bank must not contain answer fields");

console.log(`Word Quiz bank tests passed (${bank.puzzles.length} puzzles).`);

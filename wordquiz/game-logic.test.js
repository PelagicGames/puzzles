// Copyright (C) 2026 Pelagic Games

/**
 * Run with node wordquiz/game-logic.test.js from the repository root.
 * Loads the browser modules in Node with in-memory storage and verifies answer
 * checking against Node's own PBKDF2, solved-progress storage (including the
 * page-only fallback when storage is blocked or full), random unsolved selection
 * and share messages, without writing browser or disk state.
 */

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// The storage stub preserves missing-key semantics using string-keyed values.
const values = new Map();
global.window = {
  crypto: globalThis.crypto || crypto.webcrypto,
  localStorage: {
    /**
     * @param {string} key - Storage key.
     * @returns {string|null} Stored value or null when absent.
     */
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    /**
     * @param {string} key - Storage key.
     * @param {string} value - Serialised value.
     * @returns {void} Replaces the in-memory entry.
     */
    setItem(key, value) {
      values.set(key, value);
    },
    /**
     * @param {string} key - Storage key.
     * @returns {void} Deletes the in-memory entry.
     */
    removeItem(key) {
      values.delete(key);
    }
  }
};
["word-check.js", "progress.js", "share.js"].forEach((file) => {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, file), "utf8"), { filename: file });
});

const check = window.WordQuizCheck;
const progress = window.WordQuizProgress;
const share = window.WordQuizShare;

/**
 * @param {string} id - Puzzle ID.
 * @param {string} answer - Answer to encode.
 * @param {number} iterations - PBKDF2 iterations.
 * @returns {string} Reference digest computed with Node's crypto module.
 */
function referenceDigest(id, answer, iterations) {
  return crypto.pbkdf2Sync(answer.toUpperCase(), `wordquiz:${id}`, iterations, 16, "sha256").toString("base64");
}

/**
 * @returns {Promise<void>} Runs the asynchronous answer-check assertions.
 */
async function testAnswerCheck() {
  const iterations = 1000;
  const puzzle = { id: "0123456789", check: referenceDigest("0123456789", "LANTERN", iterations) };
  assert.strictEqual(await check.answerDigest(puzzle.id, "lantern", iterations), puzzle.check);
  assert.strictEqual(await check.isCorrect(puzzle, "LANTERN", iterations), true);
  assert.strictEqual(await check.isCorrect(puzzle, "lantern", iterations), true);
  assert.strictEqual(await check.isCorrect(puzzle, "LANTERNS", iterations), false);
  assert.strictEqual(await check.isCorrect(puzzle, "RANTLEN", iterations), false);
  // The ID salts the digest, so the same answer elsewhere does not match.
  assert.notStrictEqual(await check.answerDigest("9876543210", "LANTERN", iterations), puzzle.check);
}

/**
 * @returns {void} Runs the progress and selection assertions.
 */
function testProgress() {
  const puzzles = ["aaaaaaaaaa", "bbbbbbbbbb", "cccccccccc"].map((id) => ({ id }));
  assert.deepStrictEqual(progress.solvedIds(), []);
  assert.strictEqual(progress.solvedCount(puzzles), 0);

  progress.markSolved("bbbbbbbbbb");
  progress.markSolved("bbbbbbbbbb");
  progress.markSolved("retired000");
  assert.deepStrictEqual(progress.solvedIds(), ["bbbbbbbbbb", "retired000"]);
  assert.strictEqual(progress.isSolved("bbbbbbbbbb"), true);
  // IDs no longer in the bank do not count towards progress.
  assert.strictEqual(progress.solvedCount(puzzles), 1);

  assert.strictEqual(progress.randomUnsolved(puzzles, undefined, () => 0).id, "aaaaaaaaaa");
  assert.strictEqual(progress.randomUnsolved(puzzles, undefined, () => 0.99).id, "cccccccccc");
  assert.strictEqual(progress.randomUnsolved(puzzles, "aaaaaaaaaa", () => 0).id, "cccccccccc");
  progress.markSolved("aaaaaaaaaa");
  assert.strictEqual(progress.randomUnsolved(puzzles, "cccccccccc"), null);
  progress.markSolved("cccccccccc");
  assert.strictEqual(progress.randomUnsolved(puzzles), null);
  assert.strictEqual(progress.solvedCount(puzzles), 3);

  values.set(progress.storageKey, "{\"not\":\"a list\"}");
  assert.throws(() => progress.solvedIds(), /Invalid Word Quiz progress data/);
  values.delete(progress.storageKey);
  assert.strictEqual(progress.storageAvailable, true);
  assert.strictEqual(progress.createStorageNotice(), null);
}

/**
 * @param {Object} sandboxWindow - Window stand-in for an isolated context.
 * @returns {Object} WordQuizProgress loaded against that window.
 */
function loadIsolatedProgress(sandboxWindow) {
  const context = vm.createContext({ window: sandboxWindow });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "progress.js"), "utf8"), context, { filename: "progress.js" });
  return sandboxWindow.WordQuizProgress;
}

/**
 * @returns {void} Checks that blocked or full storage keeps solves page-only.
 */
function testUnavailableStorage() {
  const puzzles = ["aaaaaaaaaa", "bbbbbbbbbb"].map((id) => ({ id }));
  const blocked = loadIsolatedProgress({
    get localStorage() {
      throw new Error("SecurityError: storage is blocked");
    }
  });
  assert.strictEqual(blocked.storageAvailable, false);
  assert.strictEqual(blocked.solvedCount(puzzles), 0);
  assert.strictEqual(blocked.markSolved("aaaaaaaaaa"), false);
  assert.strictEqual(blocked.isSolved("aaaaaaaaaa"), true);
  assert.strictEqual(blocked.randomUnsolved(puzzles).id, "bbbbbbbbbb");
  assert.match(blocked.storageNoticeText, /local browser storage must be enabled/);

  let quotaFull = false;
  const quotaValues = new Map();
  const quota = loadIsolatedProgress({
    localStorage: {
      getItem: (key) => (quotaValues.has(key) ? quotaValues.get(key) : null),
      setItem: (key, value) => {
        if (quotaFull) throw new Error("QuotaExceededError");
        quotaValues.set(key, value);
      },
      removeItem: (key) => quotaValues.delete(key)
    }
  });
  assert.strictEqual(quota.storageAvailable, true);
  assert.strictEqual(quota.markSolved("aaaaaaaaaa"), true);
  quotaFull = true;
  assert.strictEqual(quota.markSolved("bbbbbbbbbb"), false);
  assert.strictEqual(quota.solvedCount(puzzles), 2);
  assert.strictEqual(quotaValues.get(quota.storageKey), JSON.stringify(["aaaaaaaaaa"]));
}

/**
 * @returns {void} Runs the share message and link assertions.
 */
function testShare() {
  const puzzle = { pos: "n", clue: "a light enclosed in a protective {} case" };
  const url = "https://example.com/wordquiz/puzzle.html?id=0123456789";
  const help = share.shareMessage({ puzzle, length: 7, solved: false, url });
  assert.match(help.text, /help me/);
  assert.match(help.text, /7-letter noun: \u201ca light enclosed in a protective ___ case\u201d/);
  assert.strictEqual(help.url, url);

  const challenge = share.shareMessage({ puzzle, length: 7, solved: true, attempts: 2, url });
  assert.match(challenge.text, /I solved this Word Quiz in 2 tries\. Can you\?/);
  assert.match(share.shareMessage({ puzzle, length: 7, solved: true, attempts: 1, url }).text, /in 1 try\./);

  const long = share.clueSnippet("word ".repeat(40));
  assert.ok(long.length <= 91 && long.endsWith("\u2026"));

  const targets = share.shareTargets(challenge);
  const ids = targets.map(({ id }) => id);
  ["whatsapp", "facebook", "instagram", "x", "teams", "email", "copy"].forEach((id) => assert.ok(ids.includes(id), id));
  targets.filter(({ href }) => href).forEach(({ id, href }) => {
    assert.ok(href.includes(encodeURIComponent(url)), `${id} link should carry the puzzle URL`);
  });
  assert.ok(targets.filter(({ copy }) => copy).every(({ note }) => note), "copy targets explain what was copied");
}

testAnswerCheck()
  .then(() => {
    testProgress();
    testUnavailableStorage();
    testShare();
    console.log("Word Quiz game logic tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

// Copyright (C) 2026 Pelagic Games

/**
 * Answer checking for Word Quiz. The puzzle bank never contains answers; each
 * puzzle carries a salted PBKDF2-SHA-256 digest of its upper-case answer, and a
 * guess is correct when it derives the same digest. The deliberate key-stretching
 * keeps answers out of the page source and console, although a determined script
 * could still test dictionary words against a digest. Publishes WordQuizCheck in
 * browsers and exports it under Node for tests.
 */

(() => {
  const root = typeof window !== "undefined" ? window : globalThis;
  const DIGEST_BITS = 128;

  /**
   * @param {Uint8Array} bytes - Raw digest.
   * @returns {string} Standard base64 text.
   */
  function toBase64(bytes) {
    return btoa(String.fromCharCode(...bytes));
  }

  /**
   * @param {string} id - Puzzle ID, used in the salt so equal answers produce different digests.
   * @param {string} guess - Candidate answer; letters are upper-cased first.
   * @param {number} iterations - PBKDF2 iteration count from the bank.
   * @returns {Promise<string>} Base64 digest comparable with a puzzle's check field.
   */
  async function answerDigest(id, guess, iterations) {
    const encoder = new TextEncoder();
    const subtle = root.crypto.subtle;
    const key = await subtle.importKey("raw", encoder.encode(guess.toUpperCase()), "PBKDF2", false, ["deriveBits"]);
    const bits = await subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(`wordquiz:${id}`), iterations },
      key,
      DIGEST_BITS
    );
    return toBase64(new Uint8Array(bits));
  }

  /**
   * @param {{id: string, check: string}} puzzle - Bank entry.
   * @param {string} guess - Letters currently in the answer spaces.
   * @param {number} iterations - PBKDF2 iteration count from the bank.
   * @returns {Promise<boolean>} Whether the guess is the answer.
   */
  async function isCorrect(puzzle, guess, iterations) {
    return (await answerDigest(puzzle.id, guess, iterations)) === puzzle.check;
  }

  root.WordQuizCheck = { answerDigest, isCorrect };
  if (typeof module !== "undefined") module.exports = root.WordQuizCheck;
})();

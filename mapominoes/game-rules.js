// Copyright (C) 2026 Pelagic Games

/**
 * Shared name-search and move-validation rules for solo, local and online play.
 * Loaded as a browser script by the game pages; the same pure functions are exercised by game-rules.test.js.
 * A country/region has `{ code, name, aliases, borders }`; routes contain `{ code }` entries and codes uniquely
 * identify selectable areas. The exported API is attached to `window.MapominoesRules`.
 * Reads caller-supplied records and routes; returns new search/result collections
 * without changing the inputs or accessing the DOM, storage or network.
 */

(() => {
  /** Builds a code-to-region lookup used by the search-independent graph checks.
   * @param {Array<object>} countries - Region records with unique `code` values.
   * @returns {Map<string, object>} Region record indexed by code.
   */
  function countryMap(countries) {
    return new Map(countries.map((country) => [country.code, country]));
  }

  /** Folds accents, punctuation and ampersands so display names and aliases compare consistently.
   * @param {string} value - Name or user-entered query.
   * @returns {string} Lower-case ASCII words separated by single spaces.
   */
  function normalize(value) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  /** Computes Levenshtein distance with two rolling rows to limit memory to O(right.length).
   * @param {string} left - First normalised string.
   * @param {string} right - Second normalised string.
   * @returns {number} Minimum insertions, deletions and substitutions needed.
   */
  function editDistance(left, right) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      // Each cell is the cheapest edit sequence for prefixes ending at these two character positions.
      const current = [leftIndex];
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        current[rightIndex] = Math.min(
          current[rightIndex - 1] + 1,
          previous[rightIndex] + 1,
          previous[rightIndex - 1]
            + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
        );
      }
      previous.splice(0, previous.length, ...current);
    }
    return previous[right.length];
  }

  /** Assigns lower scores to better exact, prefix, word-prefix, substring and fuzzy name matches.
   * @param {string} candidate - Normalised canonical name or alias.
   * @param {string} query - Normalised search query.
   * @returns {?number} Ranking score, or null when the candidate is outside the fuzzy threshold.
   */
  function matchScore(candidate, query) {
    if (candidate === query) return 0;
    if (candidate.startsWith(query)) return 10 + (candidate.length - query.length) / 100;
    if (candidate.split(" ").some((word) => word.startsWith(query))) {
      return 20 + (candidate.length - query.length) / 100;
    }
    if (candidate.includes(query)) return 30 + candidate.indexOf(query) / 100;
    const distance = editDistance(candidate, query);
    const allowed = Math.max(1, Math.min(4, Math.floor(query.length * 0.34)));
    if (distance <= allowed) return 40 + distance + candidate.length / 100;
    return null;
  }

  /** Ranks each region by its best canonical-name/alias match and returns a stable shortlist.
   * @param {Array<object>} countries - Searchable region records.
   * @param {string} input - User-entered name fragment.
   * @param {number} [limit=7] - Maximum number of results.
   * @returns {Array<{alias: ?string, country: object, score: number}>} Ranked matches; alias is null for the canonical name.
   */
  function searchCountries(countries, input, limit = 7) {
    const query = normalize(input);
    if (!query) return [];
    return countries
      .map((country) => {
        const names = [country.name, ...country.aliases];
        let best = null;
        names.forEach((name) => {
          const score = matchScore(normalize(name), query);
          if (score === null || (best && best.score <= score)) return;
          best = {
            alias: normalize(name) === normalize(country.name) ? null : name,
            country,
            score
          };
        });
        return best;
      })
      .filter(Boolean)
      .sort((left, right) => left.score - right.score
        || left.country.name.localeCompare(right.country.name))
      .slice(0, limit);
  }

  /** Searches the unused border graph for a simple path of the required remaining length.
   * @param {Map<string, object>} countriesByCode - Region lookup whose records include border-code arrays.
   * @param {string} fromCode - Last code already on the candidate route.
   * @param {Set<string>} usedCodes - Codes forbidden from reuse along this path.
   * @param {number} movesRemaining - Further distinct moves required to complete the opening circuit.
   * @returns {boolean} Whether at least one valid continuation exists.
   */
  function hasContinuation(countriesByCode, fromCode, usedCodes, movesRemaining) {
    if (movesRemaining === 0) return true;
    const country = countriesByCode.get(fromCode);
    if (!country) return false;
    return country.borders.some((border) => {
      if (usedCodes.has(border)) return false;
      // Branch-local copies prevent sibling paths from inheriting each other's visited countries.
      const nextUsed = new Set(usedCodes);
      nextUsed.add(border);
      return hasContinuation(
        countriesByCode,
        border,
        nextUsed,
        movesRemaining - 1
      );
    });
  }

  /** Checks membership, non-repetition, adjacency and the first-circuit continuation constraint.
   * @param {Array<object>} countries - Active map regions; colon-prefixed codes identify alternatives.
   * @param {Array<{code: string}>} path - Moves already entered, in route order.
   * @param {string} candidateCode - Proposed region code.
   * @param {number} playerCount - Number of players sharing the first circuit.
   * @returns {{valid: boolean, reasons: string[]}} Validation result with human-readable failures.
   */
  function validateMove(countries, path, candidateCode, playerCount) {
    const noun = countries[0]?.code.includes(":") ? "region" : "country";
    const countriesByCode = countryMap(countries);
    const candidate = countriesByCode.get(candidateCode);
    if (!candidate) return { valid: false, reasons: [`Unknown ${noun}.`] };
    const usedCodes = new Set(path.map((entry) => entry.code));
    const reasons = [];
    if (usedCodes.has(candidateCode)) {
      reasons.push(`That ${noun} has already been named.`);
    }
    if (path.length > 0) {
      const previous = countriesByCode.get(path[path.length - 1].code);
      if (!previous?.borders.includes(candidateCode)) {
        reasons.push(`${candidate.name} does not share a permitted border with ${previous?.name || `the previous ${noun}`}.`);
      }
    }
    // The current move plus existing path length determines how many other first-circuit turns remain.
    const firstRoundMovesRemaining = Math.max(
      0,
      playerCount - path.length - 1
    );
    if (firstRoundMovesRemaining > 0 && reasons.length === 0) {
      const continuationUsed = new Set(usedCodes);
      continuationUsed.add(candidateCode);
      if (!hasContinuation(
        countriesByCode,
        candidateCode,
        continuationUsed,
        firstRoundMovesRemaining
      )) {
        reasons.push("This choice would prevent every player from playing once.");
      }
    }
    return { valid: reasons.length === 0, reasons };
  }

  /** Returns every unused legal opening region or legal neighbour of the route endpoint.
   * @param {Array<object>} countries - Active map regions.
   * @param {Array<{code: string}>} path - Current route.
   * @param {number} playerCount - Player count used for first-circuit feasibility.
   * @returns {Array<object>} Region records that pass `validateMove`.
   */
  function validChoices(countries, path, playerCount) {
    const candidates = path.length === 0
      ? countries
      : (() => {
        const countriesByCode = countryMap(countries);
        const previous = countriesByCode.get(path[path.length - 1].code);
        return previous.borders
          .map((code) => countriesByCode.get(code))
          .filter(Boolean);
      })();
    return candidates.filter(
      (country) => validateMove(countries, path, country.code, playerCount).valid
    );
  }

  window.MapominoesRules = {
    editDistance,
    hasContinuation,
    normalize,
    searchCountries,
    validateMove,
    validChoices
  };
})();

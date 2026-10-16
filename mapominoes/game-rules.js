// Copyright (C) 2026 Pelagic Games

(() => {
  function countryMap(countries) {
    return new Map(countries.map((country) => [country.code, country]));
  }

  function normalize(value) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function editDistance(left, right) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
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

  function hasContinuation(countriesByCode, fromCode, usedCodes, movesRemaining) {
    if (movesRemaining === 0) return true;
    const country = countriesByCode.get(fromCode);
    if (!country) return false;
    return country.borders.some((border) => {
      if (usedCodes.has(border)) return false;
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

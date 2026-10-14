// Copyright (C) 2026 Pelagic Games

(() => {
  const countries = window.MapominoesCountries;
  const {
    searchCountries,
    validateMove,
    validChoices
  } = window.MapominoesRules;
  const countriesByCode = new Map(
    countries.map((country) => [country.code, country])
  );
  const modePanel = document.querySelector("#mode-panel");
  const setupPanel = document.querySelector("#setup-panel");
  const setupForm = document.querySelector("#setup-form");
  const gameScreen = document.querySelector("#game-screen");
  const resultScreen = document.querySelector("#result-screen");
  const finalScreen = document.querySelector("#final-screen");
  const turnHeading = document.querySelector("#turn-heading");
  const roundLabel = document.querySelector("#round-label");
  const lastCountry = document.querySelector("#last-country");
  const roundGuidance = document.querySelector("#round-guidance");
  const scoreboard = document.querySelector("#scoreboard");
  const entryPanel = document.querySelector("#entry-panel");
  const challengePanel = document.querySelector("#challenge-panel");
  const challengeHeading = document.querySelector("#challenge-heading");
  const challengeCopy = document.querySelector("#challenge-copy");
  const countryForm = document.querySelector("#country-form");
  const countrySearch = document.querySelector("#country-search");
  const countryResults = document.querySelector("#country-results");
  const selectedCountry = document.querySelector("#selected-country");
  const selectedCountryName = document.querySelector("#selected-country-name");
  const confirmCountry = document.querySelector("#confirm-country");
  const formMessage = document.querySelector("#form-message");
  const resultHeading = document.querySelector("#result-heading");
  const resultReason = document.querySelector("#result-reason");
  const choiceSummary = document.querySelector("#choice-summary");
  const routeList = document.querySelector("#route-list");
  const restartButton = document.querySelector("#restart-button");
  const finalScores = document.querySelector("#final-scores");
  const mapError = document.querySelector("#map-error");
  const mapCountries = document.querySelector("#map-countries");
  const mapRoutes = document.querySelector("#map-routes");
  const mapMarkers = document.querySelector("#map-markers");
  const resultMap = document.querySelector("#result-map");
  let state = null;
  let selectedCode = null;
  let matches = [];
  let activeMatchIndex = -1;
  let mapData = null;
  let mapLoadError = null;
  let mapZoom = null;
  let mapTransform = window.d3.zoomIdentity;
  let routeOverlay = [];
  let markerOverlay = [];

  fetch("./assets/countries-50m.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`World map request failed with HTTP ${response.status}.`);
      }
      return response.json();
    })
    .then((topology) => {
      mapData = window.topojson.feature(topology, topology.objects.countries);
      if (state?.phase === "result") renderMap();
    })
    .catch((error) => {
      mapLoadError = error;
      console.error("Mapominoes could not load the world map.", error);
      if (state?.phase === "result") renderMap();
    });

  function playerName(index) {
    if (state.mode === "solo") return "You";
    return `Player ${index + 1}`;
  }

  function nextPlayer(index) {
    return (index + 1) % state.playerCount;
  }

  function setScreen(screen) {
    modePanel.hidden = screen !== "mode";
    setupPanel.hidden = screen !== "setup";
    gameScreen.hidden = screen !== "game";
    resultScreen.hidden = screen !== "result";
    finalScreen.hidden = screen !== "final";
  }

  function startGame(playerCount, mode) {
    state = {
      currentPlayer: 0,
      lastResult: null,
      mode,
      path: [],
      phase: "turn",
      playerCount,
      round: 1,
      scores: Array(playerCount).fill(0),
      startPlayer: 0
    };
    setScreen("game");
    renderTurn();
  }

  function startSolo() {
    const startingCountry = countries[Math.floor(Math.random() * countries.length)];
    state = {
      currentPlayer: 0,
      lastResult: null,
      mode: "solo",
      path: [{
        challenged: false,
        code: startingCountry.code,
        player: 0,
        reasons: [],
        valid: true
      }],
      phase: "turn",
      playerCount: 1,
      round: 1,
      scores: [0],
      startPlayer: 0
    };
    setScreen("game");
    renderTurn();
  }

  function startRound(startPlayer) {
    if (state.mode === "solo") {
      startSolo();
      return;
    }
    state.currentPlayer = startPlayer;
    state.lastResult = null;
    state.path = [];
    state.phase = "turn";
    state.round += 1;
    state.startPlayer = startPlayer;
    setScreen("game");
    renderTurn();
  }

  function renderScores() {
    scoreboard.hidden = state.mode === "solo";
    if (state.mode === "solo") return;
    scoreboard.replaceChildren();
    state.scores.forEach((score, index) => {
      const item = document.createElement("li");
      item.classList.toggle("is-current", index === state.currentPlayer);
      const label = document.createElement("span");
      label.textContent = playerName(index);
      const value = document.createElement("strong");
      value.textContent = String(score);
      item.append(label, value);
      scoreboard.append(item);
    });
  }

  function renderTurn() {
    const solo = state.mode === "solo";
    roundLabel.textContent = solo
      ? `Solo · ${state.path.length} ${state.path.length === 1 ? "country" : "countries"}`
      : `Round ${state.round} · ${
        state.mode === "challenge" ? "Challenge" : "Autocheck"
      }`;
    turnHeading.textContent = solo
      ? "Build the longest chain"
      : `${playerName(state.currentPlayer)}'s turn`;
    const previous = state.path.length
      ? countriesByCode.get(state.path[state.path.length - 1].code)
      : null;
    lastCountry.textContent = previous
      ? previous.name
      : "Choose the starting country";
    const firstRoundRemaining = solo ? 0 : Math.max(
      0,
      state.playerCount - state.path.length
    );
    roundGuidance.textContent = solo
      ? "Name an unused country connected to the previous one."
      : firstRoundRemaining > 0
      ? `Keep a route open for ${firstRoundRemaining} more ${
        firstRoundRemaining === 1 ? "player" : "players"
      } in the first circuit.`
      : "Choose a new neighbour and remember every country already named.";
    entryPanel.hidden = state.phase !== "turn";
    challengePanel.hidden = state.phase !== "challenge";
    if (state.phase === "challenge") renderChallenge();
    document.querySelector("#end-game-button").hidden = solo;
    renderScores();
    clearCountrySelection();
    if (state.phase === "turn") countrySearch.focus();
  }

  function renderChallenge() {
    const entry = state.path[state.path.length - 1];
    const country = countriesByCode.get(entry.code);
    challengeHeading.textContent = `${playerName(state.currentPlayer)}, accept or challenge?`;
    challengeCopy.textContent = `${playerName(entry.player)} named ${country.name}. Challenge if it was previously named, does not border the last country, or blocked the first circuit. A false challenge loses the round.`;
  }

  function clearCountrySelection() {
    selectedCode = null;
    matches = [];
    activeMatchIndex = -1;
    countrySearch.value = "";
    countrySearch.setAttribute("aria-expanded", "false");
    countryResults.hidden = true;
    countryResults.replaceChildren();
    selectedCountry.hidden = true;
    confirmCountry.disabled = true;
    formMessage.textContent = "";
    formMessage.classList.remove("is-error");
  }

  function resultLabel(match) {
    if (!match.alias) return "";
    return `(${match.alias})`;
  }

  function renderMatches() {
    countryResults.replaceChildren();
    matches.forEach((match, index) => {
      const item = document.createElement("li");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(index === activeMatchIndex));
      const button = document.createElement("button");
      button.type = "button";
      button.classList.toggle("is-active", index === activeMatchIndex);
      button.dataset.index = String(index);
      const name = document.createElement("strong");
      name.textContent = match.country.name;
      button.append(name);
      const alternative = resultLabel(match);
      if (alternative) {
        const detail = document.createElement("small");
        detail.textContent = alternative;
        button.append(detail);
      }
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("pointerup", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        chooseMatch(index);
      });
      item.append(button);
      countryResults.append(item);
    });
    countryResults.hidden = matches.length === 0;
    countrySearch.setAttribute("aria-expanded", String(matches.length > 0));
  }

  function chooseMatch(index) {
    const match = matches[index];
    if (!match) return;
    selectedCode = match.country.code;
    countrySearch.value = match.country.name;
    selectedCountryName.textContent = match.country.name;
    selectedCountry.hidden = false;
    confirmCountry.disabled = false;
    countryResults.hidden = true;
    countrySearch.setAttribute("aria-expanded", "false");
    formMessage.textContent = "";
  }

  function commitCountry() {
    if (!selectedCode) {
      formMessage.textContent = "Select a country from the shortlist first.";
      formMessage.classList.add("is-error");
      return;
    }
    const player = state.currentPlayer;
    const previousPath = [...state.path];
    const validation = validateMove(
      countries,
      previousPath,
      selectedCode,
      state.playerCount
    );
    state.path.push({
      challenged: false,
      code: selectedCode,
      player,
      reasons: validation.reasons,
      valid: validation.valid
    });
    if ((state.mode === "autocheck" || state.mode === "solo")
      && !validation.valid) {
      endRound({
        awardPoint: state.mode !== "solo",
        choicePath: previousPath,
        loser: state.mode === "solo" ? null : player,
        reason: validation.reasons.join(" ")
      });
      return;
    }
    state.currentPlayer = nextPlayer(player);
    if (state.mode === "challenge") {
      state.phase = "challenge";
    }
    renderTurn();
  }

  function acceptMove() {
    state.phase = "turn";
    renderTurn();
  }

  function challengeMove() {
    const challengedEntry = state.path[state.path.length - 1];
    challengedEntry.challenged = true;
    if (!challengedEntry.valid) {
      endRound({
        choicePath: state.path.slice(0, -1),
        loser: challengedEntry.player,
        reason: `The challenge succeeded. ${challengedEntry.reasons.join(" ")}`
      });
      return;
    }
    endRound({
      choicePath: state.path,
      loser: state.currentPlayer,
      reason: `The challenge failed: ${countriesByCode.get(challengedEntry.code).name} was a valid choice.`
    });
  }

  function concede() {
    const choices = validChoices(countries, state.path, state.playerCount);
    if (choices.length === 0) {
      endRound({
        awardPoint: false,
        choices,
        choicePath: state.path,
        loser: null,
        noLegalMoves: true,
        reason: state.mode === "solo"
          ? "Excellent call: there were no legal countries left."
          : "The chain ended because there were no legal countries left."
      });
      return;
    }
    endRound({
      awardPoint: state.mode !== "solo",
      choices,
      choicePath: state.path,
      loser: state.mode === "solo" ? null : state.currentPlayer,
      reason: state.mode === "solo"
        ? "The chain ended while legal countries were still available."
        : `${playerName(state.currentPlayer)} could not continue the chain.`
    });
  }

  function endRound({
    awardPoint = true,
    choices = null,
    choicePath,
    loser,
    noLegalMoves = false,
    reason
  }) {
    const availableChoices = choices
      || validChoices(countries, choicePath, state.playerCount);
    if (awardPoint && loser !== null) state.scores[loser] += 1;
    const restartPlayer = loser === null ? state.currentPlayer : loser;
    state.lastResult = {
      choices: availableChoices,
      loser,
      noLegalMoves,
      reason,
      restartPlayer
    };
    state.phase = "result";
    setScreen("result");
    if (state.mode === "solo") {
      const legalLength = state.path.filter((entry) => entry.valid).length;
      resultHeading.textContent = noLegalMoves
        ? `Chain complete — ${legalLength} countries!`
        : `Chain ended at ${legalLength} countries`;
    } else if (noLegalMoves) {
      resultHeading.textContent = `Round ${state.round} complete — no legal moves`;
    } else {
      resultHeading.textContent = `${playerName(loser)} loses round ${state.round}`;
    }
    resultReason.textContent = reason;
    choiceSummary.textContent = availableChoices.length
      ? `${availableChoices.length} valid ${
        availableChoices.length === 1 ? "choice was" : "choices were"
      } available: ${availableChoices.map((country) => country.name).join(", ")}.`
      : "There were no valid unused bordering countries available.";
    restartButton.textContent = state.mode === "solo"
      ? "Try another solo chain"
      : `Play again — ${playerName(restartPlayer)} starts`;
    document.querySelector("#result-end-game-button").hidden = state.mode === "solo";
    renderRouteList();
    renderMap();
  }

  function renderRouteList() {
    routeList.replaceChildren();
    state.path.forEach((entry, index) => {
      const country = countriesByCode.get(entry.code);
      const item = document.createElement("li");
      item.classList.toggle("is-invalid", !entry.valid);
      const number = document.createElement("span");
      number.className = "route-number";
      number.textContent = String(index + 1);
      const name = document.createElement("strong");
      name.textContent = country.name;
      const note = document.createElement("span");
      note.className = "route-note";
      note.textContent = !entry.valid
        ? `Invalid · ${entry.reasons.join(" ")}`
        : playerName(entry.player);
      item.append(number, name, note);
      routeList.append(item);
    });
  }

  const manualConnectionCoordinates = {
    "BHR|SAU": {
      BHR: [50.45, 26.14],
      SAU: [50.21, 26.62]
    },
    "CYP|GBR": {
      CYP: [32.94, 34.62],
      GBR: [32.81, 34.64]
    },
    "DNK|SWE": {
      DNK: [12.64, 55.61],
      SWE: [12.91, 55.58]
    },
    "ESP|GBR": {
      ESP: [-5.35, 36.15],
      GBR: [-5.34, 36.13]
    },
    "FRA|GBR": {
      FRA: [1.57, 50.92],
      GBR: [-1.31, 51.1]
    },
    "FRA|NLD": {
      FRA: [-63.08, 18.08],
      NLD: [-63.05, 18.04]
    },
    "MYS|SGP": {
      MYS: [103.74, 1.46],
      SGP: [103.77, 1.34]
    }
  };

  function polygonComponents(feature) {
    if (!feature) return [];
    const { geometry } = feature;
    if (geometry.type === "Polygon") return [geometry.coordinates];
    if (geometry.type === "MultiPolygon") return geometry.coordinates;
    return [];
  }

  function projectedVertices(component, projection) {
    const vertices = component.flatMap((ring) => ring.map(projection));
    const step = Math.max(1, Math.floor(vertices.length / 400));
    return vertices.filter((_, index) => index % step === 0);
  }

  function componentCentroid(component, pathGenerator) {
    return pathGenerator.centroid({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: component }
    });
  }

  function connectionPoints(
    leftCode,
    rightCode,
    featureByCode,
    projection,
    pathGenerator,
    pointForCode
  ) {
    const key = [leftCode, rightCode].sort().join("|");
    const manual = manualConnectionCoordinates[key];
    if (manual) {
      return [
        projection(manual[leftCode]),
        projection(manual[rightCode])
      ];
    }
    const leftComponents = polygonComponents(featureByCode.get(leftCode));
    const rightComponents = polygonComponents(featureByCode.get(rightCode));
    let closest = null;
    leftComponents.forEach((leftComponent) => {
      const leftVertices = projectedVertices(leftComponent, projection);
      rightComponents.forEach((rightComponent) => {
        const rightVertices = projectedVertices(rightComponent, projection);
        let distance = Infinity;
        leftVertices.forEach((left) => {
          rightVertices.forEach((right) => {
            const squared = (left[0] - right[0]) ** 2
              + (left[1] - right[1]) ** 2;
            if (squared < distance) distance = squared;
          });
        });
        if (!closest || distance < closest.distance) {
          closest = { distance, leftComponent, rightComponent };
        }
      });
    });
    if (!closest) return [pointForCode(leftCode), pointForCode(rightCode)];
    return [
      componentCentroid(closest.leftComponent, pathGenerator),
      componentCentroid(closest.rightComponent, pathGenerator)
    ];
  }

  function updateMapOverlay() {
    routeOverlay.forEach(({ element, start, end }) => {
      const transformedStart = mapTransform.apply(start);
      const transformedEnd = mapTransform.apply(end);
      element.setAttribute("x1", transformedStart[0]);
      element.setAttribute("y1", transformedStart[1]);
      element.setAttribute("x2", transformedEnd[0]);
      element.setAttribute("y2", transformedEnd[1]);
    });
    markerOverlay.forEach(({ element, point }) => {
      const transformed = mapTransform.apply(point);
      element.setAttribute(
        "transform",
        `translate(${transformed[0]} ${transformed[1]})`
      );
    });
  }

  function renderMap() {
    mapCountries.replaceChildren();
    mapRoutes.replaceChildren();
    mapMarkers.replaceChildren();
    mapError.hidden = true;
    if (mapLoadError) {
      mapError.textContent = `The world map could not be loaded: ${mapLoadError.message}`;
      mapError.hidden = false;
      return;
    }
    if (!mapData) {
      mapError.textContent = "Loading world map\u2026";
      mapError.hidden = false;
      return;
    }
    routeOverlay = [];
    markerOverlay = [];
    const projection = window.d3.geoEqualEarth().fitExtent(
      [[12, 12], [988, 500]],
      mapData
    );
    const pathGenerator = window.d3.geoPath(projection);
    const countryByNumeric = new Map(
      countries
        .filter((country) => country.numeric)
        .map((country) => [String(Number(country.numeric)), country])
    );
    const featureByCode = new Map();
    const visitedCodes = new Set(state.path.map((entry) => entry.code));
    const invalidCodes = new Set(
      state.path.filter((entry) => !entry.valid).map((entry) => entry.code)
    );
    const choiceCodes = new Set(
      state.lastResult.choices.map((country) => country.code)
    );

    window.d3.select(mapCountries)
      .selectAll("path")
      .data(mapData.features)
      .join("path")
      .attr("class", (feature) => {
        const country = countryByNumeric.get(String(Number(feature.id)));
        if (country) featureByCode.set(country.code, feature);
        if (country && invalidCodes.has(country.code)) return "map-country is-invalid";
        if (country && visitedCodes.has(country.code)) return "map-country is-visited";
        if (country && choiceCodes.has(country.code)) return "map-country is-choice";
        return "map-country";
      })
      .attr("d", pathGenerator);

    function pointForCode(code) {
      const country = countriesByCode.get(code);
      const feature = featureByCode.get(code);
      const point = feature ? pathGenerator.centroid(feature) : null;
      if (point?.every(Number.isFinite)) return point;
      return projection(country.coordinates);
    }

    state.path.slice(1).forEach((entry, index) => {
      const [start, end] = connectionPoints(
        state.path[index].code,
        entry.code,
        featureByCode,
        projection,
        pathGenerator,
        pointForCode
      );
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", start[0]);
      line.setAttribute("y1", start[1]);
      line.setAttribute("x2", end[0]);
      line.setAttribute("y2", end[1]);
      line.setAttribute(
        "class",
        `route-segment${entry.valid ? "" : " is-invalid"}`
      );
      mapRoutes.append(line);
      routeOverlay.push({ element: line, start, end });
    });

    state.path.forEach((entry, index) => {
      const point = pointForCode(entry.code);
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "g");
      marker.setAttribute(
        "class",
        `route-marker${entry.valid ? "" : " is-invalid"}`
      );
      marker.setAttribute("transform", `translate(${point[0]} ${point[1]})`);
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", "11");
      const number = document.createElementNS("http://www.w3.org/2000/svg", "text");
      number.textContent = String(index + 1);
      marker.append(circle, number);
      mapMarkers.append(marker);
      markerOverlay.push({ element: marker, point });
    });
    mapTransform = window.d3.zoomIdentity;
    mapZoom = window.d3.zoom()
      .scaleExtent([1, 14])
      .extent([[0, 0], [1000, 520]])
      .translateExtent([[0, 0], [1000, 520]])
      .on("zoom", (event) => {
        mapTransform = event.transform;
        window.d3.select(mapCountries).attr("transform", mapTransform);
        updateMapOverlay();
      });
    window.d3.select(resultMap)
      .call(mapZoom)
      .on("dblclick.zoom", null)
      .call(mapZoom.transform, window.d3.zoomIdentity);
  }

  function showFinalScores() {
    state.phase = "final";
    setScreen("final");
    finalScores.replaceChildren();
    [...state.scores]
      .map((score, index) => ({ index, score }))
      .sort((left, right) => left.score - right.score || left.index - right.index)
      .forEach(({ index, score }, rank) => {
        const item = document.createElement("li");
        const position = document.createElement("span");
        position.textContent = `#${rank + 1}`;
        const name = document.createElement("span");
        name.textContent = playerName(index);
        const value = document.createElement("strong");
        value.textContent = String(score);
        item.append(position, name, value);
        finalScores.append(item);
      });
  }

  setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(setupForm);
    const playerCount = Number(formData.get("player-count"));
    if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 8) {
      document.querySelector("#player-count").reportValidity();
      return;
    }
    startGame(playerCount, String(formData.get("mode")));
  });
  document.querySelector("#solo-mode-button").addEventListener("click", startSolo);
  document.querySelector("#local-mode-button").addEventListener("click", () => {
    setScreen("setup");
  });
  document.querySelector("#setup-back-button").addEventListener("click", () => {
    setScreen("mode");
  });

  countrySearch.addEventListener("input", () => {
    selectedCode = null;
    selectedCountry.hidden = true;
    confirmCountry.disabled = true;
    formMessage.textContent = "";
    matches = searchCountries(countries, countrySearch.value);
    activeMatchIndex = matches.length ? 0 : -1;
    renderMatches();
  });
  countrySearch.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!matches.length) return;
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      activeMatchIndex = (
        activeMatchIndex + direction + matches.length
      ) % matches.length;
      renderMatches();
    } else if (event.key === "Enter" && !countryResults.hidden) {
      event.preventDefault();
      chooseMatch(activeMatchIndex);
    } else if (event.key === "Escape") {
      countryResults.hidden = true;
      countrySearch.setAttribute("aria-expanded", "false");
    }
  });
  countrySearch.addEventListener("blur", () => {
    window.setTimeout(() => {
      countryResults.hidden = true;
      countrySearch.setAttribute("aria-expanded", "false");
    }, 100);
  });
  countryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    commitCountry();
  });
  document.querySelector("#concede-button").addEventListener("click", concede);
  document.querySelector("#accept-button").addEventListener("click", acceptMove);
  document.querySelector("#challenge-button").addEventListener("click", challengeMove);
  document.querySelector("#end-game-button").addEventListener("click", showFinalScores);
  document.querySelector("#result-end-game-button").addEventListener("click", showFinalScores);
  document.querySelector("#map-zoom-in").addEventListener("click", () => {
    if (mapZoom) window.d3.select(resultMap).transition().call(mapZoom.scaleBy, 1.7);
  });
  document.querySelector("#map-zoom-out").addEventListener("click", () => {
    if (mapZoom) window.d3.select(resultMap).transition().call(mapZoom.scaleBy, 1 / 1.7);
  });
  document.querySelector("#map-reset").addEventListener("click", () => {
    if (mapZoom) {
      window.d3.select(resultMap)
        .transition()
        .call(mapZoom.transform, window.d3.zoomIdentity);
    }
  });
  restartButton.addEventListener("click", () => {
    startRound(state.lastResult.restartPlayer);
  });
  document.querySelector("#new-game-button").addEventListener("click", () => {
    state = null;
    setupForm.reset();
    setScreen("mode");
  });
})();

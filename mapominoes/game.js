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
  let state = null;
  let selectedCode = null;
  let matches = [];
  let activeMatchIndex = -1;
  let mapData = null;
  let mapLoadError = null;

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
    return `Player ${index + 1}`;
  }

  function nextPlayer(index) {
    return (index + 1) % state.playerCount;
  }

  function setScreen(screen) {
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

  function startRound(startPlayer) {
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
    roundLabel.textContent = `Round ${state.round} · ${
      state.mode === "challenge" ? "Challenge" : "Autocheck"
    }`;
    turnHeading.textContent = `${playerName(state.currentPlayer)}'s turn`;
    const previous = state.path.length
      ? countriesByCode.get(state.path[state.path.length - 1].code)
      : null;
    lastCountry.textContent = previous
      ? previous.name
      : "Choose the starting country";
    const firstRoundRemaining = Math.max(
      0,
      state.playerCount - state.path.length
    );
    roundGuidance.textContent = firstRoundRemaining > 0
      ? `Keep a route open for ${firstRoundRemaining} more ${
        firstRoundRemaining === 1 ? "player" : "players"
      } in the first circuit.`
      : "Choose a new neighbour and remember every country already named.";
    entryPanel.hidden = state.phase !== "turn";
    challengePanel.hidden = state.phase !== "challenge";
    if (state.phase === "challenge") renderChallenge();
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
    if (state.mode === "autocheck" && !validation.valid) {
      endRound(player, validation.reasons.join(" "), previousPath);
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
      endRound(
        challengedEntry.player,
        `The challenge succeeded. ${challengedEntry.reasons.join(" ")}`,
        state.path.slice(0, -1)
      );
      return;
    }
    endRound(
      state.currentPlayer,
      `The challenge failed: ${countriesByCode.get(challengedEntry.code).name} was a valid choice.`,
      state.path
    );
  }

  function concede() {
    endRound(
      state.currentPlayer,
      `${playerName(state.currentPlayer)} could not continue the chain.`,
      state.path
    );
  }

  function endRound(loser, reason, choicePath) {
    const choices = validChoices(countries, choicePath, state.playerCount);
    state.scores[loser] += 1;
    state.lastResult = { choices, loser, reason };
    state.phase = "result";
    setScreen("result");
    resultHeading.textContent = `${playerName(loser)} loses round ${state.round}`;
    resultReason.textContent = reason;
    choiceSummary.textContent = choices.length
      ? `${choices.length} valid ${
        choices.length === 1 ? "choice was" : "choices were"
      } available: ${choices.map((country) => country.name).join(", ")}.`
      : "There were no valid unused bordering countries available.";
    restartButton.textContent = `Play again — ${playerName(loser)} starts`;
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
    const projection = window.d3.geoNaturalEarth1().fitExtent(
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
      const start = pointForCode(state.path[index].code);
      const end = pointForCode(entry.code);
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
    });
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
  restartButton.addEventListener("click", () => {
    startRound(state.lastResult.loser);
  });
  document.querySelector("#new-game-button").addEventListener("click", () => {
    state = null;
    setupForm.reset();
    setScreen("setup");
  });
})();

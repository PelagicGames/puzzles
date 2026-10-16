// Copyright (C) 2026 Pelagic Games

(() => {
  const pageMode = document.body.dataset.mapominoesMode || "local";
  const t = window.MapominoesMaps.text;
  let countries = window.MapominoesCountries;
  const {
    searchCountries,
    validateMove,
    validChoices
  } = window.MapominoesRules;
  let countriesByCode = new Map(
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
  const allPuzzlesLink = document.querySelector("#all-puzzles-link");
  const menuButton = document.querySelector("#mapominoes-menu-button");
  let state = null;
  let selectedCode = null;
  let matches = [];
  let activeMatchIndex = -1;
  let mapData = window.MapominoesMaps.get("world").mapData;
  const mapPicker = window.MapominoesMaps.picker(setupForm);
  const requestedMap = new URLSearchParams(location.search).get("map") || "world";
  if (window.MapominoesMaps.catalog.some((map) => map.id === requestedMap)) mapPicker.value = requestedMap;

  function playerName(index) {
    if (state.mode === "solo") return "You";
    return `Player ${index + 1}`;
  }

  function nextPlayer(index) {
    return (index + 1) % state.playerCount;
  }

  function setScreen(screen) {
    if (modePanel) modePanel.hidden = screen !== "mode";
    if (setupPanel) setupPanel.hidden = screen !== "setup";
    gameScreen.hidden = screen !== "game";
    resultScreen.hidden = screen !== "result";
    finalScreen.hidden = screen !== "final";
    if (allPuzzlesLink) allPuzzlesLink.hidden = screen !== "mode";
    if (menuButton) menuButton.hidden = screen === "mode";
  }

  function returnToMenu() {
    state = null;
    setupForm?.reset();
    clearCountrySelection();
    setScreen("mode");
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
      ? t(`Solo · ${state.path.length} ${state.path.length === 1 ? "country" : "countries"}`)
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
      : t("Choose the starting country");
    const firstRoundRemaining = solo ? 0 : Math.max(
      0,
      state.playerCount - state.path.length
    );
    roundGuidance.textContent = solo
      ? t("Name an unused country connected to the previous one.")
      : firstRoundRemaining > 0
      ? `Keep a route open for ${firstRoundRemaining} more ${
        firstRoundRemaining === 1 ? "player" : "players"
      } in the first circuit.`
      : t("Choose a new neighbour and remember every country already named.");
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
    challengeCopy.textContent = `${playerName(entry.player)} named ${country.name}. ${t("Challenge if it was previously named, does not border the last country, or blocked the first circuit. A false challenge loses the round.")}`;
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
      formMessage.textContent = t("Select a country from the shortlist first.");
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
          ? t("Excellent call: there were no legal countries left.")
          : t("The chain ended because there were no legal countries left.")
      });
      return;
    }
    endRound({
      awardPoint: state.mode !== "solo",
      choices,
      choicePath: state.path,
      loser: state.mode === "solo" ? null : state.currentPlayer,
      reason: state.mode === "solo"
        ? t("The chain ended while legal countries were still available.")
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
        ? t(`Chain complete — ${legalLength} ${legalLength === 1 ? "country" : "countries"}!`)
        : t(`Chain ended at ${legalLength} ${legalLength === 1 ? "country" : "countries"}`);
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
      : t("There were no valid unused bordering countries available.");
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

  function renderMap() {
    const error = document.querySelector("#map-error");
    error.hidden = true;
    try {
      window.MapominoesRenderer.render({
        countries, mapData, path: state.path, choices: state.lastResult.choices.map((country) => country.code)
      });
    } catch (cause) {
      console.error("Mapominoes could not render the map.", cause);
      error.textContent = `The map could not be displayed: ${cause.message}`;
      error.hidden = false;
    }
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

  setupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = setupForm.querySelector("button[type='submit']");
    const error = document.querySelector("#setup-error");
    const id = mapPicker.value;
    button.disabled = true;
    mapPicker.disabled = true;
    error.textContent = "";
    try {
      const data = await window.MapominoesMaps.load(id);
      countries = data.countries;
      countriesByCode = new Map(countries.map((country) => [country.code, country]));
      mapData = data.mapData;
      window.MapominoesMaps.selected = id;
      window.MapominoesMaps.updateVocabulary(id);
    } catch (cause) {
      console.error("Could not load the selected map.", cause);
      error.textContent = cause.message;
      button.disabled = false;
      mapPicker.disabled = false;
      return;
    }
    button.disabled = false;
    mapPicker.disabled = false;
    if (pageMode === "solo") {
      startSolo();
      return;
    }
    const formData = new FormData(setupForm);
    const playerCount = Number(formData.get("player-count"));
    if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 8) {
      document.querySelector("#player-count").reportValidity();
      return;
    }
    startGame(playerCount, String(formData.get("mode")));
  });
  document.querySelector("#solo-mode-button")?.addEventListener("click", startSolo);
  document.querySelector("#local-mode-button")?.addEventListener("click", () => {
    setScreen("setup");
  });
  document.querySelector("#setup-back-button")?.addEventListener("click", () => {
    setScreen("mode");
  });
  menuButton?.addEventListener("click", returnToMenu);

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
    startRound(state.lastResult.restartPlayer);
  });
  document.querySelector("#new-game-button").addEventListener("click", () => {
    if (pageMode === "local" || pageMode === "solo") {
      state = null;
      setupForm.reset();
      setScreen("setup");
    } else {
      returnToMenu();
    }
  });
  if (pageMode === "solo" || pageMode === "local") setScreen("setup");
})();

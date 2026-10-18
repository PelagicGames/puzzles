// Copyright (C) 2026 Pelagic Games

/**
 * Coordinates solo and pass-and-play rounds, including map setup, country entry, challenges, scoring and result screens.
 * Loaded by solo.html and local.html after the shared country, rules, map and rendering scripts.
 * The mutable state object is the current round: path entries record country code, player, validity and reasons;
 * mode and phase select the rules and screen, while scores and restartPlayer drive the next round.
 * Reads setup/search controls, the body mode and URL map query; writes page state
 * and result SVG. Regional map scripts may be fetched through the shared map API.
 */

(() => {
  // The page attribute distinguishes solo setup from local multiplayer without duplicating this controller.
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
  // `state` is the active round; selection fields hold the current autocomplete interaction, not game history.
  let state = null;
  let selectedCode = null;
  let matches = [];
  let activeMatchIndex = -1;
  let mapData = window.MapominoesMaps.get("world").mapData;
  const mapPicker = window.MapominoesMaps.picker(setupForm);
  const requestedMap = new URLSearchParams(location.search).get("map") || "world";
  if (window.MapominoesMaps.catalog.some((map) => map.id === requestedMap)) mapPicker.value = requestedMap;

  /** Returns the display name for a player index, using a second-person label in solo mode.
   * @param {number} index - Zero-based player index.
   * @returns {string} Player label.
   */
  function playerName(index) {
    if (state.mode === "solo") return "You";
    return `Player ${index + 1}`;
  }

  /** Advances cyclically to the player after `index`.
   * @param {number} index - Current zero-based player index.
   * @returns {number} Next player index.
   */
  function nextPlayer(index) {
    return (index + 1) % state.playerCount;
  }

  /** Shows exactly the page panel for the named state and updates persistent navigation visibility.
   * @param {string} screen - One of mode, setup, game, result or final.
   * @returns {void}
   * @sideEffects Updates panel `hidden` properties.
   */
  function setScreen(screen) {
    if (modePanel) modePanel.hidden = screen !== "mode";
    if (setupPanel) setupPanel.hidden = screen !== "setup";
    gameScreen.hidden = screen !== "game";
    resultScreen.hidden = screen !== "result";
    finalScreen.hidden = screen !== "final";
    if (allPuzzlesLink) allPuzzlesLink.hidden = screen !== "mode";
    if (menuButton) menuButton.hidden = screen === "mode";
  }

  /** Clears an unfinished game and returns to the mode-selection screen.
   * @returns {void}
   * @sideEffects Resets the setup form and country-entry UI, and changes visible panels.
   */
  function returnToMenu() {
    state = null;
    setupForm?.reset();
    clearCountrySelection();
    setScreen("mode");
  }

  /** Initialises a local multiplayer match with zero scores and an empty first-round route.
   * @param {number} playerCount - Number of local players, from two to eight.
   * @param {string} mode - Validation mode: autocheck or challenge.
   * @returns {void}
   * @sideEffects Replaces round state, updates panels and renders the opening turn.
   */
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

  /** Starts a solo chain seeded by one random region from the currently selected map.
   * @returns {void}
   * @sideEffects Replaces round state, including the valid starting path entry, then renders the turn.
   */
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

  /** Begins the next local round with its loser (or current player after a draw) leading.
   * @param {number} startPlayer - Zero-based index of the opening player.
   * @returns {void}
   * @sideEffects Resets the route and result, increments the round, and renders the first turn.
   */
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

  /** Rebuilds the local scoreboard and marks the active player; solo play has no scoreboard.
   * @returns {void}
   * @sideEffects Replaces scoreboard DOM children and visibility.
   */
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

  /** Synchronises the turn interface with the current player, phase and route.
   * @returns {void}
   * @sideEffects Updates game DOM, clears any stale selection, and focuses search during a turn.
   */
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

  /** Explains the most recent submitted move to the next player in challenge mode.
   * @returns {void}
   * @sideEffects Updates challenge heading and explanatory text.
   */
  function renderChallenge() {
    const entry = state.path[state.path.length - 1];
    const country = countriesByCode.get(entry.code);
    challengeHeading.textContent = `${playerName(state.currentPlayer)}, accept or challenge?`;
    challengeCopy.textContent = `${playerName(entry.player)} named ${country.name}. ${t("Challenge if it was previously named, does not border the last country, or blocked the first circuit. A false challenge loses the round.")}`;
  }

  /** Resets autocomplete, selected-country confirmation and validation feedback.
   * @returns {void}
   * @sideEffects Clears and hides country-entry DOM controls.
   */
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

  /** Formats an alternate name only when the result matched an alias rather than the canonical name.
   * @param {object} match - Search result containing `alias` and `country`.
   * @returns {string} Parenthesised alias or an empty string.
   */
  function resultLabel(match) {
    if (!match.alias) return "";
    return `(${match.alias})`;
  }

  /** Builds accessible autocomplete options and wires pointer/click selection behaviour.
   * @returns {void}
   * @sideEffects Replaces result-list DOM and updates combobox expansion state.
   */
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
      // Keep focus in the combobox and stop touch/pointer events reaching its container.
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

  /** Applies one current search result as the pending move, without committing the turn.
   * @param {number} index - Index in the current `matches` array.
   * @returns {void}
   * @sideEffects Updates search text, selected-country details and submit availability.
   */
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

  /** Validates and appends the selected region, then advances or ends the round as appropriate.
   * @returns {void}
   * @sideEffects Mutates route/current-player/phase state and may render a result or next turn.
   */
  function commitCountry() {
    if (!selectedCode) {
      formMessage.textContent = t("Select a country from the shortlist first.");
      formMessage.classList.add("is-error");
      return;
    }
    const player = state.currentPlayer;
    // Keep the pre-move route for the first-circuit check and the result map when autocheck rejects this move.
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

  /** Accepts the challenged move and returns play to the normal turn-entry phase.
   * @returns {void}
   * @sideEffects Changes phase and renders the next player's turn.
   */
  function acceptMove() {
    state.phase = "turn";
    renderTurn();
  }

  /** Resolves a challenge: an invalid move loses for its author; a valid one costs the challenger.
   * @returns {void}
   * @sideEffects Marks the route entry challenged and ends the round with the appropriate loser.
   */
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

  /** Checks whether the player is right that no legal continuation exists before ending play.
   * @returns {void}
   * @sideEffects May finish the round, award a point for an incorrect concession, and render results.
   */
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

  /** Records a terminal result, awards any point, and renders the route/map summary.
   * @param {object} result - Result options: choices, choicePath, loser, reason, awardPoint and noLegalMoves.
   * @returns {void}
   * @sideEffects Mutates scores/result/phase, changes screens and updates result DOM.
   */
  function endRound({
    awardPoint = true,
    choices = null,
    choicePath,
    loser,
    noLegalMoves = false,
    reason
  }) {
    // Prefer the already-computed list when concession checked it; otherwise derive it from the displayed route.
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

  /** Rebuilds the numbered route, distinguishing invalid entries from valid player moves.
   * @returns {void}
   * @sideEffects Replaces route-list DOM children.
   */
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

  /** Draws the shared result map and surfaces renderer/data failures in the page.
   * @returns {void}
   * @sideEffects Updates SVG through MapominoesRenderer and toggles the map error message.
   */
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

  /** Displays cumulative scores from lowest (best) to highest, retaining player order for ties.
   * @returns {void}
   * @sideEffects Switches to final-screen phase and rebuilds the final scoreboard.
   */
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

  // Setup submission loads the selected catalogue entry before changing the active map or starting play.
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

  // Input and keyboard listeners implement a combobox: edits invalidate prior selection, arrows cycle, Enter chooses, Escape dismisses.
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
  // Delay dismissal briefly so pointer selection can complete before focus leaves the input.
  countrySearch.addEventListener("blur", () => {
    window.setTimeout(() => {
      countryResults.hidden = true;
      countrySearch.setAttribute("aria-expanded", "false");
    }, 100);
  });
  // Form and action-button listeners are the state-machine transitions exposed by the page controls.
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

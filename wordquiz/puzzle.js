// Copyright (C) 2026 Pelagic Games

/**
 * Word Quiz play page. Chooses the puzzle from ?id= (or a random unsolved one),
 * renders the definition, answer spaces and tile tray, and handles clicking,
 * dragging and typing tiles. A full set of spaces is checked automatically:
 * wrong answers flash and shake, correct ones are celebrated and recorded.
 */

(() => {
  const bank = window.WordQuizBank;
  const progress = window.WordQuizProgress;
  const POS_NAMES = { n: "noun", v: "verb", a: "adjective" };
  const PRAISE = ["Brilliant!", "Spot on!", "Nailed it!", "Word perfect!", "Superb!", "Genius!", "Well played!"];
  const DRAG_THRESHOLD = 6;
  // Tile edge limits in CSS pixels, and the most tiles placed on one row.
  const MIN_TILE = 34;
  const MAX_TILE = 58;
  const MAX_PER_ROW = 10;
  const CONFETTI_PIECES = 90;
  const CONFETTI_COLOURS = ["#f2b134", "#e5533d", "#2f8f83", "#4e7bd9", "#9b59b6", "#f7d774"];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const elements = {
    game: document.getElementById("game"),
    card: document.getElementById("dictionary-card"),
    clue: document.getElementById("clue"),
    pos: document.getElementById("clue-pos"),
    length: document.getElementById("clue-length"),
    badge: document.getElementById("solved-badge"),
    answerRow: document.getElementById("answer-row"),
    tray: document.getElementById("tray"),
    status: document.getElementById("status"),
    controls: document.getElementById("controls"),
    successPanel: document.getElementById("success-panel"),
    successTitle: document.getElementById("success-title"),
    tally: document.getElementById("solved-tally"),
    shareButton: document.getElementById("share-button"),
    confetti: document.getElementById("confetti")
  };

  const state = {
    puzzle: null,
    // Tile letters in their original bank order; indices identify tiles throughout.
    tiles: [],
    tileElements: [],
    // Tile index shown in each tray cell; a tile placed in a space leaves its cell empty.
    trayOrder: [],
    // Tile index in each answer space, or null when empty.
    slots: [],
    attempts: 0,
    checking: false,
    solved: false
  };

  let share = null;
  let drag = null;
  let suppressClick = false;

  // Sits beside the tally when solves cannot be saved in this browser.
  const storageNotice = progress.createStorageNotice();
  if (storageNotice) elements.tally.before(storageNotice);

  /**
   * @returns {void} Shows "solved of total" for the whole bank.
   */
  function updateTally() {
    elements.tally.textContent = `${progress.solvedCount(bank.puzzles)} / ${bank.puzzles.length} solved`;
  }

  /**
   * @param {string} id - Section element ID to reveal; the others are hidden.
   * @returns {void}
   */
  function showSection(id) {
    ["game", "all-solved", "not-found"].forEach((sectionId) => {
      document.getElementById(sectionId).hidden = sectionId !== id;
    });
  }

  /**
   * @param {string} clue - Bank clue with {} blank markers.
   * @returns {Node[]} Text nodes and blank markers for the definition paragraph.
   */
  function clueNodes(clue) {
    let text = clue.charAt(0).toUpperCase() + clue.slice(1);
    if (!/[.!?)]$/.test(text)) text += ".";
    const nodes = [];
    text.split("{}").forEach((part, index) => {
      if (index > 0) {
        const blank = document.createElement("span");
        blank.className = "clue-blank";
        const label = document.createElement("span");
        label.className = "visually-hidden";
        label.textContent = "blank";
        blank.append(label);
        nodes.push(blank);
      }
      if (part) nodes.push(document.createTextNode(part));
    });
    return nodes;
  }

  /**
   * @param {number} tileIndex - Tile index.
   * @returns {HTMLButtonElement} The tile's persistent button, even while detached during render.
   */
  function tileElement(tileIndex) {
    return state.tileElements[tileIndex];
  }

  /**
   * Builds the tile buttons, spaces and tray cells for the current puzzle.
   * @returns {void}
   */
  function buildBoard() {
    elements.answerRow.replaceChildren(...state.slots.map((_, index) => {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.dataset.slot = String(index);
      return slot;
    }));
    elements.tray.replaceChildren(...state.trayOrder.map(() => {
      const cell = document.createElement("div");
      cell.className = "tray-cell";
      return cell;
    }));
    state.tileElements = state.tiles.map((letter, index) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile";
      tile.dataset.tile = String(index);
      const image = document.createElement("img");
      image.src = `./assets/tiles/${letter.toLowerCase()}.svg`;
      image.alt = "";
      image.draggable = false;
      tile.append(image);
      elements.tray.children[state.trayOrder.indexOf(index)].append(tile);
      return tile;
    });
  }

  /**
   * @param {number} count - Items to arrange.
   * @param {number} maxPerRow - Most items that fit on one row.
   * @returns {number} Items per row, balanced so the last row is not left nearly empty.
   */
  function balancedRow(count, maxPerRow) {
    const rows = Math.ceil(count / maxPerRow);
    return Math.ceil(count / rows);
  }

  /**
   * Sizes tiles to the play area. Tray rows hold at most MAX_PER_ROW tiles and wrap
   * further when tiles would drop below MIN_TILE. The answer spaces always stay on one
   * line, shrinking (with their gaps) below the tray tile size when the word is long.
   * @returns {void}
   */
  function layoutBoard() {
    const styles = window.getComputedStyle(elements.tray);
    const gap = parseFloat(styles.columnGap) || 6;
    const trayPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const width = elements.game.clientWidth - trayPadding;
    const fit = Math.max(1, Math.floor((width + gap) / (MIN_TILE + gap)));
    const maxPerRow = Math.min(MAX_PER_ROW, fit);
    const trayPerRow = balancedRow(state.tiles.length, maxPerRow);
    const busiest = Math.max(trayPerRow, 6);
    const tileSize = Math.floor(Math.min(MAX_TILE, (width - (busiest - 1) * gap) / busiest));
    const count = state.slots.length;
    const rowWidth = elements.game.clientWidth;
    let slotGap = gap;
    let slotSize = Math.min(tileSize, (rowWidth - (count - 1) * slotGap) / count);
    if (slotSize < tileSize) {
      // Keep gaps in proportion to the shrunken spaces so long words still fit.
      slotGap = Math.max(2, Math.min(gap, slotSize * 0.12));
      slotSize = Math.min(tileSize, (rowWidth - (count - 1) * slotGap) / count);
    }
    elements.game.style.setProperty("--tile-size", `${tileSize}px`);
    elements.answerRow.style.setProperty("--tile-size", `${Math.floor(slotSize)}px`);
    elements.answerRow.style.setProperty("--gap", `${slotGap.toFixed(1)}px`);
    elements.answerRow.style.setProperty("--row-count", String(count));
    elements.tray.style.setProperty("--row-count", String(trayPerRow));
  }

  /**
   * Moves tile buttons to match state, sliding them from their old positions.
   * @returns {void}
   */
  function render() {
    const animate = !reducedMotion.matches;
    const before = new Map();
    if (animate) {
      state.tiles.forEach((_, index) => before.set(index, tileElement(index).getBoundingClientRect()));
    }
    state.slots.forEach((tileIndex, slotIndex) => {
      const slot = elements.answerRow.children[slotIndex];
      if (tileIndex === null) {
        slot.replaceChildren();
        slot.classList.remove("is-filled");
      } else {
        slot.replaceChildren(tileElement(tileIndex));
        slot.classList.add("is-filled");
      }
    });
    state.trayOrder.forEach((tileIndex, cellIndex) => {
      const cell = elements.tray.children[cellIndex];
      if (state.slots.includes(tileIndex)) cell.replaceChildren();
      else cell.replaceChildren(tileElement(tileIndex));
    });
    state.tiles.forEach((letter, index) => {
      const tile = tileElement(index);
      const slotIndex = state.slots.indexOf(index);
      if (state.solved) tile.setAttribute("aria-label", letter);
      else {
        tile.setAttribute("aria-label", slotIndex < 0
          ? `${letter}, place in the next space`
          : `${letter} in space ${slotIndex + 1}, return to tray`);
      }
      tile.disabled = state.solved;
    });
    if (!animate) return;
    // FLIP: offset each moved tile back to where it was, then let CSS slide it home.
    state.tiles.forEach((_, index) => {
      const tile = tileElement(index);
      const old = before.get(index);
      const now = tile.getBoundingClientRect();
      const dx = old.left + old.width / 2 - (now.left + now.width / 2);
      const dy = old.top + old.height / 2 - (now.top + now.height / 2);
      const scale = now.width ? old.width / now.width : 1;
      if (!dx && !dy && scale === 1) return;
      tile.style.transition = "none";
      // Spaces can be smaller than tray cells, so tiles also grow or shrink on the way.
      tile.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
      requestAnimationFrame(() => {
        tile.style.transition = "";
        tile.style.transform = "";
      });
    });
  }

  /**
   * @param {string} message - Text for the live status line.
   * @param {string} [tone] - Optional modifier class suffix (error, success).
   * @returns {void}
   */
  function setStatus(message, tone) {
    elements.status.textContent = message;
    elements.status.className = tone ? `status status-${tone}` : "status";
  }

  /**
   * @returns {boolean} Whether tiles may currently be moved.
   */
  function canMove() {
    return !state.solved && !state.checking;
  }

  /**
   * @returns {void} Re-renders and checks the answer once every space is filled.
   */
  function afterChange() {
    render();
    if (state.slots.every((tileIndex) => tileIndex !== null)) checkAnswer();
    else if (elements.status.classList.contains("status-error")) setStatus("");
  }

  /**
   * @param {number} tileIndex - Tray tile to place.
   * @returns {void} Places it in the leftmost empty space, if any.
   */
  function placeInFirstEmpty(tileIndex) {
    const slotIndex = state.slots.indexOf(null);
    if (slotIndex < 0 || state.slots.includes(tileIndex)) return;
    state.slots[slotIndex] = tileIndex;
    afterChange();
  }

  /**
   * @param {number} tileIndex - Placed tile.
   * @returns {void} Returns it to its tray cell.
   */
  function returnToTray(tileIndex) {
    const slotIndex = state.slots.indexOf(tileIndex);
    if (slotIndex < 0) return;
    state.slots[slotIndex] = null;
    afterChange();
  }

  /**
   * @param {number} tileIndex - Dragged tile.
   * @param {number} slotIndex - Target space.
   * @returns {void} Moves the tile there; a displaced tile swaps into the source
   * space, or goes back to the tray when the dragged tile came from the tray.
   */
  function dropOnSlot(tileIndex, slotIndex) {
    const from = state.slots.indexOf(tileIndex);
    if (from === slotIndex) return;
    const occupant = state.slots[slotIndex];
    if (from >= 0) state.slots[from] = occupant;
    state.slots[slotIndex] = tileIndex;
    afterChange();
  }

  /**
   * Checks the filled spaces against the puzzle's digest.
   * @returns {Promise<void>}
   */
  async function checkAnswer() {
    state.checking = true;
    state.attempts += 1;
    const guess = state.slots.map((tileIndex) => state.tiles[tileIndex]).join("");
    let correct = false;
    try {
      correct = await window.WordQuizCheck.isCorrect(state.puzzle, guess, bank.iterations);
    } finally {
      state.checking = false;
    }
    if (correct) celebrate();
    else reject();
  }

  /**
   * @returns {void} Flashes and shakes the spaces; play continues.
   */
  function reject() {
    const row = elements.answerRow;
    row.classList.remove("is-wrong");
    // Reading layout restarts the animation when the same row fails twice in a row.
    void row.offsetWidth;
    row.classList.add("is-wrong");
    setStatus("Not quite \u2013 swap some letters and try again.", "error");
  }

  /**
   * @returns {void} Records the solve and plays the success flourish.
   */
  function celebrate() {
    state.solved = true;
    const saved = progress.markSolved(state.puzzle.id);
    updateTally();
    render();
    elements.answerRow.classList.remove("is-wrong");
    elements.answerRow.classList.add("is-correct");
    [...elements.answerRow.children].forEach((slot, index) => slot.style.setProperty("--order", String(index)));
    elements.card.classList.add("is-solved");
    elements.game.classList.add("is-solved");
    elements.badge.hidden = true;
    elements.controls.hidden = true;
    elements.successTitle.textContent = PRAISE[Math.floor(Math.random() * PRAISE.length)];
    elements.successPanel.hidden = false;
    elements.shareButton.textContent = "Challenge a friend";
    const tries = state.attempts === 1 ? "first time" : `in ${state.attempts} tries`;
    const tally = saved
      ? `${progress.solvedCount(bank.puzzles)} of ${bank.puzzles.length} words solved.`
      : "Not saved: local browser storage must be enabled to track progress.";
    setStatus(`Correct ${tries}! ${tally}`, "success");
    launchConfetti();
    document.getElementById("next-button").focus({ preventScroll: true });
  }

  /**
   * @returns {void} Drops a burst of confetti pieces that remove themselves.
   */
  function launchConfetti() {
    if (reducedMotion.matches) return;
    const pieces = [];
    for (let index = 0; index < CONFETTI_PIECES; index += 1) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = CONFETTI_COLOURS[index % CONFETTI_COLOURS.length];
      piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 30}vw`);
      piece.style.setProperty("--spin", `${(Math.random() - 0.5) * 1440}deg`);
      piece.style.animationDelay = `${Math.random() * 0.5}s`;
      piece.style.animationDuration = `${2.2 + Math.random() * 1.6}s`;
      pieces.push(piece);
    }
    elements.confetti.append(...pieces);
    window.setTimeout(() => pieces.forEach((piece) => piece.remove()), 4500);
  }

  /**
   * @returns {string} Absolute direct link to the current puzzle.
   */
  function puzzleUrl() {
    return new URL(`puzzle.html?id=${encodeURIComponent(state.puzzle.id)}`, window.location.href).href;
  }

  /**
   * @returns {void} Opens the share overlay with help or challenge wording.
   */
  function openShare() {
    const solved = state.solved || progress.isSolved(state.puzzle.id);
    share.open(window.WordQuizShare.shareMessage({
      puzzle: state.puzzle,
      length: state.slots.length,
      solved,
      attempts: state.solved ? state.attempts : 0,
      url: puzzleUrl()
    }));
  }

  /**
   * @returns {void} Navigates to another random unsolved word, or the all-solved page.
   */
  function goToNext() {
    const next = progress.randomUnsolved(bank.puzzles, state.puzzle.id);
    if (!next && !state.solved && !progress.isSolved(state.puzzle.id)) {
      setStatus("This is the last word you have not solved yet!");
      return;
    }
    window.location.assign(next ? `puzzle.html?id=${encodeURIComponent(next.id)}` : "puzzle.html");
  }

  // ---- Pointer dragging ------------------------------------------------------

  /**
   * @param {PointerEvent} event - Pointer down on a tile.
   * @returns {void} Records a possible drag; it starts once the pointer moves far enough.
   */
  function onPointerDown(event) {
    const tile = event.target.closest(".tile");
    if (!tile || !canMove() || event.button !== 0 || drag) return;
    drag = { tile, tileIndex: Number(tile.dataset.tile), pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ghost: null, target: null };
    tile.setPointerCapture(event.pointerId);
  }

  /**
   * @param {number} x - Client x.
   * @param {number} y - Client y.
   * @returns {Element|null} Space or tray under the point, ignoring the ghost.
   */
  function dropTargetAt(x, y) {
    const element = document.elementFromPoint(x, y);
    return element ? element.closest(".slot, .tray") : null;
  }

  /**
   * @param {PointerEvent} event - Pointer move while pressed.
   * @returns {void} Starts or continues a drag, moving the ghost and highlighting the target.
   */
  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.ghost) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
      const rect = drag.tile.getBoundingClientRect();
      drag.offsetX = drag.startX - rect.left;
      drag.offsetY = drag.startY - rect.top;
      drag.ghost = drag.tile.cloneNode(true);
      drag.ghost.classList.add("drag-ghost");
      drag.ghost.removeAttribute("data-tile");
      drag.ghost.style.width = `${rect.width}px`;
      drag.ghost.style.height = `${rect.height}px`;
      // The ghost lives outside the board, so it carries its own size for the letter.
      drag.ghost.style.setProperty("--tile-size", `${rect.width}px`);
      document.body.append(drag.ghost);
      drag.tile.classList.add("is-drag-source");
    }
    drag.ghost.style.left = `${event.clientX - drag.offsetX}px`;
    drag.ghost.style.top = `${event.clientY - drag.offsetY}px`;
    const target = dropTargetAt(event.clientX, event.clientY);
    if (target !== drag.target) {
      if (drag.target) drag.target.classList.remove("is-drop-target");
      drag.target = target;
      if (target) target.classList.add("is-drop-target");
    }
  }

  /**
   * @param {PointerEvent} event - Pointer released.
   * @returns {void} Drops the tile on a space, or returns a placed tile to the tray.
   */
  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { ghost, tileIndex } = drag;
    const target = ghost ? dropTargetAt(event.clientX, event.clientY) : null;
    endDrag();
    if (!ghost) return;
    // The click that follows a drag must not also place or remove the tile.
    suppressClick = true;
    window.setTimeout(() => { suppressClick = false; }, 0);
    if (!canMove()) return;
    if (target && target.classList.contains("slot")) dropOnSlot(tileIndex, Number(target.dataset.slot));
    else if (state.slots.includes(tileIndex)) returnToTray(tileIndex);
  }

  /**
   * @returns {void} Removes every trace of an active drag; safe to call at any time.
   */
  function endDrag() {
    if (!drag) return;
    if (drag.tile.hasPointerCapture && drag.tile.hasPointerCapture(drag.pointerId)) {
      drag.tile.releasePointerCapture(drag.pointerId);
    }
    drag.tile.classList.remove("is-drag-source");
    if (drag.target) drag.target.classList.remove("is-drop-target");
    drag = null;
    document.querySelectorAll(".drag-ghost").forEach((ghost) => ghost.remove());
  }

  /**
   * @param {MouseEvent} event - Click inside the answer row or tray.
   * @returns {void} Toggles a tile between the tray and the spaces.
   */
  function onTileClick(event) {
    const tile = event.target.closest(".tile");
    if (!tile || suppressClick || !canMove()) return;
    const tileIndex = Number(tile.dataset.tile);
    if (state.slots.includes(tileIndex)) returnToTray(tileIndex);
    else placeInFirstEmpty(tileIndex);
  }

  /**
   * @param {KeyboardEvent} event - Key press anywhere on the page.
   * @returns {void} Letters place a matching tray tile; Backspace removes the last placed tile.
   */
  function onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey || !canMove()) return;
    if (document.getElementById("share-dialog").open) return;
    if (/^[a-z]$/i.test(event.key)) {
      const letter = event.key.toUpperCase();
      const tileIndex = state.trayOrder.find((index) => state.tiles[index] === letter && !state.slots.includes(index));
      if (tileIndex === undefined) {
        setStatus(`There is no spare ${letter} tile.`, "error");
        return;
      }
      event.preventDefault();
      placeInFirstEmpty(tileIndex);
    } else if (event.key === "Backspace") {
      const filled = state.slots.map((tileIndex, slotIndex) => (tileIndex === null ? -1 : slotIndex)).filter((index) => index >= 0);
      if (!filled.length) return;
      event.preventDefault();
      returnToTray(state.slots[filled[filled.length - 1]]);
    }
  }

  /**
   * @returns {void} Randomly reorders the tray cells.
   */
  function shuffleTray() {
    if (!canMove()) return;
    const order = state.trayOrder;
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    render();
  }

  /**
   * @param {Object} puzzle - Bank entry to play.
   * @returns {void} Resets state and shows the puzzle.
   */
  function startPuzzle(puzzle) {
    const answerLength = puzzle.tiles.length - bank.decoys;
    state.puzzle = puzzle;
    state.tiles = puzzle.tiles.split("");
    state.trayOrder = state.tiles.map((_, index) => index);
    state.slots = Array(answerLength).fill(null);
    elements.clue.replaceChildren(...clueNodes(puzzle.clue));
    elements.pos.textContent = POS_NAMES[puzzle.pos] || "word";
    elements.length.textContent = `${answerLength} letters`;
    const solvedBefore = progress.isSolved(puzzle.id);
    elements.badge.hidden = !solvedBefore;
    elements.shareButton.textContent = solvedBefore ? "Challenge a friend" : "Ask for help";
    document.title = `Word Quiz \u2013 ${answerLength}-letter ${POS_NAMES[puzzle.pos] || "word"}`;
    showSection("game");
    buildBoard();
    layoutBoard();
    render();
  }

  /**
   * @returns {void} Picks the puzzle from the address, or a random unsolved one.
   */
  function init() {
    updateTally();
    share = window.WordQuizShare.bindDialog(document.getElementById("share-dialog"));
    const requested = new URLSearchParams(window.location.search).get("id");
    if (requested) {
      const puzzle = bank.puzzles.find(({ id }) => id === requested.toLowerCase());
      if (puzzle) startPuzzle(puzzle);
      else showSection("not-found");
    } else {
      const puzzle = progress.randomUnsolved(bank.puzzles);
      if (!puzzle) {
        document.getElementById("all-solved-count").textContent = bank.puzzles.length.toLocaleString();
        showSection("all-solved");
        return;
      }
      // Give the page a shareable, reload-stable address for the chosen word.
      window.history.replaceState(null, "", `?id=${puzzle.id}`);
      startPuzzle(puzzle);
    }

    elements.answerRow.addEventListener("click", onTileClick);
    elements.tray.addEventListener("click", onTileClick);
    elements.answerRow.addEventListener("animationend", (event) => {
      if (event.animationName === "row-shake") elements.answerRow.classList.remove("is-wrong");
    });
    elements.game.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", endDrag);
    document.addEventListener("visibilitychange", () => { if (document.hidden) endDrag(); });
    document.addEventListener("keydown", onKeyDown);
    // Relayout on width changes only: height changes caused by resizing tiles must not feed back.
    let observedWidth = elements.game.clientWidth;
    new ResizeObserver(() => {
      if (!state.puzzle || elements.game.clientWidth === observedWidth) return;
      observedWidth = elements.game.clientWidth;
      layoutBoard();
    }).observe(elements.game);
    document.getElementById("shuffle-button").addEventListener("click", shuffleTray);
    document.getElementById("clear-button").addEventListener("click", () => {
      if (!canMove()) return;
      state.slots.fill(null);
      setStatus("");
      render();
    });
    document.getElementById("skip-button").addEventListener("click", goToNext);
    document.getElementById("next-button").addEventListener("click", goToNext);
    elements.shareButton.addEventListener("click", openShare);
    document.getElementById("challenge-button").addEventListener("click", openShare);
  }

  init();
})();

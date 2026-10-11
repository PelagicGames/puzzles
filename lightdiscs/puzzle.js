// Copyright (C) 2026 Pelagic Games

(() => {
  const levels = window.LightDiscLevels;
  const requestedLevel = Number(new URLSearchParams(window.location.search).get("level") || 1);
  const levelNumber = Number.isInteger(requestedLevel) && requestedLevel > 0
    ? requestedLevel
    : 1;
  const level = levels[levelNumber - 1];
  const nextLink = document.querySelector("#next-puzzle");
  const position = document.querySelector("#puzzle-position");

  if (!level) {
    window.location.replace("./puzzles.html");
    return;
  }

  document.title = `${level.title} | Light Discs`;
  document.querySelector("#puzzle-title").textContent = level.title;
  document.body.dataset.puzzleCode = level.code;
  position.textContent = `${levelNumber} / ${levels.length}`;

  function updateNextLink() {
    if (!window.LightDiscProgress.isCompleted(level.code)) {
      nextLink.hidden = true;
      return;
    }
    const next = window.LightDiscProgress.nextUnsolved(levels, level.code);
    if (!next) {
      nextLink.hidden = true;
      return;
    }
    nextLink.href = `./puzzle.html?level=${next.index + 1}`;
    nextLink.hidden = false;
  }

  document.addEventListener("lightdiscs:solved", (event) => {
    if (event.detail.code !== level.code) return;
    window.LightDiscProgress.markCompleted(level.code);
    updateNextLink();
  });
  updateNextLink();

  const gameScript = document.createElement("script");
  gameScript.src = "./lightdiscs.js";
  document.body.append(gameScript);
})();

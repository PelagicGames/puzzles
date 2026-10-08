(() => {
  const levels = [
    {
      title: "Puzzle 1",
      code: "RnrnrnrGngngngBnbnbnbTnrngnb"
    }
  ];
  const requestedLevel = Number(new URLSearchParams(window.location.search).get("level") || 1);
  const levelNumber = Number.isInteger(requestedLevel) && requestedLevel > 0
    ? requestedLevel
    : 1;
  const level = levels[levelNumber - 1];
  const comingSoon = levelNumber === levels.length + 1;
  const previousLink = document.querySelector("#previous-puzzle");
  const nextLink = document.querySelector("#next-puzzle");
  const position = document.querySelector("#puzzle-position");

  if (!level && !comingSoon) {
    window.location.replace("./puzzles.html");
    return;
  }

  if (comingSoon) {
    document.title = "More puzzles coming | Light Discs";
    document.querySelector("#puzzle-game").hidden = true;
    document.querySelector("#puzzle-coming-soon").hidden = false;
    previousLink.hidden = false;
    previousLink.href = `./puzzles.html?level=${levels.length}`;
    nextLink.hidden = true;
    position.textContent = "More puzzles coming";
    return;
  }

  document.title = `${level.title} | Light Discs`;
  document.querySelector("#puzzle-title").textContent = level.title;
  document.body.dataset.puzzleCode = level.code;
  position.textContent = `${levelNumber} / ${levels.length}`;
  if (levelNumber > 1) {
    previousLink.hidden = false;
    previousLink.href = `./puzzles.html?level=${levelNumber - 1}`;
  }
  nextLink.href = `./puzzles.html?level=${levelNumber + 1}`;

  const gameScript = document.createElement("script");
  gameScript.src = "./lightdiscs.js";
  document.body.append(gameScript);
})();

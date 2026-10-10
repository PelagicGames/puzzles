(() => {
  const levels = [
    {
      title: "Puzzle 1",
      code: "R: nr nr nr G: ng ng ng B: nb nb nb T: nr ng nb"
    },
    {
      title: "Puzzle 2",
      code: "R: nm nc nm G: ny ny nm B: nc nc ny T: nr nb ng"
    },
    {
      title: "Puzzle 3",
      code: "R: nc nm nw G: ny ny nm B: nc nc ny T: nr nb ng"
    },
    {
      title: "Puzzle 4",
      code: "R: twr t'rw twr G: twg t'gw tkg B: twb t'bw xkb T: twr t'wk xkb"
    },
    {
      title: "Puzzle 5",
      code: "R: dbk nc aym G: drk sbg lbm B: vbk lyr vgk T: lkr nk vbk"
    },
    {
      title: "Puzzle 6",
      code: "R: nr ny tgk G: akg lmw dmw B: dbm xmk dcb T: akg nk xrk"
    },
    {
      title: "Puzzle 7",
      code: "R: lkg sbk lbg G: drg swg vbc B: sbc ary ny T: lkg vbc lkg"
    },
    {
      title: "Puzzle 8",
      code: "R: tcy dwy dcr G: vmy ayw trg B: acm nc lwg T: vbg ayw trg"
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
  const complexity = document.querySelector("#puzzle-complexity");
  const solutionSummary = document.querySelector("#puzzle-solutions");

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
  const analysis = window.LightDiscSolver.analyzePuzzle(level.code);
  window.LightDiscPuzzleAnalysis = analysis;
  const solutionLabel = `${analysis.solutionCount} ${analysis.solutionCount === 1 ? "solution" : "solutions"}`;
  complexity.textContent = `Complexity: ${analysis.complexity.label} \u00b7 ${solutionLabel}`;
  complexity.title = `Score ${analysis.complexity.score}/100; shortest reset path ${analysis.complexity.resetPathDistance} moves`;
  const shownSolutions = analysis.solutions.slice(0, 5);
  solutionSummary.replaceChildren();
  const solutionHeading = document.createElement("p");
  solutionHeading.textContent = `First ${shownSolutions.length} unique ${shownSolutions.length === 1 ? "solution" : "solutions"}:`;
  const solutionList = document.createElement("ol");
  shownSolutions.forEach(({ shorthand }) => {
    const item = document.createElement("li");
    item.textContent = shorthand;
    solutionList.append(item);
  });
  solutionSummary.append(solutionHeading, solutionList);
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

// Copyright (C) 2026 Pelagic Games

/**
 * Fills puzzles.html with difficulty sections, puzzle links and completion marks.
 * The mode=crowded query lists the crowded catalogue instead of the normal one.
 * Load after puzzle-levels.js, crowded-levels.js and puzzle-progress.js. Reads
 * completion storage through CrosspathProgress; does not change saved progress.
 * Adds the "Not saved" notice to the tally when browser storage is unavailable.
 */

(() => {
  const crowded = new URLSearchParams(window.location.search).get("mode") === "crowded";
  const levels = crowded ? window.CrosspathCrowdedLevels : window.CrosspathLevels;
  const { difficulties, isCompleted, completedCount, createStorageNotice } = window.CrosspathProgress;
  const list = document.querySelector("#difficulty-list");
  const descriptions = {
    "very-easy": "Short solves with straightforward placements.",
    easy: "Mostly forced moves, with a few distractions.",
    medium: "More possibilities to compare as the path takes shape.",
    hard: "Ambiguous placements need careful reasoning.",
    "very-hard": "The most demanding puzzles, with substantial ambiguity."
  };

  if (crowded) {
    document.title = "Crowded Mode | Crosspath";
    document.querySelector("#catalogue-kicker").textContent = "Crowded Mode";
    document.querySelector("#catalogue-standfirst").textContent = "Path squares may touch without joining. Within each difficulty, puzzles run from least to most crowded. Solved puzzles are ticked.";
  }

  const tally = document.querySelector("#solved-tally");
  tally.textContent = `${completedCount(levels)} of ${levels.length} solved`;
  const notice = createStorageNotice();
  if (notice) tally.append(notice);

  // Display numbers restart in each band; link query indices retain catalogue order.
  difficulties.forEach(({ id, label }) => {
    const section = document.createElement("section");
    section.className = "difficulty-section";
    section.setAttribute("aria-labelledby", `difficulty-${id}`);
    const heading = document.createElement("h2");
    heading.id = `difficulty-${id}`;
    heading.textContent = label;
    const description = document.createElement("p");
    description.textContent = descriptions[id];
    section.append(heading, description);

    const matching = levels
      .map((level, index) => ({ level, index }))
      .filter(({ level }) => level.difficulty === id);
    const selectors = document.createElement("div");
    selectors.className = "puzzle-selectors";
    matching.forEach(({ level, index }, bandIndex) => {
      const completed = isCompleted(level.code);
      const link = document.createElement("a");
      link.className = "puzzle-selector";
      link.classList.toggle("is-completed", completed);
      link.href = `./puzzle.html?level=${index + 1}${crowded ? "&mode=crowded" : ""}`;
      link.setAttribute("aria-label", `${crowded ? "Crowded " : ""}${crowded ? label.toLowerCase() : label} puzzle ${bandIndex + 1}, ${completed ? "solved" : "not solved"}`);
      const number = document.createElement("span");
      number.textContent = String(bandIndex + 1);
      const tick = document.createElement("span");
      tick.className = "puzzle-checkbox";
      tick.setAttribute("aria-hidden", "true");
      tick.textContent = completed ? "\u2713" : "";
      link.append(number, tick);
      selectors.append(link);
    });
    section.append(selectors);
    list.append(section);
  });
})();

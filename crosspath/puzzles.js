// Copyright (C) 2026 Pelagic Games

/**
 * Fills puzzles.html with difficulty sections, puzzle links and completion marks.
 * Load after puzzle-levels.js and puzzle-progress.js. Reads completion storage
 * through CrosspathProgress; does not change saved progress.
 */

(() => {
  const levels = window.CrosspathLevels;
  const { difficulties, isCompleted, completedCount } = window.CrosspathProgress;
  const list = document.querySelector("#difficulty-list");
  const descriptions = {
    "very-easy": "Most pieces are fixed in place.",
    easy: "A few fixed pieces and marked ends.",
    medium: "Fewer clues; some pieces fit in several places.",
    hard: "Little help; many tempting placements.",
    "very-hard": "No clues beyond the pieces themselves."
  };

  document.querySelector("#solved-tally").textContent = `${completedCount(levels)} of ${levels.length} solved`;

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
      link.href = `./puzzle.html?level=${index + 1}`;
      link.setAttribute("aria-label", `${label} puzzle ${bandIndex + 1}, ${completed ? "solved" : "not solved"}`);
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

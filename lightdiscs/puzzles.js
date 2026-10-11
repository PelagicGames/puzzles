// Copyright (C) 2026 Pelagic Games

(() => {
  const levels = window.LightDiscLevels;
  const { difficulties, isCompleted } = window.LightDiscProgress;
  const list = document.querySelector("#difficulty-list");

  difficulties.forEach(({ id, label }) => {
    const section = document.createElement("section");
    section.className = "difficulty-section";
    section.setAttribute("aria-labelledby", `difficulty-${id}`);

    const heading = document.createElement("h2");
    heading.id = `difficulty-${id}`;
    heading.textContent = label;
    section.append(heading);

    const matchingLevels = levels
      .map((level, index) => ({ level, index }))
      .filter(({ level }) => level.difficulty === id);
    if (matchingLevels.length === 0) {
      const empty = document.createElement("p");
      empty.className = "difficulty-empty";
      empty.textContent = "No puzzles yet.";
      section.append(empty);
      list.append(section);
      return;
    }

    const selectors = document.createElement("div");
    selectors.className = "puzzle-selectors";
    matchingLevels.forEach(({ level, index }) => {
      const completed = isCompleted(level.code);
      const link = document.createElement("a");
      link.className = "puzzle-selector";
      link.classList.toggle("is-completed", completed);
      link.href = `./puzzle.html?level=${index + 1}`;
      link.setAttribute(
        "aria-label",
        `${level.title}, ${completed ? "completed" : "not completed"}`
      );

      const checkbox = document.createElement("span");
      checkbox.className = "puzzle-checkbox";
      checkbox.setAttribute("aria-hidden", "true");
      checkbox.textContent = completed ? "\u2713" : "";

      const number = document.createElement("span");
      number.className = "puzzle-selector-number";
      number.textContent = String(index + 1).padStart(2, "0");

      link.append(checkbox, number);
      selectors.append(link);
    });
    section.append(selectors);
    list.append(section);
  });
})();

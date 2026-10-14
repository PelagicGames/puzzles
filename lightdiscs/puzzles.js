// Copyright (C) 2026 Pelagic Games

(() => {
  const levels = window.LightDiscLevels;
  const { difficulties, isCompleted, xorUnlocked, xorUnlockCount } =
    window.LightDiscProgress;
  const list = document.querySelector("#difficulty-list");

  ["standard", "xor"].forEach((combination) => {
    if (combination === "xor") {
      const campaignHeading = document.createElement("header");
      campaignHeading.className = "campaign-heading";
      const eyebrow = document.createElement("p");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = "Alternate campaign";
      const heading = document.createElement("h2");
      heading.textContent = "XOR puzzles";
      const description = document.createElement("p");
      description.textContent = xorUnlocked()
        ? "RGB channels toggle when filters overlap."
        : `Complete ${xorUnlockCount} standard puzzles to unlock.`;
      campaignHeading.append(eyebrow, heading, description);
      list.append(campaignHeading);
    }
    difficulties.forEach(({ id, label }) => {
    const section = document.createElement("section");
    section.className = "difficulty-section";
    section.classList.toggle(
      "is-locked",
      combination === "xor" && !xorUnlocked()
    );
    section.setAttribute(
      "aria-labelledby",
      `difficulty-${combination}-${id}`
    );

    const heading = document.createElement("h2");
    heading.id = `difficulty-${combination}-${id}`;
    heading.textContent = label;
    section.append(heading);

    const matchingLevels = levels
      .map((level, index) => ({ level, index }))
      .filter(({ level }) => (
        level.difficulty === id && level.combination === combination
      ));
    if (matchingLevels.length === 0) {
      const empty = document.createElement("p");
      empty.className = "difficulty-empty";
      empty.textContent = "No puzzles yet.";
      section.append(empty);
      list.append(section);
      return;
    }
    if (combination === "xor" && !xorUnlocked()) {
      const locked = document.createElement("p");
      locked.className = "difficulty-empty";
      locked.textContent = "Locked";
      section.append(locked);
      list.append(section);
      return;
    }

    const selectors = document.createElement("div");
    selectors.className = "puzzle-selectors";
    matchingLevels.forEach(({ level, index }, difficultyIndex) => {
      const completed = isCompleted(level.code, level);
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
      number.textContent = String(difficultyIndex + 1).padStart(2, "0");

      link.append(checkbox, number);
      selectors.append(link);
    });
    section.append(selectors);
    list.append(section);
    });
  });
})();

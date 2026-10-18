// Copyright (C) 2026 Pelagic Games
/**
 * Catalogue selector for puzzles.html, loaded after both catalogues and progress.
 * Reads local completion/unlock state and populates difficulty-list with links,
 * ticks and accessible completion labels. Original catalogue indices become
 * one-based ?level values; no completion or catalogue data is written.
 */

(() => {
  const levels = window.LightDiscLevels;
  const { difficulties, isCompleted, xorUnlocked } =
    window.LightDiscProgress;
  const list = document.querySelector("#difficulty-list");

  // Omit locked XOR groups entirely; build separate difficulty sections per campaign.
  ["standard", "xor"].forEach((combination) => {
    if (combination === "xor" && !xorUnlocked()) return;
    if (combination === "xor") {
      const campaignHeading = document.createElement("header");
      campaignHeading.className = "campaign-heading";
      const eyebrow = document.createElement("p");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = "Alternate campaign";
      const heading = document.createElement("h2");
      heading.textContent = "XOR puzzles (experimental)";
      const description = document.createElement("p");
      description.textContent =
        "RGB channels toggle when filters overlap. This experimental mode may be slow, especially on mobile browsers.";
      campaignHeading.append(eyebrow, heading, description);
      list.append(campaignHeading);
    }
    difficulties.forEach(({ id, label }) => {
    const section = document.createElement("section");
    section.className = "difficulty-section";
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

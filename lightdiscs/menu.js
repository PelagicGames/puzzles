// Copyright (C) 2026 Pelagic Games
/**
 * Main-menu completion ring for index.html. Load after both level catalogues and
 * puzzle-progress.js. Reads local completion storage and appends ten decorative
 * stars plus an accessible total; it does not write progress.
 */

(() => {
  const starRing = document.querySelector("#completion-stars");
  const levels = window.LightDiscLevels;
  const { completedDifficultyCount } = window.LightDiscProgress;
  const standardStars = completedDifficultyCount(levels, "standard");
  const xorStars = completedDifficultyCount(levels, "xor");
  const earned = standardStars + xorStars;

  // Five positions per campaign represent fully completed difficulty bands.
  // The ring uses sine/cosine around the logo, with standard stars first.
  for (let index = 0; index < 10; index += 1) {
    const star = document.createElement("span");
    const campaignIndex = index < 5 ? index : index - 5;
    const visible = index < 5
      ? campaignIndex < standardStars
      : campaignIndex < xorStars;
    star.className = "completion-star";
    star.classList.toggle("is-earned", visible);
    const angle = index * Math.PI / 5;
    star.style.left = `${50 + 50 * Math.sin(angle)}%`;
    star.style.top = `${50 - 50 * Math.cos(angle)}%`;
    star.textContent = "\u2605";
    starRing.append(star);
  }
  starRing.setAttribute(
    "aria-label",
    `${earned} of 10 campaign stars earned`
  );
})();

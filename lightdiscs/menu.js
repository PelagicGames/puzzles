// Copyright (C) 2026 Pelagic Games

(() => {
  const starRing = document.querySelector("#completion-stars");
  const levels = window.LightDiscLevels;
  const { completedDifficultyCount } = window.LightDiscProgress;
  const standardStars = completedDifficultyCount(levels, "standard");
  const xorStars = completedDifficultyCount(levels, "xor");
  const earned = standardStars + xorStars;

  for (let index = 0; index < 10; index += 1) {
    const star = document.createElement("span");
    const campaignIndex = index < 5 ? index : index - 5;
    const visible = index < 5
      ? campaignIndex < standardStars
      : campaignIndex < xorStars;
    star.className = "completion-star";
    star.classList.toggle("is-earned", visible);
    star.style.setProperty("--star-angle", `${index * 36}deg`);
    star.style.setProperty("--star-angle-inverse", `${index * -36}deg`);
    star.textContent = "\u2605";
    starRing.append(star);
  }
  starRing.setAttribute(
    "aria-label",
    `${earned} of 10 campaign stars earned`
  );
})();

// Copyright (C) 2026 Pelagic Games

/**
 * Word Quiz menu: shows how many words of the bank have been solved and labels
 * the play button accordingly. Adds the "Not saved" notice under the progress
 * bar when browser storage is unavailable.
 */

(() => {
  const total = window.WordQuizBank.puzzles.length;
  const solved = window.WordQuizProgress.solvedCount(window.WordQuizBank.puzzles);
  const bar = document.getElementById("progress-bar");
  const percent = total ? (solved / total) * 100 : 0;

  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(total));
  bar.setAttribute("aria-valuenow", String(solved));
  document.getElementById("progress-label").textContent =
    `${solved.toLocaleString()} of ${total.toLocaleString()} words solved`;
  // Set after first paint so the bar grows into place.
  requestAnimationFrame(() => {
    document.getElementById("progress-fill").style.width = `${percent}%`;
  });

  const notice = window.WordQuizProgress.createStorageNotice();
  if (notice) document.getElementById("progress-label").after(notice);

  const play = document.getElementById("play-button");
  if (solved >= total) play.textContent = "All solved!";
  else if (solved > 0) play.textContent = "Play next word";
})();

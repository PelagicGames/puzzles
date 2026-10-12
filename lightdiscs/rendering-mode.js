// Copyright (C) 2026 Pelagic Games

(() => {
  const modes = {
    profile: {
      heading: "Profiling",
      title: "Profiling | Light Discs"
    },
    alpha: {
      heading: "Alpha masks",
      title: "Alpha masks | Light Discs"
    },
    multiply: {
      heading: "Multiply images",
      title: "Multiply images | Light Discs"
    }
  };
  const parameters = new URLSearchParams(window.location.search);
  const requested = parameters.get("renderer");
  const mode = Object.hasOwn(modes, requested) ? requested : "profile";
  const seed = parameters.get("seed")
    || String(crypto.getRandomValues(new Uint32Array(1))[0]);
  const iteration = Math.max(0, Number(parameters.get("iteration")) || 0);
  document.body.dataset.renderMode = mode;
  document.body.dataset.randomIteration = String(iteration);
  document.body.dataset.randomSeed = seed;
  document.title = modes[mode].title;
  document.querySelector("#profile-page-title").textContent = modes[mode].heading;
  document.querySelectorAll("[data-renderer-link]").forEach((link) => {
    const target = new URL(link.href);
    target.searchParams.set("seed", seed);
    target.searchParams.set("iteration", iteration);
    link.href = target;
    link.classList.toggle("is-active", link.dataset.rendererLink === mode);
    if (link.dataset.rendererLink === mode) {
      link.setAttribute("aria-current", "page");
    }
  });
})();

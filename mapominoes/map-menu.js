// Copyright (C) 2026 Pelagic Games
(() => {
  const maps = window.MapominoesMaps;
  const requested = new URLSearchParams(location.search).get("map") || "world";
  const select = maps.picker(document.querySelector(".mode-panel"),
    maps.catalog.some((map) => map.id === requested) ? requested : "world");
  function updateLinks() {
    document.querySelectorAll(".mode-card[href]").forEach((link) => {
      const url = new URL(link.href);
      url.searchParams.set("map", select.value);
      link.href = url.href;
    });
  }
  select.addEventListener("change", updateLinks);
  updateLinks();
})();

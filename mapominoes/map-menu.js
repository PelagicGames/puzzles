// Copyright (C) 2026 Pelagic Games

/**
 * Adds the map selector to a menu page and carries its choice into each play-mode URL.
 * Loaded by index.html and multiplayer.html after maps.js has created the shared catalogue API.
 * Reads the URL map query and catalogue; writes the inserted selector and mode-link
 * destinations only, without loading geometry or persisting game state.
 */
(() => {
  // Both menu pages use the same picker/catalogue API as the in-game setup screens.
  const maps = window.MapominoesMaps;
  const requested = new URLSearchParams(location.search).get("map") || "world";
  const select = maps.picker(document.querySelector(".mode-panel"),
    maps.catalog.some((map) => map.id === requested) ? requested : "world");
  /** Adds the selected map ID to every mode-card destination without changing its other query parameters.
   * @returns {void}
   * @sideEffects Rewrites the href of each mode card.
   */
  function updateLinks() {
    document.querySelectorAll(".mode-card[href]").forEach((link) => {
      const url = new URL(link.href);
      url.searchParams.set("map", select.value);
      link.href = url.href;
    });
  }
  // Keep destinations in sync both initially and whenever the menu selection changes.
  select.addEventListener("change", updateLinks);
  updateLinks();
})();

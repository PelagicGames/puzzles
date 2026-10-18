// Copyright (C) 2026 Pelagic Games

/**
 * Owns the map catalogue API, lazy asset loading, reusable map picker and region/country vocabulary.
 * Loaded by index.html, multiplayer.html and all game pages after map-catalog.js; page games call `load` during setup.
 * Each map datum is `{ countries, mapData }`; each country/region record carries its own code, names, borders and optional coordinates.
 * Reads bundled globals, URL-relative script locations and page labels; writes
 * the map registry, lazy script elements and picker/vocabulary DOM, not storage.
 */
(() => {
  "use strict";
  // The world map is already bundled with the page; alternatives are registered only when their asset is requested.
  const world = {
    countries: window.MapominoesCountries,
    mapData: window.MapominoesMapTopology
      ? window.topojson.feature(window.MapominoesMapTopology, window.MapominoesMapTopology.objects.countries)
      : null
  };
  window.MapominoesMapData = { world };
  const catalog = [{ id: "world", name: "World countries" }, ...window.MapominoesMapCatalog];
  // Selection drives vocabulary conversion; `pending` coalesces concurrent requests for the same script asset.
  let selected = "world";
  const pending = new Map();

  /** Returns a loaded map or injects its catalogue-approved script once and shares that pending promise.
   * @param {string} id - Catalogue map identifier.
   * @returns {Promise<{countries: Array<object>, mapData: object}>} Loaded map records and GeoJSON.
   * @sideEffects May append a script element, populate global map data and clear the pending-request cache.
   * @throws {Error} Rejects unknown IDs, incomplete bundles, and failed/malformed script loads.
   */
  function load(id) {
    const map = catalog.find((entry) => entry.id === id);
    if (!map) return Promise.reject(new Error(`Unknown map: ${id}`));
    if (window.MapominoesMapData[id]) {
      const data = window.MapominoesMapData[id];
      if (!data.mapData || !data.countries) return Promise.reject(new Error(`The bundled ${id} map data is incomplete.`));
      return Promise.resolve(data);
    }
    if (!pending.has(id)) {
      pending.set(id, new Promise((resolve, reject) => {
        const script = document.createElement("script");
        const url = new URL(`./assets/maps/${id}.js`, document.currentScript?.src || location.href);
        if (map.revision) url.searchParams.set("v", map.revision);
        script.src = url;
        // Remove the in-flight marker on either outcome so a later retry can start a fresh request.
        /** Release the pending entry and resolve the newly registered map.
         * @returns {void} Rejects a script that loaded without registering data.
         */
        script.onload = () => {
          pending.delete(id);
          const data = window.MapominoesMapData[id];
          if (data) resolve(data);
          else reject(new Error(`Map ${id} did not provide its data.`));
        };
        /** Remove the failed script and pending entry so another load can retry.
         * @returns {void} Rejects the shared pending promise.
         */
        script.onerror = () => {
          pending.delete(id);
          script.remove();
          reject(new Error(`Could not load ${id}. Check your connection and try again.`));
        };
        document.head.append(script);
      }));
    }
    return pending.get(id);
  }

  /** Builds and inserts an accessible select containing every catalogue map.
   * @param {Element} parent - Container whose first child should become the picker label.
   * @param {string} [id=selected] - Map initially selected.
   * @returns {HTMLSelectElement} Inserted select element.
   * @sideEffects Prepends labelled form controls to the parent.
   */
  function picker(parent, id = selected) {
    const label = document.createElement("label");
    label.className = "field-label";
    label.textContent = "Map";
    const select = document.createElement("select");
    select.className = "text-field";
    select.setAttribute("aria-label", "Game map");
    catalog.forEach((map) => {
      const option = document.createElement("option");
      option.value = map.id;
      option.textContent = map.name;
      select.append(option);
    });
    select.value = id;
    label.append(select);
    parent.prepend(label);
    return select;
  }

  /** Changes map-dependent interface wording while leaving canonical country/region data untouched.
   * @param {string} id - Catalogue map identifier; `world` uses country vocabulary.
   * @returns {void}
   * @sideEffects Updates matching labels, placeholders, title and tagline when those elements exist.
   */
  function updateVocabulary(id) {
    const regional = id !== "world";
    const input = document.querySelector("#country-search");
    if (input) input.placeholder = regional ? "Start typing a region name" : "Start typing a country or common name";
    const label = document.querySelector("label[for='country-search']");
    if (label) label.textContent = regional ? "Choose a region" : "Choose a country";
    const confirm = document.querySelector("#confirm-country");
    if (confirm) confirm.textContent = regional ? "Confirm region" : "Confirm country";
    const lastLabel = document.querySelector("#last-country-label");
    if (lastLabel) lastLabel.textContent = regional ? "Last region named" : "Last country named";
    const title = document.querySelector("#map-title");
    if (title) title.textContent = regional ? "Map of regions named in this route" : "Map of countries named in this route";
    const tagline = document.querySelector(".tagline");
    if (tagline) tagline.textContent = catalog.find((map) => map.id === id).name;
  }

  // Public API shared by game setup and menu pages; `get` reads the currently cached global map data.
  window.MapominoesMaps = {
    catalog, load, picker, updateVocabulary,
    /** Replaces country wording with region wording only for alternative maps.
     * @param {string} value - User-facing string in singular/plural and title-case forms.
     * @returns {string} Wording appropriate to the active map.
     */
    text(value) {
      if (selected === "world") return value;
      return value.replace(/\bcountries\b/g, "regions").replace(/\bcountry\b/g, "region")
        .replace(/\bCountries\b/g, "Regions").replace(/\bCountry\b/g, "Region");
    },
    /** @returns {string} Currently selected map ID. */
    get selected() { return selected; },
    /** @param {string} id - Newly active map ID used for vocabulary selection. */
    set selected(id) { selected = id; },
    /** @param {string} id - Map ID. @returns {?object} Loaded map data, if present. */
    get(id) { return window.MapominoesMapData[id]; }
  };
})();

// Copyright (C) 2026 Pelagic Games
(() => {
  "use strict";
  const world = {
    countries: window.MapominoesCountries,
    mapData: window.MapominoesMapTopology
      ? window.topojson.feature(window.MapominoesMapTopology, window.MapominoesMapTopology.objects.countries)
      : null
  };
  window.MapominoesMapData = { world };
  const catalog = [{ id: "world", name: "World countries" }, ...window.MapominoesMapCatalog];
  let selected = "world";
  const pending = new Map();

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
        script.onload = () => {
          pending.delete(id);
          const data = window.MapominoesMapData[id];
          if (data) resolve(data);
          else reject(new Error(`Map ${id} did not provide its data.`));
        };
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

  window.MapominoesMaps = {
    catalog, load, picker, updateVocabulary,
    text(value) {
      if (selected === "world") return value;
      return value.replace(/\bcountries\b/g, "regions").replace(/\bcountry\b/g, "region")
        .replace(/\bCountries\b/g, "Regions").replace(/\bCountry\b/g, "Region");
    },
    get selected() { return selected; },
    set selected(id) { selected = id; },
    get(id) { return window.MapominoesMapData[id]; }
  };
})();

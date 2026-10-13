<!-- Copyright (C) 2026 Pelagic Games -->

# Mapominoes data and asset attribution

## Country names, codes, aliases, and land borders

The generated `countries.js` database is derived from
[mledoze/countries](https://github.com/mledoze/countries), used under the
[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Mapominoes filters that source to the 193 UN member states plus the Holy See
and Palestine, then adds curated aliases and terrestrial connections.

The generated country database is offered under the same ODbL 1.0 terms.

## World map

`assets/countries-50m.json` is from
[world-atlas](https://github.com/topojson/world-atlas), generated from
[Natural Earth](https://www.naturalearthdata.com/). Natural Earth data is in
the public domain. The world-atlas tooling is ISC licensed.

## Map rendering

`assets/d3.min.js` is [D3.js](https://d3js.org/), distributed under the
[ISC License](https://github.com/d3/d3/blob/main/LICENSE).

`assets/topojson-client.min.js` is
[TopoJSON Client](https://github.com/topojson/topojson-client), distributed
under the [ISC License](https://github.com/topojson/topojson-client/blob/master/LICENSE).

## Curated terrestrial connections

The supplementary graph includes the Channel Tunnel, Oresund fixed link,
King Fahd Causeway, Johor-Singapore fixed links, the Saint Martin land border,
and sovereign-territory borders involving Gibraltar and the UK Sovereign Base
Areas. These are factual additions rather than copied text.

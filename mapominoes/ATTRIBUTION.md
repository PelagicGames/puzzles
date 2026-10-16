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

## Subdivision maps

The generated subdivision databases other than the UK map derive from the
[geoBoundaries gbOpen collection](https://www.geoboundaries.org/),
[release commit 9469f09](https://github.com/wmgeolab/geoBoundaries/tree/9469f09/releaseData/gbOpen).
Credit: Runfola et al. (2020), "geoBoundaries: A global database of political
administrative boundaries", PLOS ONE,
[doi:10.1371/journal.pone.0231866](https://doi.org/10.1371/journal.pone.0231866).
Each asset retains its exact source URLs, boundary ID, source year, and license.
The derived databases remain subject to their respective source licenses:

| Map | Original source / vintage | License |
| --- | --- | --- |
| US (ADM1) | US Census Bureau, MAF/TIGER Database, 2018 | Public domain |
| UK historic counties | Historic Counties Trust, Historic County Borders Project, Definition A | [Free personal, educational, non-commercial and commercial use](https://county-borders.co.uk/) |
| Switzerland (ADM1) | Federal Office of Topography swisstopo, 2022 | [swisstopo OGD terms](https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices) |
| Italy (ADM2) | ISTAT, National Institute of Statistics, 2023 | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| India (ADM1) | DataMeet India community, Election Commission of India, source vintage 2011 | [CC BY 2.5 India](https://creativecommons.org/licenses/by/2.5/in/); [DataMeet maps](https://github.com/datameet/maps) |
| China (ADM1) | geoBoundaries, Wikimedia Commons, 2019 | Public domain |
| France (ADM2) | IGN-F, 2022 | [Etalab Open License 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/) |
| Spain (ADM2) | Instituto Nacional de Estadistica, 2018 | [INE data license](https://www.ine.es/ss/Satellite?L=0&c=Page&cid=1254735849170&p=1254735849170&pagename=Ayuda%2FINELayout) |
| Brazil (ADM1) | geoBoundaries, Wikimedia Commons, 2006 | [CC BY 2.5](https://creativecommons.org/licenses/by/2.5/) |
| Japan (ADM1) | OpenStreetMap contributors, Wambacher, 2017 | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); [OSM copyright](https://www.openstreetmap.org/copyright) |

Changes: selectable region filtering, namespaced codes, adjacency extraction,
coordinate rounding, polygon winding normalization, fixed-link additions, disputed-region flags,
and correction of the Chinese source label "Guangzhou Province" to
"Guangdong Province". Island disconnections are retained. French metropolitan
departments are labeled explicitly rather than presented as all French territories.

### UK historic counties

This project made use of data provided by the
[Historic County Borders Project](https://county-borders.co.uk/), managed by
the Historic Counties Trust. Its data-use terms permit personal, educational,
non-commercial, and commercial use without specific permission.

The source is the project's WGS84 simplified shapefile for Historic Counties
Standard Definition A, covering the 92 historic counties across the UK.
Detached parts are assigned to their local host county under this definition.
Changes include topology conversion, 20% vertex-retention simplification
with county shapes retained, coordinate rounding, D3 winding normalization,
county aliases and namespaced Historic Counties Standard codes, adjacency
extraction, and the Anglesey-Caernarfonshire Menai bridge connection.

The alternative border graphs also include factual fixed-link additions:
the [Menai bridges](https://www.visitwales.com/things-do/attractions/historic-sites/bridges-wales),
[Hong Kong-Zhuhai-Macau Bridge](https://www.hzmb.gov.hk/en/),
Macau's land connection to Guangdong, and Japan's Seikan Tunnel, Kanmon links,
Akashi-Naruto route, Seto-Ohashi route, and Shimanami Kaido route.

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

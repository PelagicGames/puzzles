<!-- Copyright (C) 2026 Pelagic Games -->

# Mapominoes

Mapominoes is a country-chain memory game with solo and local multiplayer
modes. Solo play starts from a random country and challenges the player to
build the longest possible chain. Local multiplayer supports two to eight
players.

## Rules

Players take turns naming a sovereign country that has not already appeared
and that shares either a land border or a fixed terrestrial travel link with
the previous country. Exclaves and overseas sovereign territory count toward
the border graph.

During the first circuit, each choice must leave a simple unused route long
enough for every remaining player to take a turn. After that circuit, only the
border and repetition rules apply.

- **Autocheck** ends the round as soon as an invalid country is confirmed.
- **Challenge** leaves validation to the next player. A successful challenge
  makes the player who named the invalid country lose; a false challenge makes
  the challenger lose.

The losing player gains one point and starts the next round. Lower scores are
better. If a player correctly identifies that no legal move remains, the round
ends without awarding a point. An incorrect concession still awards a point.
Solo play has no scores.

At the end of a chain, an Equal Earth world map shows the route, invalid moves,
and any legal unused choices. The map supports wheel, touch, and button zooming
plus panning; route strokes and hop counters remain legible at every zoom
level. Route lines use the relevant territory or exclave where the geographic
data permits, with curated anchors for fixed terrestrial links.

## Country data

The selectable list contains the 193 UN member states plus the Holy See and
Palestine. Run the following command from the repository root to regenerate
the static country database:

```sh
node mapominoes/generate-country-data.mjs
```

The game itself has no network dependency after the assets have been
downloaded. See [ATTRIBUTION.md](./ATTRIBUTION.md) for data and asset terms.

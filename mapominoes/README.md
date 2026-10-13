<!-- Copyright (C) 2026 Pelagic Games -->

# Mapominoes

Mapominoes is a local multiplayer country-chain memory game for two to eight
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
better.

## Country data

The selectable list contains the 193 UN member states plus the Holy See and
Palestine. Run the following command from the repository root to regenerate
the static country database:

```sh
node mapominoes/generate-country-data.mjs
```

The game itself has no network dependency after the assets have been
downloaded. See [ATTRIBUTION.md](./ATTRIBUTION.md) for data and asset terms.

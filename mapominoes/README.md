<!-- Copyright (C) 2026 Pelagic Games -->

# Mapominoes

Mapominoes is a country-chain memory game with solo, local multiplayer, and
experimental online multiplayer modes. Solo play starts from a random country
and challenges the player to build the longest possible chain. Local
multiplayer supports two to eight players on one device.

This is a game I used to play (in our heads) with family and friends from
time to time, from when I was teenager.

I decided to try making the game support online multiplayer using WebRTC,
as a first-time experiment into WebRTC DataChannels. The manual mode has no
server, while the room-code mode uses a small signaling server for easier
connection setup. Gameplay remains peer-to-peer in both modes.

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
data permits, with curated anchors for fixed terrestrial links. Disputed and
self-declared regions used by the border ontology are associated with the
relevant selectable sovereign state and shown with striped shading.

The game uses separate pages for its main menu, Solo mode, multiplayer menu,
Local multiplayer, and Online multiplayer. Each play page has a persistent
text link back to its parent menu.

## Online multiplayer

Online games use host-authoritative WebRTC DataChannels in a star topology.
Two connection modes are available:

- **Manual codes** has no server. The host creates a separate offer code for
  each joining player, that player returns an answer code, and the host applies
  it. Connection codes use lossless compression.
- **Room code** uses the included lightweight signaling server. The host shares
  one reusable six-character code. Each guest's unique WebRTC offer and the
  host's answer are relayed automatically; gameplay does not pass through the
  server. This experimental mode is currently hidden from the menus and is
  available only through its direct URL.

Start the room-code server from the repository root:

```sh
node mapominoes/signaling-server.js
```

Then open
`http://localhost:8765/mapominoes/online.html?signaling=room`. Set `PORT` to
use a different port. For Internet play, expose this service behind an HTTPS
reverse proxy and share that HTTPS site with the players. Rooms expire after
six hours and are held only in memory.

The host chooses a 5, 10, 15, 30, 45, or 60 second turn limit and starts the
game when everyone has joined. All players see the player order and confirmed
submissions. If the current player has selected a country when time expires,
that selection is submitted automatically. Only the current player may
challenge the previous answer.

Players may leave explicitly and are then removed from the turn order. Guests
send heartbeats every three seconds; after 30 seconds without one, the host
marks that connection as persistently disconnected and skips it. A guest who
reconnects before their next turn remains eligible. Once their turn has been
skipped, they wait until the next round. Between rounds the host can reopen the
lobby, retain scores and order, and add more players. The next round starts
with the player who acted last, or the next connected player.

Between rounds, the current host can elect any connected guest as the new
host. The old star automatically relays WebRTC offers and answers while the
new host establishes replacement DataChannels to the other players. Once all
required channels are open, every player atomically switches to the new host;
the old host becomes an ordinary player. If migration fails or times out, the
old topology remains authoritative. No additional code copying is required.

This graceful transfer requires the old host to stay connected until migration
commits. Recovering from an unexpected host loss would require a separate
election and signaling path.

Connections use public STUN servers but no TURN relay. As a result, peers
behind some restrictive firewalls or NAT combinations may be unable to
connect. Offer and answer codes can reveal network connection metadata and
should only be shared with the intended players.

## Country data

The selectable list contains the 193 UN member states plus the Holy See and
Palestine. Run the following command from the repository root to regenerate
the static country database:

```sh
node mapominoes/generate-country-data.mjs
```

Solo and local play have no network dependency after the assets have been
downloaded. Online play only uses the network to establish and carry the
peer-to-peer connections. See [ATTRIBUTION.md](./ATTRIBUTION.md) for data and
asset terms.

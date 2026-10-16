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

## Alternative maps

World countries remain the default. Each menu and game setup offers a map
selector; solo play now has a setup screen before the random starting place
is chosen. Searches, move validation, available choices, and result maps all
use only the selected map's regions.

| Alternative | Selectable regions | Largest connected group |
| --- | ---: | ---: |
| US states and Washington, DC | 51 | 49 |
| UK historic counties | 92 | 83 |
| Swiss cantons | 26 | 26 |
| Italian regions | 20 | 18 |
| Indian states and union territories | 36 | 34 |
| Chinese provincial-level regions | 34 | 32 |
| French metropolitan departments | 96 | 94 |
| Spanish provinces | 52 | 47 |
| Brazilian states and federal district | 27 | 27 |
| Japanese prefectures | 47 | 46 |

The UK map uses all 92 historic counties across England, Wales, Scotland,
and Northern Ireland, not council areas or modern administrative/ceremonial
counties. It follows the Historic Counties Trust's Definition A: detached
parts belong to the county in which they locally lie. Yorkshire and Sussex
are each one county, and Middlesex is included. County aliases include
"County Antrim", "County Derry", and "Isle of Anglesey".
The French alternative covers metropolitan departments.
Italy has only 18 mainland-connected regions: Sicily and Sardinia
are separate islands. Subdivision adjacency comes from shared boundary arcs
plus curated fixed links: the Menai bridges, Macau's connection to Guangdong
and the Hong Kong-Zhuhai-Macau Bridge, and Japan's Seikan, Kanmon,
Akashi-Naruto, Seto-Ohashi, and Shimanami links. No ferry links are invented
for isolated regions. Source boundary vintages
vary; the bundled provenance records the source, year, and license.

Taiwan, Tibet, Hong Kong, and Macau are striped on the Chinese alternative.
Jammu and Kashmir, Ladakh, and Arunachal Pradesh are striped on the Indian
alternative. Grouping these regions for gameplay is not an endorsement of a
sovereignty claim. No Russian subdivision alternative is included.

Hop counters use interior anchors rather than centroids, including for concave
regions and polygons with holes. If incoming and outgoing hops use separate
territories, both territories get the same counter. For example, Andorra →
France → Netherlands shows hop 2 in mainland France and French Saint Martin.
Both local and online result maps use the same renderer, including zoom,
territory ownership, and dispute shading.

Map assets are bundled and loaded on demand from this site, not from an
external map service. Regenerate the assets and catalog from the repository
root with Node.js 18+ and the development-only conversion tools installed:

```sh
npm --prefix mapominoes ci --ignore-scripts
node mapominoes/generate-maps.mjs
```

Mapshaper converts and simplifies the Historic County Borders Project's
shapefile in memory, preserving shared boundary topology. These build tools
are not loaded by the browser. The UK asset has a content revision in its URL
so cached council-area data is not reused after updating.

## Online multiplayer

Online games use host-authoritative WebRTC DataChannels in a star topology.
Two connection modes are available:

- **Manual codes** has no server. The host creates a separate offer code for
  each joining player, that player returns an answer code, and the host applies
  it. Both invite and answer codes use the lossless M3 binary format, with
  optional raw DEFLATE compression.
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

The host can change maps in the lobby, including after reopening it between
rounds. The choice is sent in authoritative game snapshots and shown read-only
to guests. Changing maps clears route/selection state but keeps connections,
player order, scores, and game rules. Guests load the chosen dataset before
validating or displaying the new snapshot.

### Manual connection code format (M3)

New invites and their answers start with `M3.`. The shared codec in
[connection-codes.js](./connection-codes.js) uses a fixed, versioned dictionary
for common DataChannel SDP lines and attribute prefixes. Actual values are
checked before using a dictionary entry; they are not blindly replaced with
browser-specific defaults.

Fingerprint bytes, canonical origin session integers, invitation IDs with the
generated `invite-` prefix, application media ports, connection addresses,
IPv4 candidate addresses, candidate integers, and enumerated transports/types
are packed into binary. This covers the non-placeholder media ports and
connection addresses that browsers can emit after ICE gathering.
IPv6 addresses, mDNS
names, candidate extensions, unusual fingerprints, and unfamiliar SDP
attributes are retained verbatim where a compact representation is not
applicable. Line order, duplicate attributes, optional fields, DTLS roles,
ICE credentials, and every ICE candidate are preserved. Non-CRLF SDP and
inputs that would grow under tokenization use a raw UTF-8 representation.

The transport is `M3.` followed by unpadded Base64url encoding of:

1. One flag byte: `0` for uncompressed binary, `1` for raw DEFLATE.
2. A four-byte little-endian CRC-32 of the uncompressed binary payload.
3. The binary payload, optionally compressed.

The payload records invite/answer kind, invitation ID, and the complete SDP;
the corresponding description type is offer/answer. SDP is either a
length-prefixed UTF-8 string or an ordered list of dictionary, literal, and
structured-field records. Lengths and ordinary integers use unsigned
base-128 varints. Large canonical integers use length-prefixed big-endian
bytes. The dictionaries and field tags are M3 wire-format constants.

Raw DEFLATE is used only when both browser stream constructors support it
and compression actually reduces the payload. Otherwise the code remains
uncompressed M3; no compression-library download is required. Decoders check
the checksum, field tags, value ranges, truncation, and trailing payload data.
Input codes, expanded binary/legacy JSON, and reconstructed SDP are each
limited to 100,000 characters or bytes as applicable. The checksum detects
copying damage; it is not authentication.

Version 1 Base64 JSON and M2 gzip/Base64url codes remain readable, including
the historical uncompressed compact-v2 JSON form. When joining an older
invite, the answer uses the same older version so the original host can
decode it. If gzip is unavailable for an M2 answer, it uses compatible v1
JSON instead. Old app versions cannot read new M3 invites; those players
must refresh/update before joining a new M3 host.

### Logical connection payload

For reference, decoded connection data can be represented by the following
four-field JSON object. This is not the binary wire representation, and the
game does not display unencoded payloads or inspection controls.
SDP line breaks are JSON-escaped as `\r\n`.

```json
{
  "v": 3,
  "k": "i",
  "i": "invite-example",
  "d": {
    "type": "offer",
    "sdp": "v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=ice-ufrag:example\r\na=ice-pwd:example-password-not-real\r\na=fingerprint:sha-256 AA:BB:CC:DD\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\na=candidate:1 1 udp 2122260223 192.0.2.10 54321 typ host\r\na=end-of-candidates\r\n"
  }
}
```

This is a synthetic, non-connectable example, with documentation-only IP
addresses and a deliberately abbreviated fingerprint. Real offers can contain
multiple host/server-reflexive ICE candidates, network metadata, ICE
credentials, a full DTLS certificate fingerprint, and browser-specific SDP
attributes. The game map, rules, player names, and scores are not included in
the manual invite; those arrive over the DataChannel after connection.

`v` is the format version, `k` is `i` (invite) or `a` (answer), `i` is the
per-player invite ID, and `d` is the WebRTC session description. Keep actual
payloads private: they contain the same connection metadata as the encoded
invites.

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

## Tests

Run the focused rules, geometry, dataset, snapshot, and invite-code tests:

```sh
node --test mapominoes/game-rules.test.js mapominoes/maps.test.js mapominoes/online.test.js mapominoes/connection-codes.test.js
```

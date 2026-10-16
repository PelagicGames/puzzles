// Copyright (C) 2026 Pelagic Games
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(`${__dirname}/online.js`, "utf8");
const html = fs.readFileSync(`${__dirname}/online.html`, "utf8");
assert(!html.includes("invite-raw-output"), "Invite inspector must not be present");
assert(!html.includes("answer-raw-output"), "Answer inspector must not be present");
assert(!/Inspect (invite|answer)/.test(html), "Inspection controls must not be present");
const data = {
  world: { countries: [{ code: "FRA" }, { code: "NLD" }] },
  uk: { countries: [{ code: "uk:kent" }, { code: "uk:essex" }] }
};
const context = vm.createContext({
  TextEncoder, TextDecoder, Blob, Response, CompressionStream, DecompressionStream, TypeError,
  btoa, atob,
  window: {},
  allowedTimers: new Set([5, 10, 15, 30, 45, 60]),
  maps: { get: (id) => data[id], catalog: [{ id: "world" }, { id: "uk" }] },
  isPlainObject: (value) => value !== null && typeof value === "object" && !Array.isArray(value)
});
vm.runInContext(fs.readFileSync(`${__dirname}/connection-codes.js`, "utf8"), context);
vm.runInContext(
  source.slice(source.indexOf("  function encodeCode("), source.indexOf("  function waitForIce("))
  + source.slice(source.indexOf("  function validSnapshot("), source.indexOf("  function handleGuestMessage(")),
  context
);
const example = {
  version: 2,
  kind: "invite",
  inviteId: "invite-example",
  description: {
    type: "offer",
    sdp: "v=0\r\no=- 123456789 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n"
      + "a=group:BUNDLE 0\r\na=msid-semantic: WMS\r\n"
      + "m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\n"
      + "a=ice-ufrag:example\r\na=ice-pwd:example-password-not-real\r\n"
      + "a=fingerprint:sha-256 AA:BB:CC:DD\r\na=setup:actpass\r\na=mid:0\r\n"
      + "a=sctp-port:5000\r\na=max-message-size:262144\r\n"
      + "a=candidate:1 1 udp 2122260223 192.0.2.10 54321 typ host\r\na=end-of-candidates\r\n"
  }
};
const snapshot = {
  version: 1, mapId: "uk", phase: "turn", mode: "autocheck",
  turnSeconds: 15, hostId: "host", authorityEpoch: 1, currentPlayer: 0, roundPlayerCount: 1,
  players: [{ id: "host", name: "Host", score: 0, connected: true, roundEligible: true, left: false }],
  selections: {}, path: [{ code: "uk:kent", player: 0, valid: true, reasons: [] }]
};
assert(context.validSnapshot(snapshot));
assert(!context.validSnapshot({ ...snapshot, mapId: "world" }));
assert(!context.validSnapshot({ ...snapshot, mapId: "missing" }));
assert(context.validSnapshot({ ...snapshot, mapId: undefined,
  path: [{ code: "FRA", player: 0, valid: true, reasons: [] }] }), "Legacy snapshots default to world");

async function main() {
  const compressed = await context.encodeCode(example);
  assert(compressed.startsWith("M3."));
  const decoded = await context.window.MapominoesCodes.decode(compressed, "invite");
  assert.equal(JSON.stringify(decoded), JSON.stringify({ ...example, version: 3 }));
  context.CompressionStream = undefined;
  const uncompressed = await context.encodeCode(example);
  assert(uncompressed.startsWith("M3."));
  assert.equal(JSON.stringify(await context.window.MapominoesCodes.decode(uncompressed, "invite")), JSON.stringify({ ...example, version: 3 }));
  const legacy = { ...example, version: 1 };
  assert.equal(JSON.stringify(await context.window.MapominoesCodes.decode(btoa(JSON.stringify(legacy)), "invite")), JSON.stringify(legacy));
  const answer = { ...example, kind: "answer", description: { ...example.description, type: "answer" } };
  const answerCode = await context.encodeCode(answer);
  assert.equal((await context.window.MapominoesCodes.decode(answerCode, "answer")).kind, "answer");
  const compatible = await context.encodeCode(answer, 1);
  assert(!compatible.startsWith("M3."));
  assert.equal((await context.window.MapominoesCodes.decode(compatible, "answer")).version, 1);
  await assert.rejects(context.window.MapominoesCodes.decode(compressed, "answer"), /not a valid/);
  await assert.rejects(context.window.MapominoesCodes.decode("not a code", "invite"));
  console.log("Online map snapshots, inspector removal, M3 encoding, and legacy answer compatibility tests passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

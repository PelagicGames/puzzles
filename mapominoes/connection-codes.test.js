// Copyright (C) 2026 Pelagic Games
/**
 * Run with node connection-codes.test.js, or through npm test.
 * Reads the browser codec into isolated VMs with native and simulated stream support.
 * Checks exact wire round trips, compatibility, integrity and size limits; writes
 * only assertion diagnostics, compression summaries and process exit status.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const { deflateRawSync, inflateRawSync, gzipSync } = require("node:zlib");
const source = fs.readFileSync(`${__dirname}/connection-codes.js`, "utf8");

/** Buffer stream chunks before applying a synchronous raw-DEFLATE operation.
 * @param {Function} transform - Buffer-to-buffer compressor or inflater.
 * @returns {TransformStream} Browser-shaped stream backed by Node zlib.
 */
function rawStream(transform) {
  const chunks = [];
  return new TransformStream({
    /** @param {Uint8Array} chunk - Incoming bytes to retain. @returns {void} */
    transform(chunk) { chunks.push(Buffer.from(chunk)); },
    /** @param {TransformStreamDefaultController} controller - Output sink. @returns {void} */
    flush(controller) { controller.enqueue(new Uint8Array(transform(Buffer.concat(chunks)))); }
  });
}
/** @param {Function} native - Native stream constructor.
 * @param {Function} transform - Raw format operation. @returns {Function} Compatible constructor.
 */
function streams(native, transform) {
  return class {
    /** @param {string} format - Compression format; delegates non-raw formats to native streams. */
    constructor(format) {
      return format === "deflate-raw" ? rawStream(transform) : new native(format);
    }
  };
}
/** @param {Object} overrides - Browser globals to replace.
 * @returns {Object} Codec loaded into a fresh VM, without page startup.
 */
function environment(overrides = {}) {
  const context = vm.createContext({
    window: {}, TextEncoder, TextDecoder, Blob, TypeError, btoa, atob,
    CompressionStream: streams(CompressionStream, deflateRawSync),
    DecompressionStream: streams(DecompressionStream, inflateRawSync),
    ...overrides
  });
  vm.runInContext(source, context);
  return context.window.MapominoesCodes;
}
const codes = environment();
/** @param {string} hash - Digest algorithm. @returns {string} Deterministic synthetic certificate fingerprint. */
const fingerprint = (hash = "sha256") => createHash(hash).update("test certificate").digest("hex")
  .toUpperCase().match(/../g).join(":");
/** @param {string} kind - Invite or answer.
 * @param {number} index - Session/address variation. @returns {Object} Synthetic SDP fixture.
 */
const fixture = (kind = "invite", index = 0) => ({
  version: 3,
  kind,
  inviteId: "invite-1z141z31z141z3",
  description: {
    type: kind === "invite" ? "offer" : "answer",
    sdp: [
      "v=0", `o=- ${4109260023080860376n + BigInt(index)} 2 IN IP4 127.0.0.1`,
      "s=-", "t=0 0", "a=group:BUNDLE 0", "a=extmap-allow-mixed", "a=msid-semantic: WMS",
      "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "c=IN IP4 0.0.0.0",
      "a=ice-ufrag:Qn9x", "a=ice-pwd:ab7Cd9Ef1Gh3Ij5Kl7Mn9Op1",
      "a=ice-options:trickle", `a=fingerprint:sha-256 ${fingerprint()}`,
      `a=setup:${kind === "invite" ? "actpass" : "active"}`, "a=mid:0",
      "a=sctp-port:5000", "a=max-message-size:262144",
      `a=candidate:123456789 1 udp 2122260223 192.0.2.${index % 250 + 1} 54321 typ host generation 0 ufrag Qn9x network-cost 999`,
      "a=end-of-candidates", ""
    ].join("\r\n")
  }
});
/** @param {*} value - VM value. @returns {*} JSON copy with local prototypes for strict equality. */
const plain = (value) => JSON.parse(JSON.stringify(value));
/** @param {string} code - M3 code. @returns {Buffer} Decoded envelope including its five-byte header. */
const bytes = (code) => Buffer.from(code.slice(3), "base64url");
/** @param {string} code - M3 code. @returns {Buffer} Uncompressed packed payload, without header. */
const body = (code) => {
  const envelope = bytes(code);
  return envelope[0] ? inflateRawSync(envelope.subarray(5)) : envelope.subarray(5);
};
/** @param {Uint8Array} bytes - Payload bytes. @returns {number} Independent unsigned CRC-32 oracle. */
function crc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let i = 0; i < 8; i += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
/** Construct valid checksums around deliberately invalid packed test payloads.
 * @param {Buffer} body - Raw packed bytes.
 * @param {boolean} compressed - Whether to deflate. @returns {string} M3 envelope.
 */
function envelope(body, compressed = false) {
  const header = Buffer.alloc(5);
  header[0] = compressed ? 1 : 0;
  header.writeUInt32LE(crc(body), 1);
  return `M3.${Buffer.concat([header, compressed ? deflateRawSync(body) : body]).toString("base64url")}`;
}
/** @param {number} value - Non-negative integer. @returns {number[]} Base-128 continuation bytes. */
function uint(value) {
  const result = [];
  do {
    const byte = value % 128;
    value = Math.floor(value / 128);
    result.push(byte + (value ? 128 : 0));
  } while (value);
  return result;
}
/** @param {Object} value - Expected connection envelope.
 * @param {Object} codec - Browser capability variant. @returns {Promise<string>} Code after exact equality checks.
 */
async function roundTrip(value, codec = codes) {
  const code = await codec.encode(value);
  assert.match(code, /^M3\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(plain(await codec.decode(code, value.kind)), { ...plain(value), version: 3 });
  return code;
}

/** Run compatibility, field packing, capability fallback and hostile-input groups.
 * @returns {Promise<void>} Rejects on the first failed assertion.
 */
async function main() {
  // Both kinds must stay compact and preserve legacy version-one/two interoperability.
  for (const kind of ["invite", "answer"]) {
    const value = fixture(kind);
    const m3 = await roundTrip(value);
    const m2 = await codes.encode(value, { version: 2 });
    assert(m3.length <= m2.length * 0.75, `${kind}: M3 should be at least 25% shorter on the representative fixture`);
    assert.deepEqual(plain(await codes.decode(m2, kind)), { ...value, version: 2 });
    const v1 = await codes.encode(value, { version: 1 });
    assert.deepEqual(plain(await codes.decode(v1, kind)), { ...value, version: 1 });
    const oldFallback = btoa(JSON.stringify({ v: 2, k: kind === "invite" ? "i" : "a", i: value.inviteId, d: value.description }));
    assert.deepEqual(plain(await codes.decode(oldFallback, kind)), { ...value, version: 2 });
    assert.deepEqual(plain(await codes.decode(` \n${m3.slice(0, 25)}\n${m3.slice(25)} `, kind)), value);
    await assert.rejects(codes.decode(m3, kind === "invite" ? "answer" : "invite"), /not a valid/);
    console.log(`${kind}: M2 ${m2.length} characters -> M3 ${m3.length} (${Math.round(100 * (1 - m3.length / m2.length))}% shorter)`);
    const gathered = fixture(kind);
    gathered.description.sdp = gathered.description.sdp
      .replace("m=application 9 ", "m=application 54321 ")
      .replace("c=IN IP4 0.0.0.0", "c=IN IP4 192.0.2.1");
    const gatheredM3 = await roundTrip(gathered);
    const gatheredM2 = await codes.encode(gathered, { version: 2 });
    assert(gatheredM3.length <= gatheredM2.length * 0.75,
      `${kind}: gathered media port and connection address must remain compact`);
  }

  // Candidate extensions, unfamiliar SDP and unusual identifiers must remain byte-exact.
  const base = fixture();
  const extraCandidates = [
    "a=candidate:42 1 UDP 4294967295 2001:db8::1 65535 typ host generation 0 network-id 1",
    "a=candidate:abcdef 1 tcp 1518280447 device-123.local 9 typ host tcptype active",
    "a=candidate:1 2 udp 1686052607 198.51.100.1 40000 typ srflx raddr 192.0.2.1 rport 54321",
    "a=candidate:3 1 TCP 1 203.0.113.1 443 typ relay tcptype passive x-future anything",
    "a=candidate:4 1 udp 1 192.0.2.9 1234 typ prflx",
    "a=candidate:001 01 UDP 0001 192.000.2.1 0009 typ host  unknown extension",
    "a=candidate:future candidate format",
    "a=x-future-attribute:unknown content \u00e9 \ud83c\udf0d"
  ];
  for (let index = 0; index < 40; index += 1) {
    const value = fixture(index % 2 ? "answer" : "invite", index);
    value.description.sdp += extraCandidates.slice(0, index % 9).join("\r\n");
    await roundTrip(value);
  }
  for (const sdp of [
    "", "v=0", "v=0\ns=-\n", "v=0\rs=-\r", "v=0\r\ns=-\n", "v=0\r\n\r\ns=-  \r\n",
    "a=group:BUNDLE data\r\na=mid:data\r\na=setup:passive\r\na=sctp-port:6000\r\na=max-message-size:65536\r\n",
    "m=application 9 DTLS/SCTP 5000\r\na=sctpmap:5000 webrtc-datachannel 1024\r\n",
    "m=application 0 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 192.0.2.1\r\n",
    "m=application 65535 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP6 2001:0DB8:0:0::1\r\n",
    "m=application 00009 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 192.000.2.1\r\n",
    "m=application 65536 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 224.2.17.12/127\r\n",
    "m=application 9/2 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN FUTURE address\r\n",
    "o=- 18446744073709551615 18446744073709551615 IN IP4 127.0.0.1\r\n",
    "o=- 18446744073709551616 2 IN IP4 127.0.0.1\r\n",
    "o=browser 00001 00002 IN IP6 ::1\r\n",
    `a=fingerprint:sha-384 ${fingerprint("sha384")}\r\na=fingerprint:sha-512 ${fingerprint("sha512")}\r\n`,
    `a=fingerprint:sha-256 ${fingerprint().toLowerCase()}\r\n`,
    "a=fingerprint:unknown-hash AA:BB\r\n"
  ]) {
    await roundTrip({ ...base, description: { ...base.description, sdp } });
  }
  for (const inviteId of ["invite-0", "invite-01", "invite-zzzzzzzzzzzzzz", "invite-ABC", "custom-id", "\u00e9".repeat(80)]) {
    await roundTrip({ ...base, inviteId });
  }
  // M3 accepts the current SDP ceiling even when the legacy envelope cannot fit.
  const boundary = { ...base, description: { ...base.description, sdp: "v=0\r\n".repeat(20000) } };
  await roundTrip(boundary);
  await assert.rejects(codes.encode(boundary, { version: 2 }), /legacy connection payload is too large/);

  // Missing or partially implemented stream APIs must select explicit safe fallbacks.
  const noStreams = environment({ CompressionStream: undefined, DecompressionStream: undefined });
  const uncompressed = await roundTrip(base, noStreams);
  assert.equal(bytes(uncompressed)[0], 0);
  await roundTrip({ ...base, description: { ...base.description, sdp: "x" } });
  const tiny = await codes.encode({ ...base, inviteId: "id", description: { ...base.description, sdp: "x" } });
  assert.equal(bytes(tiny)[0], 0, "Compression must not make a code larger");
  const compressed = await codes.encode({ ...base, description: { ...base.description, sdp: base.description.sdp.repeat(10) } });
  assert.equal(bytes(compressed)[0], 1);
  await assert.rejects(noStreams.decode(compressed, "invite"), /cannot expand/);
  class UnsupportedRaw {
    /** @param {string} format - Requested format; simulate a browser lacking raw DEFLATE. */
    constructor(format) {
      if (format === "deflate-raw") throw new TypeError("Unsupported format");
      return new CompressionStream(format);
    }
  }
  const unsupported = environment({ CompressionStream: UnsupportedRaw, DecompressionStream: UnsupportedRaw });
  const unsupportedCode = await roundTrip(base, unsupported);
  assert.equal(bytes(unsupportedCode)[0], 0);
  await assert.rejects(unsupported.decode(compressed, "invite"), /does not support raw DEFLATE/);
  const legacyFallback = await noStreams.encode(base, { version: 2 });
  assert.equal((await noStreams.decode(legacyFallback, "invite")).version, 1);

  // Integrity, framing, truncation, expansion limits and malformed packed fields.
  const corrupt = bytes(uncompressed);
  corrupt[1] ^= 1;
  await assert.rejects(codes.decode(`M3.${corrupt.toString("base64url")}`, "invite"), /checksum/);
  const badFlag = bytes(uncompressed);
  badFlag[0] = 2;
  await assert.rejects(codes.decode(`M3.${badFlag.toString("base64url")}`, "invite"), /header/);
  await assert.rejects(codes.decode(compressed.slice(0, -8), "invite"));
  await assert.rejects(codes.decode("M3.%", "invite"), /Base64url/);
  await assert.rejects(codes.decode("", "invite"), /missing/);
  await assert.rejects(codes.decode("x".repeat(100001), "invite"), /too large/);
  await assert.rejects(codes.decode(envelope(Buffer.concat([body(uncompressed), Buffer.from([0])])), "invite"), /trailing/);
  for (const payload of [
    [2], [0, 2], [0, 0, 127], [0, 1, 0], [0, 0, 2, 105, 100, 2],
    [0, 0, 2, 105, 100, 0, 1, 255],
    [0, 0, 2, 105, 100, 1, 1, 255],
    [0, 0, 2, 105, 100, 1, 1, 64, 255],
    [0, 0, 2, 105, 100, 1, 1, 65, 3],
    [0, 0, 2, 105, 100, 1, 1, 69, 2]
  ]) {
    await assert.rejects(codes.decode(envelope(Buffer.from(payload)), "invite"));
  }
  await assert.rejects(codes.decode(envelope(Buffer.alloc(100001), true), "invite"), /too large/);
  const expanded = Buffer.from([0, 0, 2, 105, 100, 1, ...uint(3000), ...Array(3000).fill(8)]);
  await assert.rejects(codes.decode(envelope(expanded), "invite"), /reconstructed SDP is too large/);
  const gzipBomb = `M2.${gzipSync(Buffer.alloc(100001)).toString("base64url")}`;
  await assert.rejects(codes.decode(gzipBomb, "invite"), /too large/);
  // Encoding rejects invalid envelopes and Unicode rather than emitting lossy codes.
  await assert.rejects(codes.encode({ ...base, inviteId: "" }), /not a valid/);
  await assert.rejects(codes.encode({ ...base, description: { ...base.description, type: "answer" } }), /not a valid/);
  await assert.rejects(codes.encode({ ...base, description: { ...base.description, sdp: "\ud800" } }), /invalid Unicode/);
  await assert.rejects(codes.encode({ ...base, description: { ...base.description, sdp: "x".repeat(100001) } }), /not a valid/);
  await assert.rejects(codes.encode(base, { version: 4 }), /Unsupported/);
  console.log("M3 exact round trips, field packing, fallback, compatibility, integrity, and size tests passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

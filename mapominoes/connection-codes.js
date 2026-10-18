// Copyright (C) 2026 Pelagic Games
/**
 * Browser-side codec for manual WebRTC invite and answer codes. Loaded by the
 * online game page; it packs SDP losslessly into M3, optionally uses raw
 * DEFLATE, verifies CRC-32, and continues to read the older JSON/M2 formats.
 * The M3 dictionaries, tags, lengths, and envelope layout are wire-format
 * constants and must stay in step with the documented format in README.md.
 * Reads logical payloads/codes and browser compression capabilities; returns
 * encoded strings or decoded records without network, storage or DOM access.
 */
(() => {
  "use strict";
  // Shared upper bound for input codes, decoded text and binary payloads.
  const limit = 100000;
  // UTF-8 is used for literal strings; fatal decoding prevents malformed input
  // from silently changing when a code is reconstructed.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  // M3 dictionaries are wire-format constants. Fixed-line entries map whole
  // common SDP lines to tags; append entries, never reorder existing values.
  const fixedLines = [
    "", "v=0", "s=-", "t=0 0", "a=group:BUNDLE 0", "a=extmap-allow-mixed",
    "a=msid-semantic: WMS", "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0", "a=ice-options:trickle", "a=setup:actpass",
    "a=setup:active", "a=setup:passive", "a=mid:0", "a=sctp-port:5000",
    "a=max-message-size:262144", "a=end-of-candidates"
  ];
  // Prefix tags cover common SDP fields while preserving each original suffix.
  const prefixes = [
    "o=", "a=ice-ufrag:", "a=ice-pwd:", "a=fingerprint:", "a=candidate:",
    "a=mid:", "a=setup:", "a=sctp-port:", "a=max-message-size:", "a=ice-options:",
    "a=group:", "a=msid-semantic:", "m=", "c="
  ];
  // Candidate/address atom dictionary. Other values remain lossless text,
  // canonical decimal integers, or compact IPv4 octets.
  const atoms = [
    "raddr", "rport", "tcptype", "generation", "ufrag", "network-id", "network-cost",
    "active", "passive", "so"
  ];
  // Enumerated candidate fields are encoded by their stable array indices.
  const transports = ["udp", "tcp", "UDP", "TCP"];
  const candidateTypes = ["host", "srflx", "prflx", "relay"];
  const hashes = ["sha-256", "sha-384", "sha-512"];
  // Fingerprint byte counts correspond positionally to the hash names above.
  const hashLengths = [32, 48, 64];
  // Reflected IEEE CRC-32 lookup table, generated once for the codec lifetime.
  const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    return value >>> 0;
  });

  /**
   * Calculate the envelope's non-authenticating CRC-32 over uncompressed bytes.
   * @param {Uint8Array} bytes - Binary M3 payload.
   * @returns {number} Unsigned 32-bit checksum.
   */
  function checksum(bytes) {
    let crc = 0xffffffff;
    bytes.forEach((byte) => { crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]; });
    return (crc ^ 0xffffffff) >>> 0;
  }

  /** Accumulates one M3 payload as an ordered sequence of unsigned bytes. */
  class Writer {
    // Mutable byte list; finish() enforces the common payload-size limit.
    bytes = [];
    /** @param {number} value - One byte to append.
     * @returns {void} Mutates the writer's byte list.
     */
    byte(value) { this.bytes.push(value); }
    /**
     * Write a non-negative integer as little-endian base-128 varint groups.
     * @param {number} value - Safe non-negative integer.
     * @returns {void} Appends continuation bytes.
     */
    uint(value) {
      do {
        const byte = value % 128;
        value = Math.floor(value / 128);
        this.byte(byte + (value ? 128 : 0));
      } while (value);
    }
    /** Write a UTF-8 string preceded by its byte length.
     * @param {string} value - Losslessly encodable text.
     * @returns {void} Appends bytes, rejecting invalid Unicode.
     */
    text(value) {
      const bytes = encoder.encode(value);
      if (decoder.decode(bytes) !== value) throw new Error("The connection payload contains invalid Unicode.");
      this.uint(bytes.length);
      bytes.forEach((byte) => this.byte(byte));
    }
    /** Write a BigInt as minimal, length-prefixed, big-endian bytes.
     * @param {bigint} value - Non-negative integer.
     * @returns {void} Appends its length and bytes.
     */
    big(value) {
      const bytes = [];
      do {
        bytes.unshift(Number(value & 255n));
        value >>= 8n;
      } while (value);
      this.uint(bytes.length);
      bytes.forEach((byte) => this.byte(byte));
    }
    /** @returns {Uint8Array} Final payload, or throws if it exceeds the limit. */
    finish() {
      if (this.bytes.length > limit) throw new Error("The connection payload is too large.");
      return Uint8Array.from(this.bytes);
    }
  }

  /** Reads a payload sequentially; offset always points to the next unread byte. */
  class Reader {
    /** @param {Uint8Array} bytes - Payload to parse. */
    constructor(bytes) { this.bytes = bytes; this.offset = 0; }
    /** @returns {number} Next byte; throws on truncation. */
    byte() {
      if (this.offset >= this.bytes.length) throw new Error("The connection payload is truncated.");
      return this.bytes[this.offset++];
    }
    /** Decode at most five base-128 groups and reject values above the field bound.
     * @param {number} max - Inclusive field bound.
     * @returns {number} Decoded integer; advances the reader.
     */
    uint(max = limit) {
      let value = 0;
      let multiplier = 1;
      for (let i = 0; i < 5; i += 1) {
        const byte = this.byte();
        value += (byte & 127) * multiplier;
        if (value > max) throw new Error("A connection payload value is out of range.");
        if (byte < 128) return value;
        multiplier *= 128;
      }
      throw new Error("A connection payload integer is invalid.");
    }
    /** Return the next exact byte range, rejecting lengths beyond remaining input.
     * @param {number} length - Byte count.
     * @returns {Uint8Array} Shared view; advances the reader offset.
     */
    take(length) {
      if (length > this.bytes.length - this.offset) throw new Error("The connection payload is truncated.");
      const bytes = this.bytes.subarray(this.offset, this.offset + length);
      this.offset += length;
      return bytes;
    }
    /** Decode one length-prefixed UTF-8 value using fatal UTF-8 validation.
     * @returns {string} Text at the current offset; advances past it.
     */
    text() { return decoder.decode(this.take(this.uint())); }
    /** Read a non-empty big-endian integer with a bounded encoded length.
     * @param {number} maxLength - Maximum encoded byte count.
     * @returns {bigint} Decoded value; advances the reader.
     */
    big(maxLength) {
      const length = this.uint(maxLength);
      if (!length) throw new Error("An empty binary integer is invalid.");
      let value = 0n;
      this.take(length).forEach((byte) => { value = value * 256n + BigInt(byte); });
      return value;
    }
  }

  /** Accept only canonical decimal spellings within a safe integer bound.
   * @param {string} value - Candidate decimal text.
   * @param {number} max - Inclusive numeric bound.
   * @returns {boolean} Whether compact numeric encoding is lossless.
   */
  function integer(value, max = 0xffffffff) {
    return /^(0|[1-9][0-9]*)$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= max;
  }

  /** Parse canonical decimal IPv4 octets for the compact candidate atom form.
   * @param {string} value - Candidate address.
   * @returns {number[]|null} Four octets or null for literal preservation.
   */
  function ipv4(value) {
    const parts = value.split(".");
    return parts.length === 4 && parts.every((part) => integer(part, 255)) ? parts.map(Number) : null;
  }

  /** Encode a candidate atom using its dictionary, numeric, IPv4, or text tag.
   * @param {Writer} writer - Destination to mutate.
   * @param {string} value - Exact candidate field.
   * @returns {void}
   */
  function writeAtom(writer, value) {
    const known = atoms.indexOf(value);
    const address = ipv4(value);
    if (known >= 0) writer.byte(known + 2);
    else if (integer(value)) {
      writer.byte(32);
      writer.uint(Number(value));
    } else if (address) {
      writer.byte(33);
      address.forEach((byte) => writer.byte(byte));
    } else {
      writer.byte(0);
      writer.text(value);
    }
  }

  /** Decode one candidate atom and reject unknown atom tags.
   * @param {Reader} reader - Source to advance.
   * @returns {string} Reconstructed field.
   */
  function readAtom(reader) {
    const tag = reader.byte();
    if (tag === 0) return reader.text();
    if (tag >= 2 && tag < atoms.length + 2) return atoms[tag - 2];
    if (tag === 32) return String(reader.uint(0xffffffff));
    if (tag === 33) return Array.from(reader.take(4)).join(".");
    throw new Error("An unknown candidate field was found.");
  }

  /**
   * Split and validate only the candidate syntax the structured encoder knows.
   * Unrecognised or non-canonical lines fall back to literal SDP, preserving them.
   * @param {string} line - One SDP line.
   * @returns {string[]|null} Structured candidate fields, or null.
   */
  function candidateParts(line) {
    if (!line.startsWith("a=candidate:")) return null;
    const parts = line.slice(12).split(" ");
    if (parts.length < 8 || parts.length > 128 || parts.some((part) => !part)
      || !integer(parts[1], 65535) || !transports.includes(parts[2])
      || !integer(parts[3]) || !integer(parts[5], 65535)
      || parts[6] !== "typ" || !candidateTypes.includes(parts[7])) return null;
    return parts;
  }

  /**
   * Encode one SDP line using a fixed-line, structured-field, prefix, or literal
   * record. Structured forms are selected only when their exact syntax matches.
   * @param {Writer} writer - Destination to mutate.
   * @param {string} line - Exact SDP line without its terminator.
   * @returns {void}
   */
  function writeLine(writer, line) {
    const fixed = fixedLines.indexOf(line);
    if (fixed >= 0) {
      writer.byte(fixed + 1);
      return;
    }
    const fingerprint = /^a=fingerprint:(sha-256|sha-384|sha-512) ([0-9A-F]{2}(?::[0-9A-F]{2})+)$/.exec(line);
    if (fingerprint && fingerprint[2].split(":").length === hashLengths[hashes.indexOf(fingerprint[1])]) {
      writer.byte(65);
      writer.byte(hashes.indexOf(fingerprint[1]));
      fingerprint[2].split(":").forEach((hex) => writer.byte(parseInt(hex, 16)));
      return;
    }
    const origin = /^o=- (0|[1-9][0-9]{0,19}) (0|[1-9][0-9]{0,19}) IN IP4 127\.0\.0\.1$/.exec(line);
    if (origin && BigInt(origin[1]) < (1n << 64n) && BigInt(origin[2]) < (1n << 64n)) {
      writer.byte(66);
      writer.big(BigInt(origin[1]));
      writer.big(BigInt(origin[2]));
      return;
    }
    const application = /^m=application (0|[1-9][0-9]{0,4}) UDP\/DTLS\/SCTP webrtc-datachannel$/.exec(line);
    if (application && integer(application[1], 65535)) {
      writer.byte(68);
      writer.uint(Number(application[1]));
      return;
    }
    const connection = /^c=IN (IP4|IP6) ([^\r\n]+)$/.exec(line);
    if (connection) {
      writer.byte(69);
      writer.byte(connection[1] === "IP4" ? 0 : 1);
      writeAtom(writer, connection[2]);
      return;
    }
    const candidate = candidateParts(line);
    if (candidate) {
      writer.byte(67);
      writeAtom(writer, candidate[0]);
      writer.uint(Number(candidate[1]));
      writer.byte(transports.indexOf(candidate[2]));
      writer.uint(Number(candidate[3]));
      writeAtom(writer, candidate[4]);
      writer.uint(Number(candidate[5]));
      writer.byte(candidateTypes.indexOf(candidate[7]));
      writer.uint(candidate.length - 8);
      candidate.slice(8).forEach((part) => writeAtom(writer, part));
      return;
    }
    const prefix = prefixes.findIndex((value) => line.startsWith(value));
    if (prefix >= 0) {
      writer.byte(64);
      writer.byte(prefix);
      writer.text(line.slice(prefixes[prefix].length));
    } else {
      writer.byte(0);
      writer.text(line);
    }
  }

  /** Reconstruct an SDP line from one dictionary or typed-field record.
   * @param {Reader} reader - Source to advance.
   * @returns {string} Exact line without its terminator.
   */
  function readLine(reader) {
    const tag = reader.byte();
    if (tag > 0 && tag <= fixedLines.length) return fixedLines[tag - 1];
    if (tag === 0) return reader.text();
    if (tag === 64) {
      const prefix = prefixes[reader.byte()];
      if (prefix === undefined) throw new Error("An unknown SDP prefix was found.");
      return prefix + reader.text();
    }
    if (tag === 65) {
      const hash = reader.byte();
      if (hash >= hashes.length) throw new Error("An unknown fingerprint algorithm was found.");
      const hex = Array.from(reader.take(hashLengths[hash]), (byte) => byte.toString(16).padStart(2, "0").toUpperCase());
      return `a=fingerprint:${hashes[hash]} ${hex.join(":")}`;
    }
    if (tag === 66) return `o=- ${reader.big(8)} ${reader.big(8)} IN IP4 127.0.0.1`;
    if (tag === 68) return `m=application ${reader.uint(65535)} UDP/DTLS/SCTP webrtc-datachannel`;
    if (tag === 69) {
      const family = reader.byte();
      if (family > 1) throw new Error("An unknown connection address family was found.");
      return `c=IN ${family ? "IP6" : "IP4"} ${readAtom(reader)}`;
    }
    if (tag === 67) {
      const foundation = readAtom(reader);
      const component = reader.uint(65535);
      const transport = transports[reader.byte()];
      const priority = reader.uint(0xffffffff);
      const address = readAtom(reader);
      const port = reader.uint(65535);
      const type = candidateTypes[reader.byte()];
      if (!transport || !type) throw new Error("An unknown ICE candidate type or transport was found.");
      const extensions = Array.from({ length: reader.uint(120) }, () => readAtom(reader));
      return `a=candidate:${[foundation, component, transport, priority, address, port, "typ", type, ...extensions].join(" ")}`;
    }
    throw new Error("An unknown SDP field was found.");
  }

  /**
   * Build the uncompressed M3 payload: kind, invitation ID, then SDP. Generated
   * base-36 IDs and CRLF SDP lines get compact forms only when smaller than raw
   * UTF-8; non-CRLF input deliberately remains literal for exact round-tripping.
   * @param {Object} value - Validated connection envelope.
   * @returns {Uint8Array} Packed payload, without transport header.
   */
  function pack(value) {
    const writer = new Writer();
    writer.byte(value.kind === "invite" ? 0 : 1);
    const id = /^invite-([1-9a-z][0-9a-z]{0,13}|0)$/.exec(value.inviteId);
    writer.byte(id ? 1 : 0);
    if (id) {
      let number = 0n;
      for (const digit of id[1]) number = number * 36n + BigInt(parseInt(digit, 36));
      writer.big(number);
    } else writer.text(value.inviteId);
    const raw = new Writer();
    raw.byte(0);
    raw.text(value.description.sdp);
    let sdp = raw.bytes;
    if (!/[\r\n]/.test(value.description.sdp.replace(/\r\n/g, ""))) {
      const tokenized = new Writer();
      tokenized.byte(1);
      const lines = value.description.sdp.split("\r\n");
      tokenized.uint(lines.length);
      lines.forEach((line) => writeLine(tokenized, line));
      if (tokenized.bytes.length < sdp.length) sdp = tokenized.bytes;
    }
    sdp.forEach((byte) => writer.byte(byte));
    return writer.finish();
  }

  /**
   * Parse a complete M3 payload, enforcing field bounds, exact consumption and
   * the reconstructed-SDP limit before returning the logical connection object.
   * @param {Uint8Array} bytes - Uncompressed packed body.
   * @returns {Object} Version-three connection envelope.
   */
  function unpack(bytes) {
    const reader = new Reader(bytes);
    const kind = reader.byte();
    if (kind > 1) throw new Error("An unknown connection code kind was found.");
    const idMode = reader.byte();
    if (idMode > 1) throw new Error("An unknown invitation ID encoding was found.");
    const inviteId = idMode ? `invite-${reader.big(10).toString(36)}` : reader.text();
    const mode = reader.byte();
    if (mode > 1) throw new Error("An unknown SDP encoding was found.");
    let sdp;
    if (mode) {
      const count = reader.uint();
      const lines = [];
      let length = 0;
      for (let i = 0; i < count; i += 1) {
        const line = readLine(reader);
        length += encoder.encode(line).length + (i ? 2 : 0);
        if (length > limit) throw new Error("The reconstructed SDP is too large.");
        lines.push(line);
      }
      sdp = lines.join("\r\n");
    } else sdp = reader.text();
    if (reader.offset !== bytes.length || encoder.encode(sdp).length > limit) {
      throw new Error("The connection payload has trailing data or is too large.");
    }
    return {
      version: 3, kind: kind ? "answer" : "invite", inviteId,
      description: { type: kind ? "answer" : "offer", sdp }
    };
  }

  /** Convert bytes to standard Base64 or unpadded URL-safe Base64.
   * @param {Uint8Array} bytes - Binary input.
   * @param {boolean} url - Whether to use the URL-safe alphabet.
   * @returns {string} Encoded text.
   */
  function base64(bytes, url = false) {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    const encoded = btoa(binary);
    return url ? encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : encoded;
  }

  /** Decode Base64, validating the stricter alphabet and padding rules for M3/M2.
   * @param {string} text - Encoded body without its prefix.
   * @param {boolean} url - Whether URL-safe validation is required.
   * @returns {Uint8Array} Decoded bytes.
   */
  function unbase64(text, url = false) {
    if (url) {
      if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) throw new Error("The connection code is not valid Base64url.");
      text = text.replace(/-/g, "+").replace(/_/g, "/");
      text = text.padEnd(Math.ceil(text.length / 4) * 4, "=");
    }
    return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
  }

  /** Prefix a completed encoding and enforce the maximum visible code length.
   * @param {string} prefix - Wire-version prefix.
   * @param {Uint8Array} bytes - Envelope to encode.
   * @param {boolean} url - Whether to use Base64url.
   * @returns {string} Bounded shareable code.
   */
  function encodedCode(prefix, bytes, url = true) {
    const code = prefix + base64(bytes, url);
    if (code.length > limit) throw new Error("The encoded connection code is too large.");
    return code;
  }

  /**
   * Collect a CompressionStream/DecompressionStream with an expansion cap.
   * Cancels oversized streams and always releases the reader lock.
   * @param {ReadableStream} stream - Compressed or expanded byte stream.
   * @param {number} max - Maximum collected byte length.
   * @returns {Promise<Uint8Array>} Contiguous output bytes.
   */
  async function readStream(stream, max = limit) {
    const reader = stream.getReader();
    const chunks = [];
    let length = 0;
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        length += result.value.length;
        if (length > max) {
          await reader.cancel();
          throw new Error("The expanded connection code is too large.");
        }
        chunks.push(result.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.length; });
    return bytes;
  }

  /**
   * Create a raw-DEFLATE compressor only when both matching stream APIs support
   * the format; null signals that M3 must be emitted without compression.
   * @returns {CompressionStream|null} Usable raw compressor, or null.
   */
  function rawCompressor() {
    if (typeof CompressionStream !== "function" || typeof DecompressionStream !== "function") return null;
    try {
      new DecompressionStream("deflate-raw");
      return new CompressionStream("deflate-raw");
    } catch (error) {
      if (error instanceof TypeError) return null;
      throw error;
    }
  }

  /** Validate the public logical payload shape before encoding or returning it.
   * @param {*} value - Proposed connection envelope.
   * @param {string} [expectedKind] - Required invite/answer kind, when decoding.
   * @returns {Object} Same record, or throws on invalid shape/limits.
   */
  function validate(value, expectedKind) {
    if (!value || ![1, 2, 3].includes(value.version)
      || !["invite", "answer"].includes(value.kind) || (expectedKind && value.kind !== expectedKind)
      || typeof value.inviteId !== "string" || !value.inviteId.length || value.inviteId.length > 80
      || !value.description || typeof value.description.sdp !== "string"
      || encoder.encode(value.description.sdp).length > limit
      || value.description.type !== (value.kind === "invite" ? "offer" : "answer")) {
      throw new Error(`That is not a valid Mapominoes ${expectedKind || "connection"} code.`);
    }
    return value;
  }

  /**
   * Encode an invite/answer. Version 3 is the default; versions 1 and 2 remain
   * available for compatibility with older peers. Compression is used only if
   * raw DEFLATE is supported and produces a smaller body.
   * @param {object} value - Logical connection payload with kind, inviteId and description.
   * @param {object} [options] - Optional legacy version selection.
   * @returns {Promise<string>} Copyable connection code.
   */
  async function encode(value, { version = 3 } = {}) {
    validate(value);
    if (version !== 3) {
      if (![1, 2].includes(version)) throw new Error("Unsupported connection code version.");
      if (version === 2 && typeof CompressionStream === "function") {
        const json = JSON.stringify({ v: 2, k: value.kind === "invite" ? "i" : "a", i: value.inviteId, d: value.description });
        if (encoder.encode(json).length > limit) throw new Error("The legacy connection payload is too large.");
        const bytes = await readStream(new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")), limit + 1024);
        return encodedCode("M2.", bytes);
      }
      return encodedCode("", encoder.encode(JSON.stringify({ ...value, version: 1 })), false);
    }
    const bytes = pack(value);
    let body = bytes;
    let flag = 0;
    const compressor = rawCompressor();
    if (compressor) {
      const compressed = await readStream(new Blob([bytes]).stream().pipeThrough(compressor), limit + 1024);
      if (compressed.length < bytes.length) {
        body = compressed;
        flag = 1;
      }
    }
    const result = new Uint8Array(5 + body.length);
    result[0] = flag;
    new DataView(result.buffer).setUint32(1, checksum(bytes), true);
    result.set(body, 5);
    return encodedCode("M3.", result);
  }

  /**
   * Decode M3, M2 gzip, or legacy Base64 JSON and enforce the expected invite or
   * answer role. Whitespace is ignored for copied codes; checksum and size
   * limits protect integrity and resource use, but the checksum is not auth.
   * @param {string} text - User-supplied connection code.
   * @param {string} expectedKind - Required logical kind, normally invite/answer.
   * @returns {Promise<object>} Validated logical connection payload.
   */
  async function decode(text, expectedKind) {
    if (typeof text !== "string" || !text.length || text.length > limit) {
      throw new Error("The connection code is missing or too large.");
    }
    const compact = text.replace(/\s+/g, "");
    if (compact.startsWith("M3.")) {
      const envelope = unbase64(compact.slice(3), true);
      if (envelope.length < 6 || envelope[0] > 1) throw new Error("The M3 connection code header is invalid.");
      let bytes = envelope.subarray(5);
      if (envelope[0]) {
        if (typeof DecompressionStream !== "function") throw new Error("This browser cannot expand compressed M3 codes.");
        let decompressor;
        try { decompressor = new DecompressionStream("deflate-raw"); }
        catch (error) {
          if (error instanceof TypeError) throw new Error("This browser does not support raw DEFLATE M3 codes. Use a newer browser.");
          throw error;
        }
        bytes = await readStream(new Blob([bytes]).stream().pipeThrough(decompressor));
      }
      if (checksum(bytes) !== new DataView(envelope.buffer, envelope.byteOffset).getUint32(1, true)) {
        throw new Error("The connection code checksum does not match. Copy the complete code again.");
      }
      return validate(unpack(bytes), expectedKind);
    }
    let bytes;
    if (compact.startsWith("M2.")) {
      if (typeof DecompressionStream !== "function") throw new Error("This browser cannot expand compressed connection codes.");
      bytes = await readStream(new Blob([unbase64(compact.slice(3), true)]).stream()
        .pipeThrough(new DecompressionStream("gzip")));
    } else bytes = unbase64(compact);
    const value = JSON.parse(decoder.decode(bytes));
    return validate(value?.v === 2 ? {
      version: 2, kind: value.k === "i" ? "invite" : value.k === "a" ? "answer" : "",
      inviteId: value.i, description: value.d
    } : value, expectedKind);
  }

  window.MapominoesCodes = { encode, decode };
})();

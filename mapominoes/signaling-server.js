// Copyright (C) 2026 Pelagic Games

/**
 * Run node mapominoes/signaling-server.js from the repository, optionally with PORT.
 * Uses Node built-ins only. Serves repository files and an in-memory room/SDP API
 * for online.html?signaling=room; gameplay stays on browser DataChannels.
 * Reads HTTP bodies, URL tokens and static files; writes HTTP responses and console
 * diagnostics. Rooms and bearer tokens are ephemeral and never written to disk.
 */
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const port = Number(process.env.PORT) || 8765;
const repositoryRoot = path.resolve(__dirname, "..");
// Room code -> host token, timestamps, sequenced events and peer-ID keyed handshakes.
// Idle rooms expire after six hours; request bodies are bounded before JSON parsing.
const rooms = new Map();
const roomLifetimeMs = 6 * 60 * 60 * 1000;
const bodyLimit = 64 * 1024;
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"]
]);

/** @param {number} bytes - Random byte count. @returns {string} URL-safe opaque bearer token. */
function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** @returns {string} Unused six-character room code without ambiguous I/O/0/1 characters. */
function randomRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from(crypto.randomBytes(6), (value) => alphabet[value % alphabet.length]).join("");
  } while (rooms.has(code));
  return code;
}

/** Send an uncached JSON response with a byte-accurate content length.
 * @param {http.ServerResponse} response - HTTP output.
 * @param {number} status - Status code. @param {*} value - JSON payload. @returns {void}
 */
function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(body);
}

/** Consume a bounded JSON body; oversize input destroys the request.
 * @param {http.IncomingMessage} request - HTTP input.
 * @returns {Promise<Object>} Parsed body, or an empty object for no body.
 */
function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    // Retain chunks only within the cap; end parses once and error propagates rejection.
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > bodyLimit) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

/** @param {*} value - Untrusted RTC description.
 * @param {string} type - Required offer/answer type. @returns {boolean|undefined|null} Validation result.
 */
function validDescription(value, type) {
  return value && value.type === type && typeof value.sdp === "string"
    && value.sdp.length > 0 && value.sdp.length <= 50000;
}

/** @param {string} code - Normalised room code.
 * @returns {Object|null} Live room, refreshing its idle timestamp or deleting expired state.
 */
function findRoom(code) {
  const room = rooms.get(code);
  if (!room || Date.now() - room.updatedAt > roomLifetimeMs) {
    rooms.delete(code);
    return null;
  }
  room.updatedAt = Date.now();
  return room;
}

/** Append a host-poll event, retaining only the newest 200 records.
 * @param {Object} room - Mutable room.
 * @param {Object} event - Offer/cancel fields; assigned a monotonic sequence. @returns {void}
 */
function addEvent(room, event) {
  room.sequence += 1;
  room.events.push({ sequence: room.sequence, ...event });
  if (room.events.length > 200) room.events.splice(0, room.events.length - 200);
}

/** Route room creation, host event polling and guest offer/answer exchange.
 * Tokens travel in JSON writes or query reads; SDP is {type, sdp}. Room creation
 * returns {code, hostToken}; registration returns {peerId, guestToken}.
 * @param {http.IncomingMessage} request - API input.
 * @param {http.ServerResponse} response - API output.
 * @param {URL} url - Parsed path/query. @returns {Promise<void>}
 */
async function handleSignal(request, response, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (request.method === "POST" && url.pathname === "/signal/rooms") {
    const code = randomRoomCode();
    const hostToken = randomToken();
    rooms.set(code, {
      code,
      hostToken,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sequence: 0,
      events: [],
      peers: new Map()
    });
    sendJson(response, 201, { code, hostToken });
    return;
  }

  if (parts[0] !== "signal" || parts[1] !== "rooms" || !parts[2]) {
    sendJson(response, 404, { error: "Signaling endpoint not found." });
    return;
  }
  const code = parts[2].toUpperCase();
  const room = findRoom(code);
  if (!room) {
    sendJson(response, 404, { error: "That room does not exist or has expired." });
    return;
  }

  // Host polling resumes after a sequence cursor; an empty batch still advances it.
  if (request.method === "GET" && parts[3] === "events") {
    if (url.searchParams.get("token") !== room.hostToken) {
      sendJson(response, 403, { error: "Invalid host token." });
      return;
    }
    const after = Math.max(0, Number(url.searchParams.get("after")) || 0);
    sendJson(response, 200, {
      events: room.events.filter((event) => event.sequence > after),
      sequence: room.sequence
    });
    return;
  }

  // Registration reserves a bounded pending handshake, not a gameplay player slot.
  if (request.method === "POST" && parts.length === 4 && parts[3] === "peers") {
    if (room.peers.size >= 24) {
      sendJson(response, 429, { error: "This room has too many pending connections." });
      return;
    }
    const peerId = randomToken(12);
    const guestToken = randomToken();
    room.peers.set(peerId, {
      guestToken,
      offer: null,
      answer: null,
      createdAt: Date.now()
    });
    sendJson(response, 201, { peerId, guestToken });
    return;
  }

  if (parts[3] !== "peers" || !parts[4]) {
    sendJson(response, 404, { error: "Signaling endpoint not found." });
    return;
  }
  const peerId = parts[4];
  const peer = room.peers.get(peerId);
  if (!peer) {
    sendJson(response, 404, { error: "That pending connection no longer exists." });
    return;
  }

  if (request.method === "POST" && parts[5] === "offer") {
    const body = await readJson(request);
    if (body.token !== peer.guestToken || !validDescription(body.description, "offer")) {
      sendJson(response, 400, { error: "Invalid guest offer." });
      return;
    }
    peer.offer = body.description;
    addEvent(room, { type: "offer", peerId, description: peer.offer });
    sendJson(response, 202, { accepted: true });
    return;
  }

  if (request.method === "POST" && parts[5] === "answer") {
    const body = await readJson(request);
    if (body.token !== room.hostToken || !validDescription(body.description, "answer")) {
      sendJson(response, 400, { error: "Invalid host answer." });
      return;
    }
    peer.answer = body.description;
    sendJson(response, 202, { accepted: true });
    return;
  }

  // Retrieving an available answer consumes the pending record; null means retry.
  if (request.method === "GET" && parts[5] === "answer") {
    if (url.searchParams.get("token") !== peer.guestToken) {
      sendJson(response, 403, { error: "Invalid guest token." });
      return;
    }
    if (!peer.answer) {
      sendJson(response, 200, { description: null });
      return;
    }
    sendJson(response, 200, { description: peer.answer });
    room.peers.delete(peerId);
    return;
  }

  if (request.method === "DELETE" && parts.length === 5) {
    const token = url.searchParams.get("token");
    if (token !== peer.guestToken && token !== room.hostToken) {
      sendJson(response, 403, { error: "Invalid connection token." });
      return;
    }
    room.peers.delete(peerId);
    addEvent(room, { type: "cancel", peerId });
    response.writeHead(204, { "Cache-Control": "no-store" });
    response.end();
    return;
  }

  sendJson(response, 404, { error: "Signaling endpoint not found." });
}

/** Stream repository files after rejecting private files and server paths.
 * @param {http.ServerResponse} response - HTTP output.
 * @param {URL} url - Requested static path. @returns {void} Completes asynchronously via fs callbacks.
 */
function serveStatic(response, url) {
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const segments = requestedPath.split("/").filter(Boolean);
  const fileName = segments[segments.length - 1] || "";
  if (segments.some((segment) => segment.startsWith("."))
    || fileName === "signaling-server.js"
    || fileName.includes(".local.")
    || fileName.startsWith("generate-")) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  // Resolve before containment checks, including encoded traversal decoded above.
  const filePath = path.resolve(repositoryRoot, `.${requestedPath}`);
  if (filePath !== repositoryRoot && !filePath.startsWith(`${repositoryRoot}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    const contentType = mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache"
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

// API requests and static pages share an origin; errors cannot rewrite sent headers.
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/signal/")) {
      await handleSignal(request, response, url);
    } else {
      serveStatic(response, url);
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: error.message || "Unexpected server error." });
    else response.destroy();
  }
});

// Opportunistic lookups also expire rooms; this sweep removes otherwise idle entries.
// unref lets this maintenance timer avoid keeping a stopped server process alive.
const cleanup = setInterval(() => {
  const cutoff = Date.now() - roomLifetimeMs;
  rooms.forEach((room, code) => {
    if (room.updatedAt < cutoff) rooms.delete(code);
  });
}, 10 * 60 * 1000);
cleanup.unref();

server.listen(port, () => {
  console.log(`Mapominoes signaling server listening at http://localhost:${port}`);
  console.log(`Open http://localhost:${port}/mapominoes/online.html?signaling=room`);
});

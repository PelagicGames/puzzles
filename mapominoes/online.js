// Copyright (C) 2026 Pelagic Games

(() => {
  "use strict";

  const countries = window.MapominoesCountries;
  const { searchCountries, validateMove, validChoices } = window.MapominoesRules;
  const countriesByCode = new Map(countries.map((country) => [country.code, country]));
  const allowedTimers = new Set([5, 10, 15, 30, 45, 60]);
  const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  const roomSignaling = new URLSearchParams(location.search).get("signaling") === "room";
  const heartbeatMs = 3000;
  const disconnectMs = 30000;
  const $ = (selector) => document.querySelector(selector);
  const screens = {
    menu: $("#menu-screen"),
    host: $("#host-screen"),
    join: $("#join-screen"),
    lobby: $("#lobby-screen"),
    game: $("#game-screen"),
    result: $("#result-screen")
  };

  let role = null;
  let myId = null;
  let myName = "";
  let hostConnection = null;
  let hostChannel = null;
  let pendingInvite = null;
  const peers = new Map();
  let state = null;
  let selectedCode = null;
  let matches = [];
  let activeMatchIndex = -1;
  let turnTimeout = null;
  let activityTimeout = null;
  let timerInterval = null;
  let heartbeatInterval = null;
  let peerSweepInterval = null;
  let signalPollTimer = null;
  let signalPollBusy = false;
  let roomCode = "";
  let hostSignalToken = "";
  let signalSequence = 0;
  let guestSignalPeer = null;
  let lastHostMessage = 0;
  let closingConnections = false;
  let migration = null;
  let incomingMigration = null;
  let mapData = null;
  let mapLoadError = null;
  const resumeTokens = new Map();
  const pendingRoomPeers = new Map();
  const retiredChannels = new WeakSet();

  if (window.MapominoesMapTopology) {
    const topology = window.MapominoesMapTopology;
    mapData = window.topojson.feature(topology, topology.objects.countries);
  } else {
    mapLoadError = new Error("The bundled world map data was not loaded.");
  }

  if (roomSignaling) {
    document.title = "Mapominoes Online · Room code";
    $("#online-mode-label").textContent = "Server-assisted WebRTC room";
    $("#menu-screen .muted").textContent = "A lightweight self-hosted signaling service introduces players. Gameplay remains peer-to-peer over WebRTC DataChannels.";
    $("#host-menu-button span").textContent = "Create one reusable room code, invite players, and run the game.";
    $("#join-menu-button span").textContent = "Join using the host's reusable room code. No answer code is needed.";
    const inviteLabel = document.querySelector("label[for='invite-input']");
    inviteLabel.textContent = "Room code from host";
    $("#invite-input").rows = 1;
    $("#invite-input").placeholder = "ABC234";
    $("#join-form button[type='submit']").textContent = "Join room";
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([key, element]) => {
      element.hidden = key !== name;
    });
  }

  function exposeError(message, error = null) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    $("#connection-error").textContent = `${message}${detail}`;
    $("#connection-error").hidden = false;
    if (error) console.error(message, error);
  }

  function clearError() {
    $("#connection-error").hidden = true;
    $("#connection-error").textContent = "";
  }

  function cleanName(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 40);
  }

  function randomId(prefix) {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return `${prefix}-${values[0].toString(36)}${values[1].toString(36)}`;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function encodeCode(value) {
    const compactValue = {
      v: 2,
      k: value.kind === "invite" ? "i" : "a",
      i: value.inviteId,
      d: value.description
    };
    const bytes = new TextEncoder().encode(JSON.stringify(compactValue));
    if (typeof CompressionStream !== "function") return bytesToBase64(bytes);
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    return `M2.${bytesToBase64(compressed).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  }

  async function decodeCode(text, expectedKind) {
    if (typeof text !== "string" || text.length > 100000) {
      throw new Error("The connection code is missing or too large.");
    }
    let value;
    try {
      const compactText = text.replace(/\s+/g, "");
      if (compactText.startsWith("M2.")) {
        if (typeof DecompressionStream !== "function") {
          throw new Error("This browser cannot expand compressed connection codes.");
        }
        const encoded = compactText.slice(3).replace(/-/g, "+").replace(/_/g, "/");
        const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
        const stream = new Blob([base64ToBytes(padded)]).stream()
          .pipeThrough(new DecompressionStream("gzip"));
        const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
        if (bytes.length > 100000) throw new Error("The expanded connection code is too large.");
        const compactValue = JSON.parse(new TextDecoder().decode(bytes));
        value = {
          version: compactValue.v,
          kind: compactValue.k === "i" ? "invite" : compactValue.k === "a" ? "answer" : "",
          inviteId: compactValue.i,
          description: compactValue.d
        };
      } else {
        const bytes = base64ToBytes(compactText);
        value = JSON.parse(new TextDecoder().decode(bytes));
      }
    } catch {
      throw new Error("That connection code is not valid.");
    }
    if (!value || ![1, 2].includes(value.version) || value.kind !== expectedKind
      || typeof value.inviteId !== "string" || value.inviteId.length > 80
      || !value.description || typeof value.description.sdp !== "string"
      || !["offer", "answer"].includes(value.description.type)) {
      throw new Error(`That is not a valid Mapominoes ${expectedKind} code.`);
    }
    return value;
  }

  function waitForIce(connection) {
    if (connection.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Timed out gathering connection candidates. Check your network and try again."));
      }, 15000);
      const changed = () => {
        if (connection.iceGatheringState !== "complete") return;
        cleanup();
        resolve();
      };
      function cleanup() {
        clearTimeout(timeout);
        connection.removeEventListener("icegatheringstatechange", changed);
      }
      connection.addEventListener("icegatheringstatechange", changed);
    });
  }

  async function signalRequest(pathname, options = {}) {
    const response = await fetch(pathname, {
      ...options,
      headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers
    });
    if (response.status === 204) return null;
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.error || `Signaling request failed with HTTP ${response.status}.`);
    return value;
  }

  async function createSignaledRoom() {
    const result = await signalRequest("/signal/rooms", { method: "POST" });
    roomCode = result.code;
    hostSignalToken = result.hostToken;
    signalSequence = 0;
    $("#room-code").textContent = roomCode;
    $("#room-code-area").hidden = false;
    scheduleHostSignalPoll(0);
  }

  function scheduleHostSignalPoll(delay = 800) {
    clearTimeout(signalPollTimer);
    if (!roomSignaling || role !== "host" || !roomCode) return;
    signalPollTimer = window.setTimeout(pollHostSignals, delay);
  }

  async function pollHostSignals() {
    if (signalPollBusy || role !== "host") return;
    signalPollBusy = true;
    try {
      const result = await signalRequest(
        `/signal/rooms/${roomCode}/events?token=${encodeURIComponent(hostSignalToken)}&after=${signalSequence}`
      );
      signalSequence = result.sequence;
      for (const event of result.events) {
        if (event.type === "offer") await answerSignaledPeer(event);
        else if (event.type === "cancel") {
          pendingRoomPeers.get(event.peerId)?.close();
          pendingRoomPeers.delete(event.peerId);
        }
      }
    } catch (error) {
      exposeError("The room signaling service could not be reached.", error);
    } finally {
      signalPollBusy = false;
      scheduleHostSignalPoll();
    }
  }

  async function answerSignaledPeer(event) {
    if (pendingRoomPeers.has(event.peerId)) return;
    const connection = new RTCPeerConnection(rtcConfig);
    pendingRoomPeers.set(event.peerId, connection);
    connection.addEventListener("datachannel", ({ channel }) => {
      setupHostChannel(connection, channel, event.peerId);
    }, { once: true });
    try {
      await connection.setRemoteDescription(event.description);
      await connection.setLocalDescription(await connection.createAnswer());
      await waitForIce(connection);
      await signalRequest(`/signal/rooms/${roomCode}/peers/${event.peerId}/answer`, {
        method: "POST",
        body: JSON.stringify({
          token: hostSignalToken,
          description: connection.localDescription.toJSON()
        })
      });
    } catch (error) {
      connection.close();
      pendingRoomPeers.delete(event.peerId);
      exposeError("Could not answer a player joining the room.", error);
    }
  }

  function roomResumeDetails() {
    if (!roomCode) return {};
    try {
      return JSON.parse(localStorage.getItem(`mapominoes-room-${roomCode}`)) || {};
    } catch {
      return {};
    }
  }

  async function joinSignaledRoom(event) {
    event.preventDefault();
    clearError();
    myName = cleanName($("#guest-name").value);
    roomCode = $("#invite-input").value.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (!myName || !/^[A-Z2-9]{6}$/.test(roomCode)) {
      exposeError("Enter your name and the six-character room code.");
      return;
    }
    closeConnections();
    role = "guest";
    $("#join-form button[type='submit']").disabled = true;
    try {
      const registration = await signalRequest(`/signal/rooms/${roomCode}/peers`, { method: "POST" });
      guestSignalPeer = registration;
      hostConnection = new RTCPeerConnection(rtcConfig);
      hostChannel = hostConnection.createDataChannel("mapominoes", { ordered: true });
      setupGuestChannel();
      await hostConnection.setLocalDescription(await hostConnection.createOffer());
      await waitForIce(hostConnection);
      await signalRequest(`/signal/rooms/${roomCode}/peers/${registration.peerId}/offer`, {
        method: "POST",
        body: JSON.stringify({
          token: registration.guestToken,
          description: hostConnection.localDescription.toJSON()
        })
      });
      $("#join-status").textContent = "Waiting for the host to establish the peer connection…";
      $("#answer-area").hidden = false;
      $("#answer-area label").hidden = true;
      $("#answer-output").hidden = true;
      $("#copy-answer").hidden = true;
      await pollSignaledAnswer();
    } catch (error) {
      hostConnection?.close();
      hostConnection = null;
      exposeError("Could not join that room.", error);
    } finally {
      $("#join-form button[type='submit']").disabled = false;
    }
  }

  async function pollSignaledAnswer() {
    const deadline = Date.now() + 30000;
    while (role === "guest" && guestSignalPeer && Date.now() < deadline) {
      const query = encodeURIComponent(guestSignalPeer.guestToken);
      const result = await signalRequest(
        `/signal/rooms/${roomCode}/peers/${guestSignalPeer.peerId}/answer?token=${query}`
      );
      if (result?.description) {
        await hostConnection.setRemoteDescription(result.description);
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    }
    throw new Error("The host did not answer the connection in time.");
  }

  async function copyText(element, button) {
    try {
      await navigator.clipboard.writeText(element.value);
      const old = button.textContent;
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = old; }, 1400);
    } catch (error) {
      element.focus();
      element.select();
      exposeError("Automatic copy was blocked. The code is selected; copy it manually.", error);
    }
  }

  function safeSend(channel, message) {
    if (channel?.readyState !== "open") return false;
    try {
      channel.send(JSON.stringify(message));
      return true;
    } catch (error) {
      exposeError("A game message could not be sent.", error);
      return false;
    }
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function parseMessage(event) {
    if (typeof event.data !== "string" || event.data.length > 200000) return null;
    try {
      const value = JSON.parse(event.data);
      return isPlainObject(value) && typeof value.type === "string" ? value : null;
    } catch {
      return null;
    }
  }

  function closeConnections() {
    closingConnections = true;
    if (migration) clearTimeout(migration.timeout);
    migration = null;
    discardIncomingMigration();
    clearTimeout(turnTimeout);
    clearInterval(timerInterval);
    clearInterval(heartbeatInterval);
    clearInterval(peerSweepInterval);
    clearTimeout(signalPollTimer);
    pendingInvite?.connection.close();
    pendingInvite = null;
    peers.forEach(({ channel, connection }) => {
      channel.close();
      connection.close();
    });
    peers.clear();
    pendingRoomPeers.forEach((connection) => connection.close());
    pendingRoomPeers.clear();
    hostChannel?.close();
    hostConnection?.close();
    hostChannel = null;
    hostConnection = null;
    guestSignalPeer = null;
    window.setTimeout(() => { closingConnections = false; }, 0);
  }

  function returnToMenu() {
    closeConnections();
    role = null;
    myId = null;
    state = null;
    roomCode = "";
    hostSignalToken = "";
    signalSequence = 0;
    clearError();
    $("#host-form").reset();
    $("#join-form").reset();
    $("#answer-area").hidden = true;
    showScreen("menu");
  }

  function initialLobby(mode, seconds) {
    return {
      version: 1,
      phase: "lobby",
      mode,
      turnSeconds: seconds,
      players: [{
        id: myId,
        name: myName,
        score: 0,
        connected: true,
        roundEligible: true,
        left: false
      }],
      hostId: myId,
      authorityEpoch: 1,
      round: 0,
      roundPlayerCount: 1,
      currentPlayer: 0,
      startPlayer: 0,
      path: [],
      lastResult: null,
      selections: {},
      activity: `${myName} created the lobby.`,
      deadline: null
    };
  }

  function publicState() {
    return JSON.parse(JSON.stringify(state));
  }

  function broadcastSnapshot() {
    if (role !== "host" || !state) return;
    const snapshot = { type: "snapshot", state: publicState() };
    peers.forEach(({ channel }) => safeSend(channel, snapshot));
    render();
  }

  function hostPlayerConnectedCount() {
    return state.players.filter((player) => player.connected && !player.left).length;
  }

  function startPeerSweep() {
    clearInterval(peerSweepInterval);
    peerSweepInterval = window.setInterval(() => {
      const cutoff = Date.now() - disconnectMs;
      peers.forEach((peer) => {
        if (peer.lastSeen < cutoff) disconnectPeer(peer);
      });
    }, heartbeatMs);
  }

  function setupHostChannel(connection, channel, inviteId) {
    const peer = { connection, channel, id: null, inviteId, lastSeen: Date.now() };
    channel.addEventListener("open", () => {
      $("#lobby-status").textContent = "Connected. Waiting for the player name…";
    });
    channel.addEventListener("message", (event) => handleHostMessage(peer, event));
    channel.addEventListener("close", () => disconnectPeer(peer));
    channel.addEventListener("error", () => disconnectPeer(peer));
    connection.addEventListener("connectionstatechange", () => {
      if (connection.connectionState === "failed") disconnectPeer(peer);
    });
  }

  function handleHostMessage(peer, event) {
    peer.lastSeen = Date.now();
    const message = parseMessage(event);
    if (!message) {
      safeSend(peer.channel, { type: "error", message: "Malformed message rejected." });
      return;
    }
    if (!peer.id) {
      if (message.type !== "hello") return;
      const name = cleanName(message.name);
      const resumedPlayer = typeof message.resumeId === "string"
        && resumeTokens.get(message.resumeId) === message.resumeToken
        ? state.players.find((candidate) => candidate.id === message.resumeId && !candidate.left)
        : null;
      if (!name || (!resumedPlayer && state.phase !== "lobby")
        || (!resumedPlayer && state.players.length >= 12)) {
        safeSend(peer.channel, { type: "error", message: "The host could not add this player." });
        peer.connection.close();
        return;
      }
      peer.id = resumedPlayer?.id || randomId("player");
      peers.set(peer.id, peer);
      const resumeToken = resumedPlayer ? resumeTokens.get(peer.id) : randomId("resume");
      resumeTokens.set(peer.id, resumeToken);
      if (resumedPlayer) {
        resumedPlayer.connected = true;
        resumedPlayer.name = name;
        state.activity = `${name} reconnected${resumedPlayer.roundEligible ? "" : " and will rejoin next round"}.`;
      } else {
        state.players.push({
          id: peer.id,
          name,
          score: 0,
          connected: true,
          roundEligible: state.phase === "lobby",
          left: false
        });
        state.activity = `${name} joined the lobby.`;
      }
      safeSend(peer.channel, { type: "welcome", playerId: peer.id, resumeToken });
      $("#invite-area").hidden = true;
      $("#answer-input").value = "";
      pendingInvite = null;
      pendingRoomPeers.delete(peer.inviteId);
      broadcastSnapshot();
      return;
    }
    if (message.type === "ping") {
      safeSend(peer.channel, { type: "pong", sentAt: message.sentAt });
      return;
    }
    if (message.type === "migration-relay") {
      relayMigrationSignal(peer, message);
      return;
    }
    if (message.type === "migration-ready") {
      commitHostMigration(peer, message);
      return;
    }
    if (message.type === "migration-failed") {
      abortHostMigration(`${state.players.find((player) => player.id === peer.id)?.name || "A player"} could not complete host transfer.`);
      return;
    }
    if (message.type === "action") {
      processAction(peer.id, message);
    }
  }

  function disconnectPeer(peer) {
    if (role !== "host" || closingConnections || !peer.id || !state) return;
    const player = state.players.find((candidate) => candidate.id === peer.id);
    peers.delete(peer.id);
    if (!player || !player.connected) return;
    player.connected = false;
    peer.channel.close();
    peer.connection.close();
    if (state.phase === "lobby" && (!roomSignaling || player.left)) {
      state.players = state.players.filter((candidate) => candidate.id !== peer.id);
      state.activity = `${player.name} left the lobby.`;
    } else {
      state.activity = `${player.name} disconnected. They will be skipped if their turn arrives.`;
      skipUnavailableCurrent(player);
    }
    broadcastSnapshot();
  }

  function skipUnavailableCurrent(player) {
    const index = state.players.indexOf(player);
    if (!["turn", "challenge"].includes(state.phase) || index !== state.currentPlayer) return;
    player.roundEligible = false;
    delete state.selections[player.id];
    clearTimeout(turnTimeout);
    const followingPlayer = nextPlayer(index);
    if (followingPlayer === null) {
      endRound({
        awardPoint: false,
        choicePath: state.path,
        loser: null,
        reason: "The round ended because no connected players remained."
      });
      return;
    }
    state.currentPlayer = followingPlayer;
    state.activity = `${player.name} is unavailable, so their turn was skipped.`;
    if (state.phase === "turn") beginDeadline();
    else state.deadline = null;
  }

  function leavePlayer(playerId) {
    if (playerId === myId) {
      returnToMenu();
      return;
    }
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) return;
    player.left = true;
    player.connected = false;
    player.roundEligible = false;
    const peer = peers.get(playerId);
    peers.delete(playerId);
    skipUnavailableCurrent(player);
    state.activity = `${player.name} left the game and will be skipped.`;
    broadcastSnapshot();
    window.setTimeout(() => {
      peer?.channel.close();
      peer?.connection.close();
    }, 50);
  }

  function validMigrationSignal(signal, type) {
    return isPlainObject(signal) && signal.type === type
      && typeof signal.sdp === "string" && signal.sdp.length <= 50000;
  }

  function startHostMigration(targetId) {
    if (role !== "host" || state.phase !== "lobby" || migration) return;
    const target = state.players.find((player) => player.id === targetId);
    if (!target?.connected || target.left || target.id === myId) return;
    pendingInvite?.connection.close();
    pendingInvite = null;
    $("#invite-area").hidden = true;
    const migrationId = randomId("migration");
    const expected = new Set(state.players
      .filter((player) => player.connected && !player.left
        && player.id !== myId && player.id !== targetId)
      .map((player) => player.id));
    migration = {
      id: migrationId,
      targetId,
      expected,
      timeout: window.setTimeout(() => abortHostMigration("Host transfer timed out."), 30000)
    };
    state.activity = `Preparing to transfer hosting to ${target.name}…`;
    safeSend(peers.get(targetId)?.channel, {
      type: "migration-start",
      migrationId,
      targetId,
      oldHostId: myId,
      peerIds: [...expected],
      state: publicState(),
      roomCode: roomSignaling ? roomCode : "",
      hostSignalToken: roomSignaling ? hostSignalToken : "",
      signalSequence: roomSignaling ? signalSequence : 0,
      resumeTokens: roomSignaling ? Object.fromEntries(resumeTokens) : {}
    });
    expected.forEach((playerId) => {
      safeSend(peers.get(playerId)?.channel, {
        type: "migration-prepare",
        migrationId,
        targetId,
        oldHostId: myId
      });
    });
    render();
  }

  function prepareIncomingMigration(message) {
    if (role !== "guest" || incomingMigration
      || typeof message.migrationId !== "string"
      || typeof message.targetId !== "string"
      || typeof message.oldHostId !== "string") return;
    incomingMigration = {
      id: message.migrationId,
      oldHostId: message.oldHostId,
      targetId: message.targetId,
      expected: new Set(),
      connections: new Map(),
      channels: new Map(),
      ready: new Set()
    };
  }

  async function beginIncomingMigration(message) {
    if (role !== "guest" || message.targetId !== myId || incomingMigration
      || !validSnapshot(message.state) || !Array.isArray(message.peerIds)
      || message.peerIds.some((id) => typeof id !== "string")) return;
    incomingMigration = {
      id: message.migrationId,
      oldHostId: message.oldHostId,
      targetId: myId,
      expected: new Set(message.peerIds),
      connections: new Map(),
      channels: new Map(),
      ready: new Set(),
      roomCode: message.roomCode,
      hostSignalToken: message.hostSignalToken,
      signalSequence: message.signalSequence
    };
    if (roomSignaling && isPlainObject(message.resumeTokens)) {
      Object.entries(message.resumeTokens).forEach(([playerId, token]) => {
        if (typeof playerId === "string" && typeof token === "string") {
          resumeTokens.set(playerId, token);
        }
      });
    }
    state.activity = "Preparing new peer connections for host transfer…";
    render();
    try {
      await Promise.all(message.peerIds.map(createMigrationOffer));
      reportMigrationReady();
    } catch (error) {
      safeSend(hostChannel, {
        type: "migration-failed",
        migrationId: incomingMigration.id,
        message: error.message
      });
      discardIncomingMigration();
    }
  }

  async function createMigrationOffer(peerId) {
    const connection = new RTCPeerConnection(rtcConfig);
    const channel = connection.createDataChannel("mapominoes-migrated", { ordered: true });
    incomingMigration.connections.set(peerId, connection);
    incomingMigration.channels.set(peerId, channel);
    channel.addEventListener("open", () => {
      incomingMigration?.ready.add(peerId);
      reportMigrationReady();
    });
    await connection.setLocalDescription(await connection.createOffer());
    await waitForIce(connection);
    safeSend(hostChannel, {
      type: "migration-relay",
      migrationId: incomingMigration.id,
      to: peerId,
      signal: connection.localDescription.toJSON()
    });
  }

  async function receiveMigrationRelay(message) {
    if (!incomingMigration || message.migrationId !== incomingMigration.id) return;
    if (myId === incomingMigration.targetId) {
      if (!validMigrationSignal(message.signal, "answer")) return;
      const connection = incomingMigration.connections.get(message.from);
      if (connection) await connection.setRemoteDescription(message.signal);
      return;
    }
    if (message.from !== incomingMigration.targetId
      || !validMigrationSignal(message.signal, "offer")) return;
    const connection = new RTCPeerConnection(rtcConfig);
    incomingMigration.connections.set(message.from, connection);
    connection.addEventListener("datachannel", ({ channel }) => {
      incomingMigration.channels.set(message.from, channel);
    }, { once: true });
    await connection.setRemoteDescription(message.signal);
    await connection.setLocalDescription(await connection.createAnswer());
    await waitForIce(connection);
    safeSend(hostChannel, {
      type: "migration-relay",
      migrationId: incomingMigration.id,
      to: incomingMigration.targetId,
      signal: connection.localDescription.toJSON()
    });
  }

  function reportMigrationReady() {
    if (!incomingMigration || myId !== incomingMigration.targetId
      || incomingMigration.ready.size !== incomingMigration.expected.size) return;
    safeSend(hostChannel, {
      type: "migration-ready",
      migrationId: incomingMigration.id
    });
  }

  function relayMigrationSignal(peer, message) {
    if (!migration || message.migrationId !== migration.id
      || !validMigrationSignal(message.signal, peer.id === migration.targetId ? "offer" : "answer")) return;
    const fromTarget = peer.id === migration.targetId && migration.expected.has(message.to);
    const toTarget = migration.expected.has(peer.id) && message.to === migration.targetId;
    if (!fromTarget && !toTarget) return;
    safeSend(peers.get(message.to)?.channel, {
      type: "migration-relay",
      migrationId: migration.id,
      from: peer.id,
      signal: message.signal
    });
  }

  function commitHostMigration(peer, message) {
    if (!migration || peer.id !== migration.targetId
      || message.migrationId !== migration.id) return;
    clearTimeout(migration.timeout);
    state.hostId = migration.targetId;
    state.authorityEpoch += 1;
    state.activity = `${playerName(state.players.findIndex((player) => player.id === migration.targetId))} is now the host.`;
    const commit = {
      type: "migration-commit",
      migrationId: migration.id,
      targetId: migration.targetId,
      oldHostId: myId,
      state: publicState()
    };
    peers.forEach(({ channel }) => safeSend(channel, commit));
    applyMigrationCommit(commit);
  }

  function abortHostMigration(reason) {
    if (!migration) return;
    const message = { type: "migration-abort", migrationId: migration.id, reason };
    peers.forEach(({ channel }) => safeSend(channel, message));
    clearTimeout(migration.timeout);
    migration = null;
    state.activity = reason;
    render();
  }

  function discardIncomingMigration() {
    incomingMigration?.connections.forEach((connection) => connection.close());
    incomingMigration = null;
  }

  function applyMigrationCommit(message) {
    if (!validSnapshot(message.state) || message.state.hostId !== message.targetId) return;
    const oldRole = role;
    const oldHostConnection = hostConnection;
    const oldHostChannel = hostChannel;
    state = message.state;
    if (myId === message.targetId) {
      role = "host";
      clearInterval(heartbeatInterval);
      const migrated = incomingMigration;
      peers.clear();
      if (oldHostConnection && oldHostChannel) {
        const oldPeer = {
          connection: oldHostConnection,
          channel: oldHostChannel,
          id: message.oldHostId,
          inviteId: null,
          lastSeen: Date.now()
        };
        oldHostChannel.addEventListener("message", (event) => handleHostMessage(oldPeer, event));
        oldHostChannel.addEventListener("close", () => disconnectPeer(oldPeer));
        peers.set(oldPeer.id, oldPeer);
      }
      migrated?.connections.forEach((connection, playerId) => {
        const channel = migrated.channels.get(playerId);
        if (!channel) return;
        const peer = { connection, channel, id: playerId, inviteId: null, lastSeen: Date.now() };
        channel.addEventListener("message", (event) => handleHostMessage(peer, event));
        channel.addEventListener("close", () => disconnectPeer(peer));
        peers.set(playerId, peer);
      });
      hostConnection = null;
      hostChannel = null;
      if (roomSignaling && migrated) {
        roomCode = migrated.roomCode;
        hostSignalToken = migrated.hostSignalToken;
        signalSequence = migrated.signalSequence;
        scheduleHostSignalPoll(0);
      }
      incomingMigration = null;
      migration = null;
      startPeerSweep();
      render();
      window.setTimeout(broadcastSnapshot, 300);
      return;
    }

    let replacementConnection;
    let replacementChannel;
    if (oldRole === "host") {
      const targetPeer = peers.get(message.targetId);
      replacementConnection = targetPeer?.connection;
      replacementChannel = targetPeer?.channel;
      peers.forEach((peer, playerId) => {
        if (playerId !== message.targetId) {
          peer.channel.close();
          peer.connection.close();
        }
      });
      peers.clear();
      clearInterval(peerSweepInterval);
      clearTimeout(signalPollTimer);
      migration = null;
    } else {
      replacementConnection = incomingMigration?.connections.get(message.targetId);
      replacementChannel = incomingMigration?.channels.get(message.targetId);
      if (oldHostChannel) retiredChannels.add(oldHostChannel);
    }
    if (!replacementConnection || !replacementChannel) return;
    role = "guest";
    hostConnection = replacementConnection;
    hostChannel = replacementChannel;
    incomingMigration = null;
    setupGuestChannel(false);
    render();
    if (oldRole !== "host") {
      window.setTimeout(() => {
        oldHostChannel?.close();
        oldHostConnection?.close();
      }, 500);
    }
  }

  async function createInvite() {
    clearError();
    if (pendingInvite) pendingInvite.connection.close();
    const inviteId = randomId("invite");
    const connection = new RTCPeerConnection(rtcConfig);
    const channel = connection.createDataChannel("mapominoes", { ordered: true });
    setupHostChannel(connection, channel, inviteId);
    pendingInvite = { connection, channel, inviteId };
    $("#create-invite").disabled = true;
    $("#lobby-status").textContent = "Gathering a direct connection invite…";
    try {
      await connection.setLocalDescription(await connection.createOffer());
      await waitForIce(connection);
      $("#invite-output").value = await encodeCode({
        version: 2,
        kind: "invite",
        inviteId,
        description: connection.localDescription.toJSON()
      });
      $("#invite-area").hidden = false;
      $("#lobby-status").textContent = "Send the invite, then paste that same player's answer.";
    } catch (error) {
      connection.close();
      pendingInvite = null;
      exposeError("Could not create an invite.", error);
    } finally {
      $("#create-invite").disabled = false;
    }
  }

  async function acceptAnswer() {
    clearError();
    if (!pendingInvite) {
      exposeError("Create a fresh invite before accepting an answer.");
      return;
    }
    try {
      const code = await decodeCode($("#answer-input").value, "answer");
      if (code.inviteId !== pendingInvite.inviteId
        || code.description.type !== "answer") {
        throw new Error("This answer belongs to a different invite.");
      }
      await pendingInvite.connection.setRemoteDescription(code.description);
      $("#accept-answer").disabled = true;
      $("#lobby-status").textContent = "Answer accepted. Waiting for the player's channel to open…";
    } catch (error) {
      exposeError("Could not accept that answer.", error);
    } finally {
      $("#accept-answer").disabled = false;
    }
  }

  async function joinFromInvite(event) {
    event.preventDefault();
    clearError();
    myName = cleanName($("#guest-name").value);
    if (!myName) {
      $("#guest-name").reportValidity();
      return;
    }
    closeConnections();
    role = "guest";
    myId = null;
    $("#join-form button[type='submit']").disabled = true;
    try {
      const code = await decodeCode($("#invite-input").value, "invite");
      if (code.description.type !== "offer") throw new Error("The invite does not contain an offer.");
      hostConnection = new RTCPeerConnection(rtcConfig);
      hostConnection.addEventListener("datachannel", (channelEvent) => {
        hostChannel = channelEvent.channel;
        setupGuestChannel();
      });
      hostConnection.addEventListener("connectionstatechange", () => {
        if (["failed", "disconnected"].includes(hostConnection.connectionState)) {
          exposeError("The host connection was lost. Direct WebRTC may be blocked by this network.");
        }
      });
      await hostConnection.setRemoteDescription(code.description);
      await hostConnection.setLocalDescription(await hostConnection.createAnswer());
      await waitForIce(hostConnection);
      $("#answer-output").value = await encodeCode({
        version: 2,
        kind: "answer",
        inviteId: code.inviteId,
        description: hostConnection.localDescription.toJSON()
      });
      $("#answer-area").hidden = false;
      $("#join-status").textContent = "Send this answer to the host. Waiting for them to accept it…";
    } catch (error) {
      hostConnection?.close();
      hostConnection = null;
      exposeError("Could not create an answer.", error);
    } finally {
      $("#join-form button[type='submit']").disabled = false;
    }
  }

  function setupGuestChannel(sendHello = true) {
    const channel = hostChannel;
    const opened = () => {
      if (sendHello) {
        const resume = roomSignaling ? roomResumeDetails() : {};
        safeSend(hostChannel, {
          type: "hello",
          name: myName,
          resumeId: resume.playerId,
          resumeToken: resume.resumeToken
        });
      }
      lastHostMessage = Date.now();
      clearInterval(heartbeatInterval);
      heartbeatInterval = window.setInterval(() => {
        safeSend(hostChannel, { type: "ping", sentAt: Date.now() });
        if (Date.now() - lastHostMessage > disconnectMs) {
          exposeError("The host has not responded. Rejoin with the room code if the connection does not recover.");
        }
      }, heartbeatMs);
      $("#join-status").textContent = "Connected. Joining the lobby…";
    };
    if (channel.readyState === "open") opened();
    else channel.addEventListener("open", opened, { once: true });
    channel.addEventListener("message", handleGuestMessage);
    channel.addEventListener("close", () => {
      if (!closingConnections && role === "guest" && channel === hostChannel
        && !retiredChannels.has(channel)) {
        exposeError("The host connection closed. Rejoin with the room code or return to the multiplayer menu.");
      }
    });
    channel.addEventListener("error", () => {
      if (role === "guest" && channel === hostChannel && !retiredChannels.has(channel)) {
        exposeError("The host data channel reported an error.");
      }
    });
  }

  function validSnapshot(snapshot) {
    if (!isPlainObject(snapshot) || snapshot.version !== 1
      || !["lobby", "turn", "challenge", "result"].includes(snapshot.phase)
      || !["autocheck", "challenge"].includes(snapshot.mode)
      || !allowedTimers.has(snapshot.turnSeconds)
      || !Array.isArray(snapshot.players) || snapshot.players.length < 1
      || snapshot.players.length > 12 || !Array.isArray(snapshot.path)
      || typeof snapshot.hostId !== "string"
      || !Number.isInteger(snapshot.authorityEpoch)
      || snapshot.authorityEpoch < 1
      || snapshot.path.length > countries.length
      || !Number.isInteger(snapshot.roundPlayerCount)
      || snapshot.roundPlayerCount < 1
      || !Number.isInteger(snapshot.currentPlayer)
      || snapshot.currentPlayer < 0
      || snapshot.currentPlayer >= snapshot.players.length
      || !isPlainObject(snapshot.selections)) return false;
    return snapshot.players.some((player) => player.id === snapshot.hostId)
      && snapshot.players.every((player) => isPlainObject(player)
      && typeof player.id === "string" && typeof player.name === "string"
      && player.id.length <= 80 && player.name.length <= 40
      && Number.isInteger(player.score) && player.score >= 0
      && typeof player.connected === "boolean"
      && typeof player.roundEligible === "boolean"
      && typeof player.left === "boolean")
      && snapshot.path.every((entry) => isPlainObject(entry)
        && countriesByCode.has(entry.code) && Number.isInteger(entry.player)
        && entry.player >= 0 && entry.player < snapshot.players.length
        && typeof entry.valid === "boolean" && Array.isArray(entry.reasons)
        && entry.reasons.length < 10
        && entry.reasons.every((reason) => typeof reason === "string" && reason.length < 500))
      && (snapshot.phase !== "result"
        || (isPlainObject(snapshot.lastResult)
          && Array.isArray(snapshot.lastResult.choices)
          && snapshot.lastResult.choices.every((code) => countriesByCode.has(code))
          && Number.isInteger(snapshot.lastResult.restartPlayer)
          && snapshot.lastResult.restartPlayer >= 0
          && snapshot.lastResult.restartPlayer < snapshot.players.length
          && (snapshot.lastResult.loser === null
            || (Number.isInteger(snapshot.lastResult.loser)
              && snapshot.lastResult.loser >= 0
              && snapshot.lastResult.loser < snapshot.players.length))
          && typeof snapshot.lastResult.reason === "string"));
  }

  function handleGuestMessage(event) {
    lastHostMessage = Date.now();
    const message = parseMessage(event);
    if (!message) {
      exposeError("The host sent a malformed message; it was ignored.");
      return;
    }
    if (message.type === "pong") return;
    if (message.type === "migration-prepare") {
      prepareIncomingMigration(message);
      return;
    }
    if (message.type === "migration-start") {
      beginIncomingMigration(message).catch((error) => {
        exposeError("Could not prepare host transfer.", error);
      });
      return;
    }
    if (message.type === "migration-relay") {
      receiveMigrationRelay(message).catch((error) => {
        safeSend(hostChannel, {
          type: "migration-failed",
          migrationId: message.migrationId,
          message: error.message
        });
      });
      return;
    }
    if (message.type === "migration-commit") {
      applyMigrationCommit(message);
      return;
    }
    if (message.type === "migration-abort") {
      discardIncomingMigration();
      if (state) {
        state.activity = typeof message.reason === "string" ? message.reason : "Host transfer was cancelled.";
        render();
      }
      return;
    }
    if (message.type === "welcome" && typeof message.playerId === "string") {
      myId = message.playerId;
      if (roomSignaling && typeof message.resumeToken === "string") {
        localStorage.setItem(`mapominoes-room-${roomCode}`, JSON.stringify({
          playerId: myId,
          resumeToken: message.resumeToken,
          name: myName
        }));
      }
      return;
    }
    if (message.type === "snapshot") {
      if (!validSnapshot(message.state)) {
        exposeError("The host sent an invalid game snapshot; it was ignored.");
        return;
      }
      state = message.state;
      render();
    } else if (message.type === "error" && typeof message.message === "string") {
      exposeError(message.message.slice(0, 300));
    }
  }

  function sendAction(action, payload = {}) {
    if (role === "host") processAction(myId, { type: "action", action, ...payload });
    else safeSend(hostChannel, { type: "action", action, ...payload });
  }

  function currentPlayer() {
    return state?.players[state.currentPlayer] || null;
  }

  function isCurrent(id) {
    return currentPlayer()?.id === id;
  }

  function processAction(playerId, message) {
    if (role !== "host" || !state || typeof message.action !== "string") return;
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player?.connected) return;
    switch (message.action) {
      case "select":
        if (state.phase !== "turn" || !isCurrent(playerId)) return;
        if (message.code !== null && !countriesByCode.has(message.code)) return;
        state.selections[playerId] = message.code;
        state.activity = message.code
          ? `${player.name} selected ${countriesByCode.get(message.code).name}.`
          : `${player.name} is choosing a country.`;
        broadcastSnapshot();
        break;
      case "submit":
        if (state.phase !== "turn" || !isCurrent(playerId)
          || !countriesByCode.has(message.code)
          || state.selections[playerId] !== message.code) return;
        commitCountry(message.code, false);
        break;
      case "concede":
        if (state.phase === "turn" && isCurrent(playerId)) concede();
        break;
      case "accept":
        if (state.phase !== "challenge" || !isCurrent(playerId)) return;
        state.phase = "turn";
        state.activity = `${player.name} accepted the prior answer.`;
        beginDeadline();
        broadcastSnapshot();
        break;
      case "challenge":
        if (state.phase === "challenge" && isCurrent(playerId)) challengeMove();
        break;
      case "restart":
        if (playerId === myId && state.phase === "result") startRound(state.lastResult.restartPlayer);
        break;
      case "lobby":
        if (playerId === myId && state.phase !== "lobby") returnGameToLobby();
        break;
      case "leave":
        leavePlayer(playerId);
        break;
      default:
        safeSend(peers.get(playerId)?.channel, { type: "error", message: "Unknown game action rejected." });
    }
  }

  function nextPlayer(index) {
    for (let offset = 1; offset <= state.players.length; offset += 1) {
      const candidateIndex = (index + offset) % state.players.length;
      const candidate = state.players[candidateIndex];
      if (candidate.left || !candidate.connected) {
        candidate.roundEligible = false;
        continue;
      }
      if (candidate.roundEligible) return candidateIndex;
    }
    return null;
  }

  function connectedStarter(preferredIndex) {
    for (let offset = 0; offset < state.players.length; offset += 1) {
      const index = (preferredIndex + offset) % state.players.length;
      const player = state.players[index];
      if (player.connected && !player.left) return index;
    }
    return null;
  }

  function beginDeadline() {
    clearTimeout(turnTimeout);
    state.deadline = Date.now() + state.turnSeconds * 1000;
    turnTimeout = window.setTimeout(expireTurn, state.turnSeconds * 1000 + 30);
  }

  function expireTurn() {
    if (role !== "host" || state.phase !== "turn") return;
    const player = currentPlayer();
    const code = state.selections[player.id];
    if (countriesByCode.has(code)) commitCountry(code, true);
    else concede(true);
  }

  function startGame() {
    if (hostPlayerConnectedCount() < 2) return;
    if (state.round === 0) state.players.forEach((player) => { player.score = 0; });
    const preferred = state.nextStarterId
      ? Math.max(0, state.players.findIndex((player) => player.id === state.nextStarterId))
      : 0;
    const starter = connectedStarter(preferred);
    if (starter !== null) startRound(starter);
  }

  function startRound(startPlayer) {
    const starter = connectedStarter(startPlayer);
    if (starter === null) return;
    state.round += 1;
    state.players.forEach((player) => {
      player.roundEligible = player.connected && !player.left;
    });
    state.roundPlayerCount = state.players.filter((player) => player.roundEligible).length;
    state.currentPlayer = starter;
    state.startPlayer = starter;
    state.path = [];
    state.phase = "turn";
    state.lastResult = null;
    state.selections = {};
    state.activity = `${currentPlayer().name} chooses the starting country.`;
    beginDeadline();
    broadcastSnapshot();
  }

  function commitCountry(code, timedOut) {
    clearTimeout(turnTimeout);
    const playerIndex = state.currentPlayer;
    const player = currentPlayer();
    const previousPath = [...state.path];
    const validation = validateMove(countries, previousPath, code, state.roundPlayerCount);
    state.path.push({
      challenged: false,
      code,
      player: playerIndex,
      reasons: validation.reasons,
      valid: validation.valid
    });
    state.activity = `${player.name} submitted ${countriesByCode.get(code).name}${timedOut ? " as time expired" : ""}.`;
    delete state.selections[player.id];
    if (state.mode === "autocheck" && !validation.valid) {
      endRound({
        choicePath: previousPath,
        loser: playerIndex,
        reason: validation.reasons.join(" ")
      });
      return;
    }
    const followingPlayer = nextPlayer(playerIndex);
    if (followingPlayer === null) {
      endRound({
        awardPoint: false,
        choicePath: state.path,
        loser: null,
        reason: "The round ended because no connected players remained."
      });
      return;
    }
    state.currentPlayer = followingPlayer;
    state.phase = state.mode === "challenge" ? "challenge" : "turn";
    if (state.phase === "turn") beginDeadline();
    else state.deadline = null;
    broadcastSnapshot();
  }

  function challengeMove() {
    clearTimeout(turnTimeout);
    const challenger = currentPlayer();
    const entry = state.path[state.path.length - 1];
    if (!entry) return;
    entry.challenged = true;
    state.activity = `${challenger.name} challenged the prior answer.`;
    if (!entry.valid) {
      endRound({
        choicePath: state.path.slice(0, -1),
        loser: entry.player,
        reason: `The challenge succeeded. ${entry.reasons.join(" ")}`
      });
    } else {
      endRound({
        choicePath: state.path,
        loser: state.currentPlayer,
        reason: `The challenge failed: ${countriesByCode.get(entry.code).name} was a valid choice.`
      });
    }
  }

  function concede(timedOut = false) {
    clearTimeout(turnTimeout);
    const choices = validChoices(countries, state.path, state.roundPlayerCount);
    const player = currentPlayer();
    if (choices.length === 0) {
      endRound({
        awardPoint: false,
        choices,
        choicePath: state.path,
        loser: null,
        noLegalMoves: true,
        reason: timedOut
          ? "Time expired, but there were no legal countries left."
          : "The chain ended because there were no legal countries left."
      });
      return;
    }
    endRound({
      choices,
      choicePath: state.path,
      loser: state.currentPlayer,
      reason: timedOut
        ? `${player.name} ran out of time without a selected country.`
        : `${player.name} could not continue the chain.`
    });
  }

  function endRound({
    awardPoint = true,
    choices = null,
    choicePath,
    loser,
    noLegalMoves = false,
    reason
  }) {
    const availableChoices = choices || validChoices(countries, choicePath, state.roundPlayerCount);
    if (awardPoint && loser !== null) state.players[loser].score += 1;
    const restartPlayer = state.currentPlayer;
    state.lastResult = {
      choices: availableChoices.map((country) => country.code),
      loser,
      noLegalMoves,
      reason,
      restartPlayer
    };
    state.phase = "result";
    state.deadline = null;
    state.selections = {};
    broadcastSnapshot();
  }

  function returnGameToLobby() {
    clearTimeout(turnTimeout);
    state.nextStarterId = state.players[state.lastResult?.restartPlayer]?.id || null;
    state.players = state.players.filter((player) => !player.left);
    state.phase = "lobby";
    state.currentPlayer = Math.max(0, state.players.findIndex((player) => player.id === state.nextStarterId));
    state.startPlayer = state.currentPlayer;
    state.path = [];
    state.lastResult = null;
    state.deadline = null;
    state.selections = {};
    state.activity = "The host opened the lobby between rounds. More players may join.";
    broadcastSnapshot();
  }

  function render() {
    if (!state) return;
    if (state.phase === "lobby") renderLobby();
    else if (state.phase === "result") renderResult();
    else renderGame();
  }

  function renderLobby() {
    showScreen("lobby");
    const list = $("#lobby-players");
    list.replaceChildren();
    state.players.forEach((player) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${player.name}${player.id === state.hostId ? " · Host" : ""}${player.connected ? "" : " · Disconnected"}`;
      item.append(label);
      if (role === "host" && player.id !== myId && player.connected && !player.left) {
        const transfer = document.createElement("button");
        transfer.type = "button";
        transfer.className = "quiet-button host-transfer-button";
        transfer.textContent = "Make host";
        transfer.disabled = Boolean(migration);
        transfer.addEventListener("click", () => startHostMigration(player.id));
        item.append(transfer);
      }
      item.title = player.name;
      list.append(item);
    });
    $("#host-invite-tools").hidden = role !== "host";
    $("#create-invite").hidden = roomSignaling;
    $("#room-code-area").hidden = !roomSignaling || role !== "host" || !roomCode;
    $("#create-invite").disabled = Boolean(migration);
    $("#start-game").disabled = role !== "host" || hostPlayerConnectedCount() < 2 || Boolean(migration);
    $("#lobby-status").textContent = role === "host"
      ? migration
        ? `Transferring hosting to ${state.players.find((player) => player.id === migration.targetId)?.name}…`
        : `${hostPlayerConnectedCount()} connected · ${state.mode === "challenge" ? "Challenge" : "Autocheck"} · ${state.turnSeconds}s turns`
      : `${state.activity} Waiting for the host to start.`;
  }

  function playerName(index) {
    return state.players[index]?.name || "Unknown player";
  }

  function renderScores() {
    const list = $("#scoreboard");
    list.replaceChildren();
    state.players.forEach((player, index) => {
      const item = document.createElement("li");
      item.classList.toggle("is-current", index === state.currentPlayer);
      const name = document.createElement("span");
      name.textContent = `${player.name}${player.connected ? "" : " · Offline"}${player.roundEligible ? "" : " · Next round"}`;
      name.title = player.name;
      const score = document.createElement("strong");
      score.textContent = String(player.score);
      item.append(name, score);
      list.append(item);
    });
  }

  function renderUpcoming() {
    const list = $("#upcoming-list");
    list.replaceChildren();
    let position = 1;
    for (let offset = 1; offset <= state.players.length; offset += 1) {
      const index = (state.currentPlayer + offset) % state.players.length;
      const player = state.players[index];
      if (!player.connected || !player.roundEligible || player.left) continue;
      const item = document.createElement("li");
      item.textContent = `${position}. ${playerName(index)}`;
      item.title = playerName(index);
      list.append(item);
      position += 1;
    }
  }

  function renderGame() {
    showScreen("game");
    const player = currentPlayer();
    const mine = player?.id === myId;
    $("#round-label").textContent = `Round ${state.round} · ${state.mode === "challenge" ? "Challenge" : "Autocheck"}`;
    $("#turn-heading").textContent = `${player.name}'s turn`;
    $("#turn-heading").title = player.name;
    $("#activity-line").textContent = state.activity || "";
    $("#game-return-lobby").hidden = role !== "host";
    $("#leave-game").textContent = role === "host" ? "End hosted game" : "Leave game";
    const previous = state.path.length ? countriesByCode.get(state.path[state.path.length - 1].code) : null;
    $("#last-country").textContent = previous?.name || "Choose the starting country";
    const remaining = Math.max(0, state.roundPlayerCount - state.path.length);
    $("#round-guidance").textContent = remaining
      ? `Keep a route open for ${remaining} more ${remaining === 1 ? "player" : "players"} in the first circuit.`
      : "Choose a new neighbour and remember every country already named.";
    renderScores();
    renderUpcoming();
    $("#entry-panel").hidden = state.phase !== "turn";
    $("#challenge-panel").hidden = state.phase !== "challenge";
    if (state.phase === "turn") renderEntry(mine);
    else renderChallenge(mine);
    startTimerDisplay();
  }

  function renderEntry(mine) {
    $("#country-form").hidden = !mine;
    $("#waiting-copy").hidden = mine;
    $("#waiting-copy").textContent = `Waiting for ${currentPlayer().name} to submit a country…`;
    if (!mine) {
      clearSelectionUi(false);
      return;
    }
    const hostSelection = state.selections[myId];
    if (hostSelection && hostSelection !== selectedCode) {
      selectedCode = hostSelection;
      $("#country-search").value = countriesByCode.get(hostSelection)?.name || "";
      $("#selected-country-name").textContent = countriesByCode.get(hostSelection)?.name || "";
      $("#selected-country").hidden = false;
      $("#confirm-country").disabled = false;
    }
  }

  function renderChallenge(mine) {
    clearSelectionUi(false);
    const entry = state.path[state.path.length - 1];
    const country = countriesByCode.get(entry.code);
    $("#challenge-heading").textContent = `${currentPlayer().name}, accept or challenge?`;
    $("#challenge-copy").textContent = `${playerName(entry.player)} named ${country.name}. Challenge if it was previously named, does not border the last country, or blocked the first circuit. A false challenge loses the round.`;
    $("#challenge-actions").hidden = !mine;
    $("#challenge-waiting").hidden = mine;
    $("#challenge-waiting").textContent = `Waiting for ${currentPlayer().name}'s decision…`;
  }

  function startTimerDisplay() {
    clearInterval(timerInterval);
    const timer = $("#timer");
    function update() {
      if (!state?.deadline || state.phase !== "turn") {
        timer.textContent = "—";
        timer.classList.remove("is-urgent");
        return;
      }
      const remaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
      timer.textContent = String(remaining);
      timer.classList.toggle("is-urgent", remaining <= 5);
    }
    update();
    timerInterval = window.setInterval(update, 200);
  }

  function clearSelectionUi(send = true) {
    selectedCode = null;
    matches = [];
    activeMatchIndex = -1;
    $("#country-search").value = "";
    $("#country-results").replaceChildren();
    $("#country-results").hidden = true;
    $("#country-search").setAttribute("aria-expanded", "false");
    $("#selected-country").hidden = true;
    $("#confirm-country").disabled = true;
    $("#form-message").textContent = "";
    if (send && state?.phase === "turn" && isCurrent(myId)) sendAction("select", { code: null });
  }

  function renderMatches() {
    const list = $("#country-results");
    list.replaceChildren();
    matches.forEach((match, index) => {
      const item = document.createElement("li");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(index === activeMatchIndex));
      const button = document.createElement("button");
      button.type = "button";
      button.classList.toggle("is-active", index === activeMatchIndex);
      const name = document.createElement("strong");
      name.textContent = match.country.name;
      button.append(name);
      if (match.alias) {
        const alias = document.createElement("small");
        alias.textContent = `(${match.alias})`;
        button.append(alias);
      }
      button.addEventListener("pointerdown", (event) => event.preventDefault());
      button.addEventListener("click", () => chooseMatch(index));
      item.append(button);
      list.append(item);
    });
    list.hidden = matches.length === 0;
    $("#country-search").setAttribute("aria-expanded", String(matches.length > 0));
  }

  function chooseMatch(index) {
    const match = matches[index];
    if (!match || state?.phase !== "turn" || !isCurrent(myId)) return;
    selectedCode = match.country.code;
    $("#country-search").value = match.country.name;
    $("#selected-country-name").textContent = match.country.name;
    $("#selected-country").hidden = false;
    $("#confirm-country").disabled = false;
    $("#country-results").hidden = true;
    $("#country-search").setAttribute("aria-expanded", "false");
    sendAction("select", { code: selectedCode });
  }

  function renderResult() {
    showScreen("result");
    clearInterval(timerInterval);
    const result = state.lastResult;
    $("#result-heading").textContent = result.noLegalMoves
      ? `Round ${state.round} complete — no legal moves`
      : `${playerName(result.loser)} loses round ${state.round}`;
    $("#result-reason").textContent = result.reason;
    const choiceNames = result.choices.map((code) => countriesByCode.get(code)?.name).filter(Boolean);
    $("#choice-summary").textContent = choiceNames.length
      ? `${choiceNames.length} valid ${choiceNames.length === 1 ? "choice was" : "choices were"} available: ${choiceNames.join(", ")}.`
      : "There were no valid unused bordering countries available.";
    const route = $("#route-list");
    route.replaceChildren();
    state.path.forEach((entry, index) => {
      const item = document.createElement("li");
      item.classList.toggle("is-invalid", !entry.valid);
      const number = document.createElement("span");
      number.className = "route-number";
      number.textContent = String(index + 1);
      const name = document.createElement("strong");
      name.textContent = countriesByCode.get(entry.code).name;
      const note = document.createElement("span");
      note.className = "route-note";
      note.textContent = entry.valid ? playerName(entry.player) : `Invalid · ${entry.reasons.join(" ")}`;
      item.append(number, name, note);
      route.append(item);
    });
    $("#result-host-actions").hidden = role !== "host";
    $("#result-waiting").hidden = role === "host";
    const nextStarter = connectedStarter(result.restartPlayer);
    $("#restart-round").textContent = nextStarter === null
      ? "Waiting for players to reconnect"
      : `Play again — ${playerName(nextStarter)} starts`;
    $("#restart-round").disabled = nextStarter === null;
    renderResultMap();
  }

  function renderResultMap() {
    const error = $("#map-error");
    $("#map-countries").replaceChildren();
    $("#map-routes").replaceChildren();
    $("#map-markers").replaceChildren();
    if (mapLoadError) {
      error.textContent = `The result map could not be loaded: ${mapLoadError.message}`;
      error.hidden = false;
      return;
    }
    if (!mapData) {
      error.textContent = "Loading result map…";
      error.hidden = false;
      return;
    }
    error.hidden = true;
    const projection = window.d3.geoEqualEarth().fitExtent([[12, 12], [988, 508]], mapData);
    const pathGenerator = window.d3.geoPath(projection);
    const byNumeric = new Map(countries.filter((country) => country.numeric)
      .map((country) => [String(Number(country.numeric)), country.code]));
    const ownerOverrides = new Map([["254", "FRA"], ["292", "GBR"], ["344", "CHN"], ["383", "SRB"], ["446", "CHN"], ["732", "MAR"]]);
    const visited = new Set(state.path.map((entry) => entry.code));
    const invalid = new Set(state.path.filter((entry) => !entry.valid).map((entry) => entry.code));
    const choices = new Set(state.lastResult.choices);
    window.d3.select("#map-countries").selectAll("path").data(mapData.features).join("path")
      .attr("class", (feature) => {
        const numeric = String(Number(feature.id));
        const code = ownerOverrides.get(numeric) || byNumeric.get(numeric);
        if (invalid.has(code)) return "map-country is-invalid";
        if (visited.has(code)) return "map-country is-visited";
        if (choices.has(code)) return "map-country is-choice";
        return "map-country";
      })
      .attr("d", pathGenerator);
    const point = (code) => projection(countriesByCode.get(code).coordinates);
    state.path.slice(1).forEach((entry, index) => {
      const start = point(state.path[index].code);
      const end = point(entry.code);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", start[0]);
      line.setAttribute("y1", start[1]);
      line.setAttribute("x2", end[0]);
      line.setAttribute("y2", end[1]);
      line.setAttribute("class", `route-segment${entry.valid ? "" : " is-invalid"}`);
      $("#map-routes").append(line);
    });
    state.path.forEach((entry, index) => {
      const location = point(entry.code);
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "g");
      marker.setAttribute("class", `route-marker${entry.valid ? "" : " is-invalid"}`);
      marker.setAttribute("transform", `translate(${location[0]} ${location[1]})`);
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", "11");
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.textContent = String(index + 1);
      marker.append(circle, label);
      $("#map-markers").append(marker);
    });
  }

  $("#host-menu-button").addEventListener("click", () => showScreen("host"));
  $("#join-menu-button").addEventListener("click", () => showScreen("join"));
  document.querySelectorAll(".menu-return").forEach((button) => button.addEventListener("click", returnToMenu));
  $("#host-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();
    myName = cleanName($("#host-name").value);
    const seconds = Number($("#turn-seconds").value);
    if (!myName || !allowedTimers.has(seconds)) return;
    closeConnections();
    role = "host";
    myId = randomId("host");
    const mode = new FormData($("#host-form")).get("host-mode");
    state = initialLobby(mode === "challenge" ? "challenge" : "autocheck", seconds);
    startPeerSweep();
    if (roomSignaling) {
      try {
        await createSignaledRoom();
      } catch (error) {
        exposeError("Could not create a room on the signaling server.", error);
        return;
      }
    }
    render();
  });
  $("#join-form").addEventListener("submit", roomSignaling ? joinSignaledRoom : joinFromInvite);
  $("#create-invite").addEventListener("click", createInvite);
  $("#accept-answer").addEventListener("click", acceptAnswer);
  $("#copy-invite").addEventListener("click", () => copyText($("#invite-output"), $("#copy-invite")));
  $("#copy-answer").addEventListener("click", () => copyText($("#answer-output"), $("#copy-answer")));
  $("#copy-room-code").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      $("#copy-room-code").textContent = "Copied";
      window.setTimeout(() => { $("#copy-room-code").textContent = "Copy room code"; }, 1400);
    } catch (error) {
      exposeError("Automatic copy was blocked. Select the room code manually.", error);
    }
  });
  $("#start-game").addEventListener("click", startGame);
  $("#country-search").addEventListener("input", () => {
    selectedCode = null;
    $("#selected-country").hidden = true;
    $("#confirm-country").disabled = true;
    sendAction("select", { code: null });
    matches = searchCountries(countries, $("#country-search").value);
    activeMatchIndex = matches.length ? 0 : -1;
    renderMatches();
  });
  $("#country-search").addEventListener("keydown", (event) => {
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && matches.length) {
      event.preventDefault();
      activeMatchIndex = (activeMatchIndex + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
      renderMatches();
    } else if (event.key === "Enter" && !$("#country-results").hidden) {
      event.preventDefault();
      chooseMatch(activeMatchIndex);
    } else if (event.key === "Escape") {
      $("#country-results").hidden = true;
    }
  });
  $("#country-search").addEventListener("blur", () => {
    window.setTimeout(() => { $("#country-results").hidden = true; }, 100);
  });
  $("#country-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!selectedCode) {
      $("#form-message").textContent = "Select a country from the shortlist first.";
      return;
    }
    sendAction("submit", { code: selectedCode });
  });
  $("#concede-button").addEventListener("click", () => sendAction("concede"));
  $("#accept-move").addEventListener("click", () => sendAction("accept"));
  $("#challenge-move").addEventListener("click", () => sendAction("challenge"));
  $("#restart-round").addEventListener("click", () => sendAction("restart"));
  $("#return-lobby").addEventListener("click", () => sendAction("lobby"));
  $("#game-return-lobby").addEventListener("click", () => sendAction("lobby"));
  $("#leave-game").addEventListener("click", () => {
    if (role === "host") {
      returnToMenu();
      return;
    }
    sendAction("leave");
    window.setTimeout(returnToMenu, 100);
  });
  window.addEventListener("beforeunload", closeConnections);
})();

// Copyright (C) 2026 Pelagic Games

/**
 * Host-authoritative online play, invite exchange and optional room signalling.
 * Loaded by online.html after countries, rules, codes, maps and the map renderer.
 * Reads form controls, URL map/signaling options and room credentials in localStorage;
 * writes the page, room credentials, HTTP signalling requests and JSON DataChannels.
 * The signalling service exchanges SDP only; the host validates all gameplay actions.
 */
(() => {
  "use strict";

  // Map-local country codes index both the rules graph and the rendered geometry.
  let countries = window.MapominoesCountries;
  const { searchCountries, validateMove, validChoices } = window.MapominoesRules;
  let countriesByCode = new Map(countries.map((country) => [country.code, country]));
  // Snapshot validation and host setup share these permitted turn lengths in seconds.
  const allowedTimers = new Set([5, 10, 15, 30, 45, 60]);
  const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  const roomSignaling = new URLSearchParams(location.search).get("signaling") === "room";
  // Heartbeats refresh liveness; transport silence, not a missed single ping, disconnects.
  const heartbeatMs = 3000;
  const disconnectMs = 30000;
  /** @param {string} selector - CSS selector. @returns {Element|null} First page match. */
  const $ = (selector) => document.querySelector(selector);
  const screens = {
    menu: $("#menu-screen"),
    host: $("#host-screen"),
    join: $("#join-screen"),
    lobby: $("#lobby-screen"),
    game: $("#game-screen"),
    result: $("#result-screen")
  };

  // Identity survives round changes; guests hold one host link, hosts index guests by ID.
  let role = null;
  let myId = null;
  let myName = "";
  let hostConnection = null;
  let hostChannel = null;
  // Invite IDs own unjoined connections, expiry handles and optional guest requesters.
  const pendingInvites = new Map();
  let ownInviteId = null;
  let proxyInvite = null;
  const proxyInviteLifetimeMs = 10 * 60 * 1000;
  const peers = new Map();
  // Replicated state holds lobby/turn/challenge/result, players, path and selections.
  // Only the host mutates it; selectedCode and shortlist indices are local UI state.
  let state = null;
  let selectedCode = null;
  let matches = [];
  let activeMatchIndex = -1;
  // Host turn expiry is authoritative; the display interval merely paints a countdown.
  let turnTimeout = null;
  let activityTimeout = null;
  let timerInterval = null;
  let heartbeatInterval = null;
  let peerSweepInterval = null;
  // Room polling uses a monotonic event cursor and a busy guard against overlap.
  let signalPollTimer = null;
  let signalPollBusy = false;
  let roomCode = "";
  let hostSignalToken = "";
  let signalSequence = 0;
  let guestSignalPeer = null;
  let lastHostMessage = 0;
  let closingConnections = false;
  // Outgoing transfer tracks required peers and timeout; incoming transfer stages links
  // without replacing live channels until the old host sends a commit.
  let migration = null;
  let incomingMigration = null;
  let mapData = window.MapominoesMaps.get("world").mapData;
  // Invalidate in-flight map loads when a newer snapshot or navigation wins the race.
  let snapshotSequence = 0;
  let changingMap = false;
  // Player IDs map to private room resume tokens; pending room IDs own unjoined links.
  // Weakly held retired channels suppress obsolete close/error notifications.
  const resumeTokens = new Map();
  const pendingRoomPeers = new Map();
  const retiredChannels = new WeakSet();

  const maps = window.MapominoesMaps;
  const t = maps.text;
  const hostMapPicker = maps.picker($("#host-form"));
  const menuMapPicker = maps.picker($("#menu-screen"));
  const lobbyMapPicker = maps.picker($("#lobby-screen"));
  const requestedMap = new URLSearchParams(location.search).get("map") || "world";
  if (maps.catalog.some((map) => map.id === requestedMap)) {
    hostMapPicker.value = requestedMap;
    menuMapPicker.value = requestedMap;
  }
  // Keep setup consistent with the menu picker before a lobby exists.
  menuMapPicker.addEventListener("change", () => { hostMapPicker.value = menuMapPicker.value; });

  /** Switch rules, geometry and page vocabulary to an already loaded map.
   * @param {string} id - Catalogue map ID. @returns {void}
   */
  function activateMap(id) {
    const data = maps.get(id);
    if (!data) throw new Error(`Map ${id} has not loaded.`);
    countries = data.countries;
    countriesByCode = new Map(countries.map((country) => [country.code, country]));
    mapData = data.mapData;
    maps.selected = id;
    maps.updateVocabulary(id);
  }

  // Only the host may change maps; ignore a load completed after leaving this lobby.
  lobbyMapPicker.addEventListener("change", async () => {
    if (role !== "host" || state?.phase !== "lobby" || migration || changingMap) return;
    const id = lobbyMapPicker.value;
    const lobby = state;
    changingMap = true;
    renderLobby();
    try {
      await maps.load(id);
      if (state !== lobby || role !== "host" || state.phase !== "lobby") return;
      activateMap(id);
      state.mapId = id;
      state.path = [];
      state.selections = {};
      state.lastResult = null;
      clearSelectionUi(false);
      state.activity = `The host selected ${maps.catalog.find((map) => map.id === id).name}.`;
    } catch (error) {
      exposeError("Could not change the lobby map.", error);
    } finally {
      changingMap = false;
      if (state === lobby) broadcastSnapshot();
    }
  });

  // Reuse the invite page controls with room-specific labels and no manual answer.
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

  /** @param {string} name - Screen key to reveal; hides all others. @returns {void} */
  function showScreen(name) {
    Object.entries(screens).forEach(([key, element]) => {
      element.hidden = key !== name;
    });
  }

  /** Display a recoverable error and log an optional cause.
   * @param {string} message - User-facing context.
   * @param {Error|null} error - Optional diagnostic cause. @returns {void}
   */
  function exposeError(message, error = null) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    $("#connection-error").textContent = `${message}${detail}`;
    $("#connection-error").hidden = false;
    if (error) console.error(message, error);
  }

  /** Clear and hide the shared connection error region. @returns {void} */
  function clearError() {
    $("#connection-error").hidden = true;
    $("#connection-error").textContent = "";
  }

  /** @param {*} value - Untrusted name. @returns {string} Collapsed, trimmed name, at most 40 characters. */
  function cleanName(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 40);
  }

  /** @param {string} prefix - Identity category. @returns {string} Random session-local identifier. */
  function randomId(prefix) {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return `${prefix}-${values[0].toString(36)}${values[1].toString(36)}`;
  }

  /** @param {Object} value - Invite or answer envelope.
   * @param {number} version - Wire version to emit. @returns {Promise<string>} Shareable code.
   */
  function encodeCode(value, version = 3) {
    return window.MapominoesCodes.encode(value, { version });
  }

  // Shared decoder checks the expected invite/answer kind and legacy wire versions.
  const decodeCode = window.MapominoesCodes.decode;

  // Codes are exchanged without trickle ICE, so the offer/answer must carry candidates.
  // Waiting for gathering to finish is unreliable: Chrome on Android can keep it open
  // for ~40 s when one interface (often IPv6) never hears back from STUN, Safari can
  // stall, and Firefox is slow. Use the description once a public candidate has had a
  // moment for siblings from other interfaces to arrive.
  const iceTiming = { settleMs: 1500, hostOnlyMs: 8000, limitMs: 20000 };

  /** Wait for usable non-trickle ICE, removing listeners and timers on completion.
   * @param {RTCPeerConnection} connection - Connection gathering local candidates.
   * @param {Object} timing - Millisecond settle, host-only and hard limits.
   * @returns {Promise<void>} Rejects at the hard limit if no candidates exist.
   */
  function waitForIce(connection, timing = iceTiming) {
    /** @returns {string} Current local SDP, including candidates gathered so far. */
    const sdp = () => connection.localDescription?.sdp || "";
    /** @param {string} types - Candidate-type alternatives. @returns {boolean} Whether SDP contains one. */
    const hasCandidate = (types) => new RegExp(`^a=candidate:.* typ (${types})( |$)`, "m").test(sdp());
    if (connection.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve, reject) => {
      let settleTimer = null;
      const timers = [
        window.setTimeout(() => { if (hasCandidate("host|srflx|prflx|relay")) finish(); }, timing.hostOnlyMs),
        window.setTimeout(() => {
          if (hasCandidate("host|srflx|prflx|relay")) finish();
          else fail();
        }, timing.limitMs)
      ];
      /** @param {Event} [event] - Gathering notification. @returns {void} Start settling or finish early. */
      const check = (event) => {
        if (connection.iceGatheringState === "complete" || event?.candidate === null) {
          finish();
          return;
        }
        if (!settleTimer && hasCandidate("srflx|relay")) {
          settleTimer = window.setTimeout(finish, timing.settleMs);
        }
      };
      /** Cancel every wait handle and detach candidate observers. @returns {void} */
      function cleanup() {
        timers.forEach(clearTimeout);
        clearTimeout(settleTimer);
        connection.removeEventListener("icegatheringstatechange", check);
        connection.removeEventListener("icecandidate", check);
      }
      /** Release observers and resolve the gathering wait. @returns {void} */
      function finish() {
        cleanup();
        resolve();
      }
      /** Release observers and reject a candidate-free connection. @returns {void} */
      function fail() {
        cleanup();
        reject(new Error("No connection candidates were found. Check your network and try again."));
      }
      connection.addEventListener("icegatheringstatechange", check);
      connection.addEventListener("icecandidate", check);
      check();
    });
  }

  /** Exchange JSON with the same-origin signalling service; HTTP errors reject.
   * @param {string} pathname - API path and optional query.
   * @param {Object} options - Fetch options. @returns {Promise<Object|null>} Response or empty 204.
   */
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

  /** Allocate room credentials, display its reusable code and start polling. @returns {Promise<void>} */
  async function createSignaledRoom() {
    const result = await signalRequest("/signal/rooms", { method: "POST" });
    roomCode = result.code;
    hostSignalToken = result.hostToken;
    signalSequence = 0;
    $("#room-code").textContent = roomCode;
    $("#room-code-area").hidden = false;
    scheduleHostSignalPoll(0);
  }

  /** @param {number} delay - Delay in milliseconds; replaces any pending host poll. @returns {void} */
  function scheduleHostSignalPoll(delay = 800) {
    clearTimeout(signalPollTimer);
    if (!roomSignaling || role !== "host" || !roomCode) return;
    signalPollTimer = window.setTimeout(pollHostSignals, delay);
  }

  /** Consume sequenced offer/cancel events and reschedule while hosting. @returns {Promise<void>} */
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

  /** Stage a guest connection and post its gathered answer; failures close it.
   * @param {Object} event - Offer event with peerId and RTC description. @returns {Promise<void>}
   */
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

  /** @returns {Object} Saved player/token pair, or an empty object if storage is unavailable or invalid. */
  function roomResumeDetails() {
    if (!roomCode) return {};
    try {
      return JSON.parse(localStorage.getItem(`mapominoes-room-${roomCode}`)) || {};
    } catch {
      return {};
    }
  }

  /** Register a guest, post an offer and await the host; updates connection controls.
   * @param {SubmitEvent} event - Join form submission to suppress. @returns {Promise<void>}
   */
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

  /** Poll the guest-token endpoint for up to 30 seconds and apply the answer.
   * @returns {Promise<void>} Rejects if the room handshake times out.
   */
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

  /** Copy a code, or select it for manual copying when clipboard access fails.
   * @param {HTMLTextAreaElement} element - Code source.
   * @param {HTMLButtonElement} button - Temporary feedback target. @returns {Promise<void>}
   */
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

  /** @param {RTCDataChannel|null} channel - Destination.
   * @param {Object} message - JSON envelope with a type discriminator.
   * @returns {boolean} Whether sending succeeded; displays transport errors.
   */
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

  /** @param {*} value - Candidate record. @returns {boolean} Whether non-null, object-valued and not an array. */
  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  /** @param {MessageEvent} event - DataChannel input.
   * @returns {Object|null} Bounded JSON object with a string type, or null.
   */
  function parseMessage(event) {
    if (typeof event.data !== "string" || event.data.length > 200000) return null;
    try {
      const value = JSON.parse(event.data);
      return isPlainObject(value) && typeof value.type === "string" ? value : null;
    } catch {
      return null;
    }
  }

  /** Tear down channels, staged invites, migration and network/game timers.
   * Suppresses close notifications until queued transport events have run. @returns {void}
   */
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
    closeAllPendingInvites();
    proxyInvite = null;
    resetInviteUi();
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

  /** Invalidate pending snapshots, close networking and reset session forms/state. @returns {void} */
  function returnToMenu() {
    snapshotSequence += 1;
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

  /** @param {string} mode - Autocheck or challenge.
   * @param {number} seconds - Turn duration. @returns {Object} Version-one host snapshot.
   */
  function initialLobby(mode, seconds) {
    return {
      version: 1,
      mapId: maps.selected,
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

  /** @returns {Object} JSON-safe detached copy of the replicated state, excluding transport credentials. */
  function publicState() {
    return JSON.parse(JSON.stringify(state));
  }

  /** Send a complete {type, state} snapshot to each guest and render locally. @returns {void} */
  function broadcastSnapshot() {
    if (role !== "host" || !state) return;
    const snapshot = { type: "snapshot", state: publicState() };
    peers.forEach(({ channel }) => safeSend(channel, snapshot));
    render();
  }

  /** @returns {number} Connected players who have not explicitly left. */
  function hostPlayerConnectedCount() {
    return state.players.filter((player) => player.connected && !player.left).length;
  }

  /** Replace the host liveness interval; stale peers follow normal disconnect handling. @returns {void} */
  function startPeerSweep() {
    clearInterval(peerSweepInterval);
    peerSweepInterval = window.setInterval(() => {
      const cutoff = Date.now() - disconnectMs;
      peers.forEach((peer) => {
        if (peer.lastSeen < cutoff) disconnectPeer(peer);
      });
    }, heartbeatMs);
  }

  /** Bind handshake, action and disconnect listeners to an unidentified guest.
   * @param {RTCPeerConnection} connection - Guest transport.
   * @param {RTCDataChannel} channel - Ordered JSON channel.
   * @param {string} inviteId - Manual invite or pending room peer ID. @returns {void}
   */
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

  /** Dispatch guest envelopes: hello authenticates resume credentials, ping updates
   * liveness, invite-* proxies codes, migration-* stages transfer and action requests play.
   * @param {Object} peer - Host-owned transport record.
   * @param {MessageEvent} event - Untrusted JSON message. @returns {void}
   */
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
      const joinedInvite = pendingInvites.get(peer.inviteId);
      releasePendingInvite(peer.inviteId);
      if (joinedInvite?.requesterId) {
        safeSend(peers.get(joinedInvite.requesterId)?.channel, {
          type: "invite-joined",
          inviteId: joinedInvite.inviteId,
          name
        });
      }
      pendingRoomPeers.delete(peer.inviteId);
      broadcastSnapshot();
      return;
    }
    if (message.type === "ping") {
      safeSend(peer.channel, { type: "pong", sentAt: message.sentAt });
      return;
    }
    if (message.type === "invite-request") {
      handleInviteRequest(peer, message);
      return;
    }
    if (message.type === "invite-answer") {
      handleProxyAnswer(peer, message);
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

  /** Close a guest, cancel their unused invites and remove or skip their player.
   * @param {Object} peer - Transport record; repeated notifications are harmless. @returns {void}
   */
  function disconnectPeer(peer) {
    if (role !== "host" || closingConnections || !peer.id || !state) return;
    const player = state.players.find((candidate) => candidate.id === peer.id);
    peers.delete(peer.id);
    if (!player || !player.connected) return;
    player.connected = false;
    peer.channel.close();
    peer.connection.close();
    pendingInvites.forEach((invite) => {
      if (invite.requesterId === peer.id && !invite.answered) closePendingInvite(invite.inviteId);
    });
    if (state.phase === "lobby" && (!roomSignaling || player.left)) {
      state.players = state.players.filter((candidate) => candidate.id !== peer.id);
      state.activity = `${player.name} left the lobby.`;
    } else {
      state.activity = `${player.name} disconnected. They will be skipped if their turn arrives.`;
      skipUnavailableCurrent(player);
    }
    broadcastSnapshot();
  }

  /** Advance an unavailable current player without restarting a challenge timer.
   * @param {Object} player - Replicated player record; may end an empty round. @returns {void}
   */
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

  /** Mark an explicit departure, broadcast it, then close the guest after delivery.
   * @param {string} playerId - Departing identity; the local host returns to menu. @returns {void}
   */
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

  /** @param {*} signal - Proposed RTC description.
   * @param {string} type - Required offer/answer type. @returns {boolean} Whether bounded and correctly typed.
   */
  function validMigrationSignal(signal, type) {
    return isPlainObject(signal) && signal.type === type
      && typeof signal.sdp === "string" && signal.sdp.length <= 50000;
  }

  /** Freeze lobby invites and ask a successor to establish replacement guest links.
   * @param {string} targetId - Connected successor. @returns {void}
   */
  function startHostMigration(targetId) {
    if (role !== "host" || state.phase !== "lobby" || migration || changingMap) return;
    const target = state.players.find((player) => player.id === targetId);
    if (!target?.connected || target.left || target.id === myId) return;
    closeAllPendingInvites("Open invites were cancelled because hosting is being transferred. Create a fresh invite.");
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

  /** Stage a non-successor guest's transfer bookkeeping without changing authority.
   * @param {Object} message - migration-prepare envelope. @returns {void}
   */
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

  /** Load and validate transfer data, then prepare all successor-to-guest offers.
   * @param {Object} message - migration-start snapshot, peer IDs and room credentials.
   * @returns {Promise<void>} Reports failures to the old host and discards staged links.
   */
  async function beginIncomingMigration(message) {
    await maps.load(message.state?.mapId || "world");
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

  /** Create a successor link, relaying gathered SDP via the current host.
   * @param {string} peerId - Existing guest identity. @returns {Promise<void>}
   */
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

  /** Apply a relayed answer as successor, or answer an offer as another guest.
   * @param {Object} message - Migration ID, sender and RTC signal. @returns {Promise<void>}
   */
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

  /** Notify the old host only when every required successor channel is open. @returns {void} */
  function reportMigrationReady() {
    if (!incomingMigration || myId !== incomingMigration.targetId
      || incomingMigration.ready.size !== incomingMigration.expected.size) return;
    safeSend(hostChannel, {
      type: "migration-ready",
      migrationId: incomingMigration.id
    });
  }

  /** Forward only signals between the designated successor and expected guests.
   * @param {Object} peer - Authenticated sender.
   * @param {Object} message - migration-relay envelope. @returns {void}
   */
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

  /** Increase authority epoch and broadcast the ready successor's transfer commit.
   * @param {Object} peer - Successor transport.
   * @param {Object} message - Matching migration-ready envelope. @returns {void}
   */
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
    applyMigrationCommit(commit).catch((error) => exposeError("Could not commit host transfer.", error));
  }

  /** @param {string} reason - Broadcast explanation; restores the existing host's lobby. @returns {void} */
  function abortHostMigration(reason) {
    if (!migration) return;
    const message = { type: "migration-abort", migrationId: migration.id, reason };
    peers.forEach(({ channel }) => safeSend(channel, message));
    clearTimeout(migration.timeout);
    migration = null;
    state.activity = reason;
    render();
  }

  /** Close only staged replacement connections, retaining the current host link. @returns {void} */
  function discardIncomingMigration() {
    incomingMigration?.connections.forEach((connection) => connection.close());
    incomingMigration = null;
  }

  /** Promote staged links, rebind listeners and retire superseded channels.
   * @param {Object} message - Committed snapshot and old/new host IDs.
   * @returns {Promise<void>} Loads map data before accepting the new authority.
   */
  async function applyMigrationCommit(message) {
    await maps.load(message.state?.mapId || "world");
    if (!validSnapshot(message.state) || message.state.hostId !== message.targetId) return;
    snapshotSequence += 1;
    proxyInvite = null;
    resetInviteUi();
    activateMap(message.state.mapId || "world");
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

  /** Hide and clear manual invite controls without closing their transport. @returns {void} */
  function resetInviteUi() {
    $("#invite-area").hidden = true;
    $("#invite-output").value = "";
    $("#answer-input").value = "";
    $("#accept-answer").disabled = false;
    $("#invite-status").textContent = "";
  }

  /** @param {string} code - Encoded offer.
   * @param {string} status - Instructions; reveals and resets answer controls. @returns {void}
   */
  function showInviteCode(code, status) {
    $("#invite-output").value = code;
    $("#answer-input").value = "";
    $("#accept-answer").disabled = false;
    $("#invite-area").hidden = false;
    $("#invite-status").textContent = status;
  }

  /** Forget a joined invite without closing its now-active connection.
   * @param {string} inviteId - Invite key. @returns {Object|null} Released record, if present.
   */
  function releasePendingInvite(inviteId) {
    const invite = pendingInvites.get(inviteId);
    if (!invite) return null;
    pendingInvites.delete(inviteId);
    clearTimeout(invite.expiry);
    if (inviteId === ownInviteId) {
      ownInviteId = null;
      resetInviteUi();
    }
    return invite;
  }

  /** @param {string} inviteId - Pending offer to close.
   * @param {string} reason - Optional cancellation message to its guest requester. @returns {void}
   */
  function closePendingInvite(inviteId, reason = "") {
    const invite = releasePendingInvite(inviteId);
    if (!invite) return;
    invite.connection.close();
    if (invite.requesterId && reason) {
      safeSend(peers.get(invite.requesterId)?.channel, { type: "invite-cancelled", inviteId, message: reason });
    }
  }

  /** @param {string} reason - Optional shared requester notification; closes every pending offer. @returns {void} */
  function closeAllPendingInvites(reason = "") {
    [...pendingInvites.keys()].forEach((inviteId) => closePendingInvite(inviteId, reason));
  }

  /** Stage a host offer; proxied invites expire, and failures release their transport.
   * @param {string|null} requesterId - Guest asking to relay, or null for the host.
   * @returns {Promise<Object>} Invite ID and encoded gathered offer.
   */
  async function createHostedInvite(requesterId) {
    const inviteId = randomId("invite");
    const connection = new RTCPeerConnection(rtcConfig);
    const channel = connection.createDataChannel("mapominoes", { ordered: true });
    setupHostChannel(connection, channel, inviteId);
    const invite = { connection, channel, inviteId, requesterId, answered: false, expiry: null };
    if (requesterId) {
      invite.expiry = window.setTimeout(() => {
        closePendingInvite(inviteId, "Your invite expired before it was used. Create a fresh invite.");
      }, proxyInviteLifetimeMs);
    }
    pendingInvites.set(inviteId, invite);
    try {
      await connection.setLocalDescription(await connection.createOffer());
      await waitForIce(connection);
      if (pendingInvites.get(inviteId) !== invite) throw new Error("The invite was cancelled.");
      const code = await encodeCode({
        version: 3,
        kind: "invite",
        inviteId,
        description: connection.localDescription.toJSON()
      });
      return { inviteId, code };
    } catch (error) {
      closePendingInvite(inviteId);
      throw error;
    }
  }

  /** Accept one matching answer, restoring retry eligibility if RTC rejects it.
   * @param {Object} invite - Pending transport record.
   * @param {Object} code - Decoded answer envelope. @returns {Promise<void>}
   */
  async function applyInviteAnswer(invite, code) {
    if (code.inviteId !== invite.inviteId || code.description.type !== "answer") {
      throw new Error("This answer belongs to a different invite.");
    }
    if (invite.answered) throw new Error("An answer was already accepted for this invite.");
    invite.answered = true;
    try {
      await invite.connection.setRemoteDescription(code.description);
    } catch (error) {
      invite.answered = false;
      throw error;
    }
  }

  /** @returns {boolean} Whether lobby capacity and transfer state permit another invite. */
  function invitesOpen() {
    return state?.phase === "lobby" && !migration && !incomingMigration
      && state.players.length < 12;
  }

  /** Request a guest proxy offer or replace the host's own displayed offer. @returns {Promise<void>} */
  async function createInvite() {
    clearError();
    if (role === "guest") {
      requestProxyInvite();
      return;
    }
    if (role !== "host" || !invitesOpen()) return;
    if (ownInviteId) closePendingInvite(ownInviteId);
    $("#create-invite").disabled = true;
    $("#invite-status").textContent = "Gathering a direct connection invite…";
    try {
      const { inviteId, code } = await createHostedInvite(null);
      ownInviteId = inviteId;
      showInviteCode(code, "Send the invite, then paste that same player's answer.");
    } catch (error) {
      $("#invite-status").textContent = "";
      exposeError("Could not create an invite.", error);
    } finally {
      render();
    }
  }

  /** Create one outstanding proxied invite per guest and correlate replies by request ID.
   * @param {Object} peer - Requesting guest.
   * @param {Object} message - invite-request envelope. @returns {Promise<void>}
   */
  async function handleInviteRequest(peer, message) {
    if (typeof message.requestId !== "string" || !message.requestId || message.requestId.length > 80) return;
    const requestId = message.requestId;
    /** @param {string} text - Refusal reason. @returns {boolean} Whether the correlated error was sent. */
    const refuse = (text) => safeSend(peer.channel, { type: "invite-error", requestId, message: text });
    if (!invitesOpen() || changingMap) {
      refuse(state.players.length >= 12
        ? "The lobby is full."
        : "Invites can only be created while the lobby is open and hosting is not being transferred.");
      return;
    }
    pendingInvites.forEach((invite) => {
      if (invite.requesterId === peer.id) closePendingInvite(invite.inviteId);
    });
    try {
      const { inviteId, code } = await createHostedInvite(peer.id);
      if (peers.get(peer.id) !== peer) {
        closePendingInvite(inviteId);
        return;
      }
      safeSend(peer.channel, { type: "invite-code", requestId, inviteId, code });
    } catch (error) {
      refuse(`The host could not create an invite. ${error.message}`);
    }
  }

  /** Verify invite ownership before decoding and applying a guest-relayed answer.
   * @param {Object} peer - Relaying guest.
   * @param {Object} message - Invite ID and encoded answer. @returns {Promise<void>}
   */
  async function handleProxyAnswer(peer, message) {
    const inviteId = typeof message.inviteId === "string" ? message.inviteId : "";
    const invite = pendingInvites.get(inviteId);
    /** @param {boolean} ok - Acceptance result. @param {string} text - Feedback. @returns {boolean} Send success. */
    const reply = (ok, text) => safeSend(peer.channel, { type: "invite-answer-result", inviteId, ok, message: text });
    if (!invite || invite.requesterId !== peer.id) {
      reply(false, "That invite is no longer active. Create a fresh invite.");
      return;
    }
    try {
      await applyInviteAnswer(invite, await decodeCode(message.code, "answer"));
      reply(true, "The host accepted the answer. Waiting for the new player to connect…");
    } catch (error) {
      reply(false, `The host could not accept that answer. ${error.message}`);
    }
  }

  /** Correlate a new guest invite request and show pending feedback. @returns {void} */
  function requestProxyInvite() {
    if (role !== "guest" || !myId || !invitesOpen()) return;
    proxyInvite = { requestId: randomId("request"), inviteId: null };
    resetInviteUi();
    if (!safeSend(hostChannel, { type: "invite-request", requestId: proxyInvite.requestId })) {
      proxyInvite = null;
      exposeError("Could not reach the host to request an invite.");
      return;
    }
    $("#invite-status").textContent = "Asking the host for an invite…";
    render();
  }

  /** Update only the current request/invite UI, ignoring stale correlated replies.
   * @param {Object} message - invite-code/error/answer-result/joined/cancelled envelope. @returns {void}
   */
  function handleProxyInviteMessage(message) {
    if (!proxyInvite) return;
    if (message.type === "invite-code" || message.type === "invite-error") {
      if (message.requestId !== proxyInvite.requestId || proxyInvite.inviteId) return;
      if (message.type === "invite-code" && typeof message.inviteId === "string"
        && typeof message.code === "string") {
        proxyInvite.inviteId = message.inviteId;
        showInviteCode(message.code, "Send the invite, then paste that same player's answer. It will be passed to the host.");
      } else {
        proxyInvite = null;
        resetInviteUi();
        exposeError(typeof message.message === "string" ? message.message.slice(0, 300) : "The host refused the invite request.");
      }
      render();
      return;
    }
    if (message.inviteId !== proxyInvite.inviteId) return;
    const text = typeof message.message === "string" ? message.message.slice(0, 300) : "";
    if (message.type === "invite-answer-result") {
      if (message.ok === true) {
        $("#accept-answer").disabled = true;
        $("#invite-status").textContent = text || "The host accepted the answer.";
      } else {
        $("#accept-answer").disabled = false;
        $("#invite-status").textContent = "";
        exposeError(text || "The host could not accept that answer.");
      }
      return;
    }
    if (message.type === "invite-joined" || message.type === "invite-cancelled") {
      proxyInvite = null;
      resetInviteUi();
      $("#invite-status").textContent = message.type === "invite-joined"
        ? `${cleanName(message.name) || "Your invited player"} joined the lobby.`
        : text || "Your invite was cancelled.";
      render();
    }
  }

  /** Decode the entered answer, then apply locally or relay to its owning host. @returns {Promise<void>} */
  async function acceptAnswer() {
    clearError();
    const invite = role === "host" ? pendingInvites.get(ownInviteId) : null;
    const inviteId = role === "host" ? invite?.inviteId : proxyInvite?.inviteId;
    if (!inviteId) {
      exposeError("Create a fresh invite before accepting an answer.");
      return;
    }
    $("#accept-answer").disabled = true;
    try {
      const value = $("#answer-input").value.trim();
      const code = await decodeCode(value, "answer");
      if (role === "host") {
        await applyInviteAnswer(invite, code);
        $("#invite-status").textContent = "Answer accepted. Waiting for the player's channel to open…";
        return;
      }
      if (code.inviteId !== inviteId || code.description.type !== "answer") {
        throw new Error("This answer belongs to a different invite.");
      }
      if (!safeSend(hostChannel, { type: "invite-answer", inviteId, code: value })) {
        throw new Error("The host connection is not open.");
      }
      $("#invite-status").textContent = "Passing the answer to the host…";
    } catch (error) {
      $("#accept-answer").disabled = false;
      exposeError("Could not accept that answer.", error);
    }
  }

  /** Answer a manual offer and expose a compatible code for return to the inviter.
   * @param {SubmitEvent} event - Join submission to suppress. @returns {Promise<void>}
   */
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
        version: 3,
        kind: "answer",
        inviteId: code.inviteId,
        description: hostConnection.localDescription.toJSON()
      }, code.version);
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

  /** Bind guest protocol/liveness listeners, ignoring errors from retired transfer links.
   * @param {boolean} sendHello - Whether this link needs initial player registration. @returns {void}
   */
  function setupGuestChannel(sendHello = true) {
    const channel = hostChannel;
    /** Send optional identity/resume data, start heartbeats and update join feedback. @returns {void} */
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

  /** Validate bounded player/path/result records against the snapshot's loaded map.
   * @param {*} snapshot - Untrusted replicated state. @returns {boolean} Whether safe to apply.
   */
  function validSnapshot(snapshot) {
    const data = maps.get(snapshot?.mapId || "world");
    if (!data || !maps.catalog.some((map) => map.id === (snapshot?.mapId || "world"))) return false;
    const snapshotCodes = new Set(data.countries.map((country) => country.code));
    if (!isPlainObject(snapshot) || snapshot.version !== 1
      || !["lobby", "turn", "challenge", "result"].includes(snapshot.phase)
      || !["autocheck", "challenge"].includes(snapshot.mode)
      || !allowedTimers.has(snapshot.turnSeconds)
      || !Array.isArray(snapshot.players) || snapshot.players.length < 1
      || snapshot.players.length > 12 || !Array.isArray(snapshot.path)
      || typeof snapshot.hostId !== "string"
      || !Number.isInteger(snapshot.authorityEpoch)
      || snapshot.authorityEpoch < 1
      || snapshot.path.length > data.countries.length + 1
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
        && snapshotCodes.has(entry.code) && Number.isInteger(entry.player)
        && entry.player >= 0 && entry.player < snapshot.players.length
        && typeof entry.valid === "boolean" && Array.isArray(entry.reasons)
        && entry.reasons.length < 10
        && entry.reasons.every((reason) => typeof reason === "string" && reason.length < 500))
      && (snapshot.phase !== "result"
        || (isPlainObject(snapshot.lastResult)
          && Array.isArray(snapshot.lastResult.choices)
          && snapshot.lastResult.choices.every((code) => snapshotCodes.has(code))
          && Number.isInteger(snapshot.lastResult.restartPlayer)
          && snapshot.lastResult.restartPlayer >= 0
          && snapshot.lastResult.restartPlayer < snapshot.players.length
          && (snapshot.lastResult.loser === null
            || (Number.isInteger(snapshot.lastResult.loser)
              && snapshot.lastResult.loser >= 0
              && snapshot.lastResult.loser < snapshot.players.length))
          && typeof snapshot.lastResult.reason === "string"));
  }

  /** Dispatch host snapshots, welcome credentials, proxy replies and transfer control.
   * @param {MessageEvent} event - JSON DataChannel input; refreshes host liveness. @returns {void}
   */
  function handleGuestMessage(event) {
    lastHostMessage = Date.now();
    const message = parseMessage(event);
    if (!message) {
      exposeError("The host sent a malformed message; it was ignored.");
      return;
    }
    if (message.type === "pong") return;
    if (["invite-code", "invite-error", "invite-answer-result", "invite-joined", "invite-cancelled"]
      .includes(message.type)) {
      handleProxyInviteMessage(message);
      return;
    }
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
      applyMigrationCommit(message).catch((error) => exposeError("Could not commit host transfer.", error));
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
      receiveSnapshot(message.state);
    } else if (message.type === "error" && typeof message.message === "string") {
      exposeError(message.message.slice(0, 300));
    }
  }

  /** Load a snapshot's map, discarding stale asynchronous work and older authority.
   * @param {Object} snapshot - Proposed complete host state. @returns {Promise<void>} Renders accepted state.
   */
  async function receiveSnapshot(snapshot) {
    const sequence = ++snapshotSequence;
    try {
      if (!isPlainObject(snapshot)) throw new Error("Missing game snapshot.");
      const id = snapshot.mapId || "world";
      await maps.load(id);
      if (sequence !== snapshotSequence) return;
      if (!validSnapshot(snapshot)) throw new Error("The host sent an invalid game snapshot.");
      if (state && snapshot.authorityEpoch < state.authorityEpoch) return;
      const previousMap = state?.mapId || maps.selected;
      activateMap(id);
      state = snapshot;
      if (previousMap !== id) clearSelectionUi(false);
      render();
    } catch (error) {
      if (sequence === snapshotSequence) exposeError("Could not apply the host's game snapshot.", error);
    }
  }

  /** Route both host and guest commands through the host's action validation.
   * @param {string} action - Command discriminator.
   * @param {Object} payload - Command fields, such as code. @returns {void}
   */
  function sendAction(action, payload = {}) {
    if (role === "host") processAction(myId, { type: "action", action, ...payload });
    else safeSend(hostChannel, { type: "action", action, ...payload });
  }

  /** @returns {Object|null} Current replicated player, if state exists. */
  function currentPlayer() {
    return state?.players[state.currentPlayer] || null;
  }

  /** @param {string} id - Player ID. @returns {boolean} Whether they own the current turn. */
  function isCurrent(id) {
    return currentPlayer()?.id === id;
  }

  /** Authorise phase, identity and selected code before mutating host state.
   * Only the host may restart rounds or return everyone to the lobby.
   * @param {string} playerId - Authenticated sender.
   * @param {Object} message - Action envelope. @returns {void}
   */
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
          : `${player.name} ${t("is choosing a country.")}`;
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

  /** @param {number} index - Previous player index.
   * @returns {number|null} Next eligible index; marks unavailable players ineligible.
   */
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

  /** @param {number} preferredIndex - First index to consider.
   * @returns {number|null} Connected, non-departed starter, wrapping through the roster.
   */
  function connectedStarter(preferredIndex) {
    for (let offset = 0; offset < state.players.length; offset += 1) {
      const index = (preferredIndex + offset) % state.players.length;
      const player = state.players[index];
      if (player.connected && !player.left) return index;
    }
    return null;
  }

  /** Replace the host's turn expiry and publish its wall-clock deadline in state. @returns {void} */
  function beginDeadline() {
    clearTimeout(turnTimeout);
    state.deadline = Date.now() + state.turnSeconds * 1000;
    turnTimeout = window.setTimeout(expireTurn, state.turnSeconds * 1000 + 30);
  }

  /** Auto-submit the host-known selection, otherwise resolve a timed concession. @returns {void} */
  function expireTurn() {
    if (role !== "host" || state.phase !== "turn") return;
    const player = currentPlayer();
    const code = state.selections[player.id];
    if (countriesByCode.has(code)) commitCountry(code, true);
    else concede(true);
  }

  /** Close outstanding invites and begin with a connected starter when lobby permits. @returns {void} */
  function startGame() {
    if (role !== "host" || state.phase !== "lobby" || changingMap || migration || hostPlayerConnectedCount() < 2) return;
    if (state.round === 0) state.players.forEach((player) => { player.score = 0; });
    const preferred = state.nextStarterId
      ? Math.max(0, state.players.findIndex((player) => player.id === state.nextStarterId))
      : 0;
    const starter = connectedStarter(preferred);
    if (starter === null) return;
    closeAllPendingInvites("The game started, so your open invite was cancelled.");
    startRound(starter);
  }

  /** Reset round eligibility, route and selections, then start the host deadline.
   * @param {number} startPlayer - Preferred starter index. @returns {void}
   */
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
    state.activity = `${currentPlayer().name} ${t("chooses the starting country.")}`;
    beginDeadline();
    broadcastSnapshot();
  }

  /** Store validation alongside the move; autocheck ends immediately on invalidity,
   * whereas challenge mode defers judgement to the following player.
   * @param {string} code - Selected map code.
   * @param {boolean} timedOut - Whether expiry submitted the selection. @returns {void}
   */
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

  /** Resolve stored move validity; a failed challenge penalises its challenger. @returns {void} */
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

  /** End without a penalty if no legal continuation exists.
   * @param {boolean} timedOut - Whether the current player ran out of time. @returns {void}
   */
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
          ? t("Time expired, but there were no legal countries left.")
          : t("The chain ended because there were no legal countries left.")
      });
      return;
    }
    endRound({
      choices,
      choicePath: state.path,
      loser: state.currentPlayer,
      reason: timedOut
        ? `${player.name} ${t("ran out of time without a selected country.")}`
        : `${player.name} could not continue the chain.`
    });
  }

  /** Freeze results and broadcast; scores count losses, so the loser gains a point.
   * @param {Object} options - Award flag, optional choices, choicePath, loser index,
   * noLegalMoves flag and explanatory reason. @returns {void}
   */
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

  /** Preserve the next starter, remove departed players and reopen host invitations. @returns {void} */
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

  /** Render the screen selected by the replicated phase. @returns {void} */
  function render() {
    if (!state) return;
    if (state.phase === "lobby") renderLobby();
    else if (state.phase === "result") renderResult();
    else renderGame();
  }

  /** Rebuild roster, transfer controls, invite availability and host/guest feedback. @returns {void} */
  function renderLobby() {
    showScreen("lobby");
    if (!changingMap) lobbyMapPicker.value = state.mapId || "world";
    lobbyMapPicker.disabled = role !== "host" || Boolean(migration) || changingMap;
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
        transfer.disabled = Boolean(migration) || changingMap;
        transfer.addEventListener("click", () => startHostMigration(player.id));
        item.append(transfer);
      }
      item.title = player.name;
      list.append(item);
    });
    $("#invite-tools").hidden = !role;
    $("#start-game").hidden = role !== "host";
    $("#invite-relay-note").hidden = role !== "guest" || roomSignaling;
    $("#create-invite").hidden = roomSignaling;
    $("#room-code-area").hidden = !roomSignaling || !roomCode;
    $("#create-invite").disabled = !invitesOpen() || changingMap
      || (role === "guest" && (!myId || Boolean(proxyInvite && !proxyInvite.inviteId)));
    $("#start-game").disabled = role !== "host" || hostPlayerConnectedCount() < 2 || Boolean(migration) || changingMap;
    $("#lobby-status").textContent = role === "host"
      ? migration
        ? `Transferring hosting to ${state.players.find((player) => player.id === migration.targetId)?.name}…`
        : `${hostPlayerConnectedCount()} connected · ${state.mode === "challenge" ? "Challenge" : "Autocheck"} · ${state.turnSeconds}s turns`
      : `${state.activity} Waiting for the host to start.`;
  }

  /** @param {number} index - Roster index. @returns {string} Display name or a safe fallback. */
  function playerName(index) {
    return state.players[index]?.name || "Unknown player";
  }

  /** Rebuild loss scores and current/offline/next-round indicators. @returns {void} */
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

  /** List eligible connected players in circular turn order. @returns {void} */
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

  /** Paint turn/challenge state, hiding input from spectators, and refresh the clock. @returns {void} */
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
    $("#last-country").textContent = previous?.name || t("Choose the starting country");
    const remaining = Math.max(0, state.roundPlayerCount - state.path.length);
    $("#round-guidance").textContent = remaining
      ? `Keep a route open for ${remaining} more ${remaining === 1 ? "player" : "players"} in the first circuit.`
      : t("Choose a new neighbour and remember every country already named.");
    renderScores();
    renderUpcoming();
    $("#entry-panel").hidden = state.phase !== "turn";
    $("#challenge-panel").hidden = state.phase !== "challenge";
    if (state.phase === "turn") renderEntry(mine);
    else renderChallenge(mine);
    startTimerDisplay();
  }

  /** @param {boolean} mine - Whether local input is allowed; reconcile any host-known selection. @returns {void} */
  function renderEntry(mine) {
    $("#country-form").hidden = !mine;
    $("#waiting-copy").hidden = mine;
    $("#waiting-copy").textContent = `Waiting for ${currentPlayer().name} ${t("to submit a country…")}`;
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

  /** @param {boolean} mine - Whether local player decides; display the unjudged prior move. @returns {void} */
  function renderChallenge(mine) {
    clearSelectionUi(false);
    const entry = state.path[state.path.length - 1];
    const country = countriesByCode.get(entry.code);
    $("#challenge-heading").textContent = `${currentPlayer().name}, accept or challenge?`;
    $("#challenge-copy").textContent = `${playerName(entry.player)} named ${country.name}. ${t("Challenge if it was previously named, does not border the last country, or blocked the first circuit. A false challenge loses the round.")}`;
    $("#challenge-actions").hidden = !mine;
    $("#challenge-waiting").hidden = mine;
    $("#challenge-waiting").textContent = `Waiting for ${currentPlayer().name}'s decision…`;
  }

  /** Replace the visual countdown interval; never decides when a turn expires. @returns {void} */
  function startTimerDisplay() {
    clearInterval(timerInterval);
    const timer = $("#timer");
    /** Paint whole seconds and the urgent class from the replicated deadline. @returns {void} */
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

  /** Reset shortlist, selection and accessible expansion state.
   * @param {boolean} send - Whether to tell the host the active selection was cleared. @returns {void}
   */
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

  /** Build the keyboard/pointer shortlist; pointerdown retains input focus until selection. @returns {void} */
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

  /** @param {number} index - Shortlist index to select locally and announce to the host. @returns {void} */
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

  /** Rebuild route validation, legal alternatives and host-only next-round controls. @returns {void} */
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
      : t("There were no valid unused bordering countries available.");
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

  /** Render completed-route geometry, exposing a recoverable map error if needed. @returns {void} */
  function renderResultMap() {
    const error = document.querySelector("#map-error");
    error.hidden = true;
    try {
      window.MapominoesRenderer.render({
        countries, mapData, path: state.path, choices: state.lastResult.choices
      });
    } catch (cause) {
      console.error("Mapominoes could not render the map.", cause);
      error.textContent = `The map could not be displayed: ${cause.message}`;
      error.hidden = false;
    }
  }

  // Navigation tears down live sessions; setup waits for map data before creating state.
  $("#host-menu-button").addEventListener("click", () => showScreen("host"));
  $("#join-menu-button").addEventListener("click", () => showScreen("join"));
  document.querySelectorAll(".menu-return").forEach((button) => button.addEventListener("click", returnToMenu));
  $("#host-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();
    myName = cleanName($("#host-name").value);
    const seconds = Number($("#turn-seconds").value);
    if (!myName || !allowedTimers.has(seconds)) return;
    const submit = $("#host-form button[type='submit']");
    const id = hostMapPicker.value;
    submit.disabled = true;
    hostMapPicker.disabled = true;
    try {
      await maps.load(id);
      if (screens.host.hidden) return;
      activateMap(id);
    } catch (error) {
      exposeError("Could not load the selected map.", error);
      return;
    } finally {
      submit.disabled = false;
      hostMapPicker.disabled = false;
    }
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
  // Join mode chooses either HTTP room introduction or the manual offer/answer workflow.
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
  // Typing invalidates the previous host-known selection; only shortlist choices submit.
  $("#country-search").addEventListener("input", () => {
    selectedCode = null;
    $("#selected-country").hidden = true;
    $("#confirm-country").disabled = true;
    sendAction("select", { code: null });
    matches = searchCountries(countries, $("#country-search").value);
    activeMatchIndex = matches.length ? 0 : -1;
    renderMatches();
  });
  // Circular keyboard navigation mirrors pointer choice without submitting the form.
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
  // Let a pending shortlist click finish before dismissing the popup.
  $("#country-search").addEventListener("blur", () => {
    window.setTimeout(() => { $("#country-results").hidden = true; }, 100);
  });
  $("#country-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!selectedCode) {
      $("#form-message").textContent = t("Select a country from the shortlist first.");
      return;
    }
    sendAction("submit", { code: selectedCode });
  });
  // All play buttons share host validation; leaving allows a brief delivery window.
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

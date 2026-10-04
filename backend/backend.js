// The shared platform from a site (D-010, D-011): signing in, the visitor's
// data, and live updates, over HTTPS and one WebSocket. The web twin of the
// Godot apps' backend service (services/backend/backend.gd): the same calls,
// the same answers, the same rules, so a person is the same player in an app,
// a game and a site. The platform is Supabase; this speaks its sign-in
// (GoTrue), data (PostgREST) and live (Realtime, Phoenix channels) protocols.
//
//     import { Backend } from "./backend/backend.js?v=2780c1afa36a";
//
//     const backend = new Backend(URL, PUBLISHABLE_KEY);
//     await backend.restore();                       // whoever signed in last time, if anyone
//     if (!backend.isSignedIn()) await backend.signInAnonymously();
//     const saved = await backend.insert("notes", { body: "hello" });
//     const live = backend.channel("notes").onChanges("notes");
//     live.on("changed", (change) => console.log(change.record));
//     live.join();
//
// Every call answers a Reply: ok, status, data (the parsed body) and error
// (words a person can read). Nothing here throws.
//
// The session - who is signed in - is kept in the browser's localStorage
// (under "backend_session" unless told otherwise), so a visitor stays signed
// in between visits, and is refreshed before it runs out, for calls and for
// live channels alike. Where storage is refused (a private window), it is
// kept for this visit only.
//
// Deliberately absent: file storage, presence, and Steam (a game's, not a
// site's).

/** A session is refreshed when it has less than this long left, in seconds. */
export const REFRESH_MARGIN = 60;
/** Phoenix's heartbeat: the server drops a socket silent for longer than about 60 s. */
export const HEARTBEAT = 25;
/** Waits before trying the live socket, or a dropped channel, again, in seconds, growing to the last. */
export const RECONNECT_WAITS = [1, 2, 5, 10, 30];
/** How long a request may take before it counts as unanswered, in seconds. */
export const TIMEOUT = 20;

/** What a call answers. */
export class Reply {
  constructor(status, data, words = "") {
    this.status = status;
    this.data = data;
    this.ok = status >= 200 && status < 300 && !words;
    this.error = words || (this.ok ? "" : Reply.wordsOf(status, data));
  }

  /** The words the platform gave for a failure, or the status. */
  static wordsOf(status, data) {
    if (status === 0) return "Couldn't reach the server";
    if (data && typeof data === "object") {
      for (const field of ["msg", "message", "error_description", "error"]) {
        if (typeof data[field] === "string") return data[field];
      }
    }
    return `The server answered ${status}`;
  }
}

/** A request over fetch: (method, url, headers, body) -> { status, text }; status 0 when nothing answered. */
export async function fetchTransport(method, at, headers, body) {
  try {
    const response = await fetch(at, { method, headers, body: body || undefined, signal: AbortSignal.timeout(TIMEOUT * 1000) });
    return { status: response.status, text: await response.text() };
  } catch {
    return { status: 0, text: "" };
  }
}

/** localStorage when the browser allows it, else a store that lasts this visit only. */
export function browserStorage() {
  const memory = new Map();
  const local = (() => { try { return globalThis.localStorage ?? null; } catch { return null; } })();
  return {
    get(name) { try { return local ? local.getItem(name) : memory.get(name) ?? null; } catch { return memory.get(name) ?? null; } },
    set(name, text) { try { if (local) local.setItem(name, text); else memory.set(name, text); } catch { memory.set(name, text); } },
    remove(name) { try { local?.removeItem(name); } catch { /* refused */ } memory.delete(name); },
  };
}

/** Who wants to hear what: on(event, fn) answers a function that stops listening. */
class Speaker {
  constructor() { this._listeners = new Map(); }
  on(event, listener) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(listener);
    return () => this._listeners.get(event)?.delete(listener);
  }
  _say(event, ...said) {
    for (const listener of [...(this._listeners.get(event) ?? [])]) {
      try { listener(...said); } catch (e) { console.error(e); }
    }
  }
}

export class Backend extends Speaker {
  /**
   * @param {string} url the platform, as https://api.latent-sea.com
   * @param {string} key its publishable key, safe in a page
   * @param {object} [options] keptIn (the storage name), and for tests: storage, transport, clock, socket, timers
   */
  constructor(url, key, options = {}) {
    super();
    this.url = url.replace(/\/+$/, "");
    this.key = key;
    this.keptIn = options.keptIn ?? "backend_session";
    this.storage = options.storage ?? browserStorage();
    /** How a request is made: (method, url, headers, body) -> Promise<{ status, text }>. */
    this.transport = options.transport ?? fetchTransport;
    /** Seconds since 1970, as the platform counts. */
    this.clock = options.clock ?? (() => Date.now() / 1000);
    /** Opens the live socket: (url) -> a WebSocket. */
    this.socket = options.socket ?? ((at) => new WebSocket(at));
    this.timers = options.timers ?? { setTimeout: (...a) => setTimeout(...a), clearTimeout: (t) => clearTimeout(t) };
    /** Who is signed in: Supabase's session ({ access_token, refresh_token, expires_at, user }), or null. */
    this.session = null;
    this._refreshing = null;   // the refresh under way, which every caller waits on
    this._channels = new Map(); // topic -> Channel
    this._live = null;          // the open (or opening) socket
    this._liveOpen = false;
    this._wantLive = false;
    this._ref = 0;
    this._reconnects = 0;
    this._reconnectTimer = null;
    this._heartbeatTimer = null;
    this._heartbeatRef = "";    // the heartbeat the server hasn't answered yet
  }

  // --- who is signed in -------------------------------------------------------

  isSignedIn() { return Boolean(this.session?.access_token); }

  /** The signed-in player's id (a UUID, the same in every app, game and site), or "". */
  playerId() { return this.isSignedIn() ? String(this.session.user?.id ?? "") : ""; }

  /** The session kept from last time, refreshed if it has run out. Answers whether someone is signed in. */
  async restore() {
    let kept = null;
    try { kept = JSON.parse(this.storage.get(this.keptIn) ?? "null"); } catch { kept = null; }
    if (!kept || typeof kept !== "object" || !kept.refresh_token) return false;
    this.session = kept;
    if (this._expiring()) {
      // a refresh the server refuses signs the visitor out; no answer at all keeps the session for later
      await this.refresh();
      if (!this.isSignedIn()) return false;
    }
    this._say("signedIn", this.playerId());
    return true;
  }

  /**
   * A new player with no email or password, kept in this browser until linked to one.
   * `captchaToken` is Turnstile's answer, when the platform asks for one.
   */
  async signInAnonymously(captchaToken = "") {
    return this._startSession(await this._auth("POST", "/signup", withCaptcha({}, captchaToken)));
  }

  /** Step 1 of signing in by email: a six-digit code is emailed to this address. */
  async requestCode(email, captchaToken = "") {
    return this._auth("POST", "/otp", withCaptcha({ email, create_user: true }, captchaToken));
  }

  /** Step 2: the code from the email signs the player in. */
  async verifyCode(email, code) {
    return this._startSession(await this._auth("POST", "/verify", { type: "email", email, token: code }));
  }

  /**
   * Google's ID token (from Google's "Sign in with Google" button) signs the player in.
   * `nonce` is the raw nonce whose SHA-256 the button was given, if one was.
   */
  async signInWithGoogleToken(idToken, nonce = "") {
    const body = { provider: "google", id_token: idToken };
    if (nonce) body.nonce = nonce;
    return this._startSession(await this._auth("POST", "/token?grant_type=id_token", body));
  }

  /** A session made elsewhere - by a platform function - becomes this one. */
  async useSession(made) { return this._startSession(new Reply(200, made)); }

  /**
   * A fresh access token for the session, before the old one runs out. One at
   * a time: asked again while one runs, it answers that one's Reply. A refresh
   * the server refuses (the session was revoked) signs the visitor out; no
   * answer at all keeps the session, to try again later.
   */
  refresh() {
    if (this._refreshing) return this._refreshing;
    if (!this.session?.refresh_token) return Promise.resolve(new Reply(401, null, "Nobody is signed in"));
    this._refreshing = (async () => {
      const reply = await this._auth("POST", "/token?grant_type=refresh_token", { refresh_token: this.session.refresh_token }, false);
      if (reply.ok && reply.data?.access_token) {
        this._keep(reply.data);
        this._tellChannels();
      } else if (reply.status >= 400 && reply.status < 500) {
        this._forget();
      }
      return reply;
    })();
    this._refreshing.finally(() => { this._refreshing = null; });
    return this._refreshing;
  }

  /**
   * The signed-in player's access token, refreshed first if it is about to
   * run out, for a request made outside this client (a world's files): "" if
   * nobody is signed in.
   */
  async accessToken() {
    if (this._refreshing || this._expiring()) await this.refresh();
    return this.isSignedIn() ? String(this.session.access_token) : "";
  }

  async signOut() {
    if (this.isSignedIn()) await this._call("POST", `${this.url}/auth/v1/logout`, null);
    this._forget();
  }

  _startSession(reply) {
    if (reply.ok && reply.data?.access_token) {
      this._keep(reply.data);
      this._tellChannels();
      this._say("signedIn", this.playerId());
    } else if (reply.ok) {
      return new Reply(reply.status, reply.data, "The server didn't sign anyone in");
    }
    return reply;
  }

  _keep(made) {
    const kept = structuredClone(made);
    if (kept.expires_at === undefined && kept.expires_in !== undefined) kept.expires_at = this.clock() + Number(kept.expires_in);
    if (!kept.user && this.session?.user) kept.user = this.session.user;
    this.session = kept;
    this.storage.set(this.keptIn, JSON.stringify(kept));
  }

  _forget() {
    const was = this.isSignedIn();
    this.session = null;
    this.storage.remove(this.keptIn);
    if (was) {
      this._tellChannels();
      this._say("signedOut");
    }
  }

  // Joined channels go on as whoever is signed in now.
  _tellChannels() { for (const channel of this._channels.values()) channel._tokenChanged(); }

  _expiring() { return this.isSignedIn() && Number(this.session.expires_at ?? 0) - this.clock() < REFRESH_MARGIN; }

  // --- data ---------------------------------------------------------------------

  /** Rows of a table the visitor may see. `query` is PostgREST's: "done=eq.false&order=created_at". */
  select(table, query = "") { return this._call("GET", this._rest(table, "select=*" + (query ? `&${query}` : "")), null); }

  /** One row (an object) or several (an array); answers them as saved. */
  insert(table, rows) { return this._call("POST", this._rest(table, ""), rows, ["Prefer", "return=representation"]); }

  /** Changes to the rows `filter` picks ("id=eq.7"); answers them as saved. */
  update(table, filter, changes) {
    if (!filter) return Promise.resolve(new Reply(400, null, "An update needs a filter, so it can't change every row"));
    return this._call("PATCH", this._rest(table, filter), changes, ["Prefer", "return=representation"]);
  }

  /** Removes the rows `filter` picks. */
  delete(table, filter) {
    if (!filter) return Promise.resolve(new Reply(400, null, "A delete needs a filter, so it can't remove every row"));
    return this._call("DELETE", this._rest(table, filter), null);
  }

  /** A database function, by name, with named arguments. */
  callRpc(fn, args = {}) { return this._call("POST", `${this.url}/rest/v1/rpc/${encodeURIComponent(fn)}`, args); }

  /** A platform function (an Edge Function), by name, with a JSON body. */
  callFunction(name, body = {}) { return this._call("POST", `${this.url}/functions/v1/${encodeURIComponent(name)}`, body); }

  /**
   * A picture kept in the platform's public pictures bucket, in the signed-in
   * player's own folder (platform/sql/pictures.sql): its name there
   * ("dj.jpg") and the file or Blob, replacing one of the same name. Answers
   * { address }, the picture's public address, which changes each time so
   * no one is shown the old one from a cache.
   */
  async uploadPicture(name, file) {
    if (!this.isSignedIn()) return new Reply(401, null, "Sign in to upload a picture");
    if (this._refreshing || this._expiring()) await this.refresh();
    const path = `${this.playerId()}/${name}`;
    const headers = { apikey: this.key, Authorization: `Bearer ${this.session.access_token}`, "Content-Type": file.type || "application/octet-stream", "x-upsert": "true" };
    const { status, text } = await this.transport("POST", `${this.url}/storage/v1/object/pictures/${encodeURI(path)}`, headers, file);
    let parsed = null;
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
    if (status < 200 || status >= 300) return new Reply(status, parsed);
    return new Reply(status, { address: `${this.pictureAddress(path)}?v=${Math.round(this.clock())}` });
  }

  /** Where anyone sees a picture kept in the pictures bucket, by its path there. */
  pictureAddress(path) { return `${this.url}/storage/v1/object/public/pictures/${encodeURI(path)}`; }

  _rest(table, query) { return `${this.url}/rest/v1/${encodeURIComponent(table)}${query ? `?${query}` : ""}`; }

  // --- requests -----------------------------------------------------------------

  _auth(method, path, body, withSession = true) { return this._call(method, `${this.url}/auth/v1${path}`, body, null, withSession); }

  async _call(method, at, body, extra = null, withSession = true) {
    if (withSession && (this._refreshing || this._expiring())) await this.refresh();
    const headers = { apikey: this.key, "Content-Type": "application/json" };
    if (withSession && this.isSignedIn()) headers.Authorization = `Bearer ${this.session.access_token}`;
    if (extra) headers[extra[0]] = extra[1];
    const { status, text } = await this.transport(method, at, headers, body === null ? "" : JSON.stringify(body));
    let parsed = null;
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
    return new Reply(status, parsed);
  }

  // --- live ---------------------------------------------------------------------

  /** A live channel by name: changes to tables, and messages visitors send each other. Say what it listens to, then join it. */
  channel(name) {
    const topic = `realtime:${name}`;
    if (!this._channels.has(topic)) this._channels.set(topic, new Channel(this, topic));
    return this._channels.get(topic);
  }

  _liveWanted() {
    if (this._wantLive) return;
    this._wantLive = true;
    this._connect();
  }

  // No channel is wanted any more: the live socket closes, and isn't tried again.
  _liveUnwanted() {
    for (const channel of this._channels.values()) if (channel._wanted) return;
    this._wantLive = false;
    this._liveOpen = false;
    this.timers.clearTimeout(this._reconnectTimer);
    this.timers.clearTimeout(this._heartbeatTimer);
    const socket = this._live;
    this._live = null;
    try { socket?.close(); } catch { /* already closed */ }
  }

  _connect() {
    const at = `${this.url.replace(/^https:/, "wss:").replace(/^http:/, "ws:")}/realtime/v1/websocket?apikey=${encodeURIComponent(this.key)}&vsn=1.0.0`;
    let socket;
    try { socket = this.socket(at); } catch { this._closed(null); return; }
    this._live = socket;
    socket.onopen = () => { if (this._live === socket) this.liveOpened(); };
    socket.onmessage = (event) => { if (this._live === socket) this.hearLive(String(event.data)); };
    socket.onclose = () => { if (this._live === socket) this._closed(socket); };
    socket.onerror = () => {};
  }

  /** The live socket is open: every wanted channel joins, and the heartbeat starts. */
  liveOpened() {
    this._liveOpen = true;
    this._heartbeatRef = "";
    for (const channel of this._channels.values()) if (channel._wanted) channel._sendJoin();
    this._beatLater();
  }

  _beatLater() {
    this.timers.clearTimeout(this._heartbeatTimer);
    this._heartbeatTimer = this.timers.setTimeout(() => this._beat(), HEARTBEAT * 1000);
  }

  _beat() {
    if (!this._liveOpen) return;
    if (this._heartbeatRef) {
      // the last heartbeat went unanswered: the connection is dead though the socket looks open
      const socket = this._live;
      this._live = null;
      try { socket?.close(); } catch { /* already closed */ }
      this._closed(socket);
      return;
    }
    this._heartbeatRef = this._send("phoenix", "heartbeat", {});
    // keep the live token fresh too, without waiting for a call to need it
    if (this._expiring() && !this._refreshing) this.refresh();
    this._beatLater();
  }

  _closed(socket) {
    if (socket && this._live === socket) this._live = null;
    this._liveOpen = false;
    this.timers.clearTimeout(this._heartbeatTimer);
    for (const channel of this._channels.values()) channel.isJoined = false;
    if (!this._wantLive) return;
    const wait = RECONNECT_WAITS[Math.min(this._reconnects, RECONNECT_WAITS.length - 1)];
    this._reconnects += 1;
    this.timers.clearTimeout(this._reconnectTimer);
    this._reconnectTimer = this.timers.setTimeout(() => { if (this._wantLive) this._connect(); }, wait * 1000);
  }

  /** One message from the live socket, as text. */
  hearLive(text) {
    let message;
    try { message = JSON.parse(text); } catch { return; }
    if (!message || typeof message !== "object") return;
    if (message.topic === "phoenix" && String(message.ref ?? "") === this._heartbeatRef) {
      this._heartbeatRef = "";
      this._reconnects = 0;
      return;
    }
    this._channels.get(String(message.topic ?? ""))?._heard(message);
  }

  /** Sends one Phoenix message; answers its ref. A join's ref is also its join_ref. */
  _send(topic, event, payload, joinRef = "", isJoin = false) {
    this._ref += 1;
    const ref = String(this._ref);
    const message = { topic, event, payload, ref };
    if (isJoin) message.join_ref = ref;
    else if (joinRef) message.join_ref = joinRef;
    this._sendText(JSON.stringify(message));
    return ref;
  }

  _sendText(text) {
    if (this._liveOpen && this._live && this._live.readyState === 1) this._live.send(text);
  }
}

/** One live channel. Events: "changed" ({ type, table, record, old_record }), "broadcast" (event, payload), "joined", "joinFailed" (reason). */
export class Channel extends Speaker {
  constructor(backend, topic) {
    super();
    this.topic = topic;
    this.isJoined = false;
    this._backend = backend;
    this._changes = [];
    this._wanted = false;
    this._joinRef = "";
    this._rejoinTimer = null;
    this._rejoins = 0;
  }

  /** Listen for changes to a table the visitor may read: event is INSERT, UPDATE, DELETE or *. `filter` is Realtime's, such as "room_id=eq.7". */
  onChanges(table, event = "*", filter = "", schema = "public") {
    const wanted = { event, schema, table };
    if (filter) wanted.filter = filter;
    this._changes.push(wanted);
    return this;
  }

  join() {
    this._wanted = true;
    this._backend._channels.set(this.topic, this);
    this._backend._liveWanted();
    if (this._backend._liveOpen) this._sendJoin();
    return this;
  }

  /** Stops listening. The live socket closes once no channel is wanted. */
  leave() {
    this._wanted = false;
    this._backend.timers.clearTimeout(this._rejoinTimer);
    if (this.isJoined) this._backend._send(this.topic, "phx_leave", {});
    this.isJoined = false;
    if (this._backend._channels.get(this.topic) === this) this._backend._channels.delete(this.topic);
    this._backend._liveUnwanted();
  }

  /** A message to everyone else on this channel. */
  sendBroadcast(event, payload) {
    this._backend._send(this.topic, "broadcast", { type: "broadcast", event, payload }, this._joinRef);
  }

  _sendJoin() {
    const payload = { config: { broadcast: { self: false }, presence: { key: "" }, postgres_changes: this._changes } };
    if (this._backend.isSignedIn()) payload.access_token = this._backend.session.access_token;
    this._joinRef = this._backend._send(this.topic, "phx_join", payload, "", true);
  }

  _tokenChanged() {
    if (!this.isJoined) return;
    if (this._backend.isSignedIn()) {
      this._backend._send(this.topic, "access_token", { access_token: this._backend.session.access_token }, this._joinRef);
    } else {
      // signed out: the channel can't go on as the player, so it joins again as nobody
      this._backend._send(this.topic, "phx_leave", {}, this._joinRef);
      this.isJoined = false;
      this._sendJoin();
    }
  }

  _heard(message) {
    const payload = message.payload && typeof message.payload === "object" ? message.payload : {};
    switch (message.event) {
      case "phx_reply":
        if (String(message.ref ?? "") !== this._joinRef) return;
        if (payload.status === "ok") {
          this.isJoined = true;
          this._rejoins = 0;
          this._backend._reconnects = 0;
          this._say("joined");
        } else {
          this.isJoined = false;
          const reason = payload.response && typeof payload.response === "object" ? payload.response.reason : null;
          this._say("joinFailed", reason ? String(reason) : "refused");
        }
        break;
      case "postgres_changes": {
        const data = payload.data;
        if (!data || typeof data !== "object") return;
        this._say("changed", { type: data.type ?? "", table: data.table ?? "", record: data.record ?? {}, old_record: data.old_record ?? {} });
        break;
      }
      case "broadcast":
        this._say("broadcast", String(payload.event ?? ""), payload.payload && typeof payload.payload === "object" ? payload.payload : {});
        break;
      case "phx_error":
      case "phx_close":
        this.isJoined = false;
        if (this._wanted) {
          const wait = RECONNECT_WAITS[Math.min(this._rejoins, RECONNECT_WAITS.length - 1)];
          this._rejoins += 1;
          this._backend.timers.clearTimeout(this._rejoinTimer);
          this._rejoinTimer = this._backend.timers.setTimeout(() => {
            if (this._wanted && !this.isJoined && this._backend._liveOpen) this._sendJoin();
          }, wait * 1000);
        }
        break;
    }
  }
}

function withCaptcha(body, captchaToken) {
  if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken };
  return body;
}

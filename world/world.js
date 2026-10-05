// The engine: a general player of a world's modules (D-015, B11, B12). It
// knows nothing of any world. It asks the host where the seeker is and what
// comes next, fetches the modules the host names from storage (or from the
// browser's own copy: a version's files never change, C4), and plays each
// scene's front half with a fixed toolkit, the Scene below. Everything a scene
// makes through the toolkit is removed when the scene ends.
//
// A scene's front half is a module whose default export is called with the
// toolkit:
//
//   export default async function shore(scene) {
//     const sea = await scene.use("sea");          // a region it uses
//     sea(scene, { size: 400 });
//     const stone = scene.place(new scene.three.Mesh(...));
//     scene.onReach(stone.position, 3, () => scene.end("reached"));
//   }
//
// A region's or a spirit's front half exports a function the scene calls
// with its own toolkit, so what it places is the scene's to remove.
//
// A front half runs as the page does: it is published by the world's owner
// only. What it tells the host is a claim (F7); the host decides.

import { Dialogue } from "./dialogue.js?v=e1286f12e781";
import { Joysticks, touchScreen } from "./joysticks.js?v=e1286f12e781";
import { SEEKER, Speech } from "./speech.js?v=e1286f12e781";
import { Walker } from "./walker.js?v=e1286f12e781";

/** The Cache Storage the engine keeps module files in. */
export const FILES_CACHE = "world-files-v1";

// --- where things come from ------------------------------------------------------

/** The host on the platform: the world function, with the seeker's token (backend/). */
export function platformHost(backend) {
  return {
    async ask(body) {
      const reply = await backend.callFunction("world", body);
      const data = reply.data && typeof reply.data === "object" ? reply.data : {};
      return { ok: reply.ok, status: reply.status, body: data, error: reply.ok ? "" : String(data.error ?? reply.error ?? "") };
    },
  };
}

/**
 * Module files from the platform's private worlds bucket, with the seeker's
 * token, each kept in the browser under its versioned address (C3, C4, C5).
 */
export function platformFiles(backend, { caches = globalThis.caches, fetcher = (...a) => fetch(...a) } = {}) {
  return {
    async get(path) {
      const at = `${backend.url}/storage/v1/object/authenticated/worlds/${path.split("/").map(encodeURIComponent).join("/")}`;
      let cache = null;
      try { cache = caches ? await caches.open(FILES_CACHE) : null; } catch { cache = null; }
      const kept = await cache?.match(at, { ignoreVary: true }).catch(() => null);
      if (kept) return kept;
      const token = await backend.accessToken();
      const response = await fetcher(at, { headers: { Authorization: `Bearer ${token}`, apikey: backend.key } });
      if (!response.ok) throw new Error(`${path} couldn't be fetched (${response.status})`);
      await cache?.put(at, response.clone()).catch(() => {});
      return response;
    },
  };
}

/** Dev mode (web/world/dev/serve.mjs): the host and the files from the developer's machine, never kept. */
export function devHost(base) {
  return {
    async ask(body) {
      try {
        const response = await fetch(`${base}/host`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok, status: response.status, body: data, error: response.ok ? "" : String(data.error ?? "") };
      } catch {
        return { ok: false, status: 0, body: {}, error: "the dev server isn't running" };
      }
    },
  };
}

export function devFiles(base) {
  return {
    async get(path) {
      const response = await fetch(`${base}/files/${path}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`${path} couldn't be fetched (${response.status})`);
      return response;
    },
  };
}

/** A front half's text as a module: through a blob, so it runs as the module it is. */
export async function importText(text, name) {
  const url = URL.createObjectURL(new Blob([`${text}\n//# sourceURL=${name}`], { type: "text/javascript" }));
  try { return await import(url); } finally { URL.revokeObjectURL(url); }
}

// --- a scene and its toolkit -----------------------------------------------------

/** Everything a Three.js object holds that must be let go: geometries, materials, their textures. */
/** Whether an object is shown: it and everything it hangs from visible. */
function shown(object) {
  for (let at = object; at; at = at.parent) if (at.visible === false) return false;
  return true;
}

function dispose(object) {
  object.traverse?.((part) => {
    part.geometry?.dispose?.();
    const materials = Array.isArray(part.material) ? part.material : part.material ? [part.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose?.();
    }
  });
}

/** The toolkit a scene's front half is given (B11). Everything made through it is undone by leave() (B12). */
export class Scene {
  constructor(world, name, modules) {
    this.world = world;
    /** The scene's module. */
    this.module = name;
    this._modules = modules; // module -> { version, files, entry }
    this._undo = [];
    this._updaters = new Set();
    this._reaches = new Set();
    this._listeners = new Set(); // the characters the seeker can talk to: { voice, spirit, range, turns, said, dialogue, free, on }
    this._calls = [];            // words the seeker may say with nobody near: { pattern, then }
    this._presses = new Map(); // object -> handler
    this._left = false;
  }

  /** The Three.js namespace. */
  get three() { return this.world.three; }

  /** The seeker: their position (read it), moveTo(x, z, yaw), and which way they face (yaw). */
  get seeker() { return this.world.walker; }

  get left() { return this._left; }

  _keep(undo) { this._undo.push(undo); return undo; }

  /** Puts an object in the world, until the scene ends. */
  place(object) {
    this.world.stage.add(object);
    this._keep(() => { object.removeFromParent?.(); dispose(object); });
    return object;
  }

  /** Lights the world, until the scene ends: an object placed without being a thing to press. */
  light(object) { return this.place(object); }

  /** The sky behind everything (a colour, as 0x8fb4cc), until the scene ends. */
  sky(colour) {
    const was = this.world.stage.background;
    this.world.stage.background = new this.three.Color(colour);
    this._keep(() => { this.world.stage.background = was; });
  }

  /** `work(seconds, elapsed)` every frame, until stopped or the scene ends. Answers how to stop it. */
  every(work) {
    const entry = { work, from: this.world.clock };
    this._updaters.add(entry);
    const stop = () => this._updaters.delete(entry);
    this._keep(stop);
    return stop;
  }

  /** `then()` after `ms`, unless the scene has ended. */
  later(ms, then) {
    const timer = setTimeout(() => { if (!this._left) then(); }, ms);
    this._keep(() => clearTimeout(timer));
  }

  /** `then()` when the seeker comes within `radius` of `point` (x, z): once, or each time they come back if `{ again: true }`. */
  onReach(point, radius, then, { again = false } = {}) {
    const watch = { x: point.x, z: point.z, radius, then, again, inside: false };
    this._reaches.add(watch);
    this._keep(() => this._reaches.delete(watch));
  }

  /** `then()` when the seeker presses or taps `object` (or a part of it). */
  onPress(object, then) {
    this._presses.set(object, then);
    this._keep(() => this._presses.delete(object));
  }

  /** `then(event)` on each press of the key (its code: "KeyE", "Space"), until the scene ends. */
  onKey(code, then) {
    const heard = (event) => { if (event.code === code && !event.repeat && !/^(INPUT|TEXTAREA)$/.test(event.target?.tagName ?? "")) then(event); };
    globalThis.addEventListener?.("keydown", heard);
    this._keep(() => globalThis.removeEventListener?.("keydown", heard));
  }

  /**
   * The seeker rides a vessel until the scene ends (walker.js): W and S row,
   * A and D turn it slowly, nothing strafes. Each frame the scene reads
   * scene.seeker.position, .heading, .velocity and .rowing to move the
   * vessel, and sets scene.seeker.position.y to the seeker's eyes on it.
   */
  ride({ speed, turn } = {}) {
    this.world.walker.ride({ speed, turn });
    this._keep(() => this.world.walker.walk());
  }

  /** How big the world is drawn, in device pixels: { width, height }. */
  get pixels() {
    const canvas = this.world.renderer?.domElement;
    return { width: canvas?.width || 1280, height: canvas?.height || 720 };
  }

  /**
   * Where subtitles go in this scene: "auto" (the calmest part of the
   * picture, which the engine finds as it plays), or always "top", "middle"
   * or "bottom". Until the scene ends.
   */
  subtitles(where = "auto") {
    const was = this.world.subtitlesAt;
    this.world.subtitlesAt = where;
    this._keep(() => { this.world.subtitlesAt = was; });
  }

  /** The camera, taken from the seeker (a cut scene): they stop moving until it is given back or the scene ends. */
  takeCamera() {
    this.world.walker.paused = true;
    this.world.cameraTaken = true;
    this._keep(() => this.giveCameraBack());
    return this.world.camera;
  }

  giveCameraBack() {
    this.world.walker.paused = false;
    this.world.cameraTaken = false;
  }

  /** Words over the world for a while (or until replaced); "" clears them. */
  show(words, ms = 4000) {
    this.world.ui.show?.(words);
    if (words && ms) this.later(ms, () => this.world.ui.show?.(""));
  }

  /** What a module this scene uses exports: a region or a spirit, to call with this toolkit. */
  async use(module) {
    if (!this._modules.has(module)) throw new Error(`${this.module} doesn't use ${module}: name it in module.json's uses`);
    return (await this.world.moduleOf(module, this._modules.get(module))).default;
  }

  /** A file of this scene's module, or of a module it uses: its text, its JSON, or an address an image or sound can load from. */
  async text(file, module = this.module) { return (await this._file(module, file)).text(); }
  async json(file, module = this.module) { return (await this._file(module, file)).json(); }
  async url(file, module = this.module) {
    const url = URL.createObjectURL(await (await this._file(module, file)).blob());
    this._keep(() => URL.revokeObjectURL(url));
    return url;
  }

  async _file(module, file) {
    const live = this._modules.get(module);
    if (!live || !live.files.includes(file)) throw new Error(`${module} has no file ${file}`);
    return this.world.files.get(`${this.world.name}/${module}/${live.version}/${file}`);
  }

  /**
   * A creature's voice: its name and colour in the subtitles, and where it
   * is (an object of the scene, or a point), for the pointer. voice.say(words)
   * waits for the floor, is shown at reading pace, and answers when said.
   */
  voice({ name, colour = "#cfe8f2", at }) {
    const voice = { name: String(name), colour, at, say: (words) => this.world.speech.say(voice, words) };
    return voice;
  }

  /**
   * A character the seeker can talk to, within `range` of its voice. With a
   * dialogue tree (dialogue.js), it talks through the tree's choices, which
   * are free, and one of them is free talk; without one, or with the seeker's
   * dialogue choices turned off, the seeker speaks freely. Free talk goes to
   * `spirit` (a spirit this scene uses), on the server, and costs credits;
   * its answer is spoken by the voice. Only the page keeps the conversation (H1).
   *
   *   const gull = scene.character({ voice, spirit: "gull", tree: talk, range: 6 });
   *   gull.start();             // it begins the tree (its start node), when the scene says
   */
  character({ voice, spirit = null, tree = null, range = 4, turns = 20, game = {}, on = {} }) {
    if (spirit && !this._modules.has(spirit)) throw new Error(`${this.module} doesn't use ${spirit}`);
    // turns: as many as the spirit's module.json allows (spirit.max_turns); older ones are let go
    // on: what the tree's signals do ({ leave() {...} }), once their node's lines are said
    const character = { voice, spirit, range, turns, said: [], dialogue: null, free: false, on };
    if (tree) character.dialogue = new Dialogue(tree, { scene: this, ...game });
    this._listeners.add(character);
    this._keep(() => { this._listeners.delete(character); if (this.world.talking === character) this.world.talking = null; });
    return {
      character,
      /** Plays the tree from `node` (its start, unless named). */
      start: (node) => this.world.converse(character, node ?? tree?.start),
    };
  }

  /**
   * `then(words)` when the seeker says words matching `pattern` with nobody
   * near: Enter, then type, as if speaking to the world (it costs nothing).
   * A name, say, that calls a character back.
   */
  onCall(pattern, then) {
    const call = { pattern, then };
    this._calls.push(call);
    this._keep(() => { this._calls = this._calls.filter((c) => c !== call); });
  }

  /** A spirit that listens through a voice, with no tree: the seeker speaks freely to it. */
  listen(voice, { spirit, range = 4, turns = 20 }) {
    if (!this._modules.has(spirit)) throw new Error(`${this.module} doesn't use ${spirit}`);
    return this.character({ voice, spirit, range, turns }).character;
  }

  /**
   * The scene ends as `handler` of its back half says: it may grant, set
   * where the seeker returns, and name what comes next, which then plays.
   * Answers the handler's result.
   */
  async end(handler, input = {}) {
    if (this._left) return null;
    return this.world.call(this.module, handler, input);
  }

  /** Each frame: the scene's updaters and what the seeker reached. */
  _frame(seconds, clock) {
    for (const entry of [...this._updaters]) {
      try { entry.work(seconds, clock - entry.from); } catch (error) { this._updaters.delete(entry); this.world.failed(error); }
    }
    const at = this.world.walker.position;
    for (const watch of [...this._reaches]) {
      const inside = Math.hypot(at.x - watch.x, at.z - watch.z) <= watch.radius;
      if (inside && !watch.inside) {
        if (!watch.again) this._reaches.delete(watch);
        try { watch.then(); } catch (error) { this.world.failed(error); }
      }
      watch.inside = inside;
    }
  }

  /** The handler of a pressed object, looked for from the part pressed up through its parents. */
  _pressed(object) {
    for (let part = object; part; part = part.parent) {
      const then = this._presses.get(part);
      if (then) return then;
    }
    return null;
  }

  /** Undoes everything the scene did, newest first (B12). */
  leave() {
    if (this._left) return;
    this._left = true;
    for (const undo of this._undo.splice(0).reverse()) {
      try { undo(); } catch (error) { console.error(error); }
    }
    this._updaters.clear();
    this._reaches.clear();
    this._listeners.clear();
    this._calls = [];
    this._presses.clear();
  }
}

// --- the world --------------------------------------------------------------------

export class World {
  /**
   * @param {object} options
   *   name     the world's name ("latent_sea")
   *   host     platformHost(backend) or devHost(base)
   *   files    platformFiles(backend) or devFiles(base)
   *   three    the Three.js namespace
   *   canvas   where it is drawn; without one (or without WebGL) it plays undrawn
   *   ui       the page's: show(words), failed(words), credits({ free, bought, total, cost, typing })
   *   importer (text, name, path) -> a module; importText in a browser. A
   *            preview loads the file at its path instead (preview/preview.js)
   *   joysticks false to leave out the sticks a touch screen gets (joysticks.js)
   *   speech   options for the subtitles (speech.js): pace, wait, for tests
   */
  constructor({ name, host, files, three, canvas = null, ui = {}, joysticks = true, speech = {}, importer = importText, frames = globalThis.requestAnimationFrame?.bind(globalThis) }) {
    this.name = name;
    this.host = host;
    this.files = files;
    this.three = three;
    this.ui = ui;
    this.importer = importer;
    this.stage = new three.Scene();
    this.camera = new three.PerspectiveCamera(70, 1, 0.1, 5000);
    this.cameraTaken = false;
    this.walker = new Walker(three, canvas);
    this.scene = null;
    this.clock = 0;
    this._modules = new Map(); // "module@version" -> Promise<module>
    this._playing = Promise.resolve();
    this._frames = frames;
    this._running = false;
    this.renderer = null;
    if (canvas) {
      try {
        this.renderer = new three.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
      } catch {
        this.renderer = null; // no WebGL here: the world still plays, undrawn
      }
      canvas.addEventListener("click", (event) => this._click(event, canvas));
      // the aim, in the middle, while the mouse looks around
      this.aim = canvas.parentElement ? this._makeAim(canvas.parentElement) : null;
      // two sticks over the world, on a touch screen: they sit in what holds the canvas
      this.joysticks = canvas.parentElement && joysticks ? new Joysticks(this.walker, canvas.parentElement, canvas) : null;
    }
    // speech, as subtitles over the world, one speaker at a time
    this.choicesOn = true;     // the seeker's setting: dialogue choices, or always free talk
    this.talking = null;       // the character the seeker is speaking freely to
    this.credits = null;       // the seeker's credits, as the host last said: { free, bought, total, cost }
    this._openWhenFree = false;
    this.subtitlesAt = "auto"; // where the scene wants subtitles: auto, top, middle or bottom
    this._calm = { next: 0.3, band: null, rival: null, held: 0 };
    this._conversing = 0;        // trees playing now
    this.speech = new Speech({
      holder: canvas?.parentElement ?? null, touch: touchScreen(),
      where: (speaker) => this.onScreen(speaker.at),
      prompts: () => this.prompts(),
      spoken: (words) => this.answer(words),
      // the cost shows only while typing to a spirit: calling out to nobody is free
      typing: (open) => this.showCredits(open && !!this.talking),
      left: () => { this.calling = false; this.leaveFreeTalk(); },
      ...speech,
    });
    // the keys to talk: Enter, T to speak freely, the numbers to choose
    this._keys = (event) => {
      if (event.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? "")) return;
      if (event.key === "Enter") { if (this.talk()) event.preventDefault(); return; }
      if (event.code === "KeyT") { if (this.freeTalk()) event.preventDefault(); return; }
      if (event.code === "KeyC") { this.toggleChoices(); event.preventDefault(); return; }
      const digit = /^Digit([1-9])$/.exec(event.code);
      if (digit && this.speech.choose(Number(digit[1]))) event.preventDefault();
    };
    globalThis.addEventListener?.("keydown", this._keys);
  }

  /** The subtitles' text this many times its size at 1 (speech.js TEXT_SIZES): the seeker's setting. */
  setTextSize(size) { this.speech.setSize(size); }

  /** Whether a conversation is going on: someone speaking, choices waiting, the seeker typing, or a tree playing. */
  conversing() {
    const speech = this.speech;
    return this._conversing > 0 || !!this.talking || !!speech.offered || speech.typing || !speech.free();
  }

  /** The seeker's setting: dialogue choices offered (true), or every conversation free talk (false). */
  setChoices(on) {
    this.choicesOn = on !== false;
    if (!this.choicesOn) this.speech.withdraw();
    else for (const character of this.characters()) if (character.dialogue?.at && !character.free) this.offer(character);
  }

  /** Dialogue choices turned the other way (C, or the button on a phone): said briefly in the subtitles, and kept as the seeker's setting. */
  toggleChoices() {
    const on = !this.choicesOn;
    this.setChoices(on);
    this.speech.note(on ? "Dialogue choices on" : "Dialogue choices off · replies use credits");
    this.ui.choices?.(on);
  }

  /**
   * Buttons near a character, while the floor is free: on a phone only,
   * where they are the way to talk. A computer shows nothing: its keys
   * (Enter, T, C) are explained in the world itself.
   */
  prompts() {
    // (asked while the subtitles are still being made, too)
    if (!this.speech?.touch) return [];
    const near = this.listening();
    if (!near || this.talking) return [];
    // a phone has no C key: a button turns the choices on and off
    const toggle = near.dialogue ? [{ label: this.choicesOn ? "Choices: on" : "Choices: off", act: () => this.toggleChoices() }] : [];
    if (this.choicesOn && near.dialogue) {
      return [
        { label: "Talk", act: () => this.talk() },
        { label: "Speak freely", act: () => this.freeTalk() },
        ...toggle,
      ];
    }
    return [{ label: "Tap to speak", act: () => this.freeTalk() }, ...toggle];
  }

  /** The seeker's credits to the page: always the total; the cost of a message while they type. */
  showCredits(typing = false) {
    if (this.credits) this.ui.credits?.({ ...this.credits, typing });
  }

  /** Talk to the nearest character: its tree, where it is, or free talk without one (or with choices off). With nobody near, call out. */
  talk() {
    // speaking freely already: Enter is for the line (a blank one ends it)
    if (this.talking) return false;
    const near = this.listening();
    if (!near) return this.callOut();
    if (!this.choicesOn || !near.dialogue) return this.freeTalk(near);
    if (near.dialogue.at) { this.offer(near); return true; }
    this.converse(near, near.dialogue.tree.start);
    return true;
  }

  /** Plays a character's tree from a node: its lines, then on, or its choices, or the end. */
  async converse(character, node) {
    if (!character.dialogue || !node) return;
    this._conversing += 1;
    try {
      let step = character.dialogue.enter(node);
      for (;;) {
        for (const line of step.lines) await character.voice.say(line);
        // the script's signal, once its lines are said: the scene makes it happen
        if (step.signal) character.on?.[step.signal]?.();
        if (step.go) { step = character.dialogue.enter(step.go); continue; }
        break;
      }
      if (step.choices) this.offer(character);
    } finally {
      this._conversing -= 1;
    }
  }

  /** A character's waiting choices, under its words, unless the seeker has turned them off or speaks freely. */
  offer(character) {
    if (!this.choicesOn || character.free || !this.characters().has(character)) return;
    const choices = character.dialogue.choices();
    this.speech.offer(choices.map((c) => c.reply), (i) => this.pick(character, choices[i].id));
  }

  /** The characters of the scene playing. */
  characters() { return this.scene?._listeners ?? new Set(); }

  /** The seeker picks a choice: said as their line, then the tree goes on; or free talk. */
  async pick(character, id) {
    const next = character.dialogue.pick(id);
    if (next.free) { this.freeTalk(character); return; }
    this._conversing += 1;
    try {
      await this.speech.say({ ...SEEKER, seeker: true }, next.reply);
    } finally {
      this._conversing -= 1;
    }
    if (next.go) await this.converse(character, next.go);
  }

  /** Free talk with a character (the nearest, unless named): the seeker types into the subtitles, as soon as the floor is free. */
  freeTalk(character = this.listening()) {
    if (!character) return this.callOut();
    if (!character.spirit) return false;
    character.free = true;
    this.talking = character;
    this.speech.withdraw();
    if (!this.speech.open()) this._openWhenFree = true;
    return true;
  }

  /** With nobody near: the seeker may say something to the world, if the scene listens for any words (scene.onCall). */
  callOut() {
    if (!this.scene?._calls.length || !this.speech.open()) return false;
    this.calling = true;
    return true;
  }

  /** The seeker stops talking freely (rowed out of earshot): their line closed, and back to the tree's choices, if any. */
  stopTalking() {
    if (!this.talking && !this.calling && !this.speech.typing) return false;
    this.calling = false;
    this.speech.close();
    this.leaveFreeTalk();
    return true;
  }

  /** The seeker stops speaking freely: back to the tree's choices, if any. */
  leaveFreeTalk() {
    const character = this.talking;
    this._openWhenFree = false;
    this.talking = null;
    if (!character) return;
    character.free = false;
    if (character.dialogue?.at) this.offer(character);
  }

  /** Where a thing (an object or a point) is on screen, { x, y } from 0 to 1; behind the seeker, pushed to the edge it is nearest. */
  onScreen(at) {
    if (!at || !this.three.Vector3) return null;
    const point = new this.three.Vector3();
    if (at.isObject3D) at.getWorldPosition(point); else point.set(at.x ?? 0, at.y ?? 1.6, at.z ?? 0);
    if (!point.project) return null;
    point.project(this.camera);
    let x = point.x;
    let y = point.y;
    if (point.z > 1) { x = -x * 100; y = -y * 100; } // behind: the pointer turns away from where it would be
    return { x: (x + 1) / 2, y: (1 - y) / 2 };
  }

  /** The spirit listening nearest the seeker, within its range, or null. */
  listening() {
    let nearest = null;
    let best = Infinity;
    for (const listener of this.scene?._listeners ?? []) {
      const far = this.howFar(listener);
      if (far <= listener.range && far < best) { best = far; nearest = listener; }
    }
    return nearest;
  }

  /** How far a character is from the seeker, along the ground: Infinity when it is out of sight (hidden, or gone). */
  howFar(listener) {
    const at = listener.voice.at;
    if (at?.isObject3D && !shown(at)) return Infinity;
    const point = at?.isObject3D && this.three.Vector3 ? at.getWorldPosition(new this.three.Vector3()) : at;
    if (!point) return Infinity;
    const seeker = this.walker.position;
    return Math.hypot(seeker.x - point.x, seeker.z - point.z);
  }

  /** What the seeker said freely, answered by the character they speak to: its words come when the server gives them; then the seeker may speak again. */
  answer(words) {
    if (this.calling) {
      this.calling = false;
      for (const call of [...(this.scene?._calls ?? [])]) if (call.pattern.test(words)) call.then(words);
      return;
    }
    const character = this.talking ?? this.listening();
    if (!character?.spirit) return;
    character.said.push({ from: "seeker", text: words });
    // the server takes a conversation of at most so many turns; the oldest go first, so it always begins with the seeker
    while (character.said.length > character.turns * 2 - 1) character.said.splice(0, 2);
    const reply = this.say(character.spirit, character.said.map(({ from, text }) => ({ from, text }))).then((answered) => {
      if (answered.credits) { this.credits = answered.credits; this.showCredits(false); }
      if (answered.error) {
        character.said.pop();
        this.failed(answered.noCredits ? "You have no credits left for free talk." : answered.error);
        if (answered.noCredits) this.leaveFreeTalk();
        return "";
      }
      character.said.push({ from: "spirit", text: answered.reply });
      return answered.reply;
    });
    character.voice.say(reply).then(() => { if (this.talking === character) this._openWhenFree = true; });
  }

  /** The seeker's credits, as the host says: shown at once. */
  async loadCredits() {
    const asked = await this.host.ask({ action: "credits", world: this.name });
    if (asked.ok && asked.body.credits) { this.credits = asked.body.credits; this.showCredits(false); }
  }

  /** Where the seeker is: asked of the host, then played. */
  async enter() {
    const asked = await this.host.ask({ action: "enter", world: this.name });
    if (!asked.ok) throw new Error(asked.error || "the world can't be entered now");
    await this.play(asked.body);
    this.start();
    this.loadCredits().catch(() => {});
    return asked.body.scene;
  }

  /** A handler of a module's back half, and the scene it names next, if any. */
  async call(module, handler, input) {
    const asked = await this.host.ask({ action: "call", world: this.name, module, handler, input });
    if (!asked.ok) { this.failed(asked.error); return null; }
    if (asked.body.error) this.failed(asked.body.error);
    if (asked.body.scene) await this.play(asked.body);
    return asked.body.result ?? null;
  }

  /** A spirit's reply to the conversation so far: { reply, resting }, or { error }. */
  async say(spirit, messages) {
    const asked = await this.host.ask({ action: "say", world: this.name, spirit, messages });
    const credits = asked.body?.credits ?? null;
    if (!asked.ok) return { error: asked.error || "the spirit can't be reached", noCredits: asked.status === 402, credits };
    return { reply: String(asked.body.reply ?? ""), resting: asked.body.resting === true, credits };
  }

  /** The front half of a module at a version, imported once. */
  moduleOf(module, live) {
    const key = `${module}@${live.version}`;
    if (!this._modules.has(key)) {
      const made = (async () => {
        if (!live.entry) return { default: null };
        const response = await this.files.get(`${this.name}/${module}/${live.version}/${live.entry}`);
        const path = `${this.name}/${module}/${live.version}/${live.entry}`;
        return this.importer(await response.text(), `${this.name}/${module}/${live.entry}`, path);
      })();
      made.catch(() => this._modules.delete(key));
      this._modules.set(key, made);
    }
    return this._modules.get(key);
  }

  /** The scene the host named, in place of the one playing: one at a time, in the order asked. */
  play(answer) {
    this._playing = this._playing.then(() => this._play(answer), () => this._play(answer));
    return this._playing;
  }

  async _play({ scene: name, modules }) {
    const live = new Map(modules.map((m) => [m.module, { version: m.version, files: m.files ?? [], entry: m.entry ?? null }]));
    if (!live.has(name)) throw new Error(`the host named ${name} but sent no module for it`);
    // fetched before the old scene goes, so the change is quick
    const made = await this.moduleOf(name, live.get(name));
    this.scene?.leave();
    const scene = new Scene(this, name, live);
    this.scene = scene;
    if (typeof made.default !== "function") return;
    try {
      await made.default(scene);
    } catch (error) {
      this.failed(error);
    }
  }

  /** Draws and moves on each frame, until stopped. */
  start() {
    if (this._running || !this._frames) return;
    this._running = true;
    let last = null;
    const frame = (at) => {
      if (!this._running) return;
      const seconds = last === null ? 0 : Math.min(0.1, (at - last) / 1000);
      last = at;
      this.step(seconds);
      this._frames(frame);
    };
    this._frames(frame);
  }

  /** One frame: the seeker moves, the scene updates, and it is drawn. */
  step(seconds) {
    this.clock += seconds;
    this.walker.update(seconds);
    if (!this.cameraTaken) this.walker.aim(this.camera);
    this.scene?._frame(seconds, this.clock);
    // rowed or walked out of earshot: free talk is over
    if (this.talking && this.howFar(this.talking) > this.talking.range) this.stopTalking();
    // speaking freely: the seeker's turn again as soon as the floor is free
    if (this._openWhenFree && this.talking && this.speech.free() && this.speech.open()) this._openWhenFree = false;
    this.speech.frame();
    this._showAim();
    if (this.renderer) {
      const canvas = this.renderer.domElement;
      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      if (canvas.width !== Math.floor(width * this.renderer.getPixelRatio()) || canvas.height !== Math.floor(height * this.renderer.getPixelRatio())) {
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
      }
      this.renderer.render(this.stage, this.camera);
      this.placeSubtitles(seconds);
    }
  }

  /**
   * Subtitles where the picture is calmest: a few times a second, the frame
   * just drawn, shrunk to a few pixels, is scored band by band (top, middle,
   * bottom) by how bright and how busy it is. They move to another band only
   * once it has been clearly calmer for a moment, and only between
   * conversations: one stays where it began.
   * A scene may fix them instead (scene.subtitles).
   */
  placeSubtitles(seconds) {
    if (this.subtitlesAt !== "auto") { this.speech.placeAt(this.subtitlesAt); return; }
    const calm = this._calm;
    // a conversation stays where it began: the subtitles move only between conversations
    if (this.conversing()) {
      this.speech.wanted = this.speech.band;
      Object.assign(calm, { band: this.speech.band, rival: null, held: 0 });
      return;
    }
    calm.next -= seconds;
    if (calm.next > 0 || typeof document === "undefined") return;
    calm.next = 0.4;
    const scores = this.bandScores();
    if (!scores) return;
    const best = Object.keys(scores).reduce((a, b) => (scores[a] <= scores[b] ? a : b));
    if (!calm.band) { calm.band = best; this.speech.placeAt(best); return; }
    if (best === calm.band || scores[best] > scores[calm.band] * 0.7 - 4) { calm.rival = null; calm.held = 0; return; }
    if (calm.rival !== best) { calm.rival = best; calm.held = 0; }
    calm.held += 0.4;
    if (calm.held >= 1.6) { calm.band = best; calm.rival = null; calm.held = 0; this.speech.placeAt(best); }
  }

  /** How bright and busy each band of the frame just drawn is: { top, middle, bottom }, lower is calmer. */
  bandScores() {
    const W = 32;
    const H = 18;
    this._shrunk ??= Object.assign(document.createElement("canvas"), { width: W, height: H });
    const pen = this._shrunk.getContext("2d", { willReadFrequently: true });
    try {
      pen.drawImage(this.renderer.domElement, 0, 0, W, H);
    } catch {
      return null;
    }
    const { data } = pen.getImageData(0, 0, W, H);
    const light = (x, y) => { const i = (y * W + x) * 4; return 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]; };
    // each band: rows of the frame, leaving out the row of buttons along the top
    const bands = { top: [0.1, 0.38], middle: [0.36, 0.64], bottom: [0.62, 0.92] };
    const scores = {};
    for (const [band, [from, to]] of Object.entries(bands)) {
      let sum = 0;
      let busy = 0;
      let n = 0;
      for (let y = Math.floor(from * H); y < Math.ceil(to * H); y++) {
        for (let x = 0; x < W; x++) {
          const l = light(x, y);
          sum += l;
          if (x > 0) busy += Math.abs(l - light(x - 1, y));
          if (y > 0) busy += Math.abs(l - light(x, y - 1));
          n++;
        }
      }
      scores[band] = sum / n + 1.2 * (busy / n);
    }
    return scores;
  }

  /** The aim: a small ring in the middle of the world, brighter over something that can be pressed. */
  _makeAim(holder) {
    const ring = document.createElement("div");
    ring.className = "world-aim";
    ring.setAttribute("aria-hidden", "true");
    Object.assign(ring.style, {
      position: "absolute", zIndex: "1", left: "50%", top: "50%", width: "14px", height: "14px", margin: "-7px 0 0 -7px",
      borderRadius: "50%", border: "1.5px solid rgba(220, 245, 255, 0.55)", boxShadow: "0 0 6px rgba(140, 220, 255, 0.45)",
      pointerEvents: "none", display: "none", transition: "transform 120ms ease-out, border-color 120ms",
    });
    holder.appendChild(ring);
    return ring;
  }

  _showAim() {
    if (!this.aim) return;
    const shown = this.walker.mouseLooks && !this.cameraTaken;
    this.aim.style.display = shown ? "block" : "none";
    if (!shown) return;
    const on = this._pressable(new this.three.Vector2(0, 0)) !== null;
    this.aim.style.borderColor = on ? "rgba(255, 255, 255, 0.95)" : "rgba(220, 245, 255, 0.55)";
    this.aim.style.transform = on ? "scale(1.35)" : "none";
  }

  /** What the scene would do if the thing at this point of the screen (-1 to 1 each way) were pressed, or null. */
  _pressable(pointer) {
    const things = [...(this.scene?._presses.keys() ?? [])];
    if (!things.length || !this.three.Raycaster) return null;
    const ray = new this.three.Raycaster();
    ray.setFromCamera(pointer, this.camera);
    for (const hit of ray.intersectObjects(things, true)) {
      const then = this.scene._pressed(hit.object);
      if (then) return then;
    }
    return null;
  }

  /** A press: with the mouse looking around, on what the aim is on; otherwise a tap that wasn't a drag, where it was. */
  _click(event, canvas) {
    if (!this.scene) return;
    let pointer;
    if (this.walker.pressAimed) {
      pointer = new this.three.Vector2(0, 0);
    } else {
      // the click that takes the mouse presses nothing
      if (this.walker.pressedWith === "mouse" || this.walker.dragged > 6) return;
      const box = canvas.getBoundingClientRect();
      pointer = new this.three.Vector2(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    }
    this._pressable(pointer)?.();
  }

  failed(error) {
    const words = error instanceof Error ? error.message : String(error);
    console.error(`world: ${words}`);
    this.ui.failed?.(words);
  }

  stop() {
    this._running = false;
    this.scene?.leave();
    this.scene = null;
    this.walker.stop();
    this.joysticks?.stop();
    this.aim?.remove();
    this.speech.stop();
    globalThis.removeEventListener?.("keydown", this._keys);
    this.renderer?.dispose();
  }
}

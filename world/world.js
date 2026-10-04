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

import { Joysticks } from "./joysticks.js?v=1b3b6febfccb";
import { Walker } from "./walker.js?v=1b3b6febfccb";

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

  /** A conversation with a spirit this scene uses, until the seeker closes it. */
  talk(spirit) {
    if (!this._modules.has(spirit)) throw new Error(`${this.module} doesn't use ${spirit}`);
    return this.world.ui.talk?.(spirit) ?? Promise.resolve();
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
   *   ui       the page's: show(words), talk(spirit) -> Promise, failed(words)
   *   importer (text, name) -> a module; importText in a browser
   *   joysticks false to leave out the sticks a touch screen gets (joysticks.js)
   */
  constructor({ name, host, files, three, canvas = null, ui = {}, joysticks = true, importer = importText, frames = globalThis.requestAnimationFrame?.bind(globalThis) }) {
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
      // two sticks over the world, on a touch screen: they sit in what holds the canvas
      this.joysticks = canvas.parentElement && joysticks ? new Joysticks(this.walker, canvas.parentElement, canvas) : null;
    }
  }

  /** Where the seeker is: asked of the host, then played. */
  async enter() {
    const asked = await this.host.ask({ action: "enter", world: this.name });
    if (!asked.ok) throw new Error(asked.error || "the world can't be entered now");
    await this.play(asked.body);
    this.start();
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
    if (!asked.ok) return { error: asked.error || "the spirit can't be reached" };
    return { reply: String(asked.body.reply ?? ""), resting: asked.body.resting === true };
  }

  /** The front half of a module at a version, imported once. */
  moduleOf(module, live) {
    const key = `${module}@${live.version}`;
    if (!this._modules.has(key)) {
      const made = (async () => {
        if (!live.entry) return { default: null };
        const response = await this.files.get(`${this.name}/${module}/${live.version}/${live.entry}`);
        return this.importer(await response.text(), `${this.name}/${module}/${live.entry}`);
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
    }
  }

  /** A tap that wasn't a drag: whatever was pressed, if the scene listens for it. */
  _click(event, canvas) {
    if (this.walker.dragged > 6 || !this.scene) return;
    const box = canvas.getBoundingClientRect();
    const pointer = new this.three.Vector2(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    const ray = new this.three.Raycaster();
    ray.setFromCamera(pointer, this.camera);
    for (const hit of ray.intersectObjects(this.stage.children, true)) {
      const then = this.scene._pressed(hit.object);
      if (then) { then(); return; }
    }
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
    this.renderer?.dispose();
  }
}

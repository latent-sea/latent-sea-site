// The chimes: who hears which bell. The only API above the belfry, and the
// one place both ends are held, which is why dropping a region takes
// everything in it at once.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// TWO WAYS TO HEAR. listen(listener, region, name): the listener's heard(name)
// is called on a ring, for a bell known by address - COMMAND_RAN above all.
// follow(listener, key, work): the heart of reactivity - the work runs now,
// what it read is noted (reads.js), and the listener is wired to exactly
// those bells; when one rings, the work runs again and the wires move to
// what it read this time. Nobody lists what to listen to.
//
// Nothing dispatches while any bell sounds (commands.js asks isStriking).

import { Belfry, GLOBAL } from "./belfry.js?v=8f6b5a6cb574";
import { Reads } from "./reads.js?v=8f6b5a6cb574";

const LISTENED = "";

class Follow {
  constructor(listener, key, again) {
    this.listener = listener;
    this.key = key;
    this.at = new Map(); // address -> arrival
    this.work = null;
    this.moved = null;
    this._again = again;
    this.arrive = () => {
      if (this.moved) this.moved();
      else this._again(this.work, this.listener, this.key);
    };
  }
}

export class Chimes {
  static GLOBAL = GLOBAL;
  static RESERVED = [GLOBAL];
  static LISTENED = LISTENED;

  constructor(belfry = new Belfry()) {
    this.belfry = belfry;
    this._held = new Map(); // listener -> Map(key -> Map(address -> arrival))
    this._follows = new Map(); // listener -> Map(key -> Follow)
    this._homes = new Map(); // listener -> region
    this._members = new Map(); // region -> Set(listener)
    this._waiting = new Map(); // address -> Map(listener -> Map(key -> arrival)): wires to bells not hung yet
  }

  /** A bell hung; anything that was waiting to hear it is connected. */
  register(region, name) {
    const bell = this.belfry.register(region, name);
    if (bell) this._hung(bell);
    return bell;
  }

  strike(region, name) {
    Reads.moved(region, name);
    this.belfry.strike(region, name);
  }

  isStriking() { return this.belfry.isStriking(); }

  /** The listener's heard(name) called whenever the bell at this region and name rings. */
  listen(listener, region, name) {
    for (const at of this._held.get(listener)?.get(LISTENED)?.keys() ?? []) {
      const other = this.belfry.bellAt(at);
      if (other && other.name === name) {
        console.error(`already listening to something called ${name}, in ${other.region}; heard() gets the name alone, so a listener hearing both must be two listeners`);
        return;
      }
    }
    if (!this.belfry.has(region, name)) {
      console.error(`nothing is hung at ${region}/${name} to listen to`);
      return;
    }
    const bell = this.belfry.at(region, name);
    this._make(listener, bell.at, () => listener.heard(name), LISTENED);
  }

  /**
   * The work run now, and again whenever anything it read moves; given moved,
   * that is called instead of the work, and the work is not run again until
   * follow is called again.
   */
  follow(listener, key, work, moved = null) {
    const read = Reads.tracked(work);
    let record = this._follows.get(listener)?.get(key) ?? null;
    const standing = record ? record.at : new Map();
    if (read.size === standing.size && [...read].every((at) => standing.has(at))) {
      if (record) { record.work = work; record.moved = moved; }
      return;
    }
    if (!record) {
      record = new Follow(listener, key, (w, l, k) => this.follow(l, k, w));
      if (!this._follows.has(listener)) this._follows.set(listener, new Map());
      this._follows.get(listener).set(key, record);
    }
    record.work = work;
    record.moved = moved;
    for (const at of read) if (!standing.has(at)) this._make(listener, at, record.arrive, key);
    for (const at of [...standing.keys()]) if (!read.has(at)) this._cut(listener, key, at);
  }

  /** The listener no longer hears bells of this name. */
  stop(listener, name) {
    for (const at of [...(this._held.get(listener)?.get(LISTENED)?.keys() ?? [])]) {
      const bell = this.belfry.bellAt(at);
      if (!bell || bell.name === name) this._cut(listener, LISTENED, at);
    }
  }

  unfollow(listener, key) { this._cutKey(listener, key); }

  stopListening(listener) { this._cutKey(listener, LISTENED); }

  /** Everything the listener hears and follows, cut: what a model does as it is disposed. */
  stopAll(listener) {
    for (const key of [...(this._held.get(listener)?.keys() ?? [])]) this._cutKey(listener, key);
  }

  /** The region gone: its listeners' wires, the wires into its bells, its bells, and what was read of it. */
  dropRegion(region) {
    for (const listener of [...(this._members.get(region) ?? [])]) this.stopAll(listener);
    for (const bell of this.belfry.bellsIn(region)) this._cutAt(bell.at);
    this.belfry.dropRegion(region);
    Reads.forget(region);
  }

  dropBell(region, name) {
    if (this.belfry.has(region, name)) this._cutAt(this.belfry.at(region, name).at);
    this.belfry.dropBell(region, name);
  }

  heardBy(listener) {
    return [...(this._held.get(listener)?.get(LISTENED)?.keys() ?? [])].map((at) => this.belfry.bellAt(at)).filter(Boolean).map((bell) => bell.name);
  }

  followedBy(listener, key) {
    return [...(this._follows.get(listener)?.get(key)?.at.keys() ?? [])].map((at) => this.belfry.bellAt(at)).filter(Boolean).map((bell) => [bell.region, bell.name]);
  }

  listenersOf(region, name) {
    if (!this.belfry.has(region, name)) return [];
    const bell = this.belfry.at(region, name);
    return [...new Set(bell.ends().map(([listener]) => listener))];
  }

  count() { return [...this.belfry._at.values()].reduce((n, bell) => n + bell.count(), 0); }

  countListeners() { return this._held.size; }

  _make(listener, at, arrival, key) {
    if (!this._held.has(listener)) {
      this._held.set(listener, new Map());
      const home = typeof listener.region === "string" ? listener.region : "";
      this._homes.set(listener, home);
      if (!this._members.has(home)) this._members.set(home, new Set());
      this._members.get(home).add(listener);
    }
    const keys = this._held.get(listener);
    if (key !== LISTENED) {
      keys.set(key, this._follows.get(listener).get(key).at);
    } else if (!keys.has(key)) {
      keys.set(key, new Map());
    }
    keys.get(key).set(at, arrival);
    const bell = this.belfry.bellAt(at);
    if (bell) {
      bell.connect(arrival, [listener, key]);
    } else {
      if (!this._waiting.has(at)) this._waiting.set(at, new Map());
      if (!this._waiting.get(at).has(listener)) this._waiting.get(at).set(listener, new Map());
      this._waiting.get(at).get(listener).set(key, arrival);
    }
  }

  _hung(bell) {
    const waiting = this._waiting.get(bell.at);
    if (!waiting) return;
    for (const [listener, keys] of waiting) for (const [key, arrival] of keys) bell.connect(arrival, [listener, key]);
    this._waiting.delete(bell.at);
  }

  _cut(listener, key, at) {
    const keys = this._held.get(listener);
    const arrival = keys?.get(key)?.get(at);
    if (arrival === undefined) return;
    const bell = this.belfry.bellAt(at);
    if (bell) bell.disconnect(arrival);
    this._waiting.get(at)?.get(listener)?.delete(key);
    keys.get(key).delete(at);
    if (keys.get(key).size === 0) {
      keys.delete(key);
      if (key !== LISTENED) {
        this._follows.get(listener)?.delete(key);
        if (this._follows.get(listener)?.size === 0) this._follows.delete(listener);
      }
    }
    if (keys.size === 0) {
      this._held.delete(listener);
      this._follows.delete(listener);
      this._members.get(this._homes.get(listener))?.delete(listener);
      this._homes.delete(listener);
    }
  }

  _cutKey(listener, key) {
    for (const at of [...(this._held.get(listener)?.get(key)?.keys() ?? [])]) this._cut(listener, key, at);
  }

  _cutAt(at) {
    const bell = this.belfry.bellAt(at);
    if (!bell) return;
    for (const [listener, key] of [...bell.ends()]) this._cut(listener, key, at);
  }
}

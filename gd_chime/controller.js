// A controller: the base of a model. It keeps facts as values, each ringing
// the model's one bell as it is set; it answers for actions through the
// door (commands.js): answers() names them, would() refuses one with a
// reason, told() does one.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// A model registers in the region of the screen it was handed to, or in the
// global region when the app registers it (ChimeApp.model), and is dropped
// with that region. Disposed, it stops hearing everything.

import { Chimes } from "./chimes.js?v=e1286f12e781";
import { OwnBell } from "./own_bell.js?v=e1286f12e781";
import { Value } from "./value.js?v=e1286f12e781";

let regions = 0;
const owned = new Set();

export class Controller {
  constructor(chimes, listening = [], inRegion = Chimes.GLOBAL) {
    this._chimes = chimes;
    this.region = inRegion;
    this._values = new OwnBell("values");
    this._values.hang(chimes);
    this.disposed = false;
    this.listen(listening);
  }

  /** A region of this model's own, named after its kind, dropped with it. */
  static ownRegion(kind) {
    const named = `${kind}_${++regions}`;
    owned.add(named);
    return named;
  }

  get chimes() { return this._chimes; }

  registerBell(name) { return this._chimes.register(this.region, name); }

  /** Hear these bells by address, [[region, name], ...], and no others. */
  listen(listening) {
    this._chimes.stopListening(this);
    for (const [region, name] of listening) this.listenTo(region, name);
  }

  listenTo(region, name) { this._chimes.listen(this, region, name); }

  stopListeningTo(name) { this._chimes.stop(this, name); }

  strike(region, name) { this._chimes.strike(region, name); }

  listeningTo() { return this._chimes.heardBy(this); }

  /** The actions this model answers for, registered where it stands. */
  answers() { return []; }

  /** Why this action cannot be done now, as a phrase, or null: the door asks before telling. */
  would(_action, _payload) { return null; }

  /** The action done, answering null, or why it was refused after all. Every handler defines it. */
  told(action, _payload) { throw new Error(`${this.constructor.name} answers ${action} and does not define told()`); }

  /** A fact kept here: a value ringing this model's bell, or the bell given. */
  value(initial, on = null) { return new Value(on ?? this._values, initial); }

  /** Work done now and whenever anything it read moves. */
  follow(key, work, moved = null) { this._chimes.follow(this, key, work, moved); }

  /** A bell listened to by address rang: by default, nothing. */
  heard(_what) {}

  /** The model let go: it hears nothing more, its bell is taken down, and a region of its own is dropped. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._chimes.stopAll(this);
    this._values.dispose();
    if (owned.has(this.region)) {
      owned.delete(this.region);
      this._chimes.dropRegion(this.region);
    }
  }
}

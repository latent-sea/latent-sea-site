// A bound value: a read, which knows what it read.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// A primitive given one reads it as it draws, and IS DRAWN AGAIN WHEN
// ANYTHING IT READ MOVES: every model value read on the way notes its bell
// (reads.js), and the reader listens to exactly those. Nobody lists what to
// listen to. A model's value is one itself (value.js); a value worked out
// from others is a function (ui.bound), and reads whatever the function
// read, however it came to read it.
//
// map(format) is for presentation formatting only: the value passed through
// a function on the way, on whatever the value read. A handle, the item an
// each hands its template, is a bound value too, and field(key) reads one
// key of the item it holds. A template must read through the handle, not
// from it: while the template function itself runs, a read of the handle is
// the item's value being copied into a description, which would go stale
// with nobody told, and is reported.

import { Reads } from "./reads.js?v=61c20b1d6568";

export class Bound {
  constructor(read, answerer = null) {
    this._read = read;
    this._answerer = answerer;
    this._templateRunning = false;
  }

  /** The value as it is now. */
  read() {
    if (this._templateRunning) {
      console.error("a template read its handle while describing; bind the handle instead, so the description re-reads it");
    }
    return this._read();
  }

  /** The control this is the answer of, if any: a reader of it is drawn again when the control is. */
  answerer() { return this._answerer; }

  /** Whether the template this is the handle of is running now: set around the template's call alone, by the builder. */
  setTemplateRunning(running) { this._templateRunning = running; }

  /** The same value through a formatting function. */
  map(format) { return new Bound(() => format(this.read()), this._answerer); }

  /** One key of the object or one index of the array this reads. */
  field(key) { return this.map((item) => (item == null ? null : item[key])); }

  /** A value that never moves: it reads nothing, so nothing is listened to. */
  static constant(value) { return new Bound(() => value); }

  /** A value read from any number of bound values at once, moving on whatever any of them read. */
  static all(sources, blend) { return new Bound(() => blend(...sources.map((source) => source.read()))); }

  /** The two-source case of all(). */
  static both(a, b, blend) { return Bound.all([a, b], blend); }

  /** A value read by this function that moves on the bell at this address and on nothing else. */
  static onBell(read, region, bell) {
    const at = Reads.hung(region, bell);
    return new Bound(() => Reads.apartAt(read, at));
  }

  /** Whether this is a bound value: what a primitive asks of what it was given. */
  static is(value) { return value instanceof Bound; }
}

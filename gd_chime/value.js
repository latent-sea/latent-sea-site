// A model's value: a fact kept in one place, read by whoever cares - which
// notes the bell it moves on - and set by the model alone, which rings it.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// It always rings when set, even to an equal value: an array or an object
// may have been changed in place.

import { Bound } from "./bound.js?v=61c20b1d6568";
import { Reads } from "./reads.js?v=61c20b1d6568";

export class Value extends Bound {
  constructor(bell, initial) {
    super(() => this._held);
    this._bell = bell;
    this._at = bell.getAt();
    this._held = initial;
  }

  read() {
    Reads.noteAt(this._at);
    return this._held;
  }

  setValue(to) {
    this._held = to;
    this._bell.moved();
  }

  /** The value through a function of what it is now: counted.update(n => n + 1). */
  update(change) { this.setValue(change(this._held)); }
}

// A bell of a thing's own: hung at an address made for it alone, rung once
// at the end of the frame however many times it was moved.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.

import { Frames } from "./frames.js?v=e1286f12e781";
import { Reads } from "./reads.js?v=e1286f12e781";

let made = 0;

export class OwnBell {
  constructor(kind, named = "") {
    made++;
    this._address = named || `${kind}_${made}`;
    this._at = Reads.hung(this._address, this._address);
    this._chimes = null;
    this._due = false;
  }

  hang(chimes) {
    this._chimes = chimes;
    chimes.register(this._address, this._address);
  }

  getAddress() { return this._address; }

  getAt() { return this._at; }

  /** A read of what this rings for. */
  noted() { Reads.noteAt(this._at); }

  /** What this rings for has moved: counted now, rung at the end of the frame, once. */
  moved() {
    Reads.moved(this._address, this._address);
    if (this._due) return;
    this._due = true;
    Frames.defer(() => this._ring());
  }

  _ring() {
    this._due = false;
    if (this._chimes) this._chimes.strike(this._address, this._address);
  }

  /** The bell taken down, with everything wired to it: what the thing that owns it does as it is disposed. */
  dispose() {
    if (this._chimes) this._chimes.dropRegion(this._address);
    this._chimes = null;
  }
}

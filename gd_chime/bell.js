// A bell: it can be struck, and it carries nothing. Struck, it tells whoever
// is listening that something they care about is different; it never says
// what. The listener reads the model that struck it.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.

export class Bell {
  constructor(region, name, at) {
    this.region = region;
    this.name = name;
    this.at = at; // the interned "region/name"
    this._listeners = []; // [[arrival, end], ...] in connection order; end names who connected it
  }

  /** Whoever is listening told, in the order they connected. */
  strike() {
    for (const [arrival] of [...this._listeners]) arrival();
  }

  connect(arrival, end) { this._listeners.push([arrival, end]); }

  disconnect(arrival) {
    const i = this._listeners.findIndex(([a]) => a === arrival);
    if (i >= 0) this._listeners.splice(i, 1);
  }

  /** The ends connected: who listens, and under what key. */
  ends() { return this._listeners.map(([, end]) => end); }

  count() { return this._listeners.length; }
}

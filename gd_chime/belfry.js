// The belfry: every bell hung, by region and name, and the striking of them.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// Striking an address nobody has hung is quiet by design: the screen that
// asked may have closed before the answer came.

import { Bell } from "./bell.js?v=1b3b6febfccb";
import { Reads } from "./reads.js?v=1b3b6febfccb";

export const GLOBAL = "global";

export class Belfry {
  constructor() {
    this._held = new Map(); // region -> Map(name -> Bell)
    this._at = new Map(); // address -> Bell
    this._striking = 0;
  }

  /** A bell hung at this region and name; hanging one where one hangs is refused out loud, and the first stays. */
  register(region, name) {
    if (this.has(region, name)) {
      console.error(`${region}/${name} is already hung`);
      return null;
    }
    const bell = new Bell(region, name, Reads.hung(region, name));
    if (!this._held.has(region)) this._held.set(region, new Map());
    this._held.get(region).set(name, bell);
    this._at.set(bell.at, bell);
    return bell;
  }

  has(region, name) { return this._held.get(region)?.has(name) ?? false; }

  /** The bell struck, its listeners run now, in order; nothing hung there, nothing happens. */
  strike(region, name) {
    const bell = this._held.get(region)?.get(name);
    if (!bell) return;
    this._striking++;
    try { bell.strike(); } finally { this._striking--; }
  }

  isStriking() { return this._striking > 0; }

  at(region, name) { return this._held.get(region).get(name); }

  bellAt(at) { return this._at.get(at) ?? null; }

  bellsIn(region) { return [...(this._held.get(region)?.values() ?? [])]; }

  dropBell(region, name) {
    const bell = this._held.get(region)?.get(name);
    if (!bell) return;
    this._at.delete(bell.at);
    this._held.get(region).delete(name);
    if (this._held.get(region).size === 0) this._held.delete(region);
  }

  dropRegion(region) {
    for (const bell of this.bellsIn(region)) this._at.delete(bell.at);
    this._held.delete(region);
  }

  count() { return this._at.size; }
}

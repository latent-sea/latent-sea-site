// What a piece of work read: the address of every bell that what it read
// moves on, noted as it is read, so whoever did the work listens to exactly
// those.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// A value, read, notes the bell its model rings (value.js); so does a read
// of anything else that moves on a bell of its own - where the reader is,
// which the driver rings for. Whoever is about to work begins, works, and
// ends with the addresses read in between, each once, in the order first
// read; the chimes wire the worker to exactly those (chimes.js, follow) and
// the next piece of work replaces them. Nobody lists what to listen to, so
// nothing listed can be forgotten, and a read the work stopped making is no
// longer heard.
//
// AN ADDRESS IS ONE STRING, "region/bell", made as the bell is hung (hung)
// and kept under the region and the name it was made from. Work nests - a
// piece built while another draws - so what is being noted is a stack, and
// a read lands in the innermost work alone. A read made while no work is
// being noted is noted nowhere.
//
// HOW OFTEN WHAT A BELL RINGS FOR HAS MOVED IS COUNTED PER ADDRESS (moved),
// which is how work kept with what it read lets itself go (worked): the
// count is taken as the work is done and compared as it is next read.

const open = []; // the set of addresses read so far by each piece of work begun, innermost last
const addresses = new Map(); // region -> Map(name -> address)
const moves = new Map(); // address -> how often what the bell there rings for has moved

export const Reads = {
  /** Work is beginning: what it reads is noted for it. */
  begin() { open.push(new Set()); },

  /** The work is done: the set of addresses it read, each once, in the order first read. */
  end() { return open.pop(); },

  /** Work done with what it read noted, handing back the set of addresses. */
  tracked(work) {
    open.push(new Set());
    try { work(); } finally { return open.pop(); }
  },

  /** The one name the address of a bell hung at this region and name is known by, made now if never made. */
  hung(region, bell) {
    let named = addresses.get(region);
    if (!named) { named = new Map(); addresses.set(region, named); }
    let at = named.get(bell);
    if (at === undefined) { at = `${region}/${bell}`; named.set(bell, at); }
    return at;
  },

  /** A read of something that moves on the bell known by this one name. */
  noteAt(at) { if (open.length) open[open.length - 1].add(at); },

  /** A read of something that moves on the bell at this address, named as the region and the name. */
  note(region, bell) { if (open.length) open[open.length - 1].add(Reads.hung(region, bell)); },

  /** What the bell at this address rings for has moved: whatever was kept with a read of it is worked out afresh. */
  moved(region, bell) { const at = Reads.hung(region, bell); moves.set(at, (moves.get(at) ?? 0) + 1); },

  /** The region is gone, and its bells with it. */
  forget(region) {
    for (const at of (addresses.get(region) ?? new Map()).values()) moves.delete(at);
    addresses.delete(region);
  },

  /** Work done apart from the work around it: what it reads is noted for nothing. */
  apart(work) { Reads.tracked(work); },

  /** Work done apart from the work around it, and what it came to noted at this one address in its place. */
  apartAt(work, at) {
    open.push(new Set());
    let answer;
    try { answer = work(); } finally { open.pop(); }
    Reads.noteAt(at);
    return answer;
  },

  /**
   * Work done once and kept with what it read: held is [] until worked out, then
   * [what it came to, [[address, moves at the time], ...]]; anything it read
   * having moved since, it is worked out again.
   */
  worked(held, work) {
    if (held.length) {
      for (const [at, count] of held[1]) {
        if (count !== (moves.get(at) ?? 0)) { held.length = 0; break; }
      }
    }
    if (!held.length) {
      Reads.begin();
      let answer;
      try { answer = work(); } finally { held.push(answer); held.push([...Reads.end()].map((at) => [at, moves.get(at) ?? 0])); }
    }
    if (open.length) for (const [at] of held[1]) open[open.length - 1].add(at);
    return held[0];
  },

  /** How deep the noting stands: for a test of the stack's balance. */
  depth() { return open.length; },
};

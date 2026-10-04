// The driver: where the reader is, and the moves between places. Every read
// of where the reader is notes NAVIGATED, so whatever reads it follows the
// reader; every move rings it.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// THE STATE is the path from the app down to the screen the reader is on,
// the pop-ups raised over it (each a path from its root), the parameter
// each place was entered with, the child each place was last left at, and
// the history of paths for going back. A move is worked out first
// (transition) and refused with a phrase or carried out: the places left are
// emptied, those entered filled, every place shown or hidden, and
// NAVIGATED rung.
//
// The four commands are for code and the console; a button never declares
// one - it navigates by where its action goes (performs).

import { Chimes } from "./chimes.js?v=2780c1afa36a";
import { Controller } from "./controller.js?v=2780c1afa36a";
import { Phrase } from "./phrase.js?v=2780c1afa36a";
import { Reads } from "./reads.js?v=2780c1afa36a";

const HISTORY_CAP = 50;

export class Driver extends Controller {
  static GO = "go";
  static GOES_BACK = "go_back";
  static LOWERS = "lower";
  static FORGETS = "forget_the_way_back";
  static COMMANDS = [Driver.GO, Driver.GOES_BACK, Driver.LOWERS, Driver.FORGETS];
  static BACK = "where_they_were";
  static NAVIGATED = "navigated";

  constructor(chimes) {
    super(chimes, [], Chimes.GLOBAL);
    this.registerBell(Driver.NAVIGATED);
    this.door = null;
    this.places = new Map(); // name -> Place
    this.app = null;
    this._state = { path: [], overlays: [], params: {}, last: {}, history: [], historyParams: [] };
    this._scrolled = new Map(); // a screen -> how far down the page the reader was as they left it
  }

  answers() { return Driver.COMMANDS; }

  // --- reading where the reader is ---

  where() { Reads.note(Chimes.GLOBAL, Driver.NAVIGATED); return this._state; }

  getParameter(place) { return this.where().params[place] ?? null; }

  /** The path of the layer on top: the pop-up over everything, else the screen. */
  getTop() {
    const state = this.where();
    return state.overlays.length ? state.overlays[state.overlays.length - 1] : state.path;
  }

  isRaised() { return this.where().overlays.length > 0; }

  canGoBack() { const state = this.where(); return state.overlays.length > 0 || state.history.length > 1; }

  /** Whether this place is shown: on the path or a pop-up raised. */
  isActive(name) { const state = this.where(); return state.path.includes(name) || state.overlays.some((path) => path.includes(name)); }

  getState() { return structuredClone(this._state); }

  // --- the places ---

  addPlace(place) {
    if (this.places.has(place.name)) {
      console.error(`two places are named ${place.name}; the first keeps the name`);
      return false;
    }
    this.places.set(place.name, place);
    if (place.kind === "app") this.app = place;
    return true;
  }

  removePlace(place) { if (this.places.get(place.name) === place) this.places.delete(place.name); }

  placeNamed(name) { return this.places.get(name) ?? null; }

  rootOf(name) {
    let place = this.places.get(name);
    while (place && place.parent) place = place.parent;
    return place;
  }

  /** The names from a place's root down to it. */
  pathTo(name) {
    const path = [];
    for (let place = this.places.get(name); place; place = place.parent) path.unshift(place.name);
    return path;
  }

  /** A path carried down to a screen: through the child last left at, if still there, else the first. */
  resolved(path, last) {
    const landing = [...path];
    for (;;) {
      const tip = this.places.get(landing[landing.length - 1]);
      if (!tip || !tip.children.length) return landing;
      const remembered = tip.children.find((child) => child.name === last[tip.name]);
      landing.push((remembered ?? tip.children[0]).name);
    }
  }

  // --- the door's questions ---

  // a refusal reads where the reader is, so whatever shows it is drawn again as the reader moves
  would(action, payload) { return this.transition(this.where(), this.eventOf(action, payload)).refusal; }

  told(action, payload) { return this._run(this.eventOf(action, payload)); }

  eventOf(action, payload = {}) {
    if (action === Driver.GO) return { kind: "go", place: payload.place, parameter: payload.parameter ?? null };
    if (action === Driver.GOES_BACK) return { kind: "back" };
    if (action === Driver.LOWERS) return { kind: "lower", place: payload.place };
    return { kind: "forget" };
  }

  /** Where a press of this action in this place goes: a place, BACK, or "" for a model's command. */
  goesTo(region, action) { return this.places.get(region)?.performs.get(action) ?? ""; }

  wouldMove(goesTo, parameter) {
    if (goesTo !== Driver.BACK && !this.places.has(goesTo)) return Phrase.with("%s is no place to go to", [goesTo]);
    return this.transition(this.where(), this.moveOf(goesTo, parameter)).refusal;
  }

  move(goesTo, parameter) { return this._run(this.moveOf(goesTo, parameter)); }

  moveOf(goesTo, parameter) {
    return goesTo === Driver.BACK ? { kind: "back" } : { kind: "go", place: goesTo, parameter };
  }

  // --- the moves, worked out ---

  /** What a move comes to from this state: {state, refusal}. */
  transition(state, event) {
    const refused = (phrase) => ({ state, refusal: phrase });
    const next = structuredClone(state);
    if (event.kind === "go") {
      if (!this.places.has(event.place)) return refused(Phrase.with("%s is no state", [event.place]));
      const root = this.rootOf(event.place).name;
      if (event.parameter === null || event.parameter === undefined) delete next.params[event.place];
      else next.params[event.place] = event.parameter;
      const landing = this.resolved(this.pathTo(event.place), next.last);
      if (root === this.app?.name) {
        if (same(landing, state.path) && !state.overlays.length && sameParams(landing, state.params, next.params)) {
          return refused(Phrase.with("Already at %s", [landing[landing.length - 1]]));
        }
        this._remember(next, state.path);
        next.overlays = [];
        next.path = landing;
        for (const name of state.path) if (!landing.includes(name)) delete next.params[name];
        const params = Object.fromEntries(landing.filter((name) => name in next.params).map((name) => [name, next.params[name]]));
        const newest = next.history[next.history.length - 1];
        if (!newest || !same(newest, landing) || JSON.stringify(next.historyParams[next.historyParams.length - 1]) !== JSON.stringify(params)) {
          next.history.push(landing);
          next.historyParams.push(params);
          if (next.history.length > HISTORY_CAP) { next.history.shift(); next.historyParams.shift(); }
        }
        return { state: next, refusal: null };
      }
      const top = state.overlays[state.overlays.length - 1];
      if (top && top[0] === root) {
        if (same(landing, top) && sameParams(landing, state.params, next.params)) return refused(Phrase.with("Already at %s", [landing[landing.length - 1]]));
        this._remember(next, top);
        next.overlays[next.overlays.length - 1] = landing;
        return { state: next, refusal: null };
      }
      if (state.overlays.some((path) => path[0] === root)) return refused(Phrase.with("%s is not on top", [root]));
      next.overlays.push(landing);
      return { state: next, refusal: null };
    }
    if (event.kind === "back") {
      if (state.overlays.length) return this.transition(state, { kind: "lower", place: state.overlays[state.overlays.length - 1][0] });
      if (state.history.length < 2) return refused(Phrase.of("There is nothing to go back to"));
      this._remember(next, state.path);
      next.history.pop();
      next.historyParams.pop();
      next.path = next.history[next.history.length - 1];
      next.params = { ...next.historyParams[next.historyParams.length - 1] };
      return { state: next, refusal: null };
    }
    if (event.kind === "lower") {
      const top = state.overlays[state.overlays.length - 1];
      if (!top || top[0] !== event.place) return refused(Phrase.with("%s is not on top", [event.place]));
      this._remember(next, top);
      next.overlays.pop();
      for (const name of top) delete next.params[name];
      return { state: next, refusal: null };
    }
    if (state.history.length < 2) return refused(Phrase.of("There is nothing behind to forget"));
    next.history = [next.history[next.history.length - 1]];
    next.historyParams = [next.historyParams[next.historyParams.length - 1]];
    return { state: next, refusal: null };
  }

  _remember(next, path) {
    for (let i = 1; i < path.length; i++) next.last[path[i - 1]] = path[i];
  }

  /** The move carried out, or its refusal: places left emptied, those entered filled, every place shown or hidden, NAVIGATED rung. */
  _run(event) {
    const out = this.transition(this._state, event);
    if (out.refusal) return out.refusal;
    const before = activeOf(this._state);
    const previousScreen = this._state.path[this._state.path.length - 1] ?? null;
    const raisedBefore = this._state.overlays.length;
    this._state = out.state;
    const after = activeOf(this._state);
    for (const name of [...before].reverse()) if (!after.has(name)) this.places.get(name)?.empty();
    for (const name of after) {
      const place = this.places.get(name);
      if (place && (!before.has(name) || place.parameter !== (this._state.params[name] ?? null))) place.fill(this._state.params[name] ?? null);
    }
    const leftScreen = previousScreen;
    for (const place of this.places.values()) place.element.hidden = !after.has(place.name) && place.kind !== "app";
    if (this.app) this.app.element.inert = this._state.overlays.length > 0;
    this._scroll(leftScreen, event.kind === "back");
    this._focus(raisedBefore);
    this.strike(Chimes.GLOBAL, Driver.NAVIGATED);
    return null;
  }

  /**
   * A new screen opens at its top, and going back returns the reader to how
   * far down they were; a pop-up raised or lowered leaves the page where it is.
   */
  _scroll(left, back) {
    const arrived = this._state.path[this._state.path.length - 1] ?? null;
    const view = this.app?.element.ownerDocument.defaultView;
    if (!view || !left || arrived === left) return;
    this._scrolled.set(left, view.scrollY);
    view.scrollTo(0, back ? this._scrolled.get(arrived) ?? 0 : 0);
  }

  /** A pop-up raised takes the focus to its first pressable; lowered, it gives it back to what had it. */
  _focus(raisedBefore) {
    const overlays = this._state.overlays;
    if (overlays.length > raisedBefore) {
      const root = this.places.get(overlays[overlays.length - 1][0]);
      const doc = root.element.ownerDocument;
      root.opener = doc.activeElement;
      root.element.querySelector("button, input, textarea, [tabindex]")?.focus();
    } else if (overlays.length < raisedBefore) {
      for (const place of this.places.values()) {
        if (place.opener && place.element.hidden) { if (place.opener.isConnected) place.opener.focus(); place.opener = null; }
      }
    }
  }
}

function activeOf(state) {
  const names = new Set(state.path);
  for (const path of state.overlays) for (const name of path) names.add(name);
  return names;
}

function same(a, b) { return a.length === b.length && a.every((name, i) => name === b[i]); }

function sameParams(path, before, after) { return path.every((name) => JSON.stringify(before[name] ?? null) === JSON.stringify(after[name] ?? null)); }

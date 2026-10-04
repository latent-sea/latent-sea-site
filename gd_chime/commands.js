// The door: a command goes through here and nowhere else. It carries a
// payload, has exactly one handler, and can be refused; a press is never a
// strike. The model registered for the action, in the control's region or
// globally, is told(action, payload) and answers a phrase - why it refused -
// or null, done.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// Every command that ran is kept as the last, and COMMAND_RAN rings in the
// global region once it is kept. NOTHING DISPATCHES FROM INSIDE heard(): a
// dispatch made while any bell is sounding is refused out loud; a listener
// that must act on what it heard defers it (Frames.defer).

import { Chimes } from "./chimes.js?v=1b3b6febfccb";
import { Controller } from "./controller.js?v=1b3b6febfccb";
import { Phrase } from "./phrase.js?v=1b3b6febfccb";
import { Reads } from "./reads.js?v=1b3b6febfccb";

export class Commands extends Controller {
  static COMMAND_RAN = "command_ran";

  constructor(chimes, moves = null) {
    super(chimes, [], Chimes.GLOBAL);
    this.registerBell(Commands.COMMAND_RAN);
    this.mover = moves;
    this._handlers = new Map(); // region -> Map(action -> model)
    this._last = null;
    if (this.mover) {
      this.mover.door = this;
      for (const action of this.mover.constructor.COMMANDS) this.register(Chimes.GLOBAL, action, this.mover);
    }
  }

  /** The model that answers this action in this region; a second one is refused out loud, and the first stays. */
  register(region, action, model) {
    if (this._standing(region, action)) {
      console.error(`${action} in ${region} already has a handler`);
      return;
    }
    if (!this._handlers.has(region)) this._handlers.set(region, new Map());
    this._handlers.get(region).set(action, model);
  }

  /** The model registered, where it stands, for everything it answers. */
  stand(region, model) {
    for (const action of model.answers()) this.register(region, action, model);
  }

  handles(region, action) { return this._handler(region, action) !== null; }

  dropRegion(region) { this._handlers.delete(region); }

  /** What the model would say to this: its reason, or null. */
  gameRefusal(region, action, payload) {
    const model = this._handler(region, action);
    return model ? model.would(action, payload) ?? null : null;
  }

  /** Why a control cannot be used now: the model's reason, else the move's, else null. */
  refusal(region, action, payload) {
    const game = this.gameRefusal(region, action, payload);
    if (game) return game;
    if (this.mover) {
      const goesTo = this.mover.goesTo(region, action);
      if (goesTo !== "") return this.mover.wouldMove(goesTo, payload?.parameter ?? null);
    }
    return null;
  }

  /** The command put through the door: the refusal, or null, done. */
  dispatch(region, action, payload = {}) {
    if (this._chimes.isStriking()) {
      const nested = Phrase.with("%s was dispatched from inside heard(); defer it until the ring is over", [action]);
      console.error(String(nested));
      return nested;
    }
    const model = this._handler(region, action);
    const goesTo = this.mover ? this.mover.goesTo(region, action) : "";
    if (model === null && goesTo === "") {
      const nothing = Phrase.with("Nothing handles %s in %s", [action, region]);
      console.error(String(nothing));
      return nothing;
    }
    const record = { region, action, payload: structuredClone(payload), answer: null, paused: false };
    this._last = record;
    let answer = this.refusal(region, action, payload);
    if (answer === null && model !== null) answer = model.told(action, payload) ?? null;
    if (answer === null && goesTo !== "") answer = this.mover.move(goesTo, payload?.parameter ?? null);
    this._last = record;
    record.answer = answer;
    this.strike(Chimes.GLOBAL, Commands.COMMAND_RAN);
    return answer;
  }

  /** The last command that ran, as a copy; a read of it follows COMMAND_RAN. */
  getLast() {
    Reads.note(Chimes.GLOBAL, Commands.COMMAND_RAN);
    if (!this._last) return null;
    return { ...this._last, payload: structuredClone(this._last.payload) };
  }

  _handler(region, action) {
    return this._standing(region, action) ?? this._standing(Chimes.GLOBAL, action);
  }

  _standing(region, action) {
    const model = this._handlers.get(region)?.get(action) ?? null;
    if (model && model.disposed) {
      this._handlers.get(region).delete(action);
      return null;
    }
    return model;
  }
}

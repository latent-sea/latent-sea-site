// The register: every action an application declares, with the words that
// say what it does and the keys it is on to begin with, in one table.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// register.declareAll({ SAVES: ["Save", Actions.keys("s", {ctrl: true})] }).
// The words are English, the key a text translates as it says them; a
// button says the register's words for its action.

export class Actions {
  constructor() {
    this._words = new Map(); // action -> English
    this._inputs = new Map(); // action -> [{key, ctrl, shift, alt}, ...]
  }

  /** A key an action is on: the browser's key name ("Escape", "c", "F5") and its modifiers. */
  static keys(key, modifiers = {}) {
    return { key, ctrl: !!modifiers.ctrl, shift: !!modifiers.shift, alt: !!modifiers.alt };
  }

  /** Every action at once: {action: [words, ...keys]}, in the order the table has them. */
  declareAll(table) {
    for (const [action, said] of Object.entries(table)) this._declare(action, said[0], said.slice(1));
  }

  _declare(action, words, inputs) {
    if (this._words.has(action)) {
      console.error(`${action} is already declared, as "${this._words.get(action)}"`);
      return;
    }
    if (!words) {
      console.error(`${action} needs the words that say what it does`);
      return;
    }
    this._words.set(action, words);
    this._inputs.set(action, inputs);
  }

  has(action) { return this._words.has(action); }

  /** The English of an action: the key a text translates. */
  getWords(action) {
    if (!this._words.has(action)) throw new Error(`${action} is not declared`);
    return this._words.get(action);
  }

  getInputs(action) { return this._inputs.get(action) ?? []; }

  getAll() { return [...this._words.keys()]; }

  /** The action a key press is on, among those given, or "". */
  actionOf(event, among = this.getAll()) {
    for (const action of among) {
      for (const input of this.getInputs(action)) {
        if (input.key.toLowerCase() === event.key.toLowerCase() && input.ctrl === (event.ctrlKey || event.metaKey) && input.shift === event.shiftKey && input.alt === event.altKey) return action;
      }
    }
    return "";
  }
}

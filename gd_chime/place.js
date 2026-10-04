// A place: somewhere the reader can be - the app, a screen, a pop-up - with
// a name the driver knows, and what the pressables inside it perform.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// Places exist from the start and are shown and hidden as the reader moves;
// moving away from a screen only empties it (on_empty, its token cancelled)
// and hides it. Its region is its name.

export class Token {
  constructor(under = null) { this._live = true; this.under = under; }
  isLive() { return this._live && (this.under === null || this.under.isLive()); }
  cancel() { this._live = false; }
}

export class Place {
  constructor(name, kind, element) {
    this.name = name;
    this.region = name;
    this.kind = kind; // app, screen, tabs, pop_up
    this.element = element;
    this.performs = new Map(); // action -> where it goes: a place, BACK, or "" for a model's command
    this.handledBy = null;
    this.blocks = true;
    this.onFill = null;
    this.onEmpty = null;
    this.parameter = null;
    this.token = null;
    this.parent = null; // the nearest place this stands in, null for a root
    this.children = []; // the nearest places standing in this, in the order described
    this.opener = null; // what had the focus as a pop-up was raised
  }

  fill(parameter) {
    this.parameter = parameter;
    this.token = new Token();
    if (this.onFill) this.onFill(this.token);
  }

  empty() {
    if (this.token) this.token.cancel();
    if (this.onEmpty) this.onEmpty();
  }

  /** Whether this declares the action: a pressable for it stands in it. */
  declares(action) { return this.performs.has(action); }
}

// The application: what a site extends. It answers five questions, each with
// a default - look(), the look it wears; sources(), the words it reads;
// declare(register), its actions and their words, in one table; describe(),
// the app's description, its models made on the way; probe(), the walk that
// stands in for a reader - and is mounted into an element of the page.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// THE BUILD ORDER, as it is mounted: the look dresses the element; the
// chimes, the driver and the door are made; the register is declared; the
// builder is made and the description built; at the frame's end the
// description's faults are checked and the reader brought to the app. A
// description with a fault in it is reported in the console and the app
// stands empty (broken(faults)). Opened with ?probe, the page walks itself.
//
// A KEY THE APP TAKES IS THE APP'S: a key pressed is put, innermost place
// first, to every place on top that declares an action on that key, and
// dispatched there; a key typed into a field is the field's, except Escape.

import { Actions } from "./actions.js?v=2780c1afa36a";
import { Chimes } from "./chimes.js?v=2780c1afa36a";
import { Commands } from "./commands.js?v=2780c1afa36a";
import { Driver } from "./driver.js?v=2780c1afa36a";
import { Frames } from "./frames.js?v=2780c1afa36a";
import { Language } from "./language.js?v=2780c1afa36a";
import { Look } from "./look.js?v=2780c1afa36a";
import { Ui } from "./ui.js?v=2780c1afa36a";
import { Walk } from "./walk.js?v=2780c1afa36a";

export class ChimeApp {
  constructor() {
    this.element = null;
    this.chimes = null;
    this.driver = null;
    this.commands = null;
    this.actions = null;
    this.language = null;
    this.ui = null;
    this.started = null; // a promise kept once the reader is at the app, or its faults are said
    this._models = [];
    this._keys = null;
  }

  // --- the five questions, and broken ---

  look() { return Look.make(); }

  /** The words of the languages the app speaks: {fr: {"Save": "Enregistrer"}}. */
  sources() { return {}; }

  declare(_register) {}

  describe() { return this.ui.app("app", []); }

  /** The walk that stands in for a reader, or a promise of one: a probe loaded only when walked. */
  probe() { return null; }

  broken(_faults) {}

  // --- standing up ---

  /** A model answered from anywhere: registered in the global region for what it answers, and let go with the app. */
  model(made) {
    this._models.push(made);
    this.commands.stand(Chimes.GLOBAL, made);
    return made;
  }

  /** The app built into this element, and the reader brought to it. */
  mount(element) {
    this.element = element;
    this.look().dress(element);
    this.chimes = new Chimes();
    this.driver = new Driver(this.chimes);
    this.commands = new Commands(this.chimes, this.driver);
    this.actions = new Actions();
    Language.read(this.sources());
    this.language = new Language(this.chimes);
    this.commands.stand(Chimes.GLOBAL, this.language);
    this.declare(this.actions);
    this.ui = new Ui(element, this.chimes, this.commands, this.driver, this.actions);
    this._keys = (event) => this._key(event);
    element.ownerDocument.addEventListener("keydown", this._keys);
    this.started = new Promise((resolve) => {
      this.ui.start(this.describe(), (faults) => { this.broken(faults); resolve(false); }, () => resolve(true));
    });
    if (Walk.asked()) {
      // a probe may be loaded only when walked - import("./probe.js?v=2780c1afa36a") - so an export leaves it out
      this.started.then(async (stood) => {
        const walk = stood ? await this.probe() : null;
        if (walk) await Walk.run(walk);
        else { console.log(stood ? "NOT TRUE: the app has a probe" : "NOT TRUE: the app stood"); console.log("PROBE FAILED"); }
      });
    }
    return this;
  }

  /** The app taken down: every piece stops hearing, every model is let go. */
  unmount() {
    this.element.ownerDocument.removeEventListener("keydown", this._keys);
    this.ui.stop();
    for (const model of this._models) model.dispose();
    this.language.dispose();
    this.driver.dispose();
    this.commands.dispose();
    this._models = [];
  }

  _key(event) {
    if (event.defaultPrevented || event.isComposing) return;
    const typing = event.target instanceof Element && event.target.matches("input, textarea, [contenteditable]");
    if (typing && event.key !== "Escape") return;
    const top = this.driver.getTop();
    for (const name of [...top].reverse()) {
      const place = this.driver.placeNamed(name);
      if (!place) continue;
      const action = this.actions.actionOf(event, [...place.performs.keys()]);
      if (!action) continue;
      event.preventDefault();
      this.commands.dispatch(name, action, {});
      return;
    }
  }

  /** An app of this class mounted into the element, the page's body by default, once the page has loaded. */
  static start(AppClass, element = null) {
    const go = () => new AppClass().mount(element ?? document.body);
    if (document.readyState === "loading") {
      return new Promise((resolve) => document.addEventListener("DOMContentLoaded", () => resolve(go()), { once: true }));
    }
    return Promise.resolve(go());
  }
}

export { Frames };

// The Latent Sea: a 3D world a seeker walks, played by the world engine
// (world/, D-015) from modules the platform grants seeker by seeker. This page
// only lets them in and carries what the engine asks of it:
//   - the door: enter as a guest, with Google, or with a code emailed to them;
//   - the world, filling the window, with words over it when a scene shows some.
// Creatures and the seeker speak in subtitles, which the engine draws
// (world/speech.js), one at a time (G1).
// Nothing of the world is in this page: its scenes, regions and spirits come
// from the platform as the host names them. Opened with ?dev, they come from
// the developer's machine instead (world/dev/serve.mjs).

import * as THREE from "three";
import { ChimeApp, Chimes, Controller, Look, Phrase } from "./gd_chime/gd_chime.js?v=2780c1afa36a";
import { World } from "./world/world.js?v=2780c1afa36a";
import { DevDoor, Door } from "./door.js?v=2780c1afa36a";

const WORLD = "latent_sea";

const ENTERS_AS_GUEST = "enters_as_a_guest";
const SETS_EMAIL = "sets_the_email";
const SENDS_CODE = "sends_a_code";
const SETS_CODE = "sets_the_code";
const ENTERS_WITH_CODE = "enters_with_the_code";
const STARTS_OVER = "starts_over";
const LEAVES = "leaves";
const OPENS_SETTINGS = "opens_settings";
const CLOSES_SETTINGS = "closes_settings";
const INVERTS_Y = "inverts_y";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEA = { ground: "#0b1820", raised: "#12262f", lit: "#1a3440", ink: "#e7eef2", ink_soft: "#a9bcc6", accent: "#7fd1e8", accent_2: "#b5e6f3", warn: "#ffb4a2", edge: "#24414d" };

/**
 * A visit: who is in, how they are getting in, what the world says over
 * itself, and the settings.
 */
class Visit extends Controller {
  constructor(chimes, door) {
    super(chimes);
    this.door = door;
    this.who = this.value("checking"); // checking, out, code (a code was emailed) or in
    this.email = this.value("");
    this.code = this.value("");
    this.busy = this.value(false);
    this.problem = this.value("");
    this.caption = this.value("");
    this.settings = this.value({ invert_y: false }); // the seeker's own, saved on the platform
    this.settingsOpen = this.value(false);
    this.world = null;
    this.start();
  }

  /** The last visit's sign-in, if it still holds. */
  async start() {
    if (!this.door) return;
    this.who.setValue((await this.door.restore()) ? "in" : "out");
  }

  /** What the world asks of the page (World's ui). */
  worldUi() {
    return {
      show: (words) => this.caption.setValue(String(words ?? "")),
      failed: (words) => this.problem.setValue(String(words)),
    };
  }

  answers() { return [ENTERS_AS_GUEST, SETS_EMAIL, SENDS_CODE, SETS_CODE, ENTERS_WITH_CODE, STARTS_OVER, LEAVES, OPENS_SETTINGS, CLOSES_SETTINGS, INVERTS_Y]; }

  /** The seeker's settings, as saved, put into effect. */
  async loadSettings() {
    const loaded = await this.door.loadSettings();
    if (!loaded.ok) this.problem.setValue(loaded.error);
    this.settings.setValue(loaded.settings);
    this.applySettings();
  }

  applySettings() {
    if (this.world) this.world.walker.invertY = this.settings.read().invert_y === true;
  }

  /** A setting changed: in effect at once, then saved. */
  async change(changes) {
    this.settings.setValue({ ...this.settings.read(), ...changes });
    this.applySettings();
    const saved = await this.door.saveSettings(this.settings.read());
    if (!saved.ok) this.problem.setValue(saved.error);
  }

  would(action) {
    if ([ENTERS_AS_GUEST, SENDS_CODE, ENTERS_WITH_CODE].includes(action) && this.busy.read()) return Phrase.of("Opening the way");
    if (action === SENDS_CODE && !EMAIL.test(this.email.read().trim())) return Phrase.of("Type your email address");
    if (action === ENTERS_WITH_CODE && !/^\d{6}$/.test(this.code.read().trim())) return Phrase.of("Type the six-digit code from the email");
    return null;
  }

  told(action, payload) {
    if (action === SETS_EMAIL) this.email.setValue(payload.line);
    if (action === SETS_CODE) this.code.setValue(payload.line);
    if (action === ENTERS_AS_GUEST) this.enter(() => this.door.enterAsGuest());
    if (action === SENDS_CODE) {
      this.attempt(() => this.door.requestCode(this.email.read().trim())).then((done) => { if (done) this.who.setValue("code"); });
    }
    if (action === ENTERS_WITH_CODE) this.enter(() => this.door.enterWithCode(this.email.read().trim(), this.code.read().trim()));
    if (action === STARTS_OVER) { this.code.setValue(""); this.problem.setValue(""); this.who.setValue("out"); }
    if (action === LEAVES) this.leave();
    if (action === OPENS_SETTINGS) this.settingsOpen.setValue(true);
    if (action === CLOSES_SETTINGS) this.settingsOpen.setValue(false);
    if (action === INVERTS_Y) this.change({ invert_y: !this.settings.read().invert_y });
    return null;
  }

  async attempt(work) {
    this.busy.setValue(true);
    this.problem.setValue("");
    const done = await work();
    this.busy.setValue(false);
    if (!done.ok) this.problem.setValue(done.error);
    return done.ok;
  }

  async enter(work) {
    if (await this.attempt(work)) this.who.setValue("in");
  }

  async enterWithGoogle(credential, nonce) {
    await this.enter(() => this.door.enterWithGoogle(credential, nonce));
  }

  /** Out first, so nothing starts the world again while it closes; then signed out. */
  async leave() {
    this.who.setValue("out");
    this.world?.stop();
    this.world = null;
    this.caption.setValue("");
    this.problem.setValue("");
    this.settingsOpen.setValue(false);
    this.settings.setValue({ invert_y: false });
    await this.door.signOut();
  }
}

export class LatentSea extends ChimeApp {
  look() { return Look.make(SEA); }

  declare(register) {
    register.declareAll({
      [ENTERS_AS_GUEST]: ["Enter as a guest"],
      [SETS_EMAIL]: ["Email address"],
      [SENDS_CODE]: ["Email me a code"],
      [SETS_CODE]: ["Code"],
      [ENTERS_WITH_CODE]: ["Enter"],
      [STARTS_OVER]: ["Use another way"],
      [LEAVES]: ["Leave"],
      [OPENS_SETTINGS]: ["Settings"],
      [CLOSES_SETTINGS]: ["Close"],
      [INVERTS_Y]: ["Invert Y"],
    });
  }

  describe() {
    const ui = this.ui;
    const params = new URLSearchParams(location.search);
    // walked by its probe (?probe), the visit is handed a stand-in door and reaches nothing
    this.dev = params.has("dev");
    // a preview (web/world/preview) hands its own door to the page, before this runs
    const door = params.has("probe") ? null : globalThis.worldPreview?.door ?? (this.dev ? new DevDoor() : new Door());
    const visit = this.visit = this.model(new Visit(this.chimes, door));
    const is = (who) => visit.who.map((now) => now === who);
    // why something didn't work, wherever the seeker is looking: a fresh one each place it shows
    const problem = () => ui.when(visit.problem.map((words) => words !== ""), ui.text(visit.problem, "Problem").wraps());

    return ui.app("latent_sea", [
      ui.column([
        ui.when(is("in"), ui.stack([
          ui.surface("WorldView").named("world-view"),
          ui.when(visit.caption.map((words) => words !== ""), ui.text(visit.caption, "Caption").wraps()),
          ui.button(LEAVES, { style: "SecondaryButton Leave" }),
          ui.button(OPENS_SETTINGS, { style: "SecondaryButton Cog" }),
          ui.when(visit.settingsOpen, this.settingsPanel(visit)),
          problem(),
        ])),
        ui.when(is("checking"), ui.column([ui.text(Phrase.of("The Latent Sea"), "Title")], "Door")),
        ui.when(is("out"), this.door(visit, problem)),
        ui.when(is("code"), this.code(visit, problem)),
      ], "Sea"),
    ]);
  }

  door(visit, problem) {
    const ui = this.ui;
    return ui.column([
      ui.text(Phrase.of("The Latent Sea"), "Title"),
      ui.text(Phrase.of("Enter as a guest, or sign in to come back to where you were on another device."), "Lead").wraps(),
      ui.column([
        ui.button(ENTERS_AS_GUEST),
        ui.surface("GoogleButton").named("google-button"),
        ui.column([
          ui.field(SETS_EMAIL, "", { label: Phrase.of("Or sign in by email"), changes: SETS_EMAIL, shows: visit.email, kind: "email", autocomplete: "email", placeholder: Phrase.of("you@example.com") }),
          ui.button(SENDS_CODE, { style: "SecondaryButton" }),
        ], "EmailWay"),
      ], "Ways"),
      problem(),
    ], "Door");
  }

  code(visit, problem) {
    const ui = this.ui;
    return ui.column([
      ui.text(Phrase.of("The Latent Sea"), "Title"),
      ui.text(ui.bound(() => Phrase.with("A six-digit code is on its way to %s.", [visit.email.read().trim()])), "Lead").wraps(),
      ui.column([
        ui.field(SETS_CODE, "", { label: Phrase.of("Code"), changes: SETS_CODE, shows: visit.code, kind: "text", autocomplete: "one-time-code" }),
        ui.button(ENTERS_WITH_CODE),
        ui.button(STARTS_OVER, { style: "SecondaryButton" }),
      ], "EmailWay"),
      problem(),
    ], "Door");
  }

  /** The seeker's settings: one for now. */
  settingsPanel(visit) {
    const ui = this.ui;
    const inverted = visit.settings.map((now) => now.invert_y === true);
    return ui.column([
      ui.row([ui.text(Phrase.of("Settings"), "TalkTitle"), ui.button(CLOSES_SETTINGS, { style: "SecondaryButton" })], "TalkHead"),
      ui.pressable(INVERTS_Y, {}, [
        ui.text(ui.words(INVERTS_Y), "SettingName").grow(),
        ui.text(inverted.map((on) => (on ? "On" : "Off")), "SettingState"),
      ], "Setting"),
    ], "SettingsPanel");
  }

  probe() { return import("./probe.js?v=2780c1afa36a").then((made) => new made.Probe(this)); }

  /** The app mounted: Google's button drawn whenever the door shows; the world started whenever someone is in. */
  mount(element) {
    super.mount(element);
    const visit = this.visit;
    this.chimes.follow({ region: Chimes.GLOBAL }, "google", () => {
      if (visit.who.read() !== "out" || !visit.door?.drawGoogleButton) return;
      whenDrawn("google-button", (place) => {
        if (place.childElementCount) return;
        visit.door.drawGoogleButton(place, (credential, nonce) => visit.enterWithGoogle(credential, nonce))
          .catch((trouble) => visit.problem.setValue(trouble.message));
      });
    });
    this.chimes.follow({ region: Chimes.GLOBAL }, "world", () => {
      if (visit.who.read() !== "in" || visit.world || !visit.door) return;
      whenDrawn("world-view", (place) => this.startWorld(place));
    });
    return this;
  }

  /** The world in this element, entered where the seeker is. */
  async startWorld(place) {
    const visit = this.visit;
    if (visit.world || visit.who.read() !== "in") return;
    const canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    place.replaceChildren(canvas);
    visit.world = new World({ name: WORLD, host: visit.door.host(), files: visit.door.files(), three: THREE, canvas, ui: visit.worldUi(), importer: visit.door.importer });
    visit.loadSettings();
    try {
      await visit.world.enter();
    } catch (trouble) {
      visit.problem.setValue(trouble.message);
    }
  }
}

/** `then(element)` once the element with this id stands: it is drawn a turn or two after the visit says so. */
function whenDrawn(id, then, tries = 50) {
  const place = document.getElementById(id);
  if (place) { then(place); return; }
  if (tries) setTimeout(() => whenDrawn(id, then, tries - 1), 20);
}

ChimeApp.start(LatentSea, document.getElementById("app"));

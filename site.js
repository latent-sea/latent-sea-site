// The Latent Sea: a 3D world a seeker walks, played by the world engine
// (world/, D-015) from modules the platform grants seeker by seeker. This page
// only lets them in and carries what the engine asks of it:
//   - the door: enter as a guest, with Google, or with a code emailed to them;
//   - the world, filling the window, with words over it when a scene shows some;
//   - a conversation with a spirit, when a scene opens one (G1).
// Nothing of the world is in this page: its scenes, regions and spirits come
// from the platform as the host names them. Opened with ?dev, they come from
// the developer's machine instead (world/dev/serve.mjs).

import * as THREE from "three";
import { ChimeApp, Chimes, Controller, Look, Phrase } from "./gd_chime/gd_chime.js";
import { World } from "./world/world.js";
import { DevDoor, Door } from "./door.js";

const WORLD = "latent_sea";

const ENTERS_AS_GUEST = "enters_as_a_guest";
const SETS_EMAIL = "sets_the_email";
const SENDS_CODE = "sends_a_code";
const SETS_CODE = "sets_the_code";
const ENTERS_WITH_CODE = "enters_with_the_code";
const STARTS_OVER = "starts_over";
const SETS_DRAFT = "sets_the_draft";
const SAYS = "says_it";
const ENDS_TALK = "ends_the_conversation";
const LEAVES = "leaves";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEA = { ground: "#0b1820", raised: "#12262f", lit: "#1a3440", ink: "#e7eef2", ink_soft: "#a9bcc6", accent: "#7fd1e8", accent_2: "#b5e6f3", warn: "#ffb4a2", edge: "#24414d" };

/**
 * A visit: who is in, how they are getting in, what the world says over
 * itself, and the conversation open with a spirit, if any.
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
    this.spirit = this.value("");      // the spirit talked with, or ""
    this.messages = this.value([]);    // { id, from: seeker or spirit, text }
    this.draft = this.value("");
    this.waiting = this.value(false);
    this.world = null;
    this._closed = null;
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
      talk: (spirit) => this.talk(spirit),
    };
  }

  /** A conversation with a spirit, open until the seeker closes it. Only the page keeps it (H1). */
  talk(spirit) {
    this._closed?.();
    this.spirit.setValue(spirit);
    this.messages.setValue([]);
    this.draft.setValue("");
    this.problem.setValue("");
    return new Promise((done) => { this._closed = done; });
  }

  answers() { return [ENTERS_AS_GUEST, SETS_EMAIL, SENDS_CODE, SETS_CODE, ENTERS_WITH_CODE, STARTS_OVER, SETS_DRAFT, SAYS, ENDS_TALK, LEAVES]; }

  would(action) {
    if ([ENTERS_AS_GUEST, SENDS_CODE, ENTERS_WITH_CODE].includes(action) && this.busy.read()) return Phrase.of("Opening the way");
    if (action === SENDS_CODE && !EMAIL.test(this.email.read().trim())) return Phrase.of("Type your email address");
    if (action === ENTERS_WITH_CODE && !/^\d{6}$/.test(this.code.read().trim())) return Phrase.of("Type the six-digit code from the email");
    if (action === SAYS && !this.draft.read().trim()) return Phrase.of("Type something to say");
    if (action === SAYS && this.waiting.read()) return Phrase.of("The spirit is answering");
    return null;
  }

  told(action, payload) {
    if (action === SETS_EMAIL) this.email.setValue(payload.line);
    if (action === SETS_CODE) this.code.setValue(payload.line);
    if (action === SETS_DRAFT) this.draft.setValue(payload.line);
    if (action === ENTERS_AS_GUEST) this.enter(() => this.door.enterAsGuest());
    if (action === SENDS_CODE) {
      this.attempt(() => this.door.requestCode(this.email.read().trim())).then((done) => { if (done) this.who.setValue("code"); });
    }
    if (action === ENTERS_WITH_CODE) this.enter(() => this.door.enterWithCode(this.email.read().trim(), this.code.read().trim()));
    if (action === STARTS_OVER) { this.code.setValue(""); this.problem.setValue(""); this.who.setValue("out"); }
    if (action === SAYS) this.say();
    if (action === ENDS_TALK) this.endTalk();
    if (action === LEAVES) this.leave();
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

  async say() {
    const spirit = this.spirit.read();
    const said = [...this.messages.read(), { id: this.messages.read().length, from: "seeker", text: this.draft.read().trim() }];
    this.messages.setValue(said);
    this.draft.setValue("");
    this.waiting.setValue(true);
    const answer = await this.world.say(spirit, said.map(({ from, text }) => ({ from, text })));
    if (this.spirit.read() !== spirit) return; // closed meanwhile
    this.waiting.setValue(false);
    if (answer.error) { this.problem.setValue(answer.error); return; }
    this.messages.setValue([...said, { id: said.length, from: "spirit", text: answer.reply }]);
  }

  endTalk() {
    this.spirit.setValue("");
    this.messages.setValue([]);
    this.waiting.setValue(false);
    const closed = this._closed;
    this._closed = null;
    closed?.();
  }

  /** Out first, so nothing starts the world again while it closes; then signed out. */
  async leave() {
    this.who.setValue("out");
    this.endTalk();
    this.world?.stop();
    this.world = null;
    this.caption.setValue("");
    this.problem.setValue("");
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
      [SETS_DRAFT]: ["Say something"],
      [SAYS]: ["Say"],
      [ENDS_TALK]: ["Close"],
      [LEAVES]: ["Leave"],
    });
  }

  describe() {
    const ui = this.ui;
    const params = new URLSearchParams(location.search);
    // walked by its probe (?probe), the visit is handed a stand-in door and reaches nothing
    this.dev = params.has("dev");
    const door = params.has("probe") ? null : this.dev ? new DevDoor() : new Door();
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
          ui.when(visit.spirit.map((spirit) => spirit !== ""), this.conversation(visit, problem)),
          ui.when(visit.spirit.map((spirit) => spirit === ""), problem()),
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

  conversation(visit, problem) {
    const ui = this.ui;
    const line = (message) => ui.when(message.map((made) => made?.from === "seeker"),
      ui.text(message.map((made) => made?.text ?? ""), "FromSeeker").wraps(),
      ui.text(message.map((made) => made?.text ?? ""), "FromSpirit").wraps());
    return ui.column([
      ui.row([
        ui.text(ui.bound(() => Phrase.with("The spirit: %s", [visit.spirit.read()])), "TalkTitle"),
        ui.button(ENDS_TALK, { style: "SecondaryButton" }),
      ], "TalkHead"),
      ui.each(visit.messages, line, (made) => made.id, "Said"),
      ui.when(visit.waiting, ui.text(Phrase.of("…"), "Quiet")),
      problem(),
      ui.field(SAYS, "", { changes: SETS_DRAFT, shows: visit.draft, placeholder: Phrase.of("Say something") }).takesFocus(),
    ], "Talk");
  }

  probe() { return import("./probe.js").then((made) => new made.Probe(this)); }

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
    visit.world = new World({ name: WORLD, host: visit.door.host(), files: visit.door.files(), three: THREE, canvas, ui: visit.worldUi() });
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

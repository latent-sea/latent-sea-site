// The Latent Sea: a 3D world a seeker walks, played by the world engine
// (world/, D-015) from modules the platform grants seeker by seeker. This page
// only lets them in and carries what the engine asks of it:
//   - the door: enter as a guest, with Google, or with a code emailed to them;
//   - the world, filling the window, with words over it when a scene shows some.
// On a phone, a touch fills the screen where the browser allows it; an iPhone
// is told to add it to the home screen, which opens it full screen.
// Creatures and the seeker speak in subtitles, which the engine draws
// (world/speech.js), one at a time (G1).
// Nothing of the world is in this page: its scenes, regions and spirits come
// from the platform as the host names them. Opened with ?dev, they come from
// the developer's machine instead (world/dev/serve.mjs).

import * as THREE from "three";
import { ChimeApp, Chimes, Controller, Look, Phrase } from "./gd_chime/gd_chime.js?v=e1286f12e781";
import { World } from "./world/world.js?v=e1286f12e781";
import { DEFAULTS, DevDoor, Door, TEXT_SIZES, textSize } from "./door.js?v=e1286f12e781";

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
const TURNS_CHOICES = "turns_dialogue_choices";
const SIZES_TEXT = "sizes_text";
/** What each text size is called, in the settings. */
const SIZE_NAMES = new Map([[1, "Small"], [1.5, "Medium"], [2, "Large"], [2.5, "Largest"]]);
const FILLS_SCREEN = "fills_the_screen";
const HIDES_HINT = "hides_the_hint";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HINT_SEEN = "latent_sea.home_screen_hint";

// Full screen: where the browser allows a page to fill the screen (Android,
// computers), a touch fills it, until the seeker leaves it themselves; a
// button beside the cog goes in and out. An iPhone allows it only to a page
// opened from the home screen (manifest.json), so it is told how, once.
const touchScreen = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const canFill = () => typeof document !== "undefined" && document.fullscreenEnabled === true && !!document.documentElement.requestFullscreen;
const filled = () => !!document.fullscreenElement;
function fill() {
  try { document.documentElement.requestFullscreen({ navigationUI: "hide" })?.catch?.(() => {}); } catch { /* not allowed now */ }
}
function unfill() {
  try { document.exitFullscreen?.()?.catch?.(() => {}); } catch { /* already out */ }
}
/** An iPhone or iPad's browser, not opened from the home screen. */
function iPhoneInBrowser() {
  const apple = /iPhone|iPod|iPad/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const fromHome = navigator.standalone === true || matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches;
  return apple && !fromHome;
}
function remembered(key) { try { return localStorage.getItem(key) === "yes"; } catch { return false; } }
function remember(key) { try { localStorage.setItem(key, "yes"); } catch { /* not kept: it shows again next time */ } }
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
    this.settings = this.value({ ...DEFAULTS }); // the seeker's own, saved on the platform
    this.credits = this.value(null);     // { free, bought, total, cost, typing }, as the world says
    this.settingsOpen = this.value(false);
    this.canFill = this.value(canFill());
    this.filled = this.value(false);
    this.leftFullScreen = false; // they left it themselves: a touch no longer fills it
    this.hint = this.value(typeof navigator !== "undefined" && iPhoneInBrowser() && !remembered(HINT_SEEN));
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
      credits: (held) => this.credits.setValue(held),
      // C, or the phone's button: the dialogue choices setting, kept
      choices: (on) => this.change({ dialogue_choices: on }),
      failed: (words) => this.problem.setValue(String(words)),
    };
  }

  answers() { return [ENTERS_AS_GUEST, SETS_EMAIL, SENDS_CODE, SETS_CODE, ENTERS_WITH_CODE, STARTS_OVER, LEAVES, OPENS_SETTINGS, CLOSES_SETTINGS, INVERTS_Y, TURNS_CHOICES, SIZES_TEXT, FILLS_SCREEN, HIDES_HINT]; }

  /** The seeker's settings, as saved, put into effect. */
  async loadSettings() {
    const loaded = await this.door.loadSettings();
    if (!loaded.ok) this.problem.setValue(loaded.error);
    this.settings.setValue({ ...DEFAULTS, ...loaded.settings });
    this.applySettings();
  }

  applySettings() {
    if (!this.world) return;
    this.world.walker.invertY = this.settings.read().invert_y === true;
    this.world.setChoices(this.settings.read().dialogue_choices !== false);
    this.world.setTextSize(this.settings.read().text_size);
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
    if (action === TURNS_CHOICES) this.change({ dialogue_choices: this.settings.read().dialogue_choices === false });
    if (action === SIZES_TEXT) {
      // each press, the next size; after the largest, the smallest
      const at = TEXT_SIZES.indexOf(textSize(this.settings.read().text_size));
      this.change({ text_size: TEXT_SIZES[(at + 1) % TEXT_SIZES.length] });
    }
    if (action === FILLS_SCREEN) { if (filled()) unfill(); else { this.leftFullScreen = false; fill(); } }
    if (action === HIDES_HINT) { remember(HINT_SEEN); this.hint.setValue(false); }
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
    this.settings.setValue({ ...DEFAULTS });
    this.credits.setValue(null);
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
      [TURNS_CHOICES]: ["Dialogue choices"],
      [SIZES_TEXT]: ["Text size"],
      [FILLS_SCREEN]: ["Full screen"],
      [HIDES_HINT]: ["Got it"],
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
          ui.when(visit.canFill, ui.button(FILLS_SCREEN, { style: "SecondaryButton Fill" })),
          ui.when(visit.credits.map((held) => held !== null), this.creditsShown(visit)),
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
      ui.when(visit.hint, ui.column([
        ui.text(Phrase.of("For full screen on an iPhone: tap Share, then Add to Home Screen, and open the Latent Sea from there."), "HintWords").wraps(),
        ui.button(HIDES_HINT, { style: "SecondaryButton" }),
      ], "Hint")),
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

  /** The seeker's settings. */
  settingsPanel(visit) {
    const ui = this.ui;
    const inverted = visit.settings.map((now) => now.invert_y === true);
    const choices = visit.settings.map((now) => now.dialogue_choices !== false);
    const size = visit.settings.map((now) => SIZE_NAMES.get(textSize(now.text_size)));
    return ui.column([
      ui.row([ui.text(Phrase.of("Settings"), "TalkTitle"), ui.button(CLOSES_SETTINGS, { style: "SecondaryButton" })], "TalkHead"),
      ui.pressable(INVERTS_Y, {}, [
        ui.text(ui.words(INVERTS_Y), "SettingName").grow(),
        ui.text(inverted.map((on) => (on ? "On" : "Off")), "SettingState"),
      ], "Setting"),
      // off, every conversation is free talk: each message uses credits
      ui.pressable(TURNS_CHOICES, {}, [
        ui.text(ui.words(TURNS_CHOICES), "SettingName").grow(),
        ui.text(choices.map((on) => (on ? "On" : "Off: uses credits")), "SettingState"),
      ], "Setting"),
      // the subtitles' size: each press, the next
      ui.pressable(SIZES_TEXT, {}, [
        ui.text(ui.words(SIZES_TEXT), "SettingName").grow(),
        ui.text(size, "SettingState"),
      ], "Setting"),
    ], "SettingsPanel");
  }

  /** The seeker's credits, at the top: always the total; the cost of the message while they type one. */
  creditsShown(visit) {
    const ui = this.ui;
    const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;
    return ui.row([
      ui.text(visit.credits.map((held) => plural(held?.total ?? 0, "credit")), "CreditsTotal"),
      ui.when(visit.credits.map((held) => held?.typing === true),
        ui.text(visit.credits.map((held) => `This message: ${plural(held?.cost ?? 0, "credit")}`), "CreditsCost")),
    ], "Credits");
  }

  probe() { return import("./probe.js?v=e1286f12e781").then((made) => new made.Probe(this)); }

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
    // full screen: a touch fills it, until they leave it themselves
    document.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch" && touchScreen() && canFill() && !filled() && !visit.leftFullScreen) fill();
    }, true);
    document.addEventListener("fullscreenchange", () => {
      if (visit.filled.read() && !filled()) visit.leftFullScreen = true;
      visit.filled.setValue(filled());
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

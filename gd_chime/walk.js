// What a probe is made of: the walk that stands in for a person, run when
// the page is opened with ?probe. A site's probe.js extends this and writes
// only run(), its own claims about its own screens:
//
//     export class Probe extends Walk {
//       async run() {
//         await this.begin();
//         this.claim("the title shows", this.shows("Hello"));
//         await this.press(COUNTS);
//         this.finish();
//       }
//     }
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// It presses the way a person would where it can - a pressable's own click
// - and reads what is on the screen, not what a model says, unless a claim
// is about the model. finish() prints PROBE OK, or PROBE FAILED and every
// claim that did not hold, to the console, which is what a headless browser
// hands the tooling (check_site.py).

export class Walk {
  /** The app being walked: a mounted ChimeApp. */
  constructor(app) {
    this.app = app;
    this._failed = [];
    this._finished = false;
  }

  /** Wait for the app to stand. */
  async begin() { await this.frames(2); }

  /** A few turns of the browser's own loop, so what was changed is drawn. */
  async frames(count = 2) {
    for (let i = 0; i < count; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  /** The last place on the driver's path: the screen, or the pop-up over it. */
  top() {
    const path = this.app.driver.getTop();
    return path.length ? path[path.length - 1] : "";
  }

  /** The app's element, where every piece stands. */
  root() { return this.app.element; }

  /** Whether an element is on the screen: in the document and not hidden by anything above it. */
  visible(element) {
    if (!element.isConnected) return false;
    for (let at = element; at && at !== this.root().parentElement; at = at.parentElement) {
      if (at.hidden || at.getAttribute("aria-hidden") === "true") return false;
    }
    return true;
  }

  /** Every visible pressable for this action. */
  pressables(action) {
    return [...this.root().querySelectorAll(`[data-action="${CSS.escape(action)}"]`)].filter((part) => this.visible(part));
  }

  /** The first visible pressable for this action, or null. */
  pressable(action) { return this.pressables(action)[0] ?? null; }

  /** Press the first pressable for this action, as a person would, and let it settle. A missing one is a failed claim, not a crash. */
  async press(action) {
    const part = this.pressable(action);
    this.claim(`there is something to press for ${action}`, part != null);
    if (part) part.click();
    await this.frames(2);
  }

  /** Every visible line of words on the screen. */
  labels() {
    return [...this.root().querySelectorAll(".chime-text")].filter((label) => this.visible(label)).map((label) => label.textContent).filter((text) => text !== "");
  }

  /** Whether these exact words are on the screen. */
  shows(words) { return this.labels().includes(words); }

  /** Whether any words on the screen contain these. */
  showsPart(part) { return this.labels().some((text) => text.includes(part)); }

  /** Every visible one-line field. */
  fields() { return [...this.root().querySelectorAll("input.chime-field")].filter((line) => this.visible(line)); }

  /** Type into a field, as the keyboard would. */
  async typeInto(field, words) {
    field.value = words;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    await this.frames(1);
  }

  /** Choose a file for a file button's action, as the device's picker would hand it over. */
  async chooseFile(action, file) {
    const input = [...this.root().querySelectorAll(`input[type=file][data-action="${CSS.escape(action)}"]`)].find((part) => this.visible(part.parentElement));
    this.claim(`there is a file to choose for ${action}`, !!input);
    if (!input) return;
    const handed = new DataTransfer();
    handed.items.add(file);
    input.files = handed.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await this.frames(2);
  }

  /** A claim about the app: a sentence, and whether it held. */
  claim(sentence, held) { if (!held) this._failed.push(sentence); }

  /** The report: PROBE OK, or PROBE FAILED with every claim that did not hold. */
  finish() {
    this._finished = true;
    if (this._failed.length) {
      for (const sentence of this._failed) console.log(`NOT TRUE: ${sentence}`);
      console.log("PROBE FAILED");
    } else {
      console.log("PROBE OK");
    }
    if (typeof document !== "undefined") document.title = this._failed.length ? "PROBE FAILED" : "PROBE OK";
  }

  /** Whether the page asks to be walked: opened with ?probe. */
  static asked() { return typeof location !== "undefined" && new URLSearchParams(location.search).has("probe"); }

  /** Walk an app with a probe, and say so if the walk itself broke. */
  static async run(probe) {
    try {
      await probe.run();
      if (!probe._finished) { console.log("NOT TRUE: the probe finished"); console.log("PROBE FAILED"); }
    } catch (error) {
      console.log(`NOT TRUE: the probe ran without an error: ${error && error.stack ? error.stack : error}`);
      console.log("PROBE FAILED");
    }
  }
}

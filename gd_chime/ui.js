// The builder: the vocabulary an application describes its screens in, and
// the turning of a description into elements. What it describes is data
// (desc.js); what it builds draws itself from what it read, again whenever
// any of it moves.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// A PIECE THAT READS A BOUND VALUE FOLLOWS IT: its draw runs with what it
// reads noted (reads.js), and the chimes wire it to exactly those bells.
// When one rings, the piece is marked and drawn again on the next frame,
// once, never inside the ring. A piece taken away - a when turning, an each
// losing an item, the app unmounted - stops hearing everything.
//
// A PRESS GOES THROUGH THE DOOR: a pressable dispatches its action in the
// place it stands in (its region), and shows the refusal on its face, under
// its words, rather than in a tooltip a finger never sees. While the door
// would refuse it, it is inert and says why. A press that goes somewhere -
// goesTo, opens - is the place's move: the place declares where the action
// goes as the pressable is built, and the driver carries the reader there.
//
// A POP-UP IS DESCRIBED WHERE IT IS USED - beside the button opening it -
// and lifted beside the app by the builder, once, its name the builder's:
// its kind and how many of that kind were described before it. Its content
// is a function of the parameter it is entered with, handed in as a bound
// value. Every pop-up owns its way out: CLOSES, which goes back.

import { Bound } from "./bound.js?v=5acfd9881574";
import { Chimes } from "./chimes.js?v=5acfd9881574";
import { Desc } from "./desc.js?v=5acfd9881574";
import { Driver } from "./driver.js?v=5acfd9881574";
import { Frames } from "./frames.js?v=5acfd9881574";
import { Language } from "./language.js?v=5acfd9881574";
import { OwnBell } from "./own_bell.js?v=5acfd9881574";
import { Phrase } from "./phrase.js?v=5acfd9881574";
import { Place } from "./place.js?v=5acfd9881574";
import { Pressables, Themes } from "./themes.js?v=5acfd9881574";
import { Value } from "./value.js?v=5acfd9881574";

const DRAWN = "drawn";
let fieldsMade = 0; // every field's own id, so its label names it
const pieces = new WeakMap(); // element -> [what to do as it goes]

export class Ui {
  static CLOSES = "closes_the_overlay";
  static PLACES = ["app", "screen", "tabs", "pop_up"];

  constructor(root, chimes, commands, driver, actions) {
    this.root = root;
    this.chimes = chimes;
    this.commands = commands;
    this.driver = driver;
    this.actions = actions;
    this._place = null;
    this._pressable = null;
    this._issued = new Map(); // a pop-up's kind -> how many of it were described
    this._lifted = new Map(); // a pop-up's name -> its place
    this._templatesRunning = 0;
    this._layer = null; // where pop-ups stand, over the app
    this.named = new Map(); // id -> element
    actions.declareAll({ [Ui.CLOSES]: ["Close", actions.constructor.keys("Escape")] });
  }

  // --- content ---

  /** Words: a phrase, data, or a bound value reading either. Chain wraps, hidesEmpty. */
  text(content, style = "") { return new Desc("text", { content, style, hides_empty: false, wraps: false }); }

  /** The register's words for an action: a phrase of its English. */
  words(action) {
    // an action not declared is said by its name here, and named as a fault as the app starts (faults)
    return Phrase.of(this.actions.has(action) ? this.actions.getWords(action) : action);
  }

  /** A picture: its address, or a bound value reading one, and the words a reader who cannot see it hears. */
  image(content, style = "", alt = "") { return new Desc("image", { content, style, alt }); }

  /**
   * Another page shown in a frame of this shape - a video above all. Its
   * options: title, what the frame is, said to a reader who cannot see it;
   * ratio, its shape ("16 / 9" unless given); poster, a picture shown in its
   * place until it is pressed, so nothing of the other page loads before the
   * reader asks; and style. Without a poster the frame loads as it nears the screen.
   */
  embed(src, options = {}) {
    checked("an embed", options, ["title", "ratio", "poster", "style"]);
    return new Desc("embed", { src, title: options.title ?? "", ratio: options.ratio ?? "16 / 9", poster: options.poster ?? null, style: options.style ?? "" });
  }

  /**
   * One series as columns: a bound array of { label, value, says }, drawn
   * against max (the largest value, given none). Each column says its words
   * (says, else "label: value") as it is pointed at or focused; every nth
   * label (options.labelEvery) stands under the columns. options.said, a
   * phrase or bound value, tells a reader who can't see it what it shows.
   */
  bars(items, options = {}) {
    checked("bars", options, ["max", "labelEvery", "said", "style"]);
    return new Desc("bars", { items, max: options.max ?? null, label_every: options.labelEvery ?? 1, said: options.said ?? "", style: options.style ?? "" });
  }

  surface(style, content = []) { return new Desc("surface", { style }, content); }

  /** Running words: spans one after another - a phrase, data, a bound value, or a pressable among them. */
  paragraph(spans, style = Themes.PARAGRAPH) { return new Desc("paragraph", { spans, style }, spans.filter((span) => span instanceof Desc)); }

  /** An entity named in running words: pressed, the move its place declares, the entity carried as the parameter. */
  link(action, entity, words, options = {}) {
    checked("a link", options, ["style", "words_style"]);
    const parameter = Bound.is(entity) ? entity.map((id) => ({ parameter: id })) : { parameter: entity };
    return this.pressable(action, parameter, [this.text(words, options.words_style ?? Themes.PARAGRAPH)], options.style ?? "Link");
  }

  /**
   * A link to another page or site: its address (or a bound value reading
   * one) and what it shows. It opens in a new tab unless it stays (an
   * address on this page, a mail link). Its options: label, what it is
   * called to a reader who cannot see it (its words are, when it has none);
   * stays, to open where it is.
   */
  hyperlink(href, content, style = "", options = {}) {
    checked("a hyperlink", options, ["label", "stays"]);
    return new Desc("hyperlink", { href, style, label: options.label ?? null, stays: !!options.stays }, content);
  }

  /** A line between parts, in a style of the look's if given. */
  divider(style = "") { return new Desc("divider", { style }); }

  // --- behaviour ---

  /** A press of this action, carrying this payload - an object, or a bound value read as the press lands. */
  pressable(action, payload = {}, content = [], style = Themes.PRESSABLE) {
    return new Desc("pressable", { action, payload, style, goes_to: "" }, content);
  }

  /** A press that sets a local to this value - or a function's answer to it as it is now - selected while they agree. No door. */
  pressLocal(to, gives, content = [], style = Themes.PRESSABLE) { return new Desc("press_local", { local: to, gives, style }, content); }

  /** Why the pressable this sits in cannot be used, or was refused: words hidden while there is nothing to say. */
  reason(style = Themes.REASON) { return new Desc("reason", { style }); }

  /** THE COMMON BUTTON: a press of this action, saying the register's words over why it cannot be used. */
  button(action, options = {}) {
    checked("a button", options, ["opens", "with", "goes_to", "payload", "content", "style"]);
    const withWhich = options.with;
    const opening = Bound.is(withWhich) ? withWhich.map((which) => (which == null ? {} : { parameter: which })) : withWhich == null ? {} : { parameter: withWhich };
    const inside = [...(options.content ?? []), this.text(this.words(action), Themes.FACE), this.reason(Themes.REASON)];
    const made = this.pressable(action, options.payload ?? opening, [this.column(inside, Themes.COLUMN)], options.style ?? Pressables.BUTTON);
    if (options.goes_to) made.goesTo(options.goes_to);
    return options.opens ? made.opens(options.opens) : made;
  }

  /**
   * A line typed into: Enter dispatches the action with {line}. Options:
   * label, the words over it that name it; changes, dispatched on each
   * keystroke; shows, a bound value it shows; carries, line -> payload, for
   * Enter, changes and leaves alike (which item of a list the line is for);
   * leaves, dispatched as the focus leaves; placeholder; kind (text, email...);
   * autocomplete, what the browser may fill it with (name, email...).
   */
  field(action, style = "", options = {}) {
    checked("a field", options, ["label", "changes", "shows", "carries", "leaves", "placeholder", "kind", "autocomplete"]);
    return new Desc("field", { action, style, ...options });
  }

  /**
   * A file chosen from the reader's device - a photo, say - by a button
   * saying label: chosen, the action is dispatched with {file}, a File.
   * Options: accept, the kinds of file offered ("image/*"); payload, more
   * to carry with the file - an object, or a bound value read as the file
   * comes (which item of a list it is for); style. Refused, the refusal is
   * shown under it, as a pressable's is.
   */
  file(action, label, options = {}) {
    checked("a file", options, ["accept", "payload", "style"]);
    return new Desc("file", { action, label, accept: options.accept ?? "", payload: options.payload ?? {}, style: options.style ?? "" });
  }

  /** Lines typed into: each change dispatches the action with {line}; it shows the bound value. */
  /** A box of lines; carries, if given, turns what is typed into the payload ({ line } otherwise). */
  area(action, shows, style = "TextArea", { carries = null } = {}) { return new Desc("area", { action, shows, style, carries }); }

  // --- layout ---

  row(children, style = Themes.ROW) { return new Desc("row", { style }, children); }

  column(children, style = Themes.COLUMN) { return new Desc("column", { style }, children); }

  /** Columns as shares of the width, or as many as fit given none. */
  grid(children, columns = [], style = Themes.GRID) { return new Desc("grid", { columns, style }, children); }

  /** Each child over the last, filling it: what screens that take each other's place stand in. */
  stack(children) { return new Desc("stack", {}, children); }

  /** A window onto one piece, scrolled. */
  scroll(content, along = "down") { return new Desc("scroll", { along }, [content]); }

  // --- choosing ---

  /** One piece per item of a bound array, from the template given a handle to each item; kept by key, given one. */
  each(items, template, key = null, style = Themes.COLUMN) { return new Desc("each", { items, template, key, style, across: false }); }

  eachAcross(items, template, key = null, style = Themes.ROW) { return new Desc("each", { items, template, key, style, across: true }); }

  /** The first description while the bound value holds, else the second, which may be nothing. Chain keeps. */
  when(bound, a, b = null) { return new Desc("when", { bound, a, b, keeps: false }); }

  // --- values ---

  /** A value of the screen's own, set by a press_local: never a command. */
  local(initial) {
    const bell = new OwnBell("local");
    bell.hang(this.chimes);
    return new Value(bell, initial);
  }

  /** A value worked out from others, read again whenever any of them moves. */
  bound(work) { return new Bound(work); }

  /** What a place is entered as, as a bound value: nothing while the reader is not there. */
  parameter(place) { return new Bound(() => this.driver.getParameter(place)); }

  // --- places ---

  /** The one place every other stands inside, its actions answered by this model, or each of these. */
  app(named, content, handledBy = null) { return new Desc("app", { name: named, handled_by: handledBy, blocks: true }, content); }

  /** A place that takes its siblings' place. Options: on_fill, given the token of the stay; on_empty. */
  screen(named, content, handledBy = null, options = {}) {
    checked("a screen", options, ["on_fill", "on_empty"]);
    return new Desc("screen", { name: named, handled_by: handledBy, blocks: true, on_fill: options.on_fill ?? null, on_empty: options.on_empty ?? null }, content);
  }

  /** A screen whose content holds screens that take each other's place. */
  tabs(named, content, handledBy = null) { return new Desc("tabs", { name: named, handled_by: handledBy, blocks: true }, content); }

  /** A place raised over the app: what content answers for the parameter it is entered as. Chain blocksNothing for a panel. */
  popUp(kind, content, handledBy = null) {
    if (this._templatesRunning > 0) console.error(`a ${kind} was described inside a template; describe it once, outside, and open it with the item`);
    this._issued.set(kind, (this._issued.get(kind) ?? 0) + 1);
    return new Desc("pop_up", { name: `${kind} ${this._issued.get(kind)}`, handled_by: handledBy, blocks: true, content });
  }

  // --- building ---

  /** The region a piece built now stands in: its place's name, or the global region. */
  region() { return this._place ? this._place.name : Chimes.GLOBAL; }

  nodeNamed(id) { return this.named.get(id) ?? null; }

  /** A description built into elements under this parent, its children top-down. */
  build(desc, parent) {
    if (!(desc instanceof Desc)) throw new TypeError(`a description was expected, and ${desc} was given`);
    if (desc.kind === "pop_up") { this._lift(desc); return null; }
    const builder = BUILDERS[desc.kind];
    if (!builder) throw new Error(`there is no ${desc.kind} to build`);
    const saved = [this._place, this._pressable];
    try {
      const made = builder(this, desc, parent);
      if (desc.props.id) { made.id = desc.props.id; this.named.set(desc.props.id, made); }
      applyFacts(made, desc.facts);
      return made;
    } finally {
      [this._place, this._pressable] = saved;
    }
  }

  /** Every child built into an element. */
  buildInto(children, element) {
    for (const child of children) if (child) this.build(child, element);
  }

  /** A template's description for a handle, the handle guarded meanwhile. */
  describeWith(template, handle) {
    handle.setTemplateRunning(true);
    this._templatesRunning++;
    let desc;
    try { desc = template(handle); } finally { this._templatesRunning--; handle.setTemplateRunning(false); }
    if (!desc) console.error(`a template described nothing for ${JSON.stringify(handle.read())}; a template must cope with an empty handle`);
    return desc;
  }

  /** A piece drawn now and again whenever anything its draw read moves, on the next frame; it stops as its element goes. */
  draws(element, draw) {
    const piece = { region: this.region(), due: false };
    const redraw = () => { piece.due = false; if (!piece.gone) this.chimes.follow(piece, DRAWN, draw, moved); };
    const moved = () => {
      if (piece.due) return;
      piece.due = true;
      Frames.next(() => { if (piece.due && !piece.gone) redraw(); });
    };
    redraw();
    goes(element, () => { piece.gone = true; this.chimes.stopAll(piece); });
    return () => redraw();
  }

  /** The app's description built into the root, then, at the frame's end, its faults checked and the reader brought to it. */
  start(desc, onBroken, onStarted) {
    this._layer = el(this.root, "div", "chime-layer");
    this.build(desc, this.root);
    this.root.appendChild(this._layer);
    Frames.defer(() => {
      const wrong = this.faults();
      for (const sentence of wrong) console.error(sentence);
      if (wrong.length) { onBroken(wrong); return; }
      this.commands.dispatch(Chimes.GLOBAL, Driver.GO, { place: this.driver.app.name });
      onStarted();
    });
  }

  /** What is wrong with the description, a sentence each: what the app cannot stand with. */
  faults() {
    const wrong = [];
    if (!this.driver.app) wrong.push("the description has no app");
    for (const place of this.driver.places.values()) {
      if (Chimes.RESERVED.includes(place.name)) wrong.push(`${place.name} is a reserved region, and no place may be named after it`);
      for (const [action, goesTo] of place.performs) {
        if (!this.actions.has(action)) wrong.push(`${place.name} declares ${action}, which is no action`);
        else if (Driver.COMMANDS.includes(action)) wrong.push(`${place.name} declares ${action}, the driver's own; a button navigates by where its action goes`);
        else if (goesTo !== "" && goesTo !== Driver.BACK && !this.driver.places.has(goesTo)) wrong.push(`${place.name} sends ${action} to ${goesTo}, which is no place`);
        else if (goesTo === "" && !this.commands.handles(place.name, action)) wrong.push(`nothing answers ${action} in ${place.name}`);
      }
    }
    return wrong;
  }

  /** Everything built taken down: every piece stops hearing. */
  stop() { leave(this.root); this.root.replaceChildren(); }

  /** A pop-up lifted beside the app, once: its place built in the layer over everything, its content called with its parameter. */
  _lift(desc) {
    const name = desc.props.name;
    if (this._lifted.has(name)) return this._lifted.get(name);
    const saved = [this._place, this._pressable];
    try {
      const shade = el(this._layer ?? this.root, "div", "chime-shade chime-place");
      if (desc.props.blocks === false) shade.classList.add("chime-blocks-nothing");
      const sheet = el(shade, "div", "chime-sheet");
      sheet.setAttribute("role", "dialog");
      const place = this._place_of(desc, shade, "pop_up");
      this._lifted.set(name, place);
      place.performs.set(Ui.CLOSES, Driver.BACK);
      shade.addEventListener("click", (event) => { if (event.target === shade) this.commands.dispatch(name, Ui.CLOSES, {}); });
      this._place = place;
      const content = desc.props.content(this.parameter(name));
      if (content) this.build(content, sheet);
      return place;
    } finally {
      [this._place, this._pressable] = saved;
    }
  }

  _place_of(desc, element, kind) {
    const place = new Place(desc.props.name, kind, element);
    place.blocks = desc.props.blocks !== false;
    place.onFill = desc.props.on_fill ?? null;
    place.onEmpty = desc.props.on_empty ?? null;
    if (kind !== "pop_up" && kind !== "app") {
      place.parent = this._place;
      if (this._place) this._place.children.push(place);
    }
    element.hidden = kind !== "app";
    element.dataset.place = place.name;
    if (!this.driver.addPlace(place)) return place;
    const models = [desc.props.handled_by].flat().filter(Boolean);
    place.handledBy = models[0] ?? null;
    for (const model of models) this.commands.stand(place.name, model);
    goes(element, () => { this.driver.removePlace(place); this.commands.dropRegion(place.name); this.chimes.dropRegion(place.name); for (const model of models) model.dispose?.(); });
    return place;
  }
}

// --- the primitives: each builds its element from a description ---

const BUILDERS = {
  app(ui, desc, parent) {
    const made = el(parent, "div", "chime-app chime-place");
    ui._place = ui._place_of(desc, made, "app");
    ui.buildInto(desc.children, made);
    return made;
  },

  screen(ui, desc, parent) {
    const made = el(parent, "section", "chime-place chime-screen");
    ui._place = ui._place_of(desc, made, "screen");
    ui.buildInto(desc.children, made);
    return made;
  },

  tabs(ui, desc, parent) {
    const made = el(parent, "section", "chime-place chime-tabs");
    ui._place = ui._place_of(desc, made, "tabs");
    ui.buildInto(desc.children, made);
    return made;
  },

  text(ui, desc, parent) {
    const { content, style, hides_empty, wraps } = desc.props;
    const made = el(parent, "p", `chime-text ${styleOf(style)}`);
    if (wraps) made.classList.add("chime-wraps");
    if (hides_empty) made.classList.add("chime-hides-empty");
    ui.draws(made, () => { made.textContent = Language.said(Bound.is(content) ? content.read() : content); });
    return made;
  },

  image(ui, desc, parent) {
    const made = el(parent, "img", `chime-image ${styleOf(desc.props.style)}`);
    made.loading = "lazy";
    made.decoding = "async";
    ui.draws(made, () => {
      const { content, alt } = desc.props;
      made.src = (Bound.is(content) ? content.read() : content) ?? "";
      made.alt = Language.said(Bound.is(alt) ? alt.read() : alt);
    });
    return made;
  },

  embed(ui, desc, parent) {
    const { src, title, ratio, poster, style } = desc.props;
    const made = el(parent, "div", `chime-embed ${styleOf(style)}`);
    made.style.aspectRatio = ratio;
    const said = () => Language.said(title);
    const frame = () => {
      const shown = el(made, "iframe", "chime-embed-frame");
      shown.src = src;
      shown.title = said();
      shown.loading = "lazy";
      shown.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
      shown.referrerPolicy = "strict-origin-when-cross-origin";
      return shown;
    };
    if (!poster) { frame(); return made; }
    // the poster stands in for the frame until pressed: a press of the reader's own, never a command
    const press = el(made, "button", "chime-embed-poster");
    press.type = "button";
    press.dataset.src = src;
    const picture = el(press, "img", "chime-embed-picture");
    picture.src = poster;
    picture.alt = "";
    picture.loading = "lazy";
    el(press, "span", "chime-embed-play");
    ui.draws(press, () => { press.setAttribute("aria-label", Language.said(Phrase.with("Play %s", [said()]))); });
    press.addEventListener("click", () => {
      leave(press);
      press.remove();
      frame().focus();
    });
    return made;
  },

  bars(ui, desc, parent) {
    const { items, max, label_every: every, said, style } = desc.props;
    const made = el(parent, "figure", `chime-bars ${styleOf(style)}`);
    made.setAttribute("role", "img");
    const top = el(made, "span", "chime-bars-top");
    const plot = el(made, "div", "chime-bars-plot");
    const labels = el(made, "div", "chime-bars-labels");
    ui.draws(made, () => {
      const list = items.read() ?? [];
      const highest = Math.max(1, Bound.is(max) ? max.read() ?? 0 : max ?? 0, ...list.map((item) => Number(item.value) || 0));
      made.setAttribute("aria-label", Language.said(Bound.is(said) ? said.read() : said));
      top.textContent = String(highest);
      plot.replaceChildren();
      labels.replaceChildren();
      list.forEach((item, index) => {
        const value = Number(item.value) || 0;
        const column = el(plot, "div", "chime-bar");
        column.tabIndex = 0;
        const words = Language.said(item.says ?? `${item.label}: ${value}`);
        column.setAttribute("aria-label", words);
        column.dataset.says = words;
        const fill = el(column, "span", "chime-bar-fill");
        fill.style.height = `${(value / highest) * 100}%`;
        const label = el(labels, "span", "chime-bars-label");
        label.textContent = index % every === 0 ? Language.said(item.label) : "";
      });
    });
    return made;
  },

  surface(ui, desc, parent) {
    const made = el(parent, "div", `chime-surface ${styleOf(desc.props.style)}`);
    ui.buildInto(desc.children, made);
    return made;
  },

  paragraph(ui, desc, parent) {
    const made = el(parent, "p", `chime-text chime-wraps ${styleOf(desc.props.style)}`);
    for (const span of desc.props.spans) {
      if (span instanceof Desc) { ui.build(span, made); continue; }
      const words = el(made, "span", "chime-span");
      ui.draws(words, () => { words.textContent = Language.said(Bound.is(span) ? span.read() : span); });
    }
    return made;
  },

  hyperlink(ui, desc, parent) {
    const { href, style, label, stays } = desc.props;
    const made = el(parent, "a", `chime-hyperlink ${styleOf(style)}`);
    const address = () => String((Bound.is(href) ? href.read() : href) ?? "");
    ui.draws(made, () => {
      made.href = address();
      const leaves = !stays && /^https?:/.test(made.getAttribute("href")) && !made.getAttribute("href").startsWith("#");
      if (leaves) { made.target = "_blank"; made.rel = "noopener noreferrer"; } else { made.removeAttribute("target"); made.removeAttribute("rel"); }
      if (label) made.setAttribute("aria-label", Language.said(label)); else made.removeAttribute("aria-label");
    });
    ui.buildInto(desc.children, made);
    return made;
  },

  divider(_ui, desc, parent) { return el(parent, "hr", `chime-divider ${styleOf(desc.props.style)}`); },

  row(ui, desc, parent) { const made = el(parent, "div", `chime-row ${styleOf(desc.props.style)}`); ui.buildInto(desc.children, made); return made; },

  column(ui, desc, parent) { const made = el(parent, "div", `chime-column ${styleOf(desc.props.style)}`); ui.buildInto(desc.children, made); return made; },

  grid(ui, desc, parent) {
    const made = el(parent, "div", `chime-grid ${styleOf(desc.props.style)}`);
    const columns = desc.props.columns;
    made.style.gridTemplateColumns = columns.length ? columns.map((share) => `${share}fr`).join(" ") : "repeat(auto-fill, minmax(12rem, 1fr))";
    ui.buildInto(desc.children, made);
    return made;
  },

  stack(ui, desc, parent) { const made = el(parent, "div", "chime-stack"); ui.buildInto(desc.children, made); return made; },

  scroll(ui, desc, parent) {
    const made = el(parent, "div", `chime-scroll chime-scroll-${desc.props.along}`);
    ui.buildInto(desc.children, made);
    return made;
  },

  pressable(ui, desc, parent) {
    const { action, payload, style } = desc.props;
    const place = ui._place;
    if (!place) throw new Error(`a pressable for ${action} stands in no place`);
    if (desc.props.overlay) ui._lift(desc.props.overlay);
    const goesTo = desc.props.goes_to ?? "";
    if (!place.performs.has(action) || (goesTo && place.performs.get(action) === "")) place.performs.set(action, goesTo);
    const made = el(parent, "button", `chime-pressable ${styleOf(style)}`);
    made.type = "button";
    made.dataset.action = action;
    if (desc.props.no_focus) made.tabIndex = -1;
    const region = place.name;
    const bell = new OwnBell("refused");
    bell.hang(ui.chimes);
    const refused = new Value(bell, null); // the door's last answer to a press, shown until anything it read moves
    const carried = () => (Bound.is(payload) ? payload.read() : payload) ?? {};
    const isCurrent = () => {
      if (desc.props.current_while) return desc.props.current_while.read() === true;
      const to = place.performs.get(action) ?? "";
      if (!to || to === Driver.BACK) return false;
      // current while the reader is where it goes, on the layer on top: a press in a pop-up going to the screen beneath is not
      return ui.driver.getTop().includes(to) && JSON.stringify(ui.driver.getParameter(to)) === JSON.stringify(carried().parameter ?? null);
    };
    const reason = new Bound(() => (isCurrent() ? null : ui.commands.refusal(region, action, carried()) ?? refused.read()), made);
    made._reason = reason;
    ui._pressable = made;
    ui.buildInto(desc.children, made);
    ui.draws(made, () => {
      const refusal = ui.commands.refusal(region, action, carried());
      const current = isCurrent();
      made.setAttribute("aria-disabled", String(refusal !== null));
      made.classList.toggle("chime-current", current);
      if (current) made.setAttribute("aria-current", "page"); else made.removeAttribute("aria-current");
      if (desc.props.absent) made.hidden = refusal !== null;
    });
    // the door's answer to a press is shown until anything the door's question read moves
    ui.draws(made, () => { ui.commands.refusal(region, action, carried()); if (refused._held !== null) refused.setValue(null); });
    made.addEventListener("click", () => {
      if (ui.commands.refusal(region, action, carried()) !== null) return;
      const answer = ui.commands.dispatch(region, action, carried());
      const last = ui.commands.getLast();
      refused.setValue(answer !== null && !(last && last.paused) ? answer : null);
    });
    goes(made, () => bell.dispose());
    return made;
  },

  press_local(ui, desc, parent) {
    const { local, gives, style } = desc.props;
    const made = el(parent, "button", `chime-pressable ${styleOf(style)}`);
    made.type = "button";
    ui.buildInto(desc.children, made);
    const given = () => (typeof gives === "function" ? gives(local._held) : gives);
    ui.draws(made, () => {
      const chosen = typeof gives !== "function" && JSON.stringify(local.read()) === JSON.stringify(gives);
      made.classList.toggle("chime-current", chosen);
      made.setAttribute("aria-pressed", String(chosen));
    });
    made.addEventListener("click", () => local.setValue(given()));
    return made;
  },

  reason(ui, desc, parent) {
    const pressable = ui._pressable;
    const made = el(parent, "p", `chime-text chime-wraps chime-hides-empty ${styleOf(desc.props.style)}`);
    if (!pressable) { console.error("a reason stands in no pressable"); return made; }
    ui.draws(made, () => { made.textContent = Language.said(pressable._reason.read()); });
    return made;
  },

  field(ui, desc, parent) {
    const { action, style, changes, shows, carries, leaves, placeholder, kind, label, autocomplete } = desc.props;
    const place = ui._place;
    for (const declared of [action, changes, leaves]) if (declared && !place.performs.has(declared)) place.performs.set(declared, "");
    const holder = el(parent, "div", "chime-column chime-field-holder");
    const named = label ? el(holder, "label", "chime-text chime-field-label") : null;
    const made = el(holder, "input", `chime-field ${styleOf(style || "Field")}`);
    made.type = kind ?? "text";
    made.dataset.action = action;
    made.id = `chime-field-${++fieldsMade}`;
    if (autocomplete) made.autocomplete = autocomplete;
    if (named) { named.htmlFor = made.id; ui.draws(named, () => { named.textContent = Language.said(label); }); }
    if (placeholder) ui.draws(made, () => { made.placeholder = Language.said(placeholder); });
    if (desc.props.takes_focus) Frames.next(() => made.focus());
    const said = el(holder, "p", "chime-text chime-wraps chime-hides-empty Reason");
    const region = place.name;
    if (shows) ui.draws(made, () => { const value = shows.read() ?? ""; if (made.value !== String(value)) made.value = String(value); });
    const carried = () => (carries ? carries(made.value) : { line: made.value });
    made.addEventListener("input", () => { if (changes) ui.commands.dispatch(region, changes, carried()); });
    made.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const answer = ui.commands.dispatch(region, action, carried());
      const last = ui.commands.getLast();
      said.textContent = answer && !(last && last.paused) ? Language.said(answer) : "";
      made.setAttribute("aria-invalid", String(!!said.textContent));
      if (answer === null && !shows) made.value = "";
    });
    if (leaves) made.addEventListener("blur", () => ui.commands.dispatch(region, leaves, carried()));
    return holder;
  },

  file(ui, desc, parent) {
    const { action, label, accept, payload, style } = desc.props;
    const place = ui._place;
    if (!place.performs.has(action)) place.performs.set(action, "");
    const holder = el(parent, "div", "chime-column chime-file-holder");
    // the button is a label for a hidden input, so the device's own picker opens on a press or a key
    const made = el(holder, "label", `chime-pressable chime-file ${styleOf(style || "Pressable")}`);
    const input = el(made, "input", "chime-file-input");
    input.type = "file";
    input.dataset.action = action;
    if (accept) input.accept = accept;
    const words = el(made, "span", "chime-text");
    ui.draws(words, () => { words.textContent = Language.said(Bound.is(label) ? label.read() : label); });
    const said = el(holder, "p", "chime-text chime-wraps chime-hides-empty Reason");
    const region = place.name;
    input.addEventListener("change", () => {
      const chosen = input.files?.[0];
      input.value = ""; // the same file chosen again is a choice again
      if (!chosen) return;
      const answer = ui.commands.dispatch(region, action, { ...((Bound.is(payload) ? payload.read() : payload) ?? {}), file: chosen });
      const last = ui.commands.getLast();
      said.textContent = answer && !(last && last.paused) ? Language.said(answer) : "";
    });
    return holder;
  },

  area(ui, desc, parent) {
    const { action, shows, style, carries } = desc.props;
    const place = ui._place;
    if (!place.performs.has(action)) place.performs.set(action, "");
    const made = el(parent, "textarea", `chime-field ${styleOf(style)}`);
    made.dataset.action = action;
    ui.draws(made, () => { const value = shows.read() ?? ""; if (made.value !== String(value)) made.value = String(value); });
    made.addEventListener("input", () => ui.commands.dispatch(place.name, action, carries ? carries(made.value) : { line: made.value }));
    return made;
  },

  each(ui, desc, parent) {
    const { items, template, key, style, across } = desc.props;
    const made = el(parent, "div", `${across ? "chime-row" : "chime-column"} ${styleOf(style)}`);
    const placeAt = ui._place;
    const kept = new Map(); // key -> element
    ui.draws(made, () => {
      const list = items.read() ?? [];
      const keyOf = key ?? ((_item, index) => index);
      const wanted = list.map((item, index) => keyOf(item, index));
      const rebuild = key === null;
      const saved = ui._place;
      ui._place = placeAt;
      try {
        for (const [k, element] of [...kept]) if (rebuild || !wanted.includes(k)) { leave(element); element.remove(); kept.delete(k); }
        wanted.forEach((k, index) => {
          if (!kept.has(k)) {
            const handle = key === null ? new Bound(() => (items.read() ?? [])[index] ?? null) : new Bound(() => (items.read() ?? []).find((item, i) => keyOf(item, i) === k) ?? null);
            const piece = el(made, "div", "chime-each");
            ui.build(ui.describeWith(template, handle), piece);
            kept.set(k, piece);
          }
        });
        // put in order, moving only what is out of place: a piece moved loses the focus, so one typed in mustn't be
        let next = made.firstChild;
        for (const k of wanted) {
          const piece = kept.get(k);
          if (piece === next) next = next.nextSibling;
          else made.insertBefore(piece, next);
        }
      } finally {
        ui._place = saved;
      }
    });
    return made;
  },

  when(ui, desc, parent) {
    const { bound, a, b, keeps } = desc.props;
    const made = el(parent, "div", "chime-each");
    const placeAt = ui._place;
    const sides = [null, null];
    let showing = -1;
    ui.draws(made, () => {
      const side = truthy(bound.read()) ? 0 : 1;
      if (side === showing) return;
      showing = side;
      const saved = ui._place;
      ui._place = placeAt;
      try {
        for (const i of [0, 1]) {
          if (i === side || !sides[i]) continue;
          if (keeps) sides[i].hidden = true; else { leave(sides[i]); sides[i].remove(); sides[i] = null; }
        }
        const chosen = side === 0 ? a : b;
        if (sides[side]) sides[side].hidden = false;
        else if (chosen) { sides[side] = el(made, "div", "chime-each"); ui.build(chosen, sides[side]); }
      } finally {
        ui._place = saved;
      }
    });
    return made;
  },
};

// --- what the builder leans on ---

function el(parent, tag, classes = "") {
  const made = parent.ownerDocument.createElement(tag);
  if (classes) made.className = classes.trim();
  parent.appendChild(made);
  return made;
}

function styleOf(style) {
  if (!style) return "";
  return Bound.is(style) ? "" : String(style);
}

function applyFacts(made, facts) {
  if (facts.grow !== undefined) { made.classList.add("chime-grow"); made.style.flexGrow = String(facts.grow); }
  if (facts.basis !== undefined) made.style.flexBasis = `${facts.basis * 100}%`;
  if (facts.max !== undefined) made.style.maxWidth = `${facts.max * 100}%`;
  if (facts.span !== undefined) made.style.gridColumn = `span ${facts.span}`;
}

/** What to do as an element goes: stop its pieces hearing, drop its places. */
function goes(element, done) {
  if (!pieces.has(element)) pieces.set(element, []);
  pieces.get(element).push(done);
}

/** An element and everything under it gone: every piece in it stops, deepest first. */
export function leave(element) {
  for (const child of [...element.children]) leave(child);
  for (const done of pieces.get(element) ?? []) done();
  pieces.delete(element);
}

function truthy(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string" || Array.isArray(value)) return value.length > 0;
  if (value instanceof Map || value instanceof Set) return value.size > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function checked(what, options, allowed) {
  for (const key of Object.keys(options)) if (!allowed.includes(key)) console.error(`${what} has no option ${key}; it has ${allowed.join(", ")}`);
}

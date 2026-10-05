// Speech in the world, as subtitles: whoever speaks, creature or seeker, is
// heard one at a time, never over another. A line waits for the floor; a
// long one is shown in pieces at reading pace. Each piece names its speaker
// in their colour, with a pointer turned towards a creature as it moves
// (none for the seeker).
//
// Under a character's line, once the floor is free, its dialogue choices may
// wait: numbered, picked with the number keys or a tap. The seeker can also
// speak freely, typing into the subtitles themselves: no box, their words in
// their colour as they type, Enter to say them, Enter on a blank line to
// stop. While the
// seeker types, creatures wait.
//
// Which keys do what is the world's: Enter to talk, T to speak freely, the
// numbers to choose (world.js). This only draws, and tells.

/** Reading pace, in characters a second, and how long a piece stays: at least, at most, and the pause between speakers. */
export const PACE = 15;
const LEAST = 1.6;
const MOST = 7;
const BETWEEN = 0.35;
/** A piece is at most two subtitle lines of about 42 characters. */
const PIECE = 84;

/** A line cut into subtitle pieces: whole sentences where they fit, then at commas, then at spaces. */
export function pieces(text) {
  const words = String(text).replace(/\s+/g, " ").trim();
  if (!words) return [];
  const sentences = words.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? [words];
  const out = [];
  let piece = "";
  const push = (part) => {
    const next = piece ? `${piece} ${part}` : part;
    if (next.length <= PIECE) { piece = next; return; }
    if (piece) out.push(piece);
    piece = "";
    if (part.length <= PIECE) { piece = part; return; }
    // too long alone: at commas, then at spaces
    const clauses = part.split(/(?<=[,;:])\s+/);
    for (const clause of clauses) {
      if (clause.length <= PIECE) { const joined = piece ? `${piece} ${clause}` : clause; if (joined.length <= PIECE) piece = joined; else { out.push(piece); piece = clause; } continue; }
      for (const word of clause.split(" ")) {
        const joined = piece ? `${piece} ${word}` : word;
        if (joined.length <= PIECE) piece = joined; else { if (piece) out.push(piece); piece = word; }
      }
    }
  };
  for (const sentence of sentences) push(sentence.trim());
  if (piece) out.push(piece);
  return out;
}

/** How long a piece stays on screen, in seconds. */
export function shownFor(piece, pace = PACE) {
  return Math.min(MOST, Math.max(LEAST, piece.length / pace));
}

export const SEEKER = { name: "Seeker", colour: "#f4ead8" };

/** How big the text is, times its size at 1: the seeker's setting (TEXT_SIZES), twice that unless they change it. */
export const TEXT_SIZE = 2;
export const TEXT_SIZES = [1, 1.5, 2, 2.5];
/** A size scaled by the text size the box is given. */
const sized = (size) => `calc(${size} * var(--world-text, 1))`;
const SUBTITLE_FONT = `500 ${sized("clamp(1.05rem, 2.6vw, 1.45rem)")}/1.35 system-ui, sans-serif`;
const SHADOW = "0 1px 3px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.6)";

export class Speech {
  /**
   * @param {object} options
   *   holder   what the subtitles sit in, over the world; none in tests
   *   where    (speaker) -> where they are on screen, { x, y } from 0 to 1, or null: for the pointer
   *   prompts  () -> what the seeker can do now, as [{ label, act }] (shown while the floor is free), or []
   *   spoken   (text) -> the seeker said this, speaking freely
   *   typing   (open) -> the seeker began (true) or stopped (false) typing
   *   left     () -> the seeker stopped speaking freely (Enter on a blank line)
   *   touch    whether this is a touch screen
   *   pace     characters a second (tests go faster)
   *   wait     (seconds) -> a promise (tests skip the waiting)
   */
  constructor({ holder = null, where = () => null, prompts = () => [], spoken = () => {}, typing = () => {}, left = () => {}, touch = false, pace = PACE, wait } = {}) {
    this.where = where;
    this.prompts = prompts;
    this.spoken = spoken;
    this.onTyping = typing;
    this.left = left;
    this.touch = touch;
    this.pace = pace;
    this.wait = wait ?? ((seconds) => new Promise((done) => setTimeout(done, seconds * 1000)));
    this.queue = [];        // { speaker, text (or a promise of it), done }
    this.speaking = null;   // the speaker holding the floor, while they speak
    this.typing = false;    // the seeker holding it, while they type
    this.offered = null;    // dialogue choices waiting: { replies, pick }
    this.band = "top";      // where the subtitles sit: top, middle or bottom of the screen
    this.wanted = "top";    // where they'll move to, between lines
    this.size = TEXT_SIZE;  // how big the text is
    this.stopped = false;
    this.shownPrompts = "";
    this.dom = holder ? this.build(holder) : null;
    this.render();
  }

  /** A line for `speaker` ({ name, colour, at }): its text, or a promise of it. Answers when it has been said. */
  say(speaker, text, { first = false } = {}) {
    return new Promise((done) => {
      this.queue[first ? "unshift" : "push"]({ speaker, text, done });
      this.pump();
    });
  }

  /** Whether the floor is free: nobody speaking, nobody typing, nobody waiting to speak. */
  free() { return !this.speaking && !this.typing && this.queue.length === 0; }

  /** Dialogue choices to show once the floor is free: their words, and what to do with the one picked (its index). */
  offer(replies, pick) {
    this.offered = replies.length ? { replies, pick } : null;
    this.render();
  }

  /** No choices waiting. */
  withdraw() {
    this.offered = null;
    this.render();
  }

  /** Whether choices are showing now. */
  choosing() { return !!this.offered && this.free(); }

  /** The seeker picks the choice numbered `n` (from 1), if choices are showing. */
  choose(n) {
    if (!this.choosing()) return false;
    const { replies, pick } = this.offered;
    if (n < 1 || n > replies.length) return false;
    this.offered = null;
    this.render();
    pick(n - 1);
    return true;
  }

  /** The seeker begins to speak freely, if the floor is free. */
  open() {
    if (!this.free() || this.stopped) return false;
    this.typing = true;
    this.render();
    this.dom?.line.focus();
    this.onTyping(true);
    return true;
  }

  /** The seeker lets their line go unsaid. */
  close() {
    if (!this.typing) return;
    this.typing = false;
    if (this.dom) this.dom.line.value = "";
    this.onTyping(false);
    this.render();
    this.pump();
  }

  /** The seeker's line, sent: said in the subtitles first, then whoever answers. */
  send(text) {
    const said = String(text ?? "").trim();
    this.typing = false;
    if (this.dom) this.dom.line.value = "";
    this.onTyping(false);
    // a blank line: they've stopped speaking freely
    if (!said) { this.render(); this.pump(); this.left(); return null; }
    // the seeker had the floor: their line goes before any that waited while they typed
    const line = this.say({ ...SEEKER, seeker: true }, said, { first: true });
    this.spoken(said);
    return line;
  }

  async pump() {
    if (this.speaking || this.typing || this.stopped) return;
    const next = this.queue.shift();
    if (!next) { this.render(); return; }
    this.speaking = next.speaker;
    this.settle();
    this.render();
    let text = next.text;
    if (text && typeof text.then === "function") {
      // its words are still coming: the floor is theirs meanwhile
      this.show(next.speaker, "…");
      try { text = await text; } catch { text = ""; }
    }
    for (const piece of pieces(text ?? "")) {
      if (this.stopped) break;
      this.show(next.speaker, piece);
      await this.wait(shownFor(piece, this.pace));
    }
    this.show(null, "");
    if (!this.stopped) await this.wait(BETWEEN);
    this.speaking = null;
    next.done();
    this.pump();
  }

  // --- on screen --------------------------------------------------------------

  build(holder) {
    const box = document.createElement("div");
    box.className = "world-subtitles";
    box.setAttribute("aria-live", "polite");
    Object.assign(box.style, {
      position: "absolute", zIndex: "2", left: "50%", transform: "translateX(-50%)",
      width: `min(${sized("40rem")}, calc(100% - 2rem))`, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem",
      textAlign: "center", pointerEvents: "none", transition: "opacity 200ms ease",
    });
    const label = document.createElement("div");
    Object.assign(label.style, { display: "inline-flex", alignItems: "center", gap: "0.35rem", font: `700 ${sized("0.8rem")}/1 system-ui, sans-serif`, letterSpacing: "0.08em", textTransform: "uppercase", textShadow: SHADOW });
    // a triangle pointing up, turned towards whoever speaks
    const pointer = document.createElement("span");
    Object.assign(pointer.style, {
      display: "inline-block", width: sized("0.85rem"), height: sized("0.85rem"), background: "currentColor",
      clipPath: "polygon(50% 0, 100% 100%, 50% 72%, 0 100%)", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))",
      transition: "transform 120ms linear",
    });
    const name = document.createElement("span");
    label.append(pointer, name);
    const words = document.createElement("div");
    Object.assign(words.style, { font: SUBTITLE_FONT, padding: "0.1rem 0.8rem", textShadow: SHADOW, maxWidth: "100%", overflowWrap: "anywhere" });
    // the seeker's own words as they type: a subtitle too, not a box
    const line = document.createElement("input");
    line.type = "text";
    line.maxLength = 300;
    line.setAttribute("aria-label", "Say something");
    line.placeholder = "Say something";
    line.className = "world-subtitle-line";
    Object.assign(line.style, {
      font: SUBTITLE_FONT, width: "100%", boxSizing: "border-box", padding: "0.1rem 0.8rem", border: "none", background: "transparent",
      color: SEEKER.colour, caretColor: SEEKER.colour, textAlign: "center", outline: "none", pointerEvents: "auto", textShadow: SHADOW,
    });
    // dialogue choices: numbered, quiet, each a line to tap
    const choices = document.createElement("ol");
    choices.className = "world-choices";
    Object.assign(choices.style, { listStyle: "none", margin: "0.4rem 0 0", padding: "0", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.15rem" });
    // what the seeker can do now: "Enter to talk", "T to speak freely"
    const prompt = document.createElement("div");
    prompt.className = "world-prompts";
    Object.assign(prompt.style, { display: "flex", gap: "0.6rem", justifyContent: "center", pointerEvents: "auto" });
    line.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") { event.preventDefault(); this.send(line.value); }
    });
    line.addEventListener("blur", () => { if (this.typing && !line.value.trim()) { this.close(); this.left(); } });
    // a brief word from the world itself: "Dialogue choices off"
    const note = document.createElement("div");
    Object.assign(note.style, { font: `500 ${sized("0.85rem")}/1.2 system-ui, sans-serif`, color: SEEKER.colour, opacity: "0.75", textShadow: SHADOW, display: "none" });
    // how to stop, said under where they type, small
    const hint = document.createElement("div");
    hint.textContent = "Enter on a blank line to stop";
    Object.assign(hint.style, { font: `500 ${sized("0.75rem")}/1.2 system-ui, sans-serif`, color: SEEKER.colour, opacity: "0.6", textShadow: SHADOW, display: "none" });
    box.append(label, words, line, hint, choices, prompt, note);
    holder.appendChild(box);
    const made = { box, label, pointer, name, words, line, hint, choices, prompt, note };
    this.position(made.box, this.band);
    made.box.style.setProperty("--world-text", String(this.size));
    return made;
  }

  /** The box at a band of the screen: the top under the buttons there, the middle, or the bottom above the sticks. */
  position(box, band) {
    const bottom = `calc(${this.touch ? 168 : 40}px + env(safe-area-inset-bottom, 0px))`;
    const at = {
      top: { top: "calc(4.6rem + env(safe-area-inset-top, 0px))", bottom: "", transform: "translateX(-50%)" },
      middle: { top: "50%", bottom: "", transform: "translate(-50%, -50%)" },
      bottom: { top: "", bottom, transform: "translateX(-50%)" },
    }[band] ?? null;
    if (at) Object.assign(box.style, at);
  }

  /**
   * Where the subtitles should be (top, middle or bottom): they move there
   * between lines, never while one is showing, choices wait or the seeker types.
   */
  placeAt(band) {
    this.wanted = band;
    if (!this.current && !this.typing && !this.choosing() && !this.speaking) this.settle();
  }

  /** The text this many times its size at 1 (TEXT_SIZES). */
  setSize(size) {
    this.size = Number(size) > 0 ? Number(size) : TEXT_SIZE;
    this.dom?.box.style.setProperty("--world-text", String(this.size));
  }

  /** A brief word in the subtitles, for a few seconds. */
  note(text, seconds = 2.8) {
    if (!this.dom) return;
    const { note } = this.dom;
    note.textContent = text;
    note.style.display = "block";
    clearTimeout(this._noteTimer);
    this._noteTimer = setTimeout(() => { note.style.display = "none"; }, seconds * 1000);
  }

  /** Moves to where they should be, now. */
  settle() {
    if (this.band === this.wanted) return;
    this.band = this.wanted;
    if (this.dom) this.position(this.dom.box, this.band);
  }

  show(speaker, text) {
    this.current = speaker && text ? { speaker, text } : null;
    this.render();
  }

  render() {
    // between lines, they move to where they should be
    if (!this.current && !this.typing && !this.speaking && !this.choosing()) this.settle();
    if (!this.dom) return;
    const { label, name, words, line, hint, prompt, pointer, choices } = this.dom;
    const now = this.current;
    label.style.display = now || this.typing ? "inline-flex" : "none";
    const who = now?.speaker ?? (this.typing ? SEEKER : null);
    if (who) { name.textContent = who.name; label.style.color = who.colour; }
    pointer.style.display = who && !who.seeker && who !== SEEKER ? "inline-block" : "none";
    words.style.display = now ? "block" : "none";
    if (now) { words.textContent = now.text; words.style.color = now.speaker.colour; }
    line.style.display = this.typing ? "block" : "none";
    hint.style.display = this.typing ? "block" : "none";
    this.renderChoices(choices);
    this.renderPrompts(prompt);
    this.aim();
  }

  renderChoices(list) {
    const showing = this.choosing();
    list.style.display = showing ? "flex" : "none";
    const key = showing ? this.offered.replies.join("\n") : "";
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren();
    if (!showing) return;
    this.offered.replies.forEach((reply, i) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "world-choice";
      button.textContent = `${i + 1}  ${reply}`;
      Object.assign(button.style, {
        font: `500 ${sized("clamp(0.95rem, 2.2vw, 1.15rem)")}/1.35 system-ui, sans-serif`, color: SEEKER.colour, opacity: "0.82",
        background: "none", border: "none", padding: "0.15rem 0.6rem", cursor: "pointer", pointerEvents: "auto", textShadow: SHADOW,
      });
      button.addEventListener("click", (event) => { event.stopPropagation(); this.choose(i + 1); });
      item.appendChild(button);
      list.appendChild(item);
    });
  }

  renderPrompts(box) {
    const wanted = this.free() && !this.choosing() ? this.prompts() : [];
    const key = wanted.map((p) => p.label).join("|");
    if (this.shownPrompts === key) return;
    this.shownPrompts = key;
    box.replaceChildren();
    for (const { label, act } of wanted) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      Object.assign(button.style, {
        font: `500 ${sized("0.85rem")}/1 system-ui, sans-serif`, color: SEEKER.colour, opacity: "0.6", textShadow: SHADOW,
        background: "none", border: "none", padding: "0.6rem 0.8rem", cursor: "pointer",
      });
      button.addEventListener("click", (event) => { event.stopPropagation(); act?.(); });
      box.appendChild(button);
    }
  }

  /** Each frame: the pointer turned towards whoever speaks, and the prompts kept up to date. */
  frame() {
    if (!this.dom) return;
    this.aim();
    this.renderPrompts(this.dom.prompt);
  }

  aim() {
    const speaker = this.current?.speaker;
    if (!this.dom || !speaker || speaker.seeker) return;
    const at = this.where(speaker);
    if (!at) return;
    const box = this.dom.label.getBoundingClientRect();
    const host = this.dom.box.parentElement?.getBoundingClientRect();
    if (!host || !box.width) return;
    const dx = at.x * host.width + host.left - (box.left + box.width / 2);
    const dy = at.y * host.height + host.top - (box.top + box.height / 2);
    // the triangle points up: turn it towards the speaker
    this.dom.pointer.style.transform = `rotate(${Math.atan2(dx, -dy)}rad)`;
  }

  stop() {
    this.stopped = true;
    for (const item of this.queue.splice(0)) item.done();
    if (this.dom) this.dom.box.remove();
  }
}

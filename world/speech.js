// Speech in the world, as subtitles: whoever speaks, creature or seeker, is
// heard one at a time, never over another. A line waits for the floor; a
// long one is shown in pieces at reading pace. Each piece names its speaker
// in their colour, with a pointer turned towards a creature as it moves
// (none for the seeker). The seeker speaks by typing into the subtitles:
// Enter (or a tap on the subtitles, on a touch screen) opens the line while
// the floor is free, Enter sends it, Escape lets it go. While the seeker
// types, creatures wait.

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

export class Speech {
  /**
   * @param {object} options
   *   holder   what the subtitles sit in, over the world; none in tests
   *   where    (speaker) -> where they are on screen, { x, y } from 0 to 1, or null: for the pointer
   *   heard    () -> whether a creature is listening near the seeker (the prompt to speak shows then)
   *   spoken   (text) -> the seeker said this
   *   touch    whether this is a touch screen
   *   pace     characters a second (tests go faster)
   *   wait     (seconds) -> a promise (tests skip the waiting)
   */
  constructor({ holder = null, where = () => null, heard = () => false, spoken = () => {}, touch = false, pace = PACE, wait } = {}) {
    this.where = where;
    this.heard = heard;
    this.spoken = spoken;
    this.touch = touch;
    this.pace = pace;
    this.wait = wait ?? ((seconds) => new Promise((done) => setTimeout(done, seconds * 1000)));
    this.queue = [];        // { speaker, text (or a promise of it), done }
    this.speaking = null;   // the speaker holding the floor, while they speak
    this.typing = false;    // the seeker holding it, while they type
    this.stopped = false;
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

  /** The seeker begins to speak, if the floor is free. */
  open() {
    if (!this.free() || this.stopped) return false;
    this.typing = true;
    this.render();
    this.dom?.line.focus();
    return true;
  }

  /** The seeker lets their line go unsaid. */
  close() {
    if (!this.typing) return;
    this.typing = false;
    if (this.dom) this.dom.line.value = "";
    this.render();
    this.pump();
  }

  /** The seeker's line, sent: said in the subtitles first, then whoever answers. */
  send(text) {
    const said = String(text ?? "").trim();
    this.typing = false;
    if (this.dom) this.dom.line.value = "";
    if (!said) { this.render(); this.pump(); return null; }
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
      bottom: `calc(${this.touch ? 168 : 40}px + env(safe-area-inset-bottom, 0px))`,
      width: "min(40rem, calc(100% - 2rem))", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem",
      textAlign: "center", pointerEvents: "none",
    });
    const label = document.createElement("div");
    Object.assign(label.style, { display: "inline-flex", alignItems: "center", gap: "0.35rem", font: "700 0.8rem/1 system-ui, sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", textShadow: "0 1px 3px rgba(0,0,0,0.9)" });
    // a triangle pointing up, turned towards whoever speaks
    const pointer = document.createElement("span");
    Object.assign(pointer.style, {
      display: "inline-block", width: "0.85rem", height: "0.85rem", background: "currentColor",
      clipPath: "polygon(50% 0, 100% 100%, 50% 72%, 0 100%)", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))",
      transition: "transform 120ms linear",
    });
    const name = document.createElement("span");
    label.append(pointer, name);
    const words = document.createElement("div");
    Object.assign(words.style, {
      font: "500 clamp(1.05rem, 2.6vw, 1.45rem)/1.35 system-ui, sans-serif", padding: "0.3rem 0.8rem", borderRadius: "0.4rem",
      background: "rgba(4, 10, 14, 0.55)", textShadow: "0 1px 3px rgba(0,0,0,0.9)", maxWidth: "100%", overflowWrap: "anywhere",
    });
    const line = document.createElement("input");
    line.type = "text";
    line.maxLength = 300;
    line.setAttribute("aria-label", "Say something");
    line.className = "world-subtitle-line";
    Object.assign(line.style, {
      font: "500 clamp(1.05rem, 2.6vw, 1.45rem)/1.35 system-ui, sans-serif", width: "100%", boxSizing: "border-box",
      padding: "0.35rem 0.8rem", borderRadius: "0.4rem", border: "1px solid rgba(255,255,255,0.35)", background: "rgba(4, 10, 14, 0.6)",
      color: SEEKER.colour, textAlign: "center", outline: "none", pointerEvents: "auto",
    });
    const prompt = document.createElement("div");
    prompt.textContent = this.touch ? "Tap to speak" : "Enter to speak";
    Object.assign(prompt.style, { font: "500 0.85rem/1 system-ui, sans-serif", opacity: "0.55", textShadow: "0 1px 3px rgba(0,0,0,0.9)", pointerEvents: "auto", padding: "0.6rem 1rem", cursor: "text" });
    prompt.addEventListener("click", () => this.open());
    line.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") { event.preventDefault(); this.send(line.value); }
      if (event.key === "Escape") { event.preventDefault(); this.close(); }
    });
    line.addEventListener("blur", () => { if (this.typing && !line.value.trim()) this.close(); });
    box.append(label, words, line, prompt);
    holder.appendChild(box);
    const keys = (event) => {
      const typingElsewhere = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? "");
      if (event.key === "Enter" && !typingElsewhere && !event.repeat && this.open()) event.preventDefault();
    };
    addEventListener("keydown", keys);
    return { box, label, pointer, name, words, line, prompt, keys };
  }

  show(speaker, text) {
    this.current = speaker && text ? { speaker, text } : null;
    this.render();
  }

  render() {
    if (!this.dom) return;
    const { label, name, words, line, prompt, pointer } = this.dom;
    const now = this.current;
    label.style.display = now || this.typing ? "inline-flex" : "none";
    const who = now?.speaker ?? (this.typing ? SEEKER : null);
    if (who) { name.textContent = who.name; label.style.color = who.colour; }
    pointer.style.display = who && !who.seeker && who !== SEEKER ? "inline-block" : "none";
    words.style.display = now ? "block" : "none";
    if (now) { words.textContent = now.text; words.style.color = now.speaker.colour; }
    line.style.display = this.typing ? "block" : "none";
    prompt.style.display = !this.typing && this.free() && this.heard() ? "block" : "none";
    this.aim();
  }

  /** Each frame: the pointer turned towards whoever speaks, and the prompt kept up to date. */
  frame() {
    if (!this.dom) return;
    this.aim();
    const showPrompt = !this.typing && this.free() && this.heard();
    if ((this.dom.prompt.style.display !== "none") !== showPrompt) this.dom.prompt.style.display = showPrompt ? "block" : "none";
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
    // the ▲ points up: turn it towards the speaker
    this.dom.pointer.style.transform = `rotate(${Math.atan2(dx, -dy)}rad)`;
  }

  stop() {
    this.stopped = true;
    for (const item of this.queue.splice(0)) item.done();
    if (this.dom) { removeEventListener("keydown", this.dom.keys); this.dom.box.remove(); }
  }
}

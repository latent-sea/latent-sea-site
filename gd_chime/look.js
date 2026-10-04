// The look: a palette turned into a sheet of CSS, set on the app's element,
// so every piece under it is dressed from it the way the engine's Theme
// dresses every control. No bell is involved. A reader choosing a palette
// is a new look on the element.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// A PALETTE is an object of named colours: ground, raised, lit, ink,
// ink_soft, accent, accent_2, warn, edge - in whatever form a CSS colour
// takes. The sizes are the base's, in CSS pixels, scaled by the text size
// the look is made at (1 is the base). This ships a neutral palette so that
// it runs and is legible without a consumer; the look belongs to whoever
// uses this.
//
// Every colour goes in as a custom property on the element, --chime-<name>,
// so a style asks for a colour by name and never knows which element it
// happens to be painting. The rules below dress exactly the styles the
// primitives ask for (themes.js), by class; a consumer's own rules come
// after and win.

export const PALETTE = Object.freeze({
  ground: "#14161c",
  raised: "#1e2129",
  lit: "#2a2e39",
  ink: "#eceef3",
  ink_soft: "#9aa0ad",
  accent: "#5fb3a1",
  accent_2: "#8a7dff",
  warn: "#e0745e",
  edge: "#3a3f4d",
});

export const SIZES = Object.freeze({
  face: 16, reason: 13, words: 22, title: 15, number: 56, paragraph: 16,
  gap: 12, pad: 16, radius: 8, press: 44,
});

export class Look {
  /** A look of this palette at this text size, 1 being the base; the sheet is written once per make. */
  constructor(palette = PALETTE, textSize = 1) {
    this.palette = { ...PALETTE, ...palette };
    this.textSize = textSize;
  }

  static make(palette = PALETTE, textSize = 1) { return new Look(palette, textSize); }

  /** The custom properties of this look, as the element's inline style reads them. */
  properties() {
    const vars = {};
    for (const [name, colour] of Object.entries(this.palette)) vars[`--chime-${name.replace(/_/g, "-")}`] = colour;
    for (const [name, px] of Object.entries(SIZES)) vars[`--chime-size-${name}`] = `${Math.round(px * this.textSize * 100) / 100}px`;
    return vars;
  }

  /** The look worn by this element: its properties set on it, and the floor's sheet put in the document once. */
  dress(element) {
    for (const [name, value] of Object.entries(this.properties())) element.style.setProperty(name, value);
    element.classList.add("chime-look");
    const doc = element.ownerDocument;
    if (!doc.getElementById(SHEET_ID)) {
      const sheet = doc.createElement("style");
      sheet.id = SHEET_ID;
      sheet.textContent = SHEET;
      doc.head.appendChild(sheet);
    }
  }
}

const SHEET_ID = "gd-chime-look";

/** The floor's own sheet: a rule per style the primitives ask for, by class, reading the look's properties. */
export const SHEET = `
.chime-look { background: var(--chime-ground); color: var(--chime-ink); font: var(--chime-size-face)/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; box-sizing: border-box; min-height: 100%; }
.chime-look *, .chime-look *::before, .chime-look *::after { box-sizing: inherit; }
.chime-look [hidden] { display: none !important; }
.chime-app { position: relative; min-height: 100%; display: flex; flex-direction: column; width: 100%; max-width: 64rem; margin: 0 auto; padding: var(--chime-size-pad); gap: var(--chime-size-gap); }
.chime-screen, .chime-tabs { gap: var(--chime-size-gap); }
.chime-layer { position: fixed; inset: 0; pointer-events: none; z-index: 10; }
.chime-layer > .chime-shade { pointer-events: auto; }
.chime-image { max-width: 100%; height: auto; display: block; }
.chime-embed { position: relative; width: 100%; max-width: 100%; background: var(--chime-raised); border-radius: var(--chime-size-radius); overflow: hidden; }
.chime-embed-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.chime-embed-poster { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; cursor: pointer; background: var(--chime-raised); display: grid; place-items: center; }
.chime-embed-poster:focus-visible { outline: 3px solid var(--chime-accent); outline-offset: -3px; }
.chime-embed-picture { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.chime-embed-play { position: relative; width: 4.5rem; height: 3.2rem; border-radius: 0.9rem; background: rgb(0 0 0 / 0.72); transition: background 120ms; }
.chime-embed-play::after { content: ""; position: absolute; left: 50%; top: 50%; transform: translate(-35%, -50%); border-style: solid; border-width: 0.7rem 0 0.7rem 1.15rem; border-color: transparent transparent transparent #fff; }
.chime-embed-poster:hover .chime-embed-play { background: var(--chime-accent); }
.chime-stack { position: relative; display: grid; flex: 1 1 auto; min-height: 0; }
.chime-stack > * { grid-area: 1 / 1; min-width: 0; }
.chime-place { display: flex; flex-direction: column; min-height: 0; }
.chime-place[hidden] { display: none; }
.chime-row, .chime-column { display: flex; gap: var(--chime-size-gap); min-width: 0; }
.chime-row { flex-direction: row; align-items: center; }
.chime-column { flex-direction: column; align-items: stretch; }
.chime-row.Centred { justify-content: center; }
.chime-grid { display: grid; gap: var(--chime-size-gap); }
.chime-surface { padding: var(--chime-size-pad); }
.chime-surface.Raised { background: var(--chime-raised); border-radius: var(--chime-size-radius); }
.chime-surface.Card { background: var(--chime-raised); border: 1px solid var(--chime-edge); border-radius: var(--chime-size-radius); }
.chime-surface.NavigationScreen { flex: 1 1 auto; display: flex; flex-direction: column; }
.chime-text { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chime-text.chime-wraps { white-space: normal; overflow: visible; }
.chime-text.Face { font-size: var(--chime-size-face); }
.chime-text.Reason { font-size: var(--chime-size-reason); color: var(--chime-warn); }
.chime-text.Reason:empty, .chime-text.chime-hides-empty:empty { display: none; }
.chime-text.Words { font-size: var(--chime-size-words); font-weight: 600; }
.chime-text.Paragraph { font-size: var(--chime-size-paragraph); white-space: normal; overflow: visible; }
.chime-text.Title { font-size: var(--chime-size-title); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--chime-accent); }
.chime-text.Number { font-size: var(--chime-size-number); font-weight: 700; line-height: 1; }
.chime-text.Placeholder, .chime-text.Quiet { color: var(--chime-ink-soft); }
.chime-text.Notice { color: var(--chime-accent-2); }
.chime-text.SectionHeading, .chime-text.FormHeading { font-size: var(--chime-size-words); font-weight: 600; }
.chime-pressable { appearance: none; font: inherit; color: inherit; background: var(--chime-raised); border: 1px solid var(--chime-edge); border-radius: var(--chime-size-radius); min-height: var(--chime-size-press); padding: calc(var(--chime-size-pad) / 2) var(--chime-size-pad); cursor: pointer; text-align: left; display: inline-flex; align-items: center; gap: var(--chime-size-gap); }
/* a pressable's words are its label, not text to select: no caret, no text cursor, no selection on a tap */
.chime-pressable { -webkit-user-select: none; user-select: none; }
.chime-pressable * { cursor: inherit; }
.chime-pressable:hover { background: var(--chime-lit); }
.chime-pressable:focus-visible { outline: 2px solid var(--chime-accent); outline-offset: 2px; }
.chime-pressable[disabled], .chime-pressable[aria-disabled="true"] { opacity: 0.6; cursor: not-allowed; }
.chime-pressable.chime-glowing { box-shadow: 0 0 0 3px var(--chime-accent-2); }
.chime-pressable.chime-current { border-color: var(--chime-accent); }
.chime-pressable.BellButton { background: var(--chime-accent); color: var(--chime-ground); border-color: transparent; font-weight: 600; }
.chime-pressable.BellButton:hover { filter: brightness(1.1); }
.chime-pressable.BellButton .Reason { color: var(--chime-ground); }
.chime-pressable.Link { background: none; border: none; min-height: 0; padding: 0; color: var(--chime-accent); text-decoration: underline; display: inline; }
.chime-pressable.ToggleOn { background: var(--chime-accent); color: var(--chime-ground); border-color: transparent; }
.chime-pressable.ToggleOff { background: var(--chime-lit); }
.chime-pressable.Choice { background: var(--chime-raised); }
.chime-pressable.ChoiceChosen, .chime-pressable.SegmentChosen { background: var(--chime-accent); color: var(--chime-ground); border-color: transparent; }
.chime-pressable.Tab { background: none; border: none; border-bottom: 2px solid transparent; border-radius: 0; }
.chime-pressable.Tab.chime-current { border-bottom-color: var(--chime-accent); }
.chime-field { font: inherit; color: inherit; background: var(--chime-ground); border: 1px solid var(--chime-edge); border-radius: var(--chime-size-radius); min-height: var(--chime-size-press); padding: calc(var(--chime-size-pad) / 2) var(--chime-size-pad); width: 100%; }
.chime-bars { margin: 0; display: grid; grid-template-columns: auto 1fr; grid-template-rows: 1fr auto; gap: 0.25rem 0.5rem; min-height: 10rem; }
.chime-bars-top { grid-row: 1; grid-column: 1; align-self: start; font-size: var(--chime-size-reason); color: var(--chime-ink-soft); }
.chime-bars-plot { grid-row: 1; grid-column: 2; display: flex; align-items: flex-end; gap: 2px; border-bottom: 1px solid var(--chime-edge); border-top: 1px solid var(--chime-raised); min-height: 8rem; }
.chime-bar { position: relative; flex: 1 1 0; height: 100%; display: flex; align-items: flex-end; justify-content: center; outline: none; }
.chime-bar-fill { display: block; width: 100%; max-width: 24px; min-height: 0; background: var(--chime-accent); border-radius: 4px 4px 0 0; }
.chime-bar:hover .chime-bar-fill, .chime-bar:focus-visible .chime-bar-fill { background: var(--chime-accent-2); }
.chime-bar:focus-visible { box-shadow: 0 0 0 2px var(--chime-accent); }
.chime-bar:hover::after, .chime-bar:focus-visible::after { content: attr(data-says); position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%); white-space: nowrap; padding: 0.25rem 0.5rem; border-radius: var(--chime-size-radius); background: var(--chime-ink); color: var(--chime-ground); font-size: var(--chime-size-reason); pointer-events: none; z-index: 2; }
.chime-bars-labels { grid-row: 2; grid-column: 2; display: flex; gap: 2px; }
.chime-bars-label { flex: 1 1 0; min-width: 0; font-size: var(--chime-size-reason); color: var(--chime-ink-soft); white-space: nowrap; overflow: visible; }
.chime-file { position: relative; }
.chime-file-input { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
.chime-file:focus-within { outline: 2px solid var(--chime-accent); outline-offset: 2px; }
.chime-field-label { font-size: var(--chime-size-reason); color: var(--chime-ink-soft); }
.chime-field:focus-visible { outline: 2px solid var(--chime-accent); outline-offset: 1px; }
.chime-scroll { overflow: auto; min-height: 0; flex: 1 1 auto; }
.chime-divider { border: 0; border-top: 1px solid var(--chime-edge); margin: 0; }
.chime-shade { position: fixed; inset: 0; background: rgb(0 0 0 / 0.5); display: grid; place-items: center; padding: var(--chime-size-pad); }
.chime-shade.chime-blocks-nothing { background: none; pointer-events: none; place-items: end center; }
.chime-shade.chime-blocks-nothing > * { pointer-events: auto; }
.chime-sheet { background: var(--chime-raised); border: 1px solid var(--chime-edge); border-radius: var(--chime-size-radius); padding: var(--chime-size-pad); max-width: min(100%, 36rem); max-height: 100%; overflow: auto; }
.chime-hyperlink { color: var(--chime-accent); display: inline-flex; align-items: center; gap: 0.4em; }
.chime-hyperlink:focus-visible { outline: 2px solid var(--chime-accent); outline-offset: 2px; }
.chime-hyperlink .chime-text { overflow: visible; }
.chime-grow { flex-grow: 1; min-width: 0; }
.chime-each { display: contents; }
`;

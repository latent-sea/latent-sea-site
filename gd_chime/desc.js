// A description of a piece of interface: what kind of primitive, what it is
// given, and what it holds. A recipe returns one; the builder (build.js)
// turns one into elements, top-down, and does not keep it.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// The facts are how a layout above it treats it - grow, basis, span - set by
// chaining: ui.text("a").grow(). A description carries no element and no
// browser call; it is data a UI builder writes, and the primitives are the
// only readers of it. A pop-up a press opens travels on the press (opens),
// so every description is one value.
//
// A MARK ON A DESCRIPTION IS A CHAINED NAME, never a boolean parameter -
// wraps, hidesEmpty, keeps, takesFocus, blocksNothing - because what a bare
// true at a call site marks cannot be read off the call.

export class Desc {
  constructor(kind, props = {}, children = []) {
    this.kind = kind;
    this.props = props;
    this.children = children;
    this.facts = {};
  }

  /** How much of the room left this takes, in a row or a column. */
  grow(by = 1) { this.facts.grow = by; return this; }

  /** Its starting share of the row or column, a fraction of the layout. */
  basis(share) { this.facts.basis = share; return this; }

  /** The most of the row or column it may take, a fraction of the layout. */
  atMost(share) { this.facts.max = share; return this; }

  /** How many columns of a grid it spans. */
  span(columns) { this.facts.span = columns; return this; }

  /** Words broken onto more lines at the width they are given, rather than widening what holds them. */
  wraps() { this.props.wraps = true; return this; }

  /** Words gone from the screen while they are empty, rather than standing as a blank line. */
  hidesEmpty() { this.props.hides_empty = true; return this; }

  /** A when whose side not showing is kept hidden rather than freed, so what it holds survives. */
  keeps() { this.props.keeps = true; return this; }

  /** A line that takes the focus as it is built, so the reader types into it without reaching for it. */
  takesFocus() { this.props.takes_focus = true; return this; }

  /** A pop-up that blocks nothing beneath it - a panel the reader may keep open while working under it. */
  blocksNothing() { this.props.blocks = false; return this; }

  /** A pressable that never takes the focus: a click presses it, and the keys walk past it. */
  noFocus() { this.props.no_focus = true; return this; }

  /** A pressable gone from the screen, rather than inert, while the door would refuse it. */
  absentWhenRefused() { this.props.absent = true; return this; }

  /** A pressable drawn current while this bound value holds, wherever its press goes. */
  currentWhile(held) { this.props.current_while = held; return this; }

  /** Where a press goes: the name of the place it moves the reader to, which that place's move carries the payload to. */
  goesTo(place) { this.props.goes_to = place; return this; }

  /** A press that opens this pop-up: it goes there, and the pop-up - lifted beside the app by the builder - comes with it. */
  opens(overlay) { this.props.goes_to = overlay.getPlace(); this.props.overlay = overlay; return this; }

  /** The name of the place this describes: a pop-up's, the builder's. */
  getPlace() { return this.props.name; }

  /** A name whoever builds this can find the element by afterwards: its id on the element. */
  named(id) { this.props.id = id; return this; }
}

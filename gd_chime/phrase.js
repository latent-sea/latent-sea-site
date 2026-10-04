// A phrase: words not said yet - an English key, or a pattern and the data
// that fills it, a count - carried as it is, and said in the language on
// only as a text draws it, and again whenever the language changes.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// ENGLISH WORDS ARE PHRASES; DATA IS NOT. A text says a phrase and shows
// anything else - a string above all - as the data it is, however like a
// word it looks. So every word written for a reader is written as a phrase
// where it is written: Phrase.of("Save the day"), the English as the key.
//
// A PHRASE SHOWN ON ITS OWN IS IN SENTENCE CASE. Words said only inside
// another phrase are within(), and it is within that lowers the first letter
// as the phrase is said. THE DOOR'S ANSWER IS A PHRASE, OR NOTHING: a model's
// would() and told(), a control's reason; a refusal with data in it is
// with(). Nothing refused is null.
//
// Printed, a phrase is its English - for a log and a test, which read what
// was meant, and never for a reader. A text asks say(translate), handing the
// language's lookup, and a count chooses its form by the language's rule.

export class Phrase {
  constructor() {
    this.pattern = ""; // the English: a key, or a pattern with %s and %d where the data goes
    this.data = []; // what fills the pattern: a model's data, or phrases of their own
    this.many = ""; // a count's English for every number but one
    this.none = ""; // a count's English for 0, a key of its own, where it has one
    this.count = 0; // how many a count counts
    this.naming = false; // a key's name rather than words
    this.writer = null; // a number or a date, written the language's way as it is said
    this.parts = []; // said one after another: a word and the mark beside it
    this.lowered = false; // said inside another phrase, so its first letter is lowered where it stands
  }

  /** Words, by their English. */
  static of(words) { const made = new Phrase(); made.pattern = words; return made; }

  /** A pattern and the data that fills it: "Expecting %s" and the claim. */
  static with(words, filling) { const made = Phrase.of(words); made.data = filling; return made; }

  /** Words said only inside another phrase, with their first letter lowered. */
  static within(words) { const made = Phrase.of(words); made.lowered = true; return made; }

  /** How many, by the English's two forms - "%d item", "%d items" - and, where none has words of its own, those. */
  static counted(one, other, number, zero = "") {
    const made = Phrase.of(one); made.many = other; made.none = zero; made.count = number; return made;
  }

  /** The name of a key, as the browser writes it. */
  static named(name) { const made = Phrase.of(name); made.naming = true; return made; }

  /** A number or a date: written, the language's way, by this as it is said. */
  static written(writing) { const made = new Phrase(); made.writer = writing; return made; }

  /** Phrases and data said one after another, in the order given. */
  static joined(pieces) { const made = new Phrase(); made.parts = pieces; return made; }

  /** Whether this is a phrase: a text asks it of what it was given, and shows anything else as data. */
  static is(value) { return value instanceof Phrase; }

  /** Words with their first letter lowered, as a phrase said inside another is. */
  static lower(words) { return words.slice(0, 1).toLowerCase() + words.slice(1); }

  /**
   * The phrase said: each English key through the translation given - the
   * identity by default - and the data put in, a count by the rule for
   * plurals given (one form or the other), data said as it is.
   */
  say(translate = (english) => english, plural = (n) => (n === 1 ? "one" : "other")) {
    let words;
    if (this.writer) {
      words = String(this.writer());
    } else if (this.parts.length) {
      words = this.parts.map((part) => (Phrase.is(part) ? part.say(translate, plural) : String(part))).join("");
    } else if (this.many !== "" && this.count === 0 && this.none !== "") {
      words = translate(this.none);
    } else if (this.many !== "") {
      const form = plural(this.count) === "one" ? this.pattern : this.many;
      words = fill(translate(form), [this.count], translate, plural);
    } else if (this.naming) {
      words = this.pattern;
    } else {
      words = fill(translate(this.pattern), this.data, translate, plural);
    }
    return this.lowered ? Phrase.lower(words) : words;
  }

  /** The English, as a log or a test reads it. */
  toString() { return this.say(); }
}

/** A pattern's %s and %d each replaced by the next of the data, a phrase among it said. */
function fill(pattern, data, translate, plural) {
  let i = 0;
  return pattern.replace(/%[sd]/g, (mark) => {
    const item = data[i++];
    if (item === undefined) return mark;
    return Phrase.is(item) ? item.say(translate, plural) : String(item);
  });
}

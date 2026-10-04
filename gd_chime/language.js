// The language words are said in: which one is on, a value, and the lookups
// a text makes as it draws, each a read of it.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// A WORD'S KEY IS ITS ENGLISH. Every word the interface shows is written in
// English where it is described, and that English is what a catalogue
// translates; a word no catalogue has is shown in English. ONLY A TEXT
// TRANSLATES, AS IT DRAWS: every lookup reads the language on, so a change
// of language reaches every word where it stands, and nothing is built again.
//
// THE WORDS ARE CATALOGUES: an object of English to the language's words,
// per language - Language.read({fr: {"Save": "Enregistrer"}}) - and a plural
// as [one, other]. The language on to begin with is the nearest the browser
// asks for, else English.

import { Chimes } from "./chimes.js?v=1b3b6febfccb";
import { Controller } from "./controller.js?v=1b3b6febfccb";
import { OwnBell } from "./own_bell.js?v=1b3b6febfccb";
import { Phrase } from "./phrase.js?v=1b3b6febfccb";
import { Reads } from "./reads.js?v=1b3b6febfccb";

const ON = "language_on";
const catalogues = new Map(); // language -> {english: words}
let on = "en";

export class Language extends Controller {
  static ON = ON;
  static CHANGES_LANGUAGE = "changes_language";
  static SOURCE = "en";

  constructor(chimes) {
    super(chimes, [], Chimes.GLOBAL);
    this._bell = new OwnBell("language", ON);
    this._bell.hang(chimes);
    const asked = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [];
    on = nearest(asked) ?? Language.SOURCE;
  }

  answers() { return [Language.CHANGES_LANGUAGE]; }

  would(_action, payload) {
    return payload.value === Language.SOURCE || catalogues.has(payload.value) ? null : Phrase.with("There are no words in %s", [payload.value]);
  }

  told(_action, payload) {
    on = payload.value;
    if (typeof document !== "undefined") document.documentElement.lang = on;
    this._bell.moved();
    return null;
  }

  /** The words of more languages, beside those already read. */
  static read(more) {
    for (const [language, words] of Object.entries(more)) catalogues.set(language, { ...(catalogues.get(language) ?? {}), ...words });
  }

  static current() { Reads.note(ON, ON); return on; }

  static languages() { return [Language.SOURCE, ...catalogues.keys()]; }

  /** A word in the language on, or its English. */
  static word(english) {
    Reads.note(ON, ON);
    if (!english) return "";
    const found = catalogues.get(on)?.[english];
    return typeof found === "string" ? found : english;
  }

  /** Which of a count's forms the language on says: "one" or "other". */
  static plural(count) {
    Reads.note(ON, ON);
    return new Intl.PluralRules(on).select(count) === "one" ? "one" : "other";
  }

  /** A phrase, or data, as the language on says it: what a text shows. */
  static said(value) {
    if (value === null || value === undefined) return "";
    if (!Phrase.is(value)) return String(value);
    return value.say(Language.word, Language.plural);
  }

  dispose() { this._bell.dispose(); super.dispose(); }
}

function nearest(asked) {
  for (const tag of asked) {
    if (!tag) continue;
    if (catalogues.has(tag)) return tag;
    const base = tag.split("-")[0];
    if (base === Language.SOURCE) return Language.SOURCE;
    if (catalogues.has(base)) return base;
  }
  return null;
}

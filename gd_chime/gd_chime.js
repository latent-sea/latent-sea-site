// gd-chime for the web, in one import: every name an application needs,
// re-exported, so a site's files import THIS and their own files and
// nothing else.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
//     import { ChimeApp, Controller, Phrase, Themes } from "./gd_chime/gd_chime.js";
//
// A name here is a promise: what an application may use is exactly what
// this file exports. Everything else in the folder is internal.
//
// THE INDEX, by family:
// - The application: ChimeApp, which a site extends, answering look(),
//   sources(), declare(), describe() and probe().
// - The vocabulary: the builder (app.ui) - text, image, embed, surface, paragraph,
//   bars, link, hyperlink, divider, pressable, pressLocal, reason, button, field, file, area, row,
//   column, grid, stack, scroll, each, eachAcross, when, local, bound,
//   parameter, and the places: app, screen, tabs, popUp; Desc, a
//   description; Bound, a value a description reads.
// - The look: Look and its PALETTE; Themes, Pressables, Fields, Navigation,
//   Overlays, the names of the styles.
// - The floor: Chimes, Commands, Controller, Driver, Actions, Phrase,
//   Language, Frames.
// - The walk: Walk, which a site's probe extends.

export { Actions } from "./actions.js";
export { Bound } from "./bound.js";
export { ChimeApp } from "./chime_app.js";
export { Chimes } from "./chimes.js";
export { Commands } from "./commands.js";
export { Controller } from "./controller.js";
export { Desc } from "./desc.js";
export { Driver } from "./driver.js";
export { Frames } from "./frames.js";
export { Language } from "./language.js";
export { Look, PALETTE } from "./look.js";
export { Phrase } from "./phrase.js";
export { Fields, Navigation, Overlays, Pressables, Themes } from "./themes.js";
export { Ui } from "./ui.js";
export { Walk } from "./walk.js";

/** The version of gd-chime this is a port of, and of the port. */
export const VERSION = "0.1.0";

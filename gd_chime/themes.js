// The look's vocabulary: the names of every style a primitive asks for,
// the same names gd-chime's Theme uses, so an application reads as it does
// there. A primitive asks the look by its style and holds no look of its own.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// On the web a style is a class on the element, and the look is a sheet of
// CSS (look.js) written from a palette; a style a sheet does not name is
// still a class, and a look dresses it.

export const Themes = Object.freeze({
  LOOK: "Look",
  // the primitives' styles: the types every family varies
  PRESSABLE: "Pressable",
  ROW: "Row",
  COLUMN: "Column",
  GRID: "Grid",
  SURFACE: "Surface",
  TILES: "Tiles",
  // the kinds of words the floor's recipes draw
  FACE: "Face",
  REASON: "Reason",
  WORDS: "Words",
  PARAGRAPH: "Paragraph",
  // what an application names a thing and says a figure in
  TITLE: "Title",
  NUMBER: "Number",
  // the grounds an application stands its own content on
  RAISED: "Raised",
  CARD: "Card",
  // a row packing its parts to the middle
  CENTRED: "Centred",
  DIVIDER: "Divider",
  LOADING: "Loading",
  PLACEHOLDER: "Placeholder",
  NOTICE: "Notice",
});

export const Pressables = Object.freeze({
  BUTTON: "BellButton",
  TOGGLE_ON: "ToggleOn",
  TOGGLE_OFF: "ToggleOff",
  CHOICE: "Choice",
  CHOICE_CHOSEN: "ChoiceChosen",
  SEGMENT: "Segment",
  SEGMENT_CHOSEN: "SegmentChosen",
});

export const Fields = Object.freeze({
  FIELD: "Field",
  TEXT_AREA: "TextArea",
  SETTING_ROW: "SettingRow",
  HEADING: "FormHeading",
});

export const Navigation = Object.freeze({
  LINK: "Link",
  TAB: "Tab",
  TAB_STRIP: "TabStrip",
  SCREEN: "NavigationScreen",
  SECTION_HEADING: "SectionHeading",
});

export const Overlays = Object.freeze({
  SHADE: "Shade",
  SHEET: "Sheet",
  PANEL: "Panel",
});

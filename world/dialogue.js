// Dialogue trees: how a character talks when the seeker isn't talking freely.
// A tree is plain data, written in the character's own module:
//
//   export const talk = {
//     start: "hello",
//     nodes: {
//       hello: {
//         say: "You can see me, then.",                  // a line, or several in turn
//         choices: [
//           { reply: "Who are you?", go: "who" },        // what the seeker says, and where it leads
//           { reply: "Where am I?", go: "where", if: (game) => !game.seen("where") },
//           { reply: "Not now.", end: true },            // the conversation ends
//           { free: true },                              // "Speak freely": free talk (costs credits)
//         ],
//       },
//       who: { say: ["A gull.", "Or the shape of one."], go: "hello" },   // then back to the choices
//       where: { say: "Between the words.", do: (game) => game.scene.show("..."), end: true },
//     },
//   };
//
// A node may `say` lines; `do` something (with the game: the scene, what was
// seen and picked, and whatever the scene adds); then `go` to another node,
// `end`, or offer `choices`. A choice shows only if its `if` holds, and only
// once if `once` is set. Choices are free: free talk is the one that costs.
//
// A tree can also be plain JSON (a .json file of the module, scene.json), so
// it reads like a script: there, `if` is { "seen": "node" } or
// { "unseen": "node" } or { "picked": "choice id" }, and there is no `do`.
// Instead a node may give a `signal`: a word the scene listens for
// (scene.character's `on`), once the node's lines have been said, so the
// script can make things happen: { "say": "Farewell.", "signal": "leave" }.
//
// This runner keeps the place in the tree and what the seeker has seen and
// picked; the world plays it in the subtitles (world.js, speech.js).

export const FREE_TALK = "Speak freely";

export class Dialogue {
  /**
   * @param {object} tree  { start, nodes }
   * @param {object} game  what conditions and actions are given, besides seen() and picked()
   */
  constructor(tree, game = {}) {
    if (!tree?.nodes || !tree.nodes[tree.start]) throw new Error("a dialogue tree needs nodes and a start among them");
    this.tree = tree;
    this.seenNodes = new Set();
    this.pickedChoices = new Set();
    this.game = {
      ...game,
      seen: (node) => this.seenNodes.has(node),
      picked: (id) => this.pickedChoices.has(id),
    };
    this.at = null; // the node whose choices are waiting, or null
  }

  /** A node by name; an unknown one is an error in the tree. */
  node(name) {
    const found = this.tree.nodes[name];
    if (!found) throw new Error(`the dialogue tree has no node "${name}"`);
    return found;
  }

  /**
   * Arrives at a node: what it says, and what follows ({ go }, { end }, or
   * { choices }). Its action runs now.
   */
  enter(name) {
    const node = this.node(name);
    this.seenNodes.add(name);
    node.do?.(this.game);
    const lines = node.say === undefined ? [] : [].concat(node.say).map(String);
    const signal = node.signal ? { signal: String(node.signal) } : {};
    if (node.go) return { lines, go: node.go, ...signal };
    if (node.end || !node.choices?.length) { this.at = null; return { lines, end: true, ...signal }; }
    this.at = name;
    return { lines, choices: this.choices(), ...signal };
  }

  /** The choices waiting now, those whose conditions hold: { id, reply, free }. */
  choices() {
    if (!this.at) return [];
    const node = this.node(this.at);
    return (node.choices ?? [])
      .map((choice, index) => ({ choice, id: choice.id ?? `${this.at}:${index}` }))
      .filter(({ choice, id }) => (!choice.once || !this.pickedChoices.has(id)) && this.holds(choice.if))
      .map(({ choice, id }) => ({ id, reply: choice.free ? (choice.reply ?? FREE_TALK) : String(choice.reply), free: !!choice.free, go: choice.go ?? null, end: !!choice.end }));
  }

  /** Whether a condition holds: a function of the game, or (in JSON) { seen }, { unseen } or { picked }. */
  holds(condition) {
    if (!condition) return true;
    if (typeof condition === "function") return !!condition(this.game);
    if (condition.seen !== undefined) return this.seenNodes.has(condition.seen);
    if (condition.unseen !== undefined) return !this.seenNodes.has(condition.unseen);
    if (condition.picked !== undefined) return this.pickedChoices.has(condition.picked);
    return true;
  }

  /** The seeker picks one of the waiting choices (by its id): what follows ({ free }, { end }, or { go }). */
  pick(id) {
    const chosen = this.choices().find((c) => c.id === id);
    if (!chosen) throw new Error(`there is no choice ${id} now`);
    if (chosen.free) return { free: true };
    this.pickedChoices.add(id);
    this.at = null;
    if (chosen.end || !chosen.go) return { reply: chosen.reply, end: true };
    return { reply: chosen.reply, go: chosen.go };
  }
}

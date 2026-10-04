// The seeker on foot (B1): where they are, which way they face, and how a
// person moves them. Keys: W A S D or the arrows walk, Shift runs; dragging
// looks around. On a touch screen, two sticks (joysticks.js) set `move` and
// `look`: how far each is pushed, -1 to 1 either way.

const EYES = 1.6;
const WALK = 4;
const RUN = 9;
const LOOK = 0.004;
/** How fast a stick pushed all the way turns the seeker, in radians a second: across, and up and down. */
const TURN = 2.4;
const TILT = 1.4;

export class Walker {
  /**
   * @param {object} three the Three.js namespace
   * @param {HTMLElement|null} element what is pressed and dragged on (the canvas); null where nothing is drawn
   */
  constructor(three, element = null) {
    this.three = three;
    this.position = new three.Vector3(0, EYES, 0);
    this.yaw = 0;
    this.pitch = 0;
    /** While a scene holds the camera, the seeker doesn't move. */
    this.paused = false;
    /** The seeker's own setting: dragging up looks down, as with a flight stick. */
    this.invertY = false;
    this.keys = new Set();
    /** The walking stick: x to the right, y forward, each -1 to 1. */
    this.move = { x: 0, y: 0 };
    /** The looking stick: x to the right, y up, each -1 to 1; it turns the seeker while held. */
    this.look = { x: 0, y: 0 };
    this.looking = null; // the looking pointer, dragged on the world: { id, x, y }
    this.dragged = 0;    // how far the last press moved: a press that didn't is a tap
    this._off = [];
    if (element) this.listen(element);
  }

  listen(element) {
    const on = (target, event, handler, options) => {
      target.addEventListener(event, handler, options);
      this._off.push(() => target.removeEventListener(event, handler, options));
    };
    const typing = (event) => event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
    on(window, "keydown", (event) => { if (!typing(event)) this.keys.add(event.code); });
    on(window, "keyup", (event) => this.keys.delete(event.code));
    on(window, "blur", () => this.keys.clear());
    on(element, "pointerdown", (event) => {
      this.dragged = 0;
      if (!this.looking) this.looking = { id: event.pointerId, x: event.clientX, y: event.clientY };
      try { element.setPointerCapture(event.pointerId); } catch { /* a pointer the browser can't hold to the world still looks */ }
    });
    on(element, "pointermove", (event) => {
      if (this.looking?.id === event.pointerId) {
        const dx = event.clientX - this.looking.x;
        const dy = event.clientY - this.looking.y;
        this.looking.x = event.clientX;
        this.looking.y = event.clientY;
        this.dragged += Math.abs(dx) + Math.abs(dy);
        if (!this.paused) this.turn(dx, dy);
      }
    });
    const up = (event) => {
      if (this.looking?.id === event.pointerId) this.looking = null;
    };
    on(element, "pointerup", up);
    on(element, "pointercancel", up);
    element.style.touchAction = "none";
  }

  turn(dx, dy) {
    this.yaw -= dx * LOOK;
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - (this.invertY ? -dy : dy) * LOOK));
  }

  /** Puts the seeker at (x, z), on their feet, facing `yaw` if given. */
  moveTo(x, z, yaw = this.yaw) {
    this.position.set(x, EYES, z);
    this.yaw = yaw;
    this.pitch = 0;
  }

  /** Turns the seeker by the looking stick, for `seconds`. Pushed up, they look up (or down, with Invert Y). */
  turnByStick(seconds) {
    const { x, y } = this.look;
    if (!x && !y) return;
    this.yaw -= x * TURN * seconds;
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch + (this.invertY ? -y : y) * TILT * seconds));
  }

  /** Moves and turns the seeker for `seconds` by what is held down. */
  update(seconds) {
    if (this.paused) return;
    this.turnByStick(seconds);
    let forward = 0;
    let side = 0;
    const held = (...codes) => codes.some((code) => this.keys.has(code));
    if (held("KeyW", "ArrowUp")) forward += 1;
    if (held("KeyS", "ArrowDown")) forward -= 1;
    if (held("KeyD", "ArrowRight")) side += 1;
    if (held("KeyA", "ArrowLeft")) side -= 1;
    forward += this.move.y;
    side += this.move.x;
    const length = Math.hypot(forward, side);
    if (length === 0) return;
    // a stick part way pushed walks slower: its length is under 1
    const speed = (held("ShiftLeft", "ShiftRight") ? RUN : WALK) * seconds / Math.max(1, length);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.position.x += (-sin * forward + cos * side) * speed;
    this.position.z += (-cos * forward - sin * side) * speed;
  }

  /** Puts the camera at the seeker's eyes, looking their way. */
  aim(camera) {
    camera.position.copy(this.position);
    camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  stop() {
    for (const off of this._off.splice(0)) off();
  }
}

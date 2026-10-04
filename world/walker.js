// The seeker on foot (B1): where they are, which way they face, and how a
// person moves them. Keys: W A S D or the arrows walk, Shift runs. With a
// mouse, a click on the world takes the mouse: from then on it looks around
// without a button held, and a click presses what the aim, in the middle of
// the screen, is on. Escape gives the mouse back. On a touch screen,
// dragging looks around, and two sticks (joysticks.js) set `move` and
// `look`: how far each is pushed, -1 to 1 either way.
//
// Riding (ride()), as in a rowing boat: W and S (or the walking stick pushed
// up and down) row on and back, A and D (or it pushed across) turn the
// vessel slowly, and nothing strafes. The seeker turns with the vessel and
// still looks about as they like. A scene puts them at the vessel's height.

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
    this.looking = null; // the looking finger, dragged on the world: { id, x, y }
    this.dragged = 0;    // how far the last press moved: a press that didn't is a tap
    /** Whether the mouse looks around (the world has it), and whether it did when the last press began: that press aims, it doesn't take the mouse. */
    this.mouseLooks = false;
    this.pressAimed = false;
    this.pressedWith = "";
    this.element = null;
    /** While riding: how the vessel moves ({ speed, turn }), which way it heads, its speed, and how it is being rowed. */
    this.riding = null;
    this.heading = 0;
    this.velocity = 0;
    this.turning = 0;
    this.rowing = { forward: 0, turn: 0 };
    this._off = [];
    if (element) this.listen(element);
  }

  listen(element) {
    this.element = element;
    const on = (target, event, handler, options) => {
      target.addEventListener(event, handler, options);
      this._off.push(() => target.removeEventListener(event, handler, options));
    };
    const typing = (event) => event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
    on(window, "keydown", (event) => {
      if (event.code === "Escape") this.letGo();
      if (!typing(event)) this.keys.add(event.code);
    });
    on(window, "keyup", (event) => this.keys.delete(event.code));
    on(window, "blur", () => { this.keys.clear(); this.letGo(); });
    // the browser gives the mouse back on Escape by itself: the world lets go too
    on(document, "pointerlockchange", () => { if (document.pointerLockElement !== element) this.mouseLooks = false; });
    on(element, "pointerdown", (event) => {
      this.dragged = 0;
      this.pressAimed = this.mouseLooks;
      this.pressedWith = event.pointerType;
      if (event.pointerType === "mouse") { this.takeMouse(); return; }
      if (!this.looking) this.looking = { id: event.pointerId, x: event.clientX, y: event.clientY };
      try { element.setPointerCapture(event.pointerId); } catch { /* a finger the browser can't hold to the world still looks */ }
    });
    on(element, "pointermove", (event) => {
      if (event.pointerType === "mouse") {
        if (this.mouseLooks && !this.paused) this.turn(event.movementX ?? 0, event.movementY ?? 0);
        return;
      }
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

  /**
   * The mouse looks around from now: held to the world where the browser
   * allows (pointer lock), or else while it is over the world, until Escape.
   */
  takeMouse() {
    this.mouseLooks = true;
    try {
      const asked = this.element?.requestPointerLock?.();
      asked?.catch?.(() => { /* not allowed here (a framed page): the mouse still looks while over the world */ });
    } catch { /* as above */ }
  }

  /** The mouse is the person's again. */
  letGo() {
    this.mouseLooks = false;
    if (typeof document !== "undefined" && document.pointerLockElement && document.pointerLockElement === this.element) document.exitPointerLock?.();
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
    this.heading = yaw;
  }

  /** On a vessel from now: `speed` in metres a second at most, `turn` in radians a second at most. */
  ride({ speed = 2.4, turn = 0.45 } = {}) {
    this.riding = { speed, turn };
    this.heading = this.yaw;
    this.velocity = 0;
    this.turning = 0;
    this.rowing = { forward: 0, turn: 0 };
  }

  /** On foot again. */
  walk() {
    this.riding = null;
    this.velocity = 0;
    this.turning = 0;
    this.rowing = { forward: 0, turn: 0 };
    this.position.y = EYES;
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
    if (this.riding) { this.row(seconds); return; }
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

  /** Rows the vessel for `seconds`: it gathers speed and turns slowly, and the seeker turns with it. */
  row(seconds) {
    const held = (...codes) => codes.some((code) => this.keys.has(code));
    const clamp = (value) => Math.max(-1, Math.min(1, value));
    const forward = clamp((held("KeyW", "ArrowUp") ? 1 : 0) - (held("KeyS", "ArrowDown") ? 1 : 0) + this.move.y);
    // to the left is a positive turn, as yaw is
    const turn = clamp((held("KeyA", "ArrowLeft") ? 1 : 0) - (held("KeyD", "ArrowRight") ? 1 : 0) - this.move.x);
    this.rowing = { forward, turn };
    const { speed, turn: most } = this.riding;
    this.velocity += (forward * speed - this.velocity) * Math.min(1, seconds * 0.7);
    this.turning += (turn * most - this.turning) * Math.min(1, seconds * 1.2);
    this.heading += this.turning * seconds;
    this.yaw += this.turning * seconds;
    this.position.x -= Math.sin(this.heading) * this.velocity * seconds;
    this.position.z -= Math.cos(this.heading) * this.velocity * seconds;
  }

  /** Puts the camera at the seeker's eyes, looking their way. */
  aim(camera) {
    camera.position.copy(this.position);
    camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  stop() {
    this.letGo();
    for (const off of this._off.splice(0)) off();
  }
}

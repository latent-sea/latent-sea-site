// The seeker on foot (B1): where they are, which way they face, and how a
// person moves them. Keys: W A S D or the arrows walk, Shift runs; dragging
// looks around. On a touch screen, a finger on the left half walks (how far it
// moves from where it landed), one on the right half looks.

const EYES = 1.6;
const WALK = 4;
const RUN = 9;
const LOOK = 0.004;

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
    this.keys = new Set();
    this.stick = null;   // the walking finger: { id, x, y, dx, dy }
    this.looking = null; // the looking pointer: { id, x, y }
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
      const left = event.pointerType === "touch" && event.clientX < element.clientWidth / 2;
      if (left && !this.stick) this.stick = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
      else if (!this.looking) this.looking = { id: event.pointerId, x: event.clientX, y: event.clientY };
      element.setPointerCapture?.(event.pointerId);
    });
    on(element, "pointermove", (event) => {
      if (this.stick?.id === event.pointerId) {
        this.stick.dx = event.clientX - this.stick.x;
        this.stick.dy = event.clientY - this.stick.y;
        this.dragged += Math.abs(event.movementX) + Math.abs(event.movementY);
      } else if (this.looking?.id === event.pointerId) {
        const dx = event.clientX - this.looking.x;
        const dy = event.clientY - this.looking.y;
        this.looking.x = event.clientX;
        this.looking.y = event.clientY;
        this.dragged += Math.abs(dx) + Math.abs(dy);
        if (!this.paused) this.turn(dx, dy);
      }
    });
    const up = (event) => {
      if (this.stick?.id === event.pointerId) this.stick = null;
      if (this.looking?.id === event.pointerId) this.looking = null;
    };
    on(element, "pointerup", up);
    on(element, "pointercancel", up);
    element.style.touchAction = "none";
  }

  turn(dx, dy) {
    this.yaw -= dx * LOOK;
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - dy * LOOK));
  }

  /** Puts the seeker at (x, z), on their feet, facing `yaw` if given. */
  moveTo(x, z, yaw = this.yaw) {
    this.position.set(x, EYES, z);
    this.yaw = yaw;
    this.pitch = 0;
  }

  /** Moves the seeker for `seconds` by what is held down. */
  update(seconds) {
    if (this.paused) return;
    let forward = 0;
    let side = 0;
    const held = (...codes) => codes.some((code) => this.keys.has(code));
    if (held("KeyW", "ArrowUp")) forward += 1;
    if (held("KeyS", "ArrowDown")) forward -= 1;
    if (held("KeyD", "ArrowRight")) side += 1;
    if (held("KeyA", "ArrowLeft")) side -= 1;
    if (this.stick) {
      forward -= Math.max(-1, Math.min(1, this.stick.dy / 60));
      side += Math.max(-1, Math.min(1, this.stick.dx / 60));
    }
    const length = Math.hypot(forward, side);
    if (length === 0) return;
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

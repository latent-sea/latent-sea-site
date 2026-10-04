// Two sticks for a touch screen, the standard way: bottom left walks, bottom
// right looks around (B1). Each is a ring with a knob; a finger on it pushes
// the knob, up to the ring's edge, and lets go to centre it. The walking
// stick sets the walker's `move`, the looking stick its `look`, each -1 to 1
// either way. They show on a touch screen only, or from the first touch
// anywhere on the world.

const RING = 120;  // the ring's size, in CSS pixels
const KNOB = 52;
const REACH = (RING - KNOB) / 2;
const DEAD = 0.12; // pushed less than this, a stick is at rest

/** Whether this device's main pointer is a finger. */
export function touchScreen() {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
}

export class Joysticks {
  /**
   * @param {object} walker the Walker the sticks drive
   * @param {HTMLElement} holder what the sticks sit in, over the world (the canvas's parent)
   * @param {HTMLElement} canvas the world: a touch on it shows the sticks
   */
  constructor(walker, holder, canvas, { shown = touchScreen() } = {}) {
    this.walker = walker;
    this.sticks = [this.stick(holder, "move", "left"), this.stick(holder, "look", "right")];
    this._off = [];
    const touched = (event) => { if (event.pointerType === "touch") this.show(); };
    canvas.addEventListener("pointerdown", touched);
    this._off.push(() => canvas.removeEventListener("pointerdown", touched));
    if (shown) this.show(); else this.hide();
  }

  stick(holder, which, side) {
    const ring = document.createElement("div");
    ring.className = `world-stick world-stick-${which}`;
    ring.setAttribute("aria-hidden", "true");
    Object.assign(ring.style, {
      position: "absolute", zIndex: "1", width: `${RING}px`, height: `${RING}px`, borderRadius: "50%",
      bottom: "calc(24px + env(safe-area-inset-bottom, 0px))", [side]: "calc(24px + env(safe-area-inset-" + side + ", 0px))",
      background: "rgba(255, 255, 255, 0.10)", border: "2px solid rgba(255, 255, 255, 0.35)",
      touchAction: "none", userSelect: "none", webkitUserSelect: "none",
    });
    const knob = document.createElement("div");
    Object.assign(knob.style, {
      position: "absolute", left: `${(RING - KNOB) / 2 - 2}px`, top: `${(RING - KNOB) / 2 - 2}px`,
      width: `${KNOB}px`, height: `${KNOB}px`, borderRadius: "50%", background: "rgba(255, 255, 255, 0.55)",
      pointerEvents: "none", transition: "transform 80ms ease-out",
    });
    ring.appendChild(knob);
    holder.appendChild(ring);
    const stick = { ring, knob, which, finger: null };
    const set = (x, y) => {
      knob.style.transform = `translate(${x * REACH}px, ${y * REACH}px)`;
      const length = Math.hypot(x, y);
      const scale = length < DEAD ? 0 : (length - DEAD) / (1 - DEAD) / length;
      // screen y runs down; the walker's runs forward (move) and up (look)
      this.walker[which] = { x: x * scale, y: -y * scale };
    };
    const at = (event) => {
      const box = ring.getBoundingClientRect();
      let x = (event.clientX - (box.left + box.width / 2)) / REACH;
      let y = (event.clientY - (box.top + box.height / 2)) / REACH;
      const length = Math.hypot(x, y);
      if (length > 1) { x /= length; y /= length; }
      set(x, y);
    };
    ring.addEventListener("pointerdown", (event) => {
      if (stick.finger !== null) return;
      event.preventDefault();
      event.stopPropagation();
      stick.finger = event.pointerId;
      try { ring.setPointerCapture(event.pointerId); } catch { /* a finger the browser can't hold to the ring still pushes it */ }
      knob.style.transition = "none";
      at(event);
    });
    ring.addEventListener("pointermove", (event) => { if (event.pointerId === stick.finger) at(event); });
    const release = (event) => {
      if (event.pointerId !== stick.finger) return;
      stick.finger = null;
      knob.style.transition = "transform 80ms ease-out";
      set(0, 0);
    };
    ring.addEventListener("pointerup", release);
    ring.addEventListener("pointercancel", release);
    stick.release = () => { stick.finger = null; set(0, 0); };
    return stick;
  }

  show() { for (const { ring } of this.sticks) ring.style.display = ""; this.shown = true; }

  hide() {
    for (const stick of this.sticks) { stick.ring.style.display = "none"; stick.release(); }
    this.shown = false;
  }

  stop() {
    for (const off of this._off.splice(0)) off();
    for (const stick of this.sticks) { stick.release(); stick.ring.remove(); }
  }
}

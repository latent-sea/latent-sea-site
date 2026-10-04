// The frame: what the floor defers to the end of the current one, and what
// it does on the next. A bell rung as a value is set rings once at the end
// of the frame however many sets were made; a piece told it must draw again
// draws on the next frame, once.
//
// gd-chime for the web. MIT licensed; see LICENCE beside this file.
//
// A browser has no frame of its own that a script sees, so this makes one of
// the microtask queue: the deferred calls run as the current run of script
// ends, in the order they were asked, and a call deferred by one of them
// runs in the same flush after it. "Next frame" is a flush after the
// deferred one, so a draw never runs inside a ring.

const deferred = [];
let flushing = false;
let promised = false;

export const Frames = {
  /** Done at the end of the current frame, after whatever is running now. */
  defer(work) {
    deferred.push(work);
    if (!promised) {
      promised = true;
      queueMicrotask(flush);
    }
  },

  /** Done on the next frame: after everything deferred now has run. */
  next(work) {
    Frames.defer(() => Frames.defer(work));
  },

  /** Every deferred call run now, and every call they deferred: for a test, or a probe waiting for the dust to settle. */
  flush() { flush(); },

  /** A promise of the next frame having passed: what a walk awaits between a press and a reading. */
  passed() { return new Promise((resolve) => setTimeout(resolve, 0)); },
};

function flush() {
  promised = false;
  if (flushing) return;
  flushing = true;
  try {
    while (deferred.length) {
      const work = deferred.shift();
      try { work(); } catch (error) { console.error(error); }
    }
  } finally {
    flushing = false;
  }
}

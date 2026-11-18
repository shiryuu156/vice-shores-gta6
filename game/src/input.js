// Vice Shores — keyboard and mouse input. Held keys are read every frame;
// one-shot presses (interact, enter car, punch, reload, pause, mute) are queued
// as flags and taken once by the loop, so a press between two frames is never
// lost and never counted twice. The camera orbits by dragging the mouse, and a
// click on the canvas takes pointer lock for a full third-person feel.

export const ACTION_INTERACT = 1; // E: mission marker / pickup
export const ACTION_ENTER = 2; // F: enter or exit a car (also punch on foot)
export const ACTION_RELOAD = 4; // R
export const ACTION_PAUSE = 8; // Escape / P
export const ACTION_MUTE = 16; // M
export const ACTION_SHOOT = 32; // mouse click, taken as an edge
export const ACTION_START = 64; // Enter / Space on a menu

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let dragging = false;
  let locked = false;

  const ONE_SHOT = {
    KeyE: ACTION_INTERACT,
    KeyF: ACTION_ENTER,
    KeyR: ACTION_RELOAD,
    KeyM: ACTION_MUTE,
    Enter: ACTION_START,
    Space: ACTION_START,
  };

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' || event.code === 'KeyP') {
      if (!event.repeat) actions |= ACTION_PAUSE;
      return;
    }
    held.add(event.code);
    const flag = ONE_SHOT[event.code];
    if (flag !== undefined && !event.repeat) actions |= flag;
    // Space scrolls the page otherwise; the game owns the key.
    if (event.code === 'Space' || event.code === 'Tab') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      actions |= ACTION_SHOOT;
      dragging = true;
      if (document.pointerLockElement !== canvas) {
        try { canvas.requestPointerLock(); } catch { /* pointer lock is a nicety */ }
      }
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) dragging = false;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  window.addEventListener('mousemove', (event) => {
    if (locked) {
      mouseDX += event.movementX;
      mouseDY += event.movementY;
    } else if (dragging) {
      mouseDX += event.movementX;
      mouseDY += event.movementY;
    }
  });

  return {
    isDown(code) { return held.has(code); },
    // WASD / arrows as a -1..1 pair, already normalised for diagonals.
    moveAxes() {
      let x = 0, y = 0;
      if (held.has('KeyW') || held.has('ArrowUp')) y += 1;
      if (held.has('KeyS') || held.has('ArrowDown')) y -= 1;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      return { x, y };
    },
    sprint() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    jump() { return held.has('Space'); },
    takeMouseDelta() {
      const d = { x: mouseDX, y: mouseDY };
      mouseDX = 0; mouseDY = 0;
      return d;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}

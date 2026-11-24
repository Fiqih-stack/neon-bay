// Neon Bay input: keyboard plus mouse. Held keys drive movement; taps
// (enter a car, reload, punch, pause, confirm, mute, weapon swap, horn,
// radio) are queued as bit flags and taken once by the loop, so a press
// that lands between frames is never lost.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_RELOAD = 8;
export const ACTION_PUNCH = 16;
export const ACTION_MUTE = 32;
export const ACTION_WEAPON1 = 64;
export const ACTION_WEAPON2 = 128;
export const ACTION_HORN = 256;
export const ACTION_RADIO = 512;

// Which physical key holds which direction.
const MOVE_KEYS = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

// Which physical key raises which action bit (or bits) on a tap.
// Space both confirms and punches, so it carries two bits at once.
const TAP_KEYS = {
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM | ACTION_PUNCH,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyE: ACTION_ENTER,
  KeyR: ACTION_RELOAD,
  KeyM: ACTION_MUTE,
  Digit1: ACTION_WEAPON1,
  Digit2: ACTION_WEAPON2,
  KeyH: ACTION_HORN,
  KeyT: ACTION_RADIO,
};

export function createInput(canvas) {
  const held = new Set();
  let queued = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseHeld = false;
  let clickQueued = false;

  function keyDown(event) {
    const dir = MOVE_KEYS[event.code];
    if (dir !== undefined) {
      held.add(dir);
    } else if (!event.repeat) {
      const bit = TAP_KEYS[event.code];
      if (bit !== undefined) queued |= bit;
    }
    // Arrow keys and space would scroll the page; swallow them.
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  }

  function keyUp(event) {
    const dir = MOVE_KEYS[event.code];
    if (dir !== undefined) held.delete(dir);
  }

  function focusLost() {
    held.clear();
    mouseHeld = false;
  }

  function trackMouse(event) {
    const box = canvas.getBoundingClientRect();
    mouseX = event.clientX - box.left;
    mouseY = event.clientY - box.top;
  }

  function pointerDown(event) {
    trackMouse(event);
    mouseHeld = true;
    clickQueued = true;
    if (event.button === 0) queued |= ACTION_CONFIRM;
  }

  function pointerUp() {
    mouseHeld = false;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', focusLost);
  canvas.addEventListener('pointermove', trackMouse);
  canvas.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  // -1, 0 or 1 on an axis: the positive key minus the negative one.
  function axisOf(neg, pos) {
    return (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0);
  }

  return {
    moveX() {
      return axisOf('left', 'right');
    },
    moveY() {
      return axisOf('up', 'down');
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseHeld };
    },
    // True once per click: the loop fires one shot, then the flag clears.
    takeShoot() {
      const shot = clickQueued;
      clickQueued = false;
      return shot;
    },
    // Hand over every queued one-shot action and clear the queue.
    takeActions() {
      const taken = queued;
      queued = 0;
      return taken;
    },
  };
}

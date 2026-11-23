// Neon Bay input: keyboard plus mouse. Held keys give movement; one-shot presses
// (enter a car, reload, punch, pause, confirm, mute, weapon swap) are queued as bit
// flags and taken once by the loop, so a press between frames is never lost.

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

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter', 'Space']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let shootQueued = false;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyE') {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (event.code === 'KeyR') {
      if (!event.repeat) actions |= ACTION_RELOAD;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (event.code === 'Digit1') {
      if (!event.repeat) actions |= ACTION_WEAPON1;
    } else if (event.code === 'Digit2') {
      if (!event.repeat) actions |= ACTION_WEAPON2;
    } else if (event.code === 'KeyH') {
      if (!event.repeat) actions |= ACTION_HORN;
    } else if (event.code === 'KeyT') {
      if (!event.repeat) actions |= ACTION_RADIO;
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    shootQueued = true;
    if (event.button === 0) actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function axis(neg, pos) {
    return (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0);
  }

  return {
    /** -1/0/1 for each axis from WASD or the arrow keys. */
    moveX() {
      return axis('ArrowLeft', 'ArrowRight') || axis('KeyA', 'KeyD');
    },
    moveY() {
      return axis('ArrowUp', 'ArrowDown') || axis('KeyW', 'KeyS');
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    takeShoot() {
      const shot = shootQueued;
      shootQueued = false;
      return shot;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}

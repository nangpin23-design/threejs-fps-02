// Input: keyboard state, mouse look deltas and pointer lock. The game owns
// no input of its own — everything the simulation needs comes from here.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  let lookX = 0;
  let lookY = 0;
  let firing = false;
  let locked = false;
  let onKey = null;

  function requestLock() {
    canvas.requestPointerLock();
  }
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    onLockChange(locked);
  });
  document.addEventListener('mousemove', (event) => {
    if (!locked) return;
    lookX += event.movementX;
    lookY += event.movementY;
  });
  document.addEventListener('mousedown', (event) => {
    if (event.button === 0 && locked) firing = true;
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) firing = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (onKey) onKey(event.code);
  });
  document.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); firing = false; });

  return {
    state: { keys, get firing() { return firing; } },
    takeLook() {
      const x = lookX;
      const y = lookY;
      lookX = 0;
      lookY = 0;
      return { x, y };
    },
    requestLock,
    exitLock() { if (document.pointerLockElement) document.exitPointerLock(); },
    set onKeyDown(fn) { onKey = fn; },
    get locked() { return locked; },
    releaseFire() { firing = false; },
  };
}

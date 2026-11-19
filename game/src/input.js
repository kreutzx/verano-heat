// Keyboard and mouse state for the whole game. One Input instance is fed by
// window events; the simulation only ever reads it, which keeps the fixed
// timestep loop free of DOM timing surprises.

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();   // keys that went down since the last step
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.pointerLocked = false;

    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement != null;
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once per physical press; consumed by the simulation step.
  tapped(code) {
    return this.pressed.has(code);
  }

  // Called at the end of every simulation step.
  endStep() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  lockPointer(element) {
    if (element && element.requestPointerLock) element.requestPointerLock();
  }

  unlockPointer() {
    if (document.exitPointerLock) document.exitPointerLock();
  }
}

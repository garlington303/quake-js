const KEY_BINDINGS = {
  KeyW: "forward",
  KeyS: "backward",
  KeyA: "left",
  KeyD: "right",
  Space: "jump",
};

export function attachInput(canvas) {
  const state = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    jumpQueued: false,
    primaryFireQueued: false,
    flashlightToggled: false,
    weaponSelectQueued: null, // null | "shotgun" | "sword"
    weaponScrollDelta: 0,     // +1 = scroll down (next), -1 = scroll up (prev)
    pointerLocked: false,
    lookDeltaX: 0,
    lookDeltaY: 0,
  };

  const setKeyState = (code, pressed) => {
    const action = KEY_BINDINGS[code];

    if (action) {
      state[action] = pressed;
    }
  };

  const handlePointerLockChange = () => {
    state.pointerLocked = document.pointerLockElement === canvas;
  };

  window.addEventListener("keydown", (event) => {
    if (!event.repeat && event.code === "Space") {
      state.jumpQueued = true;
    }
    if (!event.repeat && event.code === "KeyF") {
      state.flashlightToggled = true;
    }
    if (!event.repeat && event.code === "Digit1") {
      state.weaponSelectQueued = "shotgun";
    }
    if (!event.repeat && event.code === "Digit2") {
      state.weaponSelectQueued = "sword";
    }
    if (!event.repeat && event.code === "Digit3") {
      state.weaponSelectQueued = "grenade";
    }
    if (!event.repeat && event.code === "Digit4") {
      state.weaponSelectQueued = "staff";
    }
    setKeyState(event.code, true);
  });

  window.addEventListener("keyup", (event) => {
    setKeyState(event.code, false);
  });

  window.addEventListener("blur", () => {
    state.forward = false;
    state.backward = false;
    state.left = false;
    state.right = false;
    state.jump = false;
    state.jumpQueued = false;
    state.primaryFireQueued = false;
  });

  document.addEventListener("pointerlockchange", handlePointerLockChange);

  window.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }

    state.primaryFireQueued = true;
  });

  window.addEventListener("mousemove", (event) => {
    if (!state.pointerLocked) {
      return;
    }

    state.lookDeltaX += event.movementX;
    state.lookDeltaY += event.movementY;
  });

  // Scroll wheel — cycle weapons (deltaY > 0 = scroll down = next weapon)
  window.addEventListener("wheel", (event) => {
    if (!state.pointerLocked) return;
    state.weaponScrollDelta += event.deltaY > 0 ? 1 : -1;
  }, { passive: true });

  return {
    state,
    consumeLookDelta() {
      const delta = {
        x: state.lookDeltaX,
        y: state.lookDeltaY,
      };

      state.lookDeltaX = 0;
      state.lookDeltaY = 0;

      return delta;
    },
    consumeJump() {
      const queued = state.jumpQueued;
      state.jumpQueued = false;
      return queued;
    },
    consumePrimaryFire() {
      const queued = state.primaryFireQueued;
      state.primaryFireQueued = false;
      return queued;
    },
    consumeFlashlightToggle() {
      const toggled = state.flashlightToggled;
      state.flashlightToggled = false;
      return toggled;
    },
    consumeWeaponSelect() {
      const sel = state.weaponSelectQueued;
      state.weaponSelectQueued = null;
      return sel;
    },
    // Returns +1 (next), -1 (prev), or 0 (no scroll this frame).
    consumeWeaponScroll() {
      const delta = state.weaponScrollDelta;
      state.weaponScrollDelta = 0;
      if (delta === 0) return 0;
      return delta > 0 ? 1 : -1;
    },
  };
}

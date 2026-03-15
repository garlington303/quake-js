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
  };
}

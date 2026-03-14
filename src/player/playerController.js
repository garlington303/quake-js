import { Ray, Vector3 } from "@babylonjs/core";
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT } from "./playerConstants.js";

const LOOK_SENSITIVITY = 0.0022;

// Quake-ish units.
const GRAVITY_UNITS_PER_SECOND_SQUARED = 800;
const JUMP_SPEED = 270;

const MAX_GROUND_SPEED = 320;
const MAX_AIR_SPEED = 320;
const GROUND_ACCEL = 14;
const AIR_ACCEL = 2;
const FRICTION = 6;

const GROUND_CHECK_START_ABOVE_FEET = 1;
const GROUND_CHECK_DISTANCE = 2.5;
const GROUNDED_DISTANCE_THRESHOLD = 1.8;
// When grounded, pull toward the floor proportional to float height.
// Zero force when flush → no depenetration bounce. Stronger pull the higher above floor.
const FLOOR_SPRING = 120;
const STOP_SPEED = 80;

function getYawBasis(camera) {
  const yaw = camera.rotation.y;
  const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new Vector3(forward.z, 0, -forward.x);

  return { forward, right };
}

function applyFriction(horizontalVelocity, deltaTimeSeconds) {
  const speed = Math.hypot(horizontalVelocity.x, horizontalVelocity.z);

  if (speed < 0.001) {
    horizontalVelocity.x = 0;
    horizontalVelocity.z = 0;
    return;
  }

  const control = Math.max(speed, STOP_SPEED);
  const drop = control * FRICTION * deltaTimeSeconds;
  const newSpeed = Math.max(0, speed - drop);
  const ratio = newSpeed / speed;
  horizontalVelocity.x *= ratio;
  horizontalVelocity.z *= ratio;
}

function accelerate(horizontalVelocity, wishDir, wishSpeed, accel, deltaTimeSeconds) {
  if (!wishDir || wishSpeed <= 0) {
    return;
  }

  const currentSpeed = Vector3.Dot(horizontalVelocity, wishDir);
  const addSpeed = wishSpeed - currentSpeed;

  if (addSpeed <= 0) {
    return;
  }

  const accelSpeed = Math.min(accel * wishSpeed * deltaTimeSeconds, addSpeed);
  horizontalVelocity.x += wishDir.x * accelSpeed;
  horizontalVelocity.z += wishDir.z * accelSpeed;
}

function computeWish(camera, input) {
  const { state } = input;
  const movement = new Vector3(0, 0, 0);
  const { forward, right } = getYawBasis(camera);

  if (state.forward) {
    movement.addInPlace(forward);
  }

  if (state.backward) {
    movement.subtractInPlace(forward);
  }

  if (state.right) {
    movement.addInPlace(right);
  }

  if (state.left) {
    movement.subtractInPlace(right);
  }

  if (movement.equalsWithEpsilon(Vector3.ZeroReadOnly)) {
    return { wishDir: null, wishSpeed: 0 };
  }

  movement.normalize();
  return { wishDir: movement, wishSpeed: 1 };
}

// Returns { grounded, floatHeight } where floatHeight is how far above the
// floor the player's feet currently are (0 = touching floor, positive = floating).
function checkGround(scene, body) {
  const rayOrigin = body.position.add(
    new Vector3(0, -(PLAYER_HEIGHT / 2 - GROUND_CHECK_START_ABOVE_FEET), 0),
  );
  const ray = new Ray(rayOrigin, new Vector3(0, -1, 0), GROUND_CHECK_DISTANCE + GROUND_CHECK_START_ABOVE_FEET);
  const hit = scene.pickWithRay(ray, (mesh) => mesh !== body && Boolean(mesh?.checkCollisions));

  if (!hit?.hit || hit.distance > GROUNDED_DISTANCE_THRESHOLD) {
    return { grounded: false, floatHeight: 0 };
  }

  // hit.distance is from the ray origin (1 unit above feet) to the floor.
  // floatHeight = distance minus the 1-unit ray start offset = actual gap under feet.
  const floatHeight = Math.max(0, hit.distance - GROUND_CHECK_START_ABOVE_FEET);
  return { grounded: true, floatHeight };
}

export function createPlayerController(scene, camera, input, collider = null) {
  const horizontalVelocity = new Vector3(0, 0, 0);
  let verticalVelocity = 0;
  let grounded = false;
  const body = collider ?? camera;
  const eyeOffset = PLAYER_EYE_HEIGHT - PLAYER_HEIGHT / 2;
  let smoothedBodyY = null;

  return {
    reset(spawnPosition) {
      horizontalVelocity.set(0, 0, 0);
      verticalVelocity = 0;
      smoothedBodyY = null;
      body.position.copyFrom(spawnPosition);
      body.position.y -= eyeOffset;
      camera.position.copyFrom(spawnPosition);
    },

    update(deltaTimeSeconds) {
      const { state } = input;
      const lookDelta = input.consumeLookDelta();

      if (state.pointerLocked) {
        camera.rotation.y += lookDelta.x * LOOK_SENSITIVITY;
        camera.rotation.x += lookDelta.y * LOOK_SENSITIVITY;
      }

      const groundResult = checkGround(scene, body);
      grounded = groundResult.grounded;

      if (grounded) {
        applyFriction(horizontalVelocity, deltaTimeSeconds);
      }

      const { wishDir, wishSpeed } = computeWish(camera, input);
      const maxSpeed = grounded ? MAX_GROUND_SPEED : MAX_AIR_SPEED;
      const accel = grounded ? GROUND_ACCEL : AIR_ACCEL;
      accelerate(horizontalVelocity, wishDir, wishSpeed * maxSpeed, accel, deltaTimeSeconds);

      if (grounded && verticalVelocity < 0) {
        verticalVelocity = 0;
      }

      if (grounded && input.consumeJump()) {
        verticalVelocity = JUMP_SPEED;
        grounded = false;
      } else if (!grounded) {
        verticalVelocity -= GRAVITY_UNITS_PER_SECOND_SQUARED * deltaTimeSeconds;
      } else {
        // Spring: pull toward floor proportional to float height.
        // floatHeight ≈ 0 when flush → near-zero force → no depenetration bounce.
        // floatHeight > 0 on ramps/seams → gentle pull keeps feet planted.
        verticalVelocity = -(groundResult.floatHeight * FLOOR_SPRING);
      }

      const displacement = new Vector3(
        horizontalVelocity.x * deltaTimeSeconds,
        verticalVelocity * deltaTimeSeconds,
        horizontalVelocity.z * deltaTimeSeconds,
      );

      const previousPosition = body.position.clone();
      if (typeof body.moveWithCollisions === "function") {
        body.moveWithCollisions(displacement);
      } else {
        // Fallback for builds where camera collisions aren't available.
        body.position.addInPlace(displacement);
      }

      // Reconstruct horizontal velocity from actual displacement so wall collisions feel right.
      const actual = body.position.subtract(previousPosition);
      horizontalVelocity.x = actual.x / Math.max(deltaTimeSeconds, 0.0001);
      horizontalVelocity.z = actual.z / Math.max(deltaTimeSeconds, 0.0001);

      // Kill upward velocity if blocked mid-jump (ceiling hit).
      if (!grounded && verticalVelocity > 0 && Math.abs(actual.y) < 0.5) {
        verticalVelocity = 0;
      }

      if (collider) {
        const rawY = body.position.y;

        // Initialise on first frame.
        if (smoothedBodyY === null) smoothedBodyY = rawY;

        if (grounded) {
          // Snap instantly downward (steps, landing) but smooth upward micro-bounces
          // caused by ellipsoid depenetration so they never reach the camera.
          if (rawY <= smoothedBodyY) {
            smoothedBodyY = rawY;
          } else {
            smoothedBodyY += (rawY - smoothedBodyY) * Math.min(1.0, deltaTimeSeconds * 8);
          }
        } else {
          // In air: track exactly so jumping and falling feel crisp.
          smoothedBodyY = rawY;
        }

        camera.position.copyFrom(body.position);
        camera.position.y = smoothedBodyY + eyeOffset;
      }

      scene.metadata ??= {};
      scene.metadata.player = {
        grounded,
        horizontalSpeed: Math.hypot(horizontalVelocity.x, horizontalVelocity.z),
        verticalVelocity,
      };
    },
  };
}

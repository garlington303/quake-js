// Camera-space head-bobbing.
// Applied AFTER playerController sets camera.position each frame so the
// bob offset is purely additive and doesn't interfere with movement/collision.
//
// Reads scene.metadata.player written by playerController:
//   { grounded, horizontalSpeed, verticalVelocity }

const WALK_BOB_SPEED  = 9.0;   // rad/sec — two full vertical cycles per stride
const WALK_BOB_AMP_Y  = 0.048; // units — up/down travel
const WALK_BOB_ROLL   = 0.011; // radians — lateral tilt per step

const IDLE_BOB_SPEED  = 1.6;
const IDLE_BOB_AMP_Y  = 0.004;

const LAND_DIP_MAX    = -0.13;  // maximum downward camera kick on landing
const LAND_DIP_MIN    = -0.03;  // minimum dip even for gentle drops
const LAND_FALL_REF   = 380;    // fall speed (units/sec) that gives max dip
const LAND_RECOVER    = 13.0;   // spring-back coefficient

const DAMAGE_KICK_PITCH = -0.06; // radians — downward flinch on hit
const DAMAGE_KICK_RECOVER = 10;  // spring-back speed

export function createHeadBob(camera, scene) {
  let phase         = 0;
  let prevGrounded  = false;
  let lastAirVVel   = 0;   // vertical velocity captured while airborne
  let landDip       = 0;
  let damageKickX   = 0;   // pitch offset from taking damage

  return {
    update(dt) {
      const meta      = scene.metadata?.player ?? {};
      const speed     = meta.horizontalSpeed ?? 0;
      const grounded  = meta.grounded       ?? false;
      const vertVel   = meta.verticalVelocity ?? 0;

      // Track last airborne vertical velocity so we know impact speed on land.
      if (!grounded) lastAirVVel = vertVel;

      // Landing impact — fires once on the frame grounded flips true.
      if (grounded && !prevGrounded) {
        const fallSpeed = Math.abs(Math.min(0, lastAirVVel));
        const strength  = Math.min(1.0, fallSpeed / LAND_FALL_REF);
        landDip = LAND_DIP_MIN + (LAND_DIP_MAX - LAND_DIP_MIN) * strength;
      }
      prevGrounded = grounded;

      // Spring recovery toward 0.
      if (landDip !== 0) {
        landDip += (0 - landDip) * Math.min(1, dt * LAND_RECOVER);
        if (Math.abs(landDip) < 0.001) landDip = 0;
      }

      // Choose bob parameters based on movement state.
      const isWalking = grounded && speed > 20;
      const bobSpeed  = isWalking ? WALK_BOB_SPEED : IDLE_BOB_SPEED;
      const ampY      = isWalking ? WALK_BOB_AMP_Y : IDLE_BOB_AMP_Y;
      const ampRoll   = isWalking ? WALK_BOB_ROLL  : 0;

      phase += dt * bobSpeed;

      // Double-frequency for Y so there are two dips per stride cycle.
      const bobY    = Math.sin(phase * 2) * ampY;
      const bobRoll = Math.sin(phase)     * ampRoll;

      // Damage kick spring recovery.
      if (damageKickX !== 0) {
        damageKickX += (0 - damageKickX) * Math.min(1, dt * DAMAGE_KICK_RECOVER);
        if (Math.abs(damageKickX) < 0.001) damageKickX = 0;
      }

      camera.position.y += bobY + landDip;
      camera.rotation.x += damageKickX;
      camera.rotation.z  = bobRoll;
    },

    // Trigger a damage view-punch (downward flinch, springs back).
    damageKick(damage) {
      const strength = Math.min(1.0, damage / 40);
      damageKickX = DAMAGE_KICK_PITCH * strength;
    },

    // Call on respawn so the phase doesn't carry over.
    reset() {
      phase        = 0;
      prevGrounded = false;
      lastAirVVel  = 0;
      landDip      = 0;
      damageKickX  = 0;
      camera.rotation.z = 0;
    },
  };
}

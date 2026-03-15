import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createPixelSpriteEffect } from "./pixelSpriteEffect.js";

const DEFAULT_SPEED = 1400;

const DEFAULT_PROJECTILE_EFFECT = {
  frameCount: 24,
  frameRate: 24,
  size: 1.8,
  textureUrl: "/gfx/Pixel%20VFX/Fire%20Spells%20Pixel%20VFX/Fire%20Spells/Lavaball.png",
};

export function createProjectileSystem(scene) {
  const projectiles = [];

  return {
    spawnProjectile(options) {
      const origin = options.origin;
      const target = options.target;
      const color = options.color ?? new Color3(0.9, 0.85, 0.6);
      const speed = options.speed ?? DEFAULT_SPEED;
      const onComplete = options.onComplete ?? null;
      const effect = createPixelSpriteEffect(scene, {
        ...DEFAULT_PROJECTILE_EFFECT,
        emissiveColor: color,
        frameCount: options.frameCount ?? DEFAULT_PROJECTILE_EFFECT.frameCount,
        frameRate: options.frameRate ?? DEFAULT_PROJECTILE_EFFECT.frameRate,
        size: options.size ?? DEFAULT_PROJECTILE_EFFECT.size,
        textureUrl: options.textureUrl ?? DEFAULT_PROJECTILE_EFFECT.textureUrl,
      });

      const travel = target.subtract(origin);
      const distance = travel.length();
      const direction = distance > 0 ? travel.scale(1 / distance) : new Vector3(0, 0, 1);
      effect.setPosition(origin);

      projectiles.push({
        direction,
        distance,
        effect,
        traveled: 0,
        speed,
        target,
        onComplete,
      });
    },
    update(deltaTimeSeconds) {
      for (let index = projectiles.length - 1; index >= 0; index -= 1) {
        const projectile = projectiles[index];
        const step = projectile.speed * deltaTimeSeconds;
        projectile.traveled += step;
        projectile.effect.update(deltaTimeSeconds, true);

        if (projectile.traveled >= projectile.distance) {
          projectile.effect.setPosition(projectile.target);
          projectile.effect.dispose();
          projectiles.splice(index, 1);
          if (projectile.onComplete) {
            projectile.onComplete(projectile.target);
          }
          continue;
        }

        projectile.effect.mesh.position.addInPlace(projectile.direction.scale(step));
      }
    },
  };
}

import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { createPixelSpriteEffect } from "./pixelSpriteEffect.js";

const WORLD_IMPACT = {
  columns: 6,
  rows: 1,
  frameCount: 6,
  frameRate: 20,
  size: 2.5,
  duration: 0.3,
  textureUrl: "/ui/muzzle_flash.png?v=2",
};

const ENEMY_IMPACT = {
  columns: 6,
  rows: 1,
  frameCount: 6,
  frameRate: 24,
  size: 2.0,
  duration: 0.25,
  textureUrl: "/ui/muzzle_flash.png?v=2",
};

export function createImpactSystem(scene) {
  const impacts = [];

  return {
    spawnImpact(position, options = {}) {
      const isEnemy = options.isEnemy ?? false;
      const preset = isEnemy ? ENEMY_IMPACT : WORLD_IMPACT;
      const color = options.color ?? (isEnemy ? new Color3(1, 0.35, 0.35) : new Color3(1, 0.72, 0.35));
      const duration = options.durationSeconds ?? preset.duration;
      const effect = createPixelSpriteEffect(scene, {
        columns: options.columns ?? preset.columns,
        rows: options.rows ?? preset.rows,
        emissiveColor: color,
        frameCount: options.frameCount ?? preset.frameCount,
        frameRate: options.frameRate ?? preset.frameRate,
        size: options.size ?? preset.size,
        textureUrl: options.textureUrl ?? preset.textureUrl,
      });
      effect.setPosition(position);

      impacts.push({
        effect,
        remaining: duration,
      });
    },
    update(deltaTimeSeconds) {
      for (let index = impacts.length - 1; index >= 0; index -= 1) {
        const impact = impacts[index];
        impact.remaining -= deltaTimeSeconds;
        const animationFinished = impact.effect.update(deltaTimeSeconds, false);
        if (impact.remaining <= 0 || animationFinished) {
          impact.effect.dispose();
          impacts.splice(index, 1);
        }
      }
    },
  };
}

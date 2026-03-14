import { Color3 } from "@babylonjs/core";
import { createPixelSpriteEffect } from "./pixelSpriteEffect.js";

const DEFAULT_DURATION = 0.14;

const DEFAULT_IMPACT_EFFECT = {
  frameCount: 6,
  frameRate: 22,
  size: 1.2,
  textureUrl: "/gfx/Pixel%20VFX/Fire%20Spells%20Pixel%20VFX/Fire%20Spells/Fireball_Hit.png",
};

export function createImpactSystem(scene) {
  const impacts = [];

  return {
    spawnImpact(position, options = {}) {
      const color = options.color ?? new Color3(1, 0.72, 0.35);
      const duration = options.durationSeconds ?? DEFAULT_DURATION;
      const effect = createPixelSpriteEffect(scene, {
        ...DEFAULT_IMPACT_EFFECT,
        emissiveColor: color,
        frameCount: options.frameCount ?? DEFAULT_IMPACT_EFFECT.frameCount,
        frameRate: options.frameRate ?? DEFAULT_IMPACT_EFFECT.frameRate,
        size: options.size ?? DEFAULT_IMPACT_EFFECT.size,
        textureUrl: options.textureUrl ?? DEFAULT_IMPACT_EFFECT.textureUrl,
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

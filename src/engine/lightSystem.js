import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

export function createLightSystem(scene) {
  const lights = [];

  function spawnLight(position, options = {}) {
    const light = new PointLight(`dyn-light-${performance.now()}`, position.clone(), scene);
    const color = options.color ?? new Color3(1, 0.8, 0.6);
    light.diffuse = color;
    light.specular = color;
    light.intensity = options.intensity ?? 1.6;
    light.radius = options.radius ?? 6;

    lights.push({
      light,
      lifetime: options.duration ?? 0.12,
      remaining: options.duration ?? 0.12,
      fadeOut: options.fadeOut ?? 0.1,
      flicker: options.flicker ?? 0.0,
      baseIntensity: light.intensity,
      position: position.clone(),
    });

    return light;
  }

  function update(deltaTimeSeconds) {
    for (let i = lights.length - 1; i >= 0; i -= 1) {
      const entry = lights[i];
      entry.remaining -= deltaTimeSeconds;
      if (entry.remaining <= 0) {
        entry.light.dispose();
        lights.splice(i, 1);
        continue;
      }

      const t = Math.max(entry.remaining / Math.max(entry.lifetime, 0.0001), 0);
      const fade = t < entry.fadeOut ? t / Math.max(entry.fadeOut, 0.0001) : 1;
      const flicker = entry.flicker > 0 ? (0.85 + 0.3 * Math.sin(performance.now() * 0.02)) : 1;
      entry.light.intensity = entry.baseIntensity * fade * flicker;
    }
  }

  function spawnMuzzleFlash(camera) {
    const forward = camera.getForwardRay(1).direction;
    const position = camera.position.add(forward.scale(0.6)).add(new Vector3(0, -0.05, 0));
    spawnLight(position, {
      color: new Color3(1, 0.85, 0.6),
      intensity: 2.2,
      radius: 8,
      duration: 0.08,
      fadeOut: 0.4,
      flicker: 1,
    });
  }

  function spawnImpactLight(position, isEnemy) {
    spawnLight(position, {
      color: isEnemy ? new Color3(1, 0.35, 0.35) : new Color3(1, 0.75, 0.35),
      intensity: 1.4,
      radius: 5,
      duration: 0.15,
      fadeOut: 0.5,
    });
  }

  return {
    spawnLight,
    spawnMuzzleFlash,
    spawnImpactLight,
    update,
  };
}

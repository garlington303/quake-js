import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
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
  rows: 4,
  frameCount: 24,
  frameRate: 36,
  size: 2.8,
  duration: 0.5,
  textureUrl: "/gfx/Pixel VFX/Fire Spells Pixel VFX/Fire Spells Scaled 2x/Fire_Explosion.png",
};

// ── Blood scatter config ────────────────────────────────────────────────────
const BLOOD_PARTICLE_COUNT  = 5;
const BLOOD_PARTICLE_SIZE   = 0.6;
const BLOOD_SCATTER_SPEED   = 8;    // units/s outward
const BLOOD_GRAVITY         = 18;   // units/s² downward
const BLOOD_LIFETIME        = 0.45; // seconds
const BLOOD_COLORS = [
  new Color3(0.7, 0.04, 0.04),
  new Color3(0.85, 0.08, 0.08),
  new Color3(0.55, 0.02, 0.02),
];

function createBloodParticle(scene, position) {
  const mesh = MeshBuilder.CreatePlane(`blood-${Date.now()}-${Math.random()}`, { size: BLOOD_PARTICLE_SIZE }, scene);
  const material = new StandardMaterial(`blood-mat-${Date.now()}-${Math.random()}`, scene);
  const color = BLOOD_COLORS[Math.floor(Math.random() * BLOOD_COLORS.length)];
  material.diffuseColor  = color;
  material.emissiveColor = color;
  material.disableLighting = true;
  material.backFaceCulling = false;
  mesh.material = material;
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.isPickable = false;
  mesh.renderingGroupId = 2;
  mesh.position.copyFrom(position);

  // Random outward direction (spread in a hemisphere)
  const angle = Math.random() * Math.PI * 2;
  const upBias = 0.3 + Math.random() * 0.7; // mostly upward/outward
  const speed = BLOOD_SCATTER_SPEED * (0.6 + Math.random() * 0.4);
  const velocity = new Vector3(
    Math.cos(angle) * speed,
    upBias * speed * 0.6,
    Math.sin(angle) * speed,
  );

  return { mesh, material, velocity, remaining: BLOOD_LIFETIME };
}

export function createImpactSystem(scene) {
  const impacts = [];
  const particles = [];

  return {
    spawnImpact(position, options = {}) {
      const isEnemy = options.isEnemy ?? false;
      const preset = isEnemy ? ENEMY_IMPACT : WORLD_IMPACT;
      const color = options.color ?? (isEnemy ? new Color3(0.9, 0.12, 0.08) : new Color3(1, 0.72, 0.35));
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

      // Spawn blood scatter for enemy hits
      if (isEnemy) {
        const count = options.bloodCount ?? BLOOD_PARTICLE_COUNT;
        for (let i = 0; i < count; i++) {
          particles.push(createBloodParticle(scene, position));
        }
      }
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

      // Update blood scatter particles
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const p = particles[index];
        p.remaining -= deltaTimeSeconds;
        if (p.remaining <= 0) {
          p.mesh.dispose();
          p.material.dispose();
          particles.splice(index, 1);
          continue;
        }
        // Apply gravity
        p.velocity.y -= BLOOD_GRAVITY * deltaTimeSeconds;
        // Move
        p.mesh.position.x += p.velocity.x * deltaTimeSeconds;
        p.mesh.position.y += p.velocity.y * deltaTimeSeconds;
        p.mesh.position.z += p.velocity.z * deltaTimeSeconds;
        // Fade out by shrinking
        const t = p.remaining / BLOOD_LIFETIME;
        p.mesh.scaling.setAll(t);
      }
    },
  };
}

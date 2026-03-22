import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createPixelSpriteEffect } from "./pixelSpriteEffect.js";

const DEFAULT_SPEED = 1400;

const DEFAULT_PROJECTILE_EFFECT = {
  frameCount: 24,
  frameRate: 24,
  size: 1.8,
  textureUrl: "/gfx/Pixel%20VFX/Fire%20Spells%20Pixel%20VFX/Fire%20Spells/Lavaball.png",
};

function spawnSphereProjectileVisual(scene, options) {
  const diameter = options.diameter ?? 0.2;
  const mesh = MeshBuilder.CreateSphere(`proj-sphere-${performance.now()}-${Math.random()}`, {
    diameter,
    segments: options.segments ?? 6,
  }, scene);
  const material = new StandardMaterial(`proj-sphere-mat-${performance.now()}-${Math.random()}`, scene);
  const color = options.color ?? new Color3(1, 0.75, 0.3);
  material.diffuseColor = color.scale(0.85);
  material.emissiveColor = color;
  material.specularColor = color.scale(0.08);
  material.disableLighting = false;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.checkCollisions = false;
  mesh.renderingGroupId = 1;
  mesh.position.copyFrom(options.origin);

  let light = null;
  if ((options.lightIntensity ?? 0) > 0) {
    light = new PointLight(`proj-sphere-light-${performance.now()}`, options.origin.clone(), scene);
    light.diffuse = color;
    light.specular = color.scale(0.5);
    light.intensity = options.lightIntensity;
    light.range = options.lightRange ?? 8;
  }

  return { mesh, material, light };
}

export function createProjectileSystem(scene) {
  const projectiles = [];

  // ── Legacy target-based projectile (enemy AI use) ─────────────────────────
  function spawnProjectile(options) {
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
      type: "legacy",
      direction,
      distance,
      effect,
      traveled: 0,
      speed,
      target,
      onComplete,
    });
  }

  // ── Generic visual bolt (enemy AI / non-staff use) ─────────────────────────
  function spawnBolt(options) {
    const color = options.color ?? new Color3(0.4, 0.3, 1.0);
    const target = options.target.clone();
    const origin = options.origin.clone();
    const travel = target.subtract(origin);
    const distance = travel.length();
    const direction = distance > 0 ? travel.scale(1 / distance) : new Vector3(0, 0, 1);

    const effect = createPixelSpriteEffect(scene, {
      frameCount: 6,
      frameRate: 14,
      size: options.size ?? 1.4,
      textureUrl: DEFAULT_PROJECTILE_EFFECT.textureUrl,
      emissiveColor: color,
    });
    effect.setPosition(origin);

    const light = new PointLight(`bolt-light-${performance.now()}`, origin.clone(), scene);
    light.diffuse = color;
    light.specular = color;
    light.intensity = 6.0;
    light.range = 35;

    projectiles.push({
      type: "bolt",
      direction,
      distance,
      traveled: 0,
      speed: options.speed ?? 700,
      effect,
      light,
      onArrive: options.onArrive ?? null,
    });
  }

  function spawnSphereProjectile(options) {
    const origin = options.origin.clone();
    const direction = options.direction.clone().normalize();
    const speed = options.speed ?? DEFAULT_SPEED;
    const velocity = direction.scale(speed);
    const { mesh, material, light } = spawnSphereProjectileVisual(scene, {
      color: options.color,
      diameter: options.diameter,
      lightIntensity: options.lightIntensity,
      lightRange: options.lightRange,
      origin,
      segments: options.segments,
    });

    projectiles.push({
      type: "sphere",
      gravity: options.gravity ?? 0,
      lifeRemaining: options.lifeSeconds ?? 1.5,
      light,
      material,
      mesh,
      onExpire: options.onExpire ?? null,
      onHit: options.onHit ?? null,
      resolveHit: options.resolveHit ?? null,
      velocity,
    });
  }

  // ── Staff ice bolt ─────────────────────────────────────────────────────────
  // Frostball.png + Frostball_Hit.png — both 192×128 (6 cols × 4 rows = 24 frames)
  const ICE_COLOR       = new Color3(0.35, 0.85, 1.0); // bright cyan-ice
  const ICE_LIGHT_BASE  = 7.0;
  const ICE_LIGHT_RANGE = 40;

  // Standalone impact effects — ticked independently until animation ends
  const impacts = [];

  function spawnStaffBolt(options) {
    const origin = options.origin.clone();
    const target = options.target.clone();
    const travel = target.subtract(origin);
    const distance = travel.length();
    const direction = distance > 0 ? travel.scale(1 / distance) : new Vector3(0, 0, 1);

    // Frostball sprite — loops while in flight
    const effect = createPixelSpriteEffect(scene, {
      columns: 6,
      rows: 4,
      frameCount: 24,
      frameRate: 18,
      size: options.size ?? 1.3,
      textureUrl: "/gfx/Pixel%20VFX/Ice%20Spells%20Pixel%20VFX/Ice%20Spells/Frostball.png",
      emissiveColor: ICE_COLOR,
    });
    effect.setPosition(origin);

    // Pulsing ice-blue point light that rides with the bolt
    const light = new PointLight(`staff-bolt-light-${performance.now()}`, origin.clone(), scene);
    light.diffuse    = ICE_COLOR;
    light.specular   = ICE_COLOR;
    light.intensity  = ICE_LIGHT_BASE;
    light.range      = ICE_LIGHT_RANGE;

    projectiles.push({
      type: "staffBolt",
      direction,
      distance,
      traveled: 0,
      speed: options.speed ?? 750,
      effect,
      light,
      pulsePhase: 0,
      onArrive: options.onArrive ?? null,
    });
  }

  // Spawn a one-shot Frostball_Hit impact burst at the given world position.
  function spawnStaffImpact(position) {
    const effect = createPixelSpriteEffect(scene, {
      columns: 6,
      rows: 4,
      frameCount: 24,
      frameRate: 22,
      size: 2.2,
      textureUrl: "/gfx/Pixel%20VFX/Ice%20Spells%20Pixel%20VFX/Ice%20Spells/Frostball_Hit.png",
      emissiveColor: ICE_COLOR,
    });
    effect.setPosition(position);

    // Brief flash at impact
    const light = new PointLight(`staff-impact-light-${performance.now()}`, position.clone(), scene);
    light.diffuse   = ICE_COLOR;
    light.specular  = ICE_COLOR;
    light.intensity = 12.0;
    light.range     = 50;

    const duration = 24 / 22; // seconds to play all 24 frames at 22 fps
    impacts.push({ effect, light, elapsed: 0, duration });
  }

  function update(deltaTimeSeconds) {
    // ── Projectiles ──────────────────────────────────────────────────────────
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];

      if (p.type === "legacy") {
        const step = p.speed * deltaTimeSeconds;
        p.traveled += step;
        p.effect.update(deltaTimeSeconds, true);
        if (p.traveled >= p.distance) {
          p.effect.setPosition(p.target);
          p.effect.dispose();
          projectiles.splice(i, 1);
          if (p.onComplete) p.onComplete(p.target);
          continue;
        }
        p.effect.mesh.position.addInPlace(p.direction.scale(step));

      } else if (p.type === "bolt") {
        const step = p.speed * deltaTimeSeconds;
        p.traveled += step;
        p.effect.update(deltaTimeSeconds, true);
        p.effect.mesh.position.addInPlace(p.direction.scale(step));
        p.light.position.copyFrom(p.effect.mesh.position);

        if (p.traveled >= p.distance) {
          const arrivePos = p.effect.mesh.position.clone();
          p.effect.dispose();
          p.light.dispose();
          projectiles.splice(i, 1);
          if (p.onArrive) p.onArrive(arrivePos);
          continue;
        }
        p.light.intensity = 6.0 * (1 - (p.traveled / p.distance) * 0.5);

      } else if (p.type === "staffBolt") {
        const step = p.speed * deltaTimeSeconds;
        p.traveled += step;
        p.effect.update(deltaTimeSeconds, true);
        p.effect.mesh.position.addInPlace(p.direction.scale(step));
        p.light.position.copyFrom(p.effect.mesh.position);

        // Shimmer pulse
        p.pulsePhase += deltaTimeSeconds * 8;
        const pulse = 0.85 + 0.15 * Math.sin(p.pulsePhase);
        p.light.intensity = ICE_LIGHT_BASE * pulse;

        if (p.traveled >= p.distance) {
          const arrivePos = p.effect.mesh.position.clone();
          p.effect.dispose();
          p.light.dispose();
          projectiles.splice(i, 1);
          if (p.onArrive) p.onArrive(arrivePos);
          continue;
        }
      } else if (p.type === "sphere") {
        p.lifeRemaining -= deltaTimeSeconds;
        if (p.lifeRemaining <= 0) {
          const expirePos = p.mesh.position.clone();
          p.mesh.dispose();
          p.material.dispose();
          p.light?.dispose();
          projectiles.splice(i, 1);
          if (p.onExpire) p.onExpire(expirePos);
          continue;
        }

        if (p.gravity !== 0) {
          p.velocity.y -= p.gravity * deltaTimeSeconds;
        }

        const start = p.mesh.position.clone();
        const displacement = p.velocity.scale(deltaTimeSeconds);
        const distance = displacement.length();

        if (distance > 0.0001 && p.resolveHit) {
          const direction = displacement.scale(1 / distance);
          const hit = p.resolveHit(start, direction, distance);
          if (hit && hit.type !== "miss") {
            p.mesh.position.copyFrom(hit.position);
            p.light?.position.copyFrom(hit.position);
            p.mesh.dispose();
            p.material.dispose();
            p.light?.dispose();
            projectiles.splice(i, 1);
            if (p.onHit) p.onHit(hit);
            continue;
          }
        }

        p.mesh.position.addInPlace(displacement);
        p.light?.position.copyFrom(p.mesh.position);
      }
    }

    // ── Impact effects ───────────────────────────────────────────────────────
    for (let i = impacts.length - 1; i >= 0; i--) {
      const imp = impacts[i];
      imp.elapsed += deltaTimeSeconds;
      imp.effect.update(deltaTimeSeconds, false);
      // Fade the flash light out over the animation duration
      imp.light.intensity = 12.0 * Math.max(0, 1 - imp.elapsed / imp.duration);
      if (imp.elapsed >= imp.duration) {
        imp.effect.dispose();
        imp.light.dispose();
        impacts.splice(i, 1);
      }
    }
  }

  return {
    spawnProjectile,
    spawnBolt,
    spawnSphereProjectile,
    spawnStaffBolt,
    spawnStaffImpact,
    update,
  };
}

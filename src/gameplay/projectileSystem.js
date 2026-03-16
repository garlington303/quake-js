import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { Ray } from "@babylonjs/core/Culling/ray.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF";
import { createPixelSpriteEffect } from "./pixelSpriteEffect.js";

const DEFAULT_SPEED = 1400;
const GRENADE_GRAVITY = 800;
// World-space scale — native GLB is ~11 units tall; 0.40 gives ~4.5 Quake-unit grenade
const GRENADE_WORLD_SCALE = 0.40;
const MAX_BOUNCES = 4;

const DEFAULT_PROJECTILE_EFFECT = {
  frameCount: 24,
  frameRate: 24,
  size: 1.8,
  textureUrl: "/gfx/Pixel%20VFX/Fire%20Spells%20Pixel%20VFX/Fire%20Spells/Lavaball.png",
};

// ── Grenade GLB cache (loaded once, reused per throw) ─────────────────────────
let _grenadeBuffer = null;
async function _fetchGrenadeBuffer() {
  if (_grenadeBuffer) return _grenadeBuffer;
  try {
    const res = await fetch(window.location.origin + "/models/Items%20&%20Weapons/frag_grenade.glb");
    if (res.ok) _grenadeBuffer = await res.arrayBuffer();
  } catch (_) { /* fallback to sphere */ }
  return _grenadeBuffer;
}

async function _instantiateGrenadeModel(scene, origin) {
  const buf = await _fetchGrenadeBuffer();
  if (!buf) return null;
  try {
    const blob = new Blob([buf], { type: "model/gltf-binary" });
    const blobUrl = URL.createObjectURL(blob);
    const result = await SceneLoader.ImportMeshAsync("", "", blobUrl, scene, undefined, ".glb");
    URL.revokeObjectURL(blobUrl);

    const root = new TransformNode("grenade-world-prop", scene);
    root.scaling.setAll(GRENADE_WORLD_SCALE);
    root.position.copyFrom(origin);

    const meshSet = new Set(result.meshes);
    result.meshes
      .filter((m) => !m.parent || !meshSet.has(m.parent))
      .forEach((m) => { m.parent = root; });
    result.meshes.forEach((m) => {
      m.isPickable = false;
      m.renderingGroupId = 0;
    });

    return { root, meshes: result.meshes };
  } catch (_) {
    return null;
  }
}

export function createProjectileSystem(scene) {
  const projectiles = [];

  // Kick off grenade buffer preload immediately
  _fetchGrenadeBuffer();

  // Legacy target-based projectile (enemy AI use)
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

  // Visual magic bolt — travels to pre-computed target, triggers onArrive
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

  // Physics grenade — arc + bounce, GLB model loaded async
  function spawnGrenade(options) {
    const velocity = options.direction.clone().normalize().scale(options.throwSpeed ?? 320);
    velocity.y += options.upwardKick ?? 110;

    // Immediate sphere proxy (visible until GLB loads)
    const sphere = MeshBuilder.CreateSphere(`grenade-sphere-${performance.now()}`, { diameter: 4, segments: 8 }, scene);
    const mat = new StandardMaterial(`grenade-mat-${performance.now()}`, scene);
    mat.diffuseColor = new Color3(0.22, 0.28, 0.18);
    mat.specularColor = new Color3(0.45, 0.45, 0.35);
    mat.specularPower = 32;
    sphere.material = mat;
    sphere.position.copyFrom(options.origin);
    sphere.isPickable = false;

    // Pulsing fuse light — warm orange, speeds up as fuse burns down
    const fuseLight = new PointLight(`grenade-fuse-${performance.now()}`, options.origin.clone(), scene);
    fuseLight.diffuse = new Color3(1.0, 0.45, 0.05);
    fuseLight.specular = new Color3(1.0, 0.55, 0.0);
    fuseLight.intensity = 0;
    fuseLight.range = 24;

    const initialFuseTime = options.fuseTime ?? 2.4;

    const entry = {
      type: "grenade",
      sphere,
      fuseLight,
      modelRoot: null,   // set when GLB loads
      velocity,
      position: options.origin.clone(),
      rotation: new Vector3(0, 0, 0),
      fuseTimer: initialFuseTime,
      initialFuseTime,
      bounceCount: 0,
      exploded: false,
      onExplode: options.onExplode ?? null,
      onBounce:  options.onBounce  ?? null,
    };
    projectiles.push(entry);

    // Load GLB model, swap in when ready
    _instantiateGrenadeModel(scene, options.origin).then((model) => {
      if (!model) return;
      if (entry.exploded || !projectiles.includes(entry)) {
        // Already exploded — discard loaded model
        model.root.dispose();
        return;
      }
      entry.modelRoot = model.root;
      entry.sphere.isVisible = false;
      model.root.position.copyFrom(entry.position);
    });
  }

  function _disposeGrenade(entry) {
    entry.exploded = true;
    entry.sphere.dispose();
    entry.fuseLight?.dispose();
    entry.modelRoot?.dispose();
  }

  function update(deltaTimeSeconds) {
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

      } else if (p.type === "grenade") {
        // ── Gravity ─────────────────────────────────────────────────────────
        p.velocity.y -= GRENADE_GRAVITY * deltaTimeSeconds;
        const move = p.velocity.scale(deltaTimeSeconds);
        const moveLen = move.length();
        let bounced = false;

        // ── Collision / bounce ────────────────────────────────────────────
        if (moveLen > 0.01) {
          const ray = new Ray(p.position, move.clone().normalize(), moveLen + 2);
          const pick = scene.pickWithRay(ray, (m) => m.checkCollisions && m.name !== "player-collider");

          if (pick?.hit && pick.distance <= moveLen + 2) {
            if (p.bounceCount < MAX_BOUNCES) {
              const normal = pick.getNormal(true) ?? new Vector3(0, 1, 0);
              const dot = Vector3.Dot(p.velocity, normal);
              if (dot < 0) {
                // Reflect: v' = v - 2(v·n)n, with energy loss
                p.velocity.subtractInPlace(normal.scale(2 * dot));
                p.velocity.scaleInPlace(0.48);
                p.bounceCount++;
                bounced = true;
                // Snap to contact point + small normal offset to avoid re-penetration
                if (pick.pickedPoint) {
                  p.position.copyFrom(pick.pickedPoint).addInPlace(normal.scale(2));
                }
                if (p.onBounce) p.onBounce();
              }
            } else {
              // Max bounces reached — detonate
              p.fuseTimer = 0;
            }
          }
        }

        // ── Ground friction when rolling ──────────────────────────────────
        if (p.bounceCount >= 1) {
          const groundRay = new Ray(p.position, new Vector3(0, -1, 0), 4);
          const ground = scene.pickWithRay(groundRay, (m) => m.checkCollisions && m.name !== "player-collider");
          if (ground?.hit && ground.distance < 4) {
            const drag = 1 - deltaTimeSeconds * 2.5;
            p.velocity.x *= drag;
            p.velocity.z *= drag;
          }
        }

        // ── Fuse light pulse (orange strobe, accelerates toward 0) ────────
        if (p.fuseLight) {
          const fuseProgress = 1 - Math.max(0, p.fuseTimer / p.initialFuseTime);
          const pulseFreq = (2 + fuseProgress * 10) * Math.PI;
          const pulse = Math.max(0, Math.sin(performance.now() * 0.001 * pulseFreq));
          p.fuseLight.intensity = pulse * 3.8;
          p.fuseLight.position.copyFrom(p.position);
        }

        // ── Fuse countdown ────────────────────────────────────────────────
        p.fuseTimer -= deltaTimeSeconds;
        if (p.fuseTimer <= 0) {
          const explodePos = p.position.clone();
          _disposeGrenade(p);
          projectiles.splice(i, 1);
          if (p.onExplode) p.onExplode(explodePos);
          continue;
        }

        // ── Position update ───────────────────────────────────────────────
        if (!bounced) p.position.addInPlace(move);

        p.sphere.position.copyFrom(p.position);
        if (p.modelRoot) p.modelRoot.position.copyFrom(p.position);

        // ── Rolling rotation based on velocity ────────────────────────────
        const speed = p.velocity.length();
        if (speed > 5) {
          const velNorm = p.velocity.clone().normalize();
          const rollAxis = Vector3.Cross(velNorm, Vector3.Up());
          const rollLen = rollAxis.length();
          if (rollLen > 0.01) {
            rollAxis.scaleInPlace(1 / rollLen);
            const rollAngle = speed * 0.012 * deltaTimeSeconds;
            p.rotation.x += rollAxis.x * rollAngle;
            p.rotation.z += rollAxis.z * rollAngle;
          }
        }

        p.sphere.rotation.copyFrom(p.rotation);
        if (p.modelRoot) p.modelRoot.rotation.copyFrom(p.rotation);
      }
    }
  }

  return {
    spawnProjectile,
    spawnBolt,
    spawnGrenade,
    update,
  };
}

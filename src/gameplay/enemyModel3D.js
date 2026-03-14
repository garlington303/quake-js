/**
 * enemyModel3D.js
 * Loads a Quake GLB model (morph-target animated) and drives frame animation.
 *
 * GLB files are exported from Blender with every MDL frame as a shape key
 * (morph target).  Frame names follow Quake conventions, e.g.:
 *   stand1, stand2 … stand7   → idle loop
 *   run1, run2 … run8         → walk/run loop
 *   attak1 … attak8           → attack sequence (one-shot)
 *   death1 … death6           → death sequence (one-shot)
 *
 * We parse those names into named animation groups and expose a simple
 * playAnimation(name) / update(dt) interface.
 */

import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import "@babylonjs/loaders/glTF"; // register glTF loader

const FRAME_RATE = 10; // frames per second for morph animation

// Quake animation group prefix patterns (ordered, first match wins)
const ANIM_PREFIXES = [
  { name: "idle",   prefixes: ["stand", "idle"] },
  { name: "walk",   prefixes: ["run", "walk"] },
  { name: "attack", prefixes: ["attak", "attack", "shoot", "melee"] },
  { name: "pain",   prefixes: ["pain"] },
  { name: "death",  prefixes: ["deth", "death", "die"] },
  { name: "extra",  prefixes: [] }, // catch-all
];

function extractFrameNumber(frameName) {
  const match = frameName.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : null;
}

function groupFrames(morphTargetManager) {
  const grouped = {};
  for (const { name } of ANIM_PREFIXES) {
    grouped[name] = {};
  }

  const count = morphTargetManager.numTargets;
  for (let i = 0; i < count; i++) {
    const frameName = morphTargetManager.getTarget(i).name.toLowerCase();
    let matched = false;
    for (const { name, prefixes } of ANIM_PREFIXES) {
      if (!prefixes.length) continue;
      const prefix = prefixes.find((p) => frameName.startsWith(p));
      if (prefix) {
        const remainder = frameName.slice(prefix.length);
        const variant = remainder && /[a-z]/.test(remainder[0]) ? remainder[0] : "";
        grouped[name][variant] ??= [];
        grouped[name][variant].push({ index: i, name: frameName });
        matched = true;
        break;
      }
    }
    if (!matched) {
      grouped.extra[""] ??= [];
      grouped.extra[""].push({ index: i, name: frameName });
    }
  }

  const groups = {};
  for (const [name, variants] of Object.entries(grouped)) {
    const variantKeys = Object.keys(variants);
    if (!variantKeys.length) continue;
    const preferred = variantKeys.includes("") ? "" : variantKeys.sort((a, b) => {
      const aLen = variants[a]?.length ?? 0;
      const bLen = variants[b]?.length ?? 0;
      return bLen - aLen;
    })[0];
    const frames = variants[preferred];
    const sorted = frames
      .slice()
      .sort((a, b) => {
        const aNum = extractFrameNumber(a.name);
        const bNum = extractFrameNumber(b.name);
        if (aNum === null && bNum === null) return a.index - b.index;
        if (aNum === null) return 1;
        if (bNum === null) return -1;
        return aNum - bNum;
      })
      .map((entry) => entry.index);
    if (sorted.length) groups[name] = sorted;
  }

  return groups;
}

export async function loadEnemyModel(scene, modelUrl, position, options = {}) {
  const lastSlash = modelUrl.lastIndexOf("/");
  const rootUrl = modelUrl.substring(0, lastSlash + 1);
  const filename = modelUrl.substring(lastSlash + 1);

  console.log(`[enemyModel3D] loading ${modelUrl}`);
  const result = await SceneLoader.ImportMeshAsync("", rootUrl, filename, scene);
  console.log(`[enemyModel3D] loaded ${filename}: ${result.meshes.length} meshes`);
  result.meshes.forEach((m) => {
    console.log(`  mesh="${m.name}" morphTargetManager=${m.morphTargetManager ? m.morphTargetManager.numTargets + " targets" : "none"}`);
  });

  const meshes = result.meshes.filter((m) => m.morphTargetManager);
  if (!meshes.length) {
    // No morph targets — just return as static model
    const root = result.meshes[0];
    if (root) root.position.copyFrom(position);
    console.warn(`[enemyModel3D] ${filename} has no morph targets — static mesh only`);
    return {
      meshes: result.meshes,
      position: root?.position ?? position.clone(),
      setPosition(pos) { root?.position.copyFrom(pos); },
      playAnimation() {},
      update() {},
      dispose() { result.meshes.forEach((m) => m.dispose()); },
    };
  }

  const mainMesh = meshes[0];
  const mtm = mainMesh.morphTargetManager;
  const groups = groupFrames(mtm);

  // __root__ is the top-level container; position it so all children follow.
  // The MDL→GLB export maps Quake Z (up) to Blender Y (forward), which ends up
  // as Babylon Z after the glTF handedness conversion — models are sideways.
  // GLB-imported nodes have rotationQuaternion set, which silently overrides
  // the euler rotation property.  Set rotationQuaternion directly.
  // The MDL export maps Quake Z (up) → Blender Y (forward) → Babylon -Z,
  // so +90° around X brings Quake-up back to Babylon Y (actual up).
  const rootMesh = result.meshes.find((m) => m.name === "__root__") ?? result.meshes[0];
  // Stand upright (-90° X), then face forward along Z (-90° Y).
  // Quake models face +X; Babylon players look along ±Z, so a Y turn is needed.
  const upright = Quaternion.RotationAxis(Vector3.Right(), -Math.PI / 2);
  const faceForward = Quaternion.RotationAxis(Vector3.Up(), -Math.PI / 2);
  rootMesh.rotationQuaternion = faceForward.multiply(upright);
  result.meshes.forEach((m) => {
    m.isPickable = false;
    m.checkCollisions = false;
  });

  // Compute the ground offset: Quake MDL vertices extend below the entity origin
  // (typically -24 units).  Force a world-matrix update so the bounding box
  // reflects the rotation we just set, then lift rootMesh so its lowest point
  // sits at the requested floor Y.
  rootMesh.computeWorldMatrix(true);
  mainMesh.refreshBoundingInfo();
  const bbox = mainMesh.getBoundingInfo().boundingBox;
  const modelHeight = bbox.maximumWorld.y - bbox.minimumWorld.y;
  // Lift so the model's feet (not lowest stray verts) sit at floor Y.
  // Keep bias small to avoid sinking; allow an explicit lift for per-model tuning.
  const FOOT_BIAS_UNITS = 2; // ignore up to 2 world units of lowest verts
  const bias = Math.min(FOOT_BIAS_UNITS, modelHeight * 0.02);
  const footLift = Number.isFinite(options.footLift) ? options.footLift : 3;
  const groundOffset = -(bbox.minimumWorld.y + bias) + footLift;
  rootMesh.position.copyFrom(position);
  rootMesh.position.y += groundOffset;

  // State
  let currentGroup = groups.idle ?? groups[Object.keys(groups)[0]] ?? [];
  let frameIndex = 0;
  let frameAccum = 0;
  let looping = true;
  let done = false;

  function applyFrame(idx) {
    const count = mtm.numTargets;
    for (let i = 0; i < count; i++) {
      mtm.getTarget(i).influence = 0;
    }
    if (currentGroup.length > 0) {
      mtm.getTarget(currentGroup[idx]).influence = 1;
    }
  }

  applyFrame(0);

  function playAnimation(name, loop = true) {
    const g = groups[name];
    if (!g) return;
    currentGroup = g;
    frameIndex = 0;
    frameAccum = 0;
    looping = loop;
    done = false;
    applyFrame(0);
  }

  function update(deltaTime) {
    if (done || currentGroup.length === 0) return;
    frameAccum += deltaTime;
    const frameDuration = 1 / FRAME_RATE;
    while (frameAccum >= frameDuration) {
      frameAccum -= frameDuration;
      frameIndex++;
      if (frameIndex >= currentGroup.length) {
        if (looping) {
          frameIndex = 0;
        } else {
          frameIndex = currentGroup.length - 1;
          done = true;
          break;
        }
      }
    }
    applyFrame(frameIndex);
  }

  function setPosition(pos) {
    rootMesh.position.x = pos.x;
    rootMesh.position.y = pos.y + groundOffset;
    rootMesh.position.z = pos.z;
  }

  // yaw: angle in radians from +Z toward +X (atan2(dx, dz) toward the target).
  // Recomposes the rotationQuaternion so the model faces that direction while
  // keeping the upright correction intact.
  function setFacing(yaw) {
    const facing = Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2 + yaw);
    rootMesh.rotationQuaternion = facing.multiply(upright);
  }

  const HIT_COLOR = new Color3(1, 0.25, 0.25);

  function setHitFlash(active) {
    result.meshes.forEach((m) => {
      m.renderOverlay = active;
      if (active) {
        m.overlayColor = HIT_COLOR;
        m.overlayAlpha = 0.6;
      }
    });
  }

  function dispose() {
    result.meshes.forEach((m) => m.dispose());
  }

  return {
    meshes: result.meshes,
    position: mainMesh.position,
    getHitbox() {
      const width = bbox.maximumWorld.x - bbox.minimumWorld.x;
      const depth = bbox.maximumWorld.z - bbox.minimumWorld.z;
      const halfHeight = (bbox.maximumWorld.y - bbox.minimumWorld.y) / 2;
      const radius = Math.max(width, depth) / 2;
      return { halfHeight, radius };
    },
    setPosition,
    playAnimation,
    update,
    dispose,
    hasAnimation: (name) => Boolean(groups[name]),
    setFacing,
    setHitFlash,
  };
}

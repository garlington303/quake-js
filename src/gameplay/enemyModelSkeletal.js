/**
 * enemyModelSkeletal.js
 *
 * Loads a rigged / skeletal-animated enemy whose animations are spread across
 * multiple GLB files (e.g. Meshy AI exports: one file per clip).
 *
 * Each file contains the full mesh + skeleton + a single AnimationGroup.
 * We load them all up front, parent every mesh root to a shared TransformNode,
 * and show/hide the active slot while stopping all others.
 *
 * Public API matches loadEnemyModel() in enemyModel3D.js so enemySystem.js
 * can use both interchangeably.
 */

import { Color3 }        from "@babylonjs/core/Maths/math.color.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3 }       from "@babylonjs/core/Maths/math.vector.js";
import { SceneLoader }   from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF";

// ── helpers ───────────────────────────────────────────────────────────────────

function splitUrl(url) {
  const i = url.lastIndexOf("/");
  return {
    rootUrl:  url.substring(0, i + 1),
    filename: url.substring(i + 1),
  };
}

// ── main loader ───────────────────────────────────────────────────────────────

/**
 * @param {BABYLON.Scene} scene
 * @param {Record<string, string>} animUrls  e.g. { idle: "/…/base.glb", walk: "/…/walk.glb" }
 * @param {BABYLON.Vector3}        position  world foot position
 * @param {object}                 [options]
 * @param {number}                 [options.footLift=0]        extra Y lift so feet don't clip
 * @param {number}                 [options.facingOffset=0]    radians added to setFacing yaw
 * @param {number}                 [options.halfHeight=30]     hitbox half-height (Quake units)
 * @param {number}                 [options.radius=18]         hitbox radius
 * @param {number}                 [options.scale=1]           uniform scale override
 */
export async function loadEnemyModelSkeletal(scene, animUrls, position, options = {}) {
  const footLift     = options.footLift     ?? 0;
  const facingOffset = options.facingOffset ?? 0;
  const scale        = options.scale        ?? 1;

  // Shared pivot — every animation mesh is parented here.
  const root = new TransformNode("enemy-skel-root", scene);
  root.position.copyFrom(position);

  const slots = {};   // animName → { meshes, rootMesh, animGroup }

  // ── load one GLB slot ──────────────────────────────────────────────────────
  async function loadSlot(name, url) {
    const { rootUrl, filename } = splitUrl(url);
    let result;
    try {
      result = await SceneLoader.ImportMeshAsync("", rootUrl, filename, scene);
    } catch (err) {
      console.error(`[skeletal] Failed to load "${name}" from ${url}:`, err);
      return;
    }

    // Find the top-level glTF root node.
    const slotRoot = result.meshes.find((m) => m.name === "__root__") ?? result.meshes[0];
    if (!slotRoot) return;

    // Parent to our shared pivot and apply foot lift.
    slotRoot.parent = root;
    slotRoot.position.set(0, footLift, 0);

    // Uniform scale (e.g. if the Meshy export is metric but the scene is in Quake units).
    if (scale !== 1) slotRoot.scaling.setAll(scale);

    // Renderability settings — same group as the world geometry (0) so lighting works.
    result.meshes.forEach((m) => {
      m.isPickable      = false;
      m.checkCollisions = false;
      m.renderingGroupId = 0;
    });

    // Grab the first AnimationGroup that was imported with this mesh.
    const animGroup = result.animationGroups.length > 0 ? result.animationGroups[0] : null;
    animGroup?.stop();

    // Start hidden; the caller activates the default slot after all loads finish.
    slotRoot.setEnabled(false);

    slots[name] = { meshes: result.meshes, rootMesh: slotRoot, animGroup };
    console.log(`[skeletal] loaded slot "${name}" (${result.meshes.length} meshes, anim=${animGroup?.name ?? "none"})`);
  }

  // Load all slots in parallel for speed.
  await Promise.all(Object.entries(animUrls).map(([name, url]) => loadSlot(name, url)));

  if (Object.keys(slots).length === 0) {
    console.error("[skeletal] No slots loaded — returning stub model.");
    root.dispose();
    return null;
  }

  // ── auto-scale to match halfHeight ─────────────────────────────────────────
  // Meshy AI exports in metres; Quake units are ~32/foot.
  // We measure the loaded mesh and scale so total height == halfHeight * 2.
  const targetHalfH = options.halfHeight ?? 30;
  {
    const refSlot = slots.idle ?? slots.walk ?? Object.values(slots)[0];
    if (refSlot) {
      // Temporarily enable so bounding-box math works.
      refSlot.rootMesh.setEnabled(true);
      const bounds = refSlot.rootMesh.getHierarchyBoundingVectors(true);
      const meshH  = bounds.max.y - bounds.min.y;
      if (meshH > 0.01) {
        const autoScale = (targetHalfH * 2) / meshH;
        root.scaling.setAll(autoScale);
        // Align feet: bounds.min.y (mesh-space floor) after scale sits at
        // root.position.y + bounds.min.y * autoScale; shift up to land on root.position.y.
        root.position.y -= bounds.min.y * autoScale;
        console.log(`[skeletal] auto-scale=${autoScale.toFixed(2)}  meshH=${meshH.toFixed(3)}  target=${targetHalfH * 2}`);
      }
      refSlot.rootMesh.setEnabled(false);
    }
  }

  // ── state ──────────────────────────────────────────────────────────────────
  let currentSlotName = null;
  let looping         = true;
  let done            = false;
  let doneObserver    = null;  // stored so we can remove it if needed

  // ── activate helper ────────────────────────────────────────────────────────
  function activateSlot(name) {
    const target = slots[name];
    if (!target) {
      console.warn(`[skeletal] Unknown animation slot "${name}"`);
      return null;
    }
    // Tear down all other slots.
    for (const [k, slot] of Object.entries(slots)) {
      if (k !== name) {
        slot.rootMesh.setEnabled(false);
        slot.animGroup?.stop();
      }
    }
    target.rootMesh.setEnabled(true);
    return target;
  }

  // Start with idle (or the first available slot).
  const defaultName = slots.idle ? "idle"
                    : slots.walk ? "walk"
                    : Object.keys(slots)[0];
  if (defaultName) {
    const defSlot = activateSlot(defaultName);
    defSlot?.animGroup?.start(true);
    currentSlotName = defaultName;
  }

  // ── hit flash ─────────────────────────────────────────────────────────────
  const HIT_COLOR = new Color3(1, 0.25, 0.25);

  function setHitFlash(active) {
    const slot = slots[currentSlotName];
    if (!slot) return;
    slot.meshes.forEach((m) => {
      m.renderOverlay = active;
      if (active) {
        m.overlayColor = HIT_COLOR;
        m.overlayAlpha = 0.6;
      }
    });
  }

  // ── public API ─────────────────────────────────────────────────────────────

  function playAnimation(name, loop = true, _rateOverride = null) {
    const slot = activateSlot(name);
    if (!slot) return;

    currentSlotName = name;
    looping         = loop;
    done            = false;

    // Remove any leftover end-observer from a previous one-shot.
    if (doneObserver) {
      const prev = slots[currentSlotName]?.animGroup;
      prev?.onAnimationGroupEndObservable.remove(doneObserver);
      doneObserver = null;
    }

    if (slot.animGroup) {
      slot.animGroup.loopAnimation = loop;
      slot.animGroup.reset();
      slot.animGroup.play(loop);

      if (!loop) {
        doneObserver = slot.animGroup.onAnimationGroupEndObservable.addOnce(() => {
          done = true;
          doneObserver = null;
        });
      }
    } else if (!loop) {
      // No animation group — treat it as instantly done so the state machine moves on.
      done = true;
    }
  }

  // Skeletal animations can't easily be reversed; just play the forward clip.
  function playAnimationReverse(name, loop = false, rateOverride = null) {
    playAnimation(name, loop, rateOverride);
  }

  function setPosition(pos) {
    root.position.x = pos.x;
    root.position.y = pos.y;
    root.position.z = pos.z;
  }

  // yaw = atan2(toPlayer.x, toPlayer.z) → 0 = facing +Z.
  // facingOffset lets per-model GLBs compensate for their default export direction.
  function setFacing(yaw) {
    root.rotation.y = yaw + facingOffset;
  }

  function dispose() {
    for (const slot of Object.values(slots)) {
      slot.animGroup?.dispose();
      slot.meshes.forEach((m) => m.dispose());
    }
    root.dispose();
  }

  function getHitbox() {
    return {
      halfHeight: options.halfHeight ?? 30,
      radius:     options.radius     ?? 18,
    };
  }

  return {
    playAnimation,
    playAnimationReverse,
    isDone:        () => done,
    // update() — AnimationGroups are ticked by the scene automatically;
    // we just need the hook so enemySystem.js can call it.
    update(_dt) {},
    setPosition,
    setFacing,
    setHitFlash,
    dispose,
    hasAnimation:  (name) => Boolean(slots[name]),
    getHitbox,
  };
}

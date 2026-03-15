/**
 * propSystem.js
 *
 * Spawns prop_static entities from a parsed map.
 *
 * The `model` property set in TrenchBroom can be:
 *   - An MDL path (relative to pak-extracted/):  "progs/custom/ammo_box_1.mdl"
 *   - A GLB path (relative to public/):          "models/Items & Weapons/ammo_box_1.glb"
 *
 * Resolution order when given an MDL path:
 *   1. Strip extension, extract stem  ("ammo_box_1")
 *   2. Try "/models/Items & Weapons/{stem}.glb"
 *   3. Try "/models/enemies/{stem}.glb"
 *   4. Try "/models/{stem}.glb"
 *   5. Skip and log a warning
 *
 * When given a path that already ends in .glb the URL is used as-is,
 * prefixed with "/" if needed.
 *
 * The Quake → Babylon coordinate transform mirrors brushBuilder:
 *   babylon.x = quake.x   (East)
 *   babylon.y = quake.z   (Up)
 *   babylon.z = quake.y   (South)  [Quake Y is South, Babylon Z is South]
 *
 * Quake `angle` is yaw measured clockwise from North (+Y in Quake space),
 * which corresponds to Babylon's rotation.y in radians.
 */

import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import "@babylonjs/loaders/glTF"; // ensure glTF loader is registered

// Directories (relative to public root) searched in order for GLB files.
const GLB_SEARCH_DIRS = [
  "models/Items & Weapons",
  "models/enemies",
  "models",
];

// Default scale to bring meter-based GLB assets into Quake-ish units.
// Can be overridden per-entity via `scale` in the .map.
const DEFAULT_PROP_SCALE = 32.0;

/**
 * Derive a list of GLB URLs to try for the given model property value.
 * @param {string} modelProp  e.g. "progs/custom/ammo_box_1.mdl" or "models/foo.glb"
 * @returns {string[]}  ordered list of candidate URLs
 */
function resolveGlbCandidates(modelProp) {
  if (!modelProp) return [];

  const normalized = modelProp.replace(/\\/g, "/");

  // If it already points to a .glb use it directly
  if (normalized.toLowerCase().endsWith(".glb")) {
    const url = normalized.startsWith("/") ? normalized : `/${normalized}`;
    return [url];
  }

  // Extract bare filename stem (no extension, no directory)
  const stem = normalized.split("/").pop().replace(/\.[^.]+$/, "");
  if (!stem) return [];

  return GLB_SEARCH_DIRS.map((dir) => `/${dir}/${stem}.glb`);
}

/**
 * Attempt to load a GLB from the first URL that responds with a 200.
 * Returns null if none succeed.
 * @param {string[]} candidates
 * @returns {Promise<string|null>}
 */
async function findGlbUrl(candidates) {
  for (const url of candidates) {
    try {
      // HEAD request to check existence without downloading the full file
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) return url;
    } catch {
      // network error → try next
    }
  }
  return null;
}

/**
 * Parse the `origin` property ("x y z" in Quake space) to a Babylon Vector3.
 */
function parseOrigin(originText) {
  if (!originText) return null;
  const [x = 0, y = 0, z = 0] = originText.split(/\s+/).map(Number);
  // Quake x→Babylon x, Quake y→Babylon z, Quake z→Babylon y
  return new Vector3(x, z, y);
}

/**
 * Parse the `angles` property ("pitch yaw roll" in Quake space).
 * Returns [pitchRad, yawRad, rollRad] in Babylon convention.
 */
function parseAngles(anglesText) {
  if (!anglesText) return null;
  const parts = anglesText.split(/\s+/).map(Number);
  const pitch = (parts[0] ?? 0) * (Math.PI / 180);
  const yaw   = (parts[1] ?? 0) * (Math.PI / 180);
  const roll  = (parts[2] ?? 0) * (Math.PI / 180);
  return { pitch, yaw, roll };
}

/**
 * Create and wire up the prop system.
 *
 * @param {import("@babylonjs/core").Scene} scene
 * @returns {{ spawnProps: (entities: object[]) => Promise<number>, dispose: () => void }}
 */
export function createPropSystem(scene) {
  const spawnedMeshes = [];

  /**
   * Spawn all prop_static entities found in the entity list.
   * @param {object[]} entities  parsed map entities
   * @returns {Promise<number>}  count of successfully spawned props
   */
  async function spawnProps(entities) {
    const props = entities.filter(
      (e) => e.classname === "prop_static" || e.classname.startsWith("prop_"),
    );
    if (!props.length) return 0;

    let spawned = 0;

    for (const entity of props) {
      const { properties } = entity;
      // Explicit model property takes priority; otherwise derive from classname
      let modelProp = properties.model ?? properties.model_path ?? "";
      if (!modelProp && entity.classname.startsWith("prop_")) {
        // e.g. "prop_bedside_table_1" → stem "bedside_table_1"
        const stem = entity.classname.slice("prop_".length);
        if (stem) {
          modelProp = stem;  // bare stem, no extension — triggers directory search
        }
      }
      if (!modelProp) {
        console.warn("[propSystem] prop entity has no model and classname cannot be resolved", entity);
        continue;
      }

      const candidates = resolveGlbCandidates(modelProp);
      // eslint-disable-next-line no-await-in-loop
      const glbUrl = await findGlbUrl(candidates);

      if (!glbUrl) {
        console.warn(
          `[propSystem] Could not find GLB for model "${modelProp}". Tried:`,
          candidates,
        );
        continue;
      }

      // Quake origin → Babylon position
      const position = parseOrigin(properties.origin) ?? Vector3.Zero();

      // Rotation: prefer `angles` (pitch yaw roll), fall back to `angle` (yaw only)
      let pitch = 0, yaw = 0, roll = 0;
      if (properties.angles) {
        const parsed = parseAngles(properties.angles);
        if (parsed) ({ pitch, yaw, roll } = parsed);
      } else {
        yaw = Number(properties.angle ?? 0) * (Math.PI / 180);
      }

      const userScale = Number(properties.scale ?? 1.0);
      const scale = userScale * DEFAULT_PROP_SCALE;

      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await SceneLoader.ImportMeshAsync("", glbUrl, "", scene);
        const rootMeshes = result.meshes;

        rootMeshes.forEach((mesh) => {
          if (mesh.parent) return; // only move root nodes

          mesh.position.copyFrom(position);
          mesh.rotation.set(pitch, yaw, roll);
          if (scale !== 1.0) {
            mesh.scaling.setAll(scale);
          }
        });

        spawnedMeshes.push(...rootMeshes);
        spawned += 1;
      } catch (err) {
        console.warn(`[propSystem] Failed to load GLB from ${glbUrl}:`, err);
      }
    }

    return spawned;
  }

  function dispose() {
    spawnedMeshes.forEach((mesh) => {
      try { mesh.dispose(); } catch { /* already disposed */ }
    });
    spawnedMeshes.length = 0;
  }

  return { spawnProps, dispose };
}

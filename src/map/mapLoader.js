import { Color3, PointLight, Vector3 } from "@babylonjs/core";
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT } from "../player/playerConstants.js";
import { buildBrushMeshes } from "./brushBuilder.js";
import { parseMap } from "./mapParser.js";
import { createWadTextureProvider, loadWad } from "./wadLoader.js";

function parseWadList(worldspawn) {
  const wadValue = worldspawn?.properties?.wad ?? "";
  return wadValue
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeWadUrl(entry) {
  if (entry.startsWith("http://") || entry.startsWith("https://") || entry.startsWith("/")) {
    return entry;
  }

  const baseName = entry.split(/[\\/]/).pop();
  return `/wads/${baseName}`;
}

async function loadQuakePalette() {
  try {
    const response = await fetch("/gfx/palette.lmp");
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 768) return null;
    return bytes.slice(0, 768); // 256 × RGB
  } catch {
    return null;
  }
}

async function loadWadTextures(scene, wadEntries = []) {
  if (!wadEntries.length) {
    return null;
  }

  const defaultPalette = await loadQuakePalette();
  const wadDatas = [];

  for (const entry of wadEntries) {
    const url = normalizeWadUrl(entry);
    try {
      // eslint-disable-next-line no-await-in-loop
      const wad = await loadWad(url, { defaultPalette });
      wadDatas.push(wad);
    } catch (error) {
      console.warn(`Failed to load WAD ${url}`, error);
    }
  }

  if (!wadDatas.length) {
    return null;
  }

  const mergedTextures = new Map();
  wadDatas.forEach((wad) => {
    wad.textures.forEach((value, key) => {
      if (!mergedTextures.has(key)) {
        mergedTextures.set(key, value);
      }
    });
  });

  return {
    provider: createWadTextureProvider(scene, { textures: mergedTextures }),
    wadCount: wadDatas.length,
  };
}

function parseOrigin(originText) {
  if (!originText) {
    return null;
  }

  const [x = 0, y = 0, z = 0] = originText.split(/\s+/).map(Number);
  return new Vector3(x, z, y);
}

function computeEntityCenter(entity) {
  if (!entity?.brushes?.length) {
    return null;
  }

  const bounds = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };

  entity.brushes.forEach((brush) => {
    brush.faces.forEach((face) => {
      face.points.forEach((point) => {
        bounds.min.x = Math.min(bounds.min.x, point.x);
        bounds.min.y = Math.min(bounds.min.y, point.y);
        bounds.min.z = Math.min(bounds.min.z, point.z);
        bounds.max.x = Math.max(bounds.max.x, point.x);
        bounds.max.y = Math.max(bounds.max.y, point.y);
        bounds.max.z = Math.max(bounds.max.z, point.z);
      });
    });
  });

  if (!Number.isFinite(bounds.min.x)) {
    return null;
  }

  const center = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };

  return new Vector3(center.x, center.z, center.y);
}

function getEntityPosition(entity) {
  return parseOrigin(entity.properties.origin) ?? computeEntityCenter(entity);
}

function applyPlayerSpawn(camera, playerCollider, entities) {
  if (!camera) {
    return;
  }

  const spawnEntity = entities.find(
    (entity) => entity.classname === "info_player_start" || entity.classname === "player_start"
  );

  if (!spawnEntity) {
    return;
  }

  const spawnPosition = parseOrigin(spawnEntity.properties.origin);

  if (spawnPosition) {
    camera.position.copyFrom(spawnPosition);
    if (playerCollider) {
      const eyeOffset = PLAYER_EYE_HEIGHT - PLAYER_HEIGHT / 2;
      playerCollider.position.copyFrom(spawnPosition);
      playerCollider.position.y -= eyeOffset;
    }
  }

  const yawDegrees = Number(spawnEntity.properties.angle ?? 0);
  camera.rotation.y = (yawDegrees * Math.PI) / 180;
}

function parseLightColor(entity) {
  const colorText = entity.properties._color ?? entity.properties.color ?? null;
  if (!colorText) return null;
  const parts = colorText.split(/\s+/).map(Number).filter((v) => Number.isFinite(v));
  if (parts.length < 3) return null;
  const [r, g, b] = parts;
  const scale = r > 1 || g > 1 || b > 1 ? 1 / 255 : 1;
  return new Color3(r * scale, g * scale, b * scale);
}

function parseLightIntensity(entity) {
  const raw = Number(entity.properties.intensity ?? entity.properties.light ?? entity.properties._light);
  if (!Number.isFinite(raw)) return null;
  return raw;
}

function parseLightRadius(entity) {
  const raw = Number(entity.properties.radius ?? entity.properties.range);
  if (!Number.isFinite(raw)) return null;
  return raw;
}

function computeLightIntensity(raw) {
  if (raw <= 0) return 0.1;
  if (raw <= 10) return raw * 18;
  if (raw <= 50) return raw * 6;
  return (raw / 100) * 10;
}

function applyLights(scene, entities) {
  let count = 0;
  entities
    .filter((entity) => entity.classname === "light" || entity.classname?.startsWith("light_"))
    .forEach((entity, index) => {
      const position = parseOrigin(entity.properties.origin) ?? new Vector3(0, 8, 0);
      const light = new PointLight(`map-light-${index}`, position, scene);
      const rawIntensity = parseLightIntensity(entity);
      const intensity = rawIntensity != null ? computeLightIntensity(rawIntensity) : 1.6;
      light.intensity = intensity;
      const color = parseLightColor(entity);
      if (color) {
        light.diffuse = color;
        light.specular = color;
      }
      const radius = parseLightRadius(entity);
      if (radius != null) {
        light.range = Math.max(6, radius * 9);
      } else if (rawIntensity != null) {
        light.range = Math.max(12, rawIntensity * 12);
      }
      count += 1;
    });
  return count;
}

// Maps Quake standard monster classnames to our internal enemy type keys
const QUAKE_MONSTER_TYPE_MAP = {
  monster_soldier:        "soldier",
  monster_dog:            "dog",
  monster_ogre:           "ogre",
  monster_ogre_marksman:  "ogre",
  monster_knight:         "knight",
  monster_hell_knight:    "hell_knight",
  monster_zombie:         "zombie",
  monster_wizard:         "wizard",
  monster_demon1:         "fiend",
  monster_shambler:       "shambler",
  monster_shalrath:       "shalrath",
  monster_tarbaby:        "tarbaby",
  monster_fish:           "fish",
  monster_boss:           "shambler", // fallback for Chthon
};

function resolveEnemyType(entity) {
  if (entity.classname === "enemy_spawn") {
    return entity.properties.type ?? null;
  }
  return QUAKE_MONSTER_TYPE_MAP[entity.classname] ?? null;
}

function applyEnemies(enemySystem, entities) {
  if (!enemySystem) {
    return [];
  }

  return entities
    .filter((entity) => entity.classname === "enemy_spawn" || entity.classname in QUAKE_MONSTER_TYPE_MAP)
    .map((entity, index) => {
      const position = getEntityPosition(entity) ?? new Vector3(0, 48, 0);
      const type = resolveEnemyType(entity);

      if (!type) return null;

      return enemySystem.spawnEnemy({
        id: entity.properties.targetname ?? `enemy-${index}`,
        position,
        type,
      });
    })
    .filter(Boolean);
}

// Maps Quake standard item classnames to our internal classnames
const QUAKE_ITEM_REMAP = {
  item_shells:        "item_ammo_shells",
  item_spikes:        "item_ammo_nails",
  item_rockets:       "item_ammo_rockets",
  item_cells:         "item_ammo_cells",
  item_health_small:  "item_health",
  item_health_large:  "item_health",
  item_health_mega:   "item_health",
  item_armor1:        "item_armor",
  item_armor2:        "item_armor",
  item_armorInv:      "item_armor",
  weapon_supernailgun:    "weapon_nailgun",
  weapon_grenadelauncher: "weapon_rocketlauncher",
};

const PICKUP_CLASSNAMES = new Set([
  "item_health",
  "item_armor",
  "item_ammo_shells",
  "item_ammo_nails",
  "item_ammo_rockets",
  "item_ammo_cells",
  "weapon_shotgun",
  "weapon_supershotgun",
  "weapon_nailgun",
  "weapon_rocketlauncher",
  "weapon_lightning",
  ...Object.keys(QUAKE_ITEM_REMAP),
]);

function applyPickups(itemSystem, entities) {
  if (!itemSystem) {
    return 0;
  }

  let count = 0;

  for (const entity of entities) {
    if (!PICKUP_CLASSNAMES.has(entity.classname)) continue;

    const position = getEntityPosition(entity);
    if (!position) continue;

    const classname = QUAKE_ITEM_REMAP[entity.classname] ?? entity.classname;
    const result = itemSystem.spawnPickup({
      classname,
      position,
      properties: entity.properties,
    });

    if (result) count += 1;
  }

  return count;
}

export async function loadMap(scene, options = {}) {
  const {
    camera = null,
    debug = null,
    enemySystem = null,
    itemSystem = null,
    playerCollider = null,
    url = "/maps/test.map",
  } = options;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch map from ${url}: ${response.status} ${response.statusText}`);
  }

  const mapText = await response.text();
  const mapData = parseMap(mapText);
  const wadEntries = parseWadList(mapData.worldspawn);
  const wadResult = await loadWadTextures(scene, wadEntries);
  const mapGeometry = buildBrushMeshes(scene, mapData, {
    debug,
    textureProvider: wadResult?.provider ?? null,
  });
  const spawnedEnemies = applyEnemies(enemySystem, mapData.entities);
  const pickupCount = applyPickups(itemSystem, mapData.entities);

  scene.metadata ??= {};
  scene.metadata.mapDebug = mapGeometry.debugInfo;
  scene.metadata.mapStats = {
    debugEnabled: Boolean(debug?.enabled),
    enemyCount: spawnedEnemies.length,
    entityCount: mapData.entities.length,
    meshCount: mapGeometry.meshes.length,
    pickupCount,
    skippedBrushCount: mapGeometry.debugInfo?.skippedBrushCount ?? 0,
    url,
    wadCount: wadResult?.wadCount ?? 0,
  };

  if (debug?.enabled && mapGeometry.debugInfo) {
    const summary = {
      collisionTriangleCount: mapGeometry.debugInfo.collisionTriangleCount,
      renderedBrushCount: mapGeometry.debugInfo.renderedBrushCount,
      showCollisionMesh: mapGeometry.debugInfo.showCollisionMesh,
      skippedBrushCount: mapGeometry.debugInfo.skippedBrushCount,
      worldspawnBrushCount: mapGeometry.debugInfo.worldspawnBrushCount,
    };
    console.groupCollapsed("[map-debug] brush summary");
    console.table(summary);

    const skipped = mapGeometry.debugInfo.entries.filter((entry) => entry.status === "skipped");
    if (skipped.length) {
      console.warn("[map-debug] skipped brushes", skipped);
    }

    console.log("[map-debug] all brush entries", mapGeometry.debugInfo.entries);
    console.groupEnd();
  }

  applyPlayerSpawn(camera, playerCollider, mapData.entities);
  const lightCount = applyLights(scene, mapData.entities);
  scene.metadata.mapStats.lightCount = lightCount;

  return {
    mapData,
    mapGeometry,
    mapText,
  };
}

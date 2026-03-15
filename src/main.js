import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Engine } from "@babylonjs/core/Engines/engine";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createEnemySystem } from "./gameplay/enemySystem.js";
import { createItemSystem } from "./gameplay/itemSystem.js";
import { createImpactSystem } from "./gameplay/impactSystem.js";
import { loadMap } from "./map/mapLoader.js";
import { setupCamera } from "./engine/camera.js";
import { attachInput } from "./engine/input.js";
import { createFallbackEnvironment, createScene } from "./engine/scene.js";
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT, PLAYER_RADIUS } from "./player/playerConstants.js";
import { createPlayerController } from "./player/playerController.js";
import { createViewModel } from "./player/viewModel.js";
import { createAudioSystem } from "./engine/audioSystem.js";
import { createHud } from "./ui/hud.js";
import { applyRetroPipeline } from "./engine/retroPipeline.js";
import { createLightSystem } from "./engine/lightSystem.js";
import { createFlashlight } from "./player/flashlight.js";

function parseFlag(value) {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

function inspectForwardHit(scene, camera, maxDistance = 512) {
  const pick = scene.pickWithRay(camera.getForwardRay(maxDistance), () => true);

  if (!pick?.hit) {
    const result = { hit: false, maxDistance };
    console.log("[map-debug] forward inspect", result);
    return result;
  }

  const result = {
    distance: pick.distance,
    hit: true,
    meshName: pick.pickedMesh?.name ?? null,
    metadata: pick.pickedMesh?.metadata ?? null,
    point: pick.pickedPoint
      ? {
          x: pick.pickedPoint.x,
          y: pick.pickedPoint.y,
          z: pick.pickedPoint.z,
        }
      : null,
  };

  console.log("[map-debug] forward inspect", result);
  return result;
}

const canvas = document.getElementById("renderCanvas");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Expected #renderCanvas to be a canvas element.");
}

const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
});

const scene = createScene(engine, canvas);
const camera = setupCamera(scene, canvas);
const input = attachInput(canvas);
const playerCollider = MeshBuilder.CreateBox(
  "player-collider",
  {
    width: PLAYER_RADIUS * 2,
    height: PLAYER_HEIGHT,
    depth: PLAYER_RADIUS * 2,
  },
  scene,
);
playerCollider.isPickable = false;
playerCollider.isVisible = false;
playerCollider.checkCollisions = false;
playerCollider.ellipsoid = new Vector3(PLAYER_RADIUS, PLAYER_HEIGHT / 2, PLAYER_RADIUS);
playerCollider.ellipsoidOffset = new Vector3(0, 0, 0);
playerCollider.position.copyFrom(camera.position);
playerCollider.position.y -= PLAYER_EYE_HEIGHT - PLAYER_HEIGHT / 2;

const playerController = createPlayerController(scene, camera, input, playerCollider);
const enemySystem = createEnemySystem(scene);
const itemSystem = createItemSystem(scene);
const viewModel = createViewModel(scene, camera);
const impactSystem = createImpactSystem(scene);
const hud = createHud();
const audio = createAudioSystem();
const lightSystem = createLightSystem(scene);
const flashlight = createFlashlight(scene, camera);
const queryParams = new URLSearchParams(window.location.search);
const debugMapEnabled = parseFlag(queryParams.get("debugMap"));
const debugCollisionExplicit = queryParams.has("debugCollision");
const retroEnabled = !queryParams.has("retro") || parseFlag(queryParams.get("retro"));
const lightsEnabled = !queryParams.has("fx") || parseFlag(queryParams.get("fx"));
const mapDebugOptions = {
  enabled: debugMapEnabled,
  showCollisionMesh: debugCollisionExplicit ? parseFlag(queryParams.get("debugCollision")) : debugMapEnabled,
};

if (retroEnabled) {
  applyRetroPipeline(scene, camera, {
    scanlineIntensity: 0.24,
    noiseIntensity: 0.035,
    vignette: 0,
    curvature: 0,
    ditherScale: 1.0,
  });
}

canvas.addEventListener("click", () => {
  audio.resume();
});

// Shotgun fire rate — deliberate one shot per ~0.85 s
const FIRE_COOLDOWN = 0.85;

let playerHealth = 100;
let playerArmor = 0;
let ammoShells = 25;
let lastEnemyAttackAt = 0;
let shotsFired = 0;
let kills = 0;
let fireCooldownTimer = 0;
let mapStatusText = "Loading map...";
const GOD_MODE = true;

// Death / respawn state
const RESPAWN_DELAY = 3.0;
let isDead = false;
let deathTimer = 0;
let playerSpawnPosition = camera.position.clone();
let playerSpawnYaw = camera.rotation.y;

window.__trenchfps = {
  camera,
  debug: {
    map: mapDebugOptions,
  },
  enemySystem,
  engine,
  input,
  playerCollider,
  scene,
};

try {
  const mapResult = await loadMap(scene, {
    camera,
    debug: mapDebugOptions,
    enemySystem,
    itemSystem,
    playerCollider,
    url: "/maps/test.map",
  });
  const meshCount = mapResult?.mapGeometry?.meshes?.length ?? 0;
  window.__trenchfps.mapDebug = mapResult?.mapGeometry?.debugInfo ?? null;
  window.__trenchfps.mapGeometry = mapResult?.mapGeometry ?? null;
  window.__trenchfps.inspectForward = (maxDistance = 512) => inspectForwardHit(scene, camera, maxDistance);
  window.__trenchfps.playerColliderState = () => ({
    checkCollisions: playerCollider.checkCollisions,
    ellipsoid: playerCollider.ellipsoid?.clone?.() ?? playerCollider.ellipsoid,
    position: playerCollider.position.clone(),
  });
  window.__trenchfps.setCollisionDebugVisible = (visible) => {
    const collisionMesh = mapResult?.mapGeometry?.collisionMesh;
    if (!collisionMesh) {
      return false;
    }

    collisionMesh.visibility = visible ? 1 : 0;
    mapDebugOptions.showCollisionMesh = visible;
    return true;
  };
  // Use spawn data returned from the map loader.
  if (mapResult.spawnPosition) {
    playerSpawnPosition = mapResult.spawnPosition.clone();
  } else {
    playerSpawnPosition = camera.position.clone();
  }
  playerSpawnYaw = mapResult.spawnYaw ?? camera.rotation.y;
  // Flush controller internal state (velocity, smoothing) to the spawn position.
  playerController.reset(playerSpawnPosition);

  if (meshCount === 0) {
    mapStatusText = "Map loaded but empty; using fallback scene.";
    createFallbackEnvironment(scene);
  } else {
    const skippedBrushCount = mapResult?.mapGeometry?.debugInfo?.skippedBrushCount ?? 0;
    const debugSuffix = mapDebugOptions.enabled
      ? ` debug on${mapDebugOptions.showCollisionMesh ? ", collision visible" : ""}, skipped ${skippedBrushCount}.`
      : ".";
    mapStatusText = `Map loaded (${meshCount} meshes)${debugSuffix}`;
  }
  setTimeout(() => { mapStatusText = null; }, 3000);
} catch (error) {
  console.error("Failed to load map, falling back to debug scene.", error);
  mapStatusText = "Map load failed; using fallback scene.";
  createFallbackEnvironment(scene);
  setTimeout(() => { mapStatusText = null; }, 5000);
}

engine.runRenderLoop(() => {
  const deltaTimeSeconds = engine.getDeltaTime() / 1000;

  // ── Death / respawn ────────────────────────────────────────────────────────
  if (isDead) {
    deathTimer -= deltaTimeSeconds;
    if (deathTimer <= 0) {
      isDead = false;
      playerHealth = 100;
      playerArmor = 0;
      ammoShells = 25;
      camera.rotation.y = playerSpawnYaw;
      playerController.reset(playerSpawnPosition);
      hud.hideDeath();
    }
    hud.update(deltaTimeSeconds, {
      health: 0, armor: playerArmor, ammoText: "0",
      enemies: scene.metadata?.enemyCount ?? 0,
      pointerLocked: input.state.pointerLocked,
      shotsFired, kills, statusText: mapStatusText,
    });
    scene.render();
    return;
  }

  playerController.update(deltaTimeSeconds);
  audio.update(deltaTimeSeconds, scene.metadata?.player ?? {});

  if (input.consumeFlashlightToggle()) {
    const flashlightOn = flashlight.toggle();
    viewModel.root.setEnabled(!flashlightOn);
  }

  // ── Weapon fire ───────────────────────────────────────────────────────────
  fireCooldownTimer = Math.max(0, fireCooldownTimer - deltaTimeSeconds);
  const wantsFire = input.consumePrimaryFire();

  if (wantsFire && fireCooldownTimer === 0 && ammoShells > 0 && !flashlight.isOn) {
    fireCooldownTimer = FIRE_COOLDOWN;
    ammoShells -= 1;

    const hit = enemySystem.handlePrimaryFire(camera);
    shotsFired += 1;
    audio.playShoot();
    if (lightsEnabled) lightSystem.spawnMuzzleFlash(camera);

    if (hit?.type === "enemy") {
      hud.notifyHit();
      audio.playHit();
      if (hit.enemyDown) kills += 1;
    }

    if (hit?.type === "world" || hit?.type === "enemy") {
      const impactColor = hit?.type === "enemy"
        ? new Color3(1, 0.35, 0.35)
        : new Color3(1, 0.72, 0.35);
      impactSystem.spawnImpact(hit.position, { color: impactColor });
      if (lightsEnabled) lightSystem.spawnImpactLight(hit.position, hit?.type === "enemy");
    }

    viewModel.fire();
  }

  viewModel.update(deltaTimeSeconds);
  flashlight.update(deltaTimeSeconds);
  impactSystem.update(deltaTimeSeconds);
  if (lightsEnabled) lightSystem.update(deltaTimeSeconds);

  // ── Item pickups ──────────────────────────────────────────────────────────
  const collectedItems = itemSystem.update(deltaTimeSeconds, camera.position);
  for (const item of collectedItems) {
    if (item.health)      playerHealth = Math.min(100, playerHealth + item.health);
    if (item.armor)       playerArmor  = Math.min(200, playerArmor  + item.armor);
    if (item.ammo_shells) ammoShells  += item.ammo_shells;
    audio.playPickup();
  }

  // ── Enemy damage with armor absorption ───────────────────────────────────
  if (!GOD_MODE && scene.metadata?.lastEnemyAttack?.at && scene.metadata.lastEnemyAttack.at > lastEnemyAttackAt) {
    lastEnemyAttackAt = scene.metadata.lastEnemyAttack.at;
    let damage = scene.metadata.lastEnemyAttack.damage;

    // Armor absorbs 50 % of each hit, consumed first.
    if (playerArmor > 0) {
      const absorbed = Math.min(playerArmor, Math.floor(damage * 0.5));
      playerArmor -= absorbed;
      damage      -= absorbed;
    }

    playerHealth = Math.max(0, playerHealth - damage);
    audio.playHurt();

    if (playerHealth <= 0 && !isDead) {
      isDead = true;
      deathTimer = RESPAWN_DELAY;
      audio.playDeath();
      hud.showDeath();
    }
  }

  enemySystem.update(deltaTimeSeconds, { playerPosition: camera.position });

  hud.update(deltaTimeSeconds, {
    health: playerHealth,
    armor: playerArmor,
    ammoText: String(ammoShells),
    enemies: scene.metadata?.enemyCount ?? 0,
    pointerLocked: input.state.pointerLocked,
    shotsFired,
    kills,
    statusText: mapStatusText,
  });
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});

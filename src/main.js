import { Engine } from "@babylonjs/core/Engines/engine";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createEnemySystem } from "./gameplay/enemySystem.js";
import { createItemSystem } from "./gameplay/itemSystem.js";
import { createImpactSystem } from "./gameplay/impactSystem.js";
import { createProjectileSystem } from "./gameplay/projectileSystem.js";
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
import { createHeadBob } from "./player/headBob.js";
import { WEAPONS, WEAPON_ORDER } from "./gameConstants.js";

function parseFlag(value) {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

function inspectForwardHit(scene, camera, maxDistance = 512, debug = false) {
  const pick = scene.pickWithRay(camera.getForwardRay(maxDistance), () => true);

  if (!pick?.hit) {
    const result = { hit: false, maxDistance };
    if (debug) console.log("[map-debug] forward inspect", result);
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

  if (debug) console.log("[map-debug] forward inspect", result);
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
// Disable UBOs to stay within GL_MAX_VERTEX_UNIFORM_BUFFERS (WebGL2 min = 12).
// 3 scene lights + flashlight + up to 8 map torches pushes Babylon 8.x over limit;
// classic uniforms are a safe fallback.
engine.disableUniformBuffers = true;

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
const projectileSystem = createProjectileSystem(scene);
const hud = createHud();
const audio = createAudioSystem();
const lightSystem = createLightSystem(scene);
const flashlight = createFlashlight(scene, camera);
const headBob = createHeadBob(camera, scene);
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
    scanlineIntensity: 0.12,
    noiseIntensity: 0.025,
    vignette: 0.55,
    curvature: 0,
    ditherScale: 1.0,
    chromaticAberration: 0.0025,
    bloomStrength: 0.4,
    colorTint: 1.0,
  });
}

canvas.addEventListener("click", () => {
  audio.resume();
});

// Destructure weapon constants from centralised config
const { shotgun: W_SHOTGUN, sword: W_SWORD, grenade: W_GRENADE, staff: W_STAFF } = WEAPONS;

let playerHealth = 100;
let playerArmor = 0;
let ammoShells = 25;
let grenadeCount = 5;
let lastEnemyAttackAt = 0;
let lastEnemyAggroAt  = 0;
let kills = 0;
let fireCooldownTimer   = 0;
let meleeCooldownTimer  = 0;
let throwCooldownTimer  = 0;
let castCooldownTimer   = 0;
let activeWeapon = "shotgun";
let mapStatusText = "Loading map...";
const GOD_MODE = parseFlag(queryParams.get("godMode"));

// Landing detection state
let prevGrounded = true;
let peakFallSpeed = 0;

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
    url: "/maps/comprehensive.map",
  });
  const meshCount = mapResult?.mapGeometry?.meshes?.length ?? 0;
  window.__trenchfps.mapDebug = mapResult?.mapGeometry?.debugInfo ?? null;
  window.__trenchfps.mapGeometry = mapResult?.mapGeometry ?? null;
  window.__trenchfps.inspectForward = (maxDistance = 512) => inspectForwardHit(scene, camera, maxDistance, mapDebugOptions.enabled);
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
      headBob.reset();
      hud.hideDeath();
    }
    hud.update(deltaTimeSeconds, {
      health: 0, armor: playerArmor, ammoText: "0",
      enemies: scene.metadata?.enemyCount ?? 0,
      pointerLocked: input.state.pointerLocked,
      kills, statusText: mapStatusText,
      activeWeapon,
    });
    scene.render();
    return;
  }

  const lookDelta = input.consumeLookDelta();
  playerController.update(deltaTimeSeconds, lookDelta);
  headBob.update(deltaTimeSeconds);

  // ── Landing detection ─────────────────────────────────────────────────────
  const playerMeta = scene.metadata?.player ?? {};
  if (!playerMeta.grounded) {
    peakFallSpeed = Math.max(peakFallSpeed, -(playerMeta.verticalVelocity ?? 0));
  }
  if (!prevGrounded && playerMeta.grounded && peakFallSpeed > 80) {
    audio.playLand(peakFallSpeed);
    peakFallSpeed = 0;
  }
  if (playerMeta.grounded) peakFallSpeed = 0;
  prevGrounded = playerMeta.grounded ?? true;

  audio.update(deltaTimeSeconds, playerMeta);

  if (input.consumeFlashlightToggle()) {
    const flashlightOn = flashlight.toggle();
    viewModel.root.setEnabled(!flashlightOn);
  }

  // ── Weapon select (keys 1 / 2, or scroll wheel) ───────────────────────────
  const weaponSelect = input.consumeWeaponSelect();
  const weaponScroll = input.consumeWeaponScroll();

  let nextWeapon = weaponSelect;

  if (!nextWeapon && weaponScroll !== 0) {
    const currentIdx = WEAPON_ORDER.indexOf(activeWeapon);
    const nextIdx = (currentIdx + weaponScroll + WEAPON_ORDER.length) % WEAPON_ORDER.length;
    nextWeapon = WEAPON_ORDER[nextIdx];
  }

  if (nextWeapon && nextWeapon !== activeWeapon) {
    activeWeapon = nextWeapon;
    viewModel.setWeapon(activeWeapon);
    hud.notifyWeaponSwitch(activeWeapon);
    audio.playWeaponSwitch();
  }

  // ── Weapon fire / melee ───────────────────────────────────────────────────
  fireCooldownTimer  = Math.max(0, fireCooldownTimer  - deltaTimeSeconds);
  meleeCooldownTimer = Math.max(0, meleeCooldownTimer - deltaTimeSeconds);
  throwCooldownTimer = Math.max(0, throwCooldownTimer - deltaTimeSeconds);
  castCooldownTimer  = Math.max(0, castCooldownTimer  - deltaTimeSeconds);
  const wantsFire = input.consumePrimaryFire();

  if (wantsFire && !flashlight.isOn) {
    if (activeWeapon === "shotgun" && fireCooldownTimer === 0) {
      if (ammoShells <= 0) {
        audio.playDryFire();
        fireCooldownTimer = W_SHOTGUN.dryFireCooldown;
      } else {
      ammoShells -= 1;
      fireCooldownTimer = W_SHOTGUN.cooldown;

      const hit = enemySystem.handlePrimaryFire(camera);
      audio.playShoot();
      if (lightsEnabled) lightSystem.spawnMuzzleFlash(camera);

      if (hit?.type === "enemy") {
        hud.notifyHit();
        audio.playHit();
        if (hit.enemyDown) { kills += 1; audio.playEnemyDeath(); }
        else               { audio.playEnemyHurt(); }
      }

      if (hit?.type === "world" || hit?.type === "enemy") {
        const isEnemy = hit.type === "enemy";
        impactSystem.spawnImpact(hit.position, { isEnemy });
        if (lightsEnabled) lightSystem.spawnImpactLight(hit.position, isEnemy);
      }

      viewModel.fire();
      }

    } else if (activeWeapon === "sword" && meleeCooldownTimer === 0) {
      meleeCooldownTimer = W_SWORD.cooldown;

      const hit = enemySystem.handleMeleeAttack(camera, W_SWORD.range, W_SWORD.damage);
      audio.playSwing();

      if (hit?.type === "enemy") {
        hud.notifyHit();
        audio.playHit();
        if (hit.enemyDown) { kills += 1; audio.playEnemyDeath(); }
        else               { audio.playEnemyHurt(); }
      }

      if (hit?.type === "world" || hit?.type === "enemy") {
        const isEnemy = hit.type === "enemy";
        impactSystem.spawnImpact(hit.position, { isEnemy, size: isEnemy ? 2.0 : 1.2 });
        if (lightsEnabled) lightSystem.spawnImpactLight(hit.position, isEnemy);
      }

      viewModel.swingMelee();

    } else if (activeWeapon === "grenade" && throwCooldownTimer === 0) {
      if (grenadeCount <= 0) {
        audio.playDryFire();
        throwCooldownTimer = W_GRENADE.dryFireCooldown;
      } else {
        grenadeCount -= 1;
        throwCooldownTimer = W_GRENADE.cooldown;
        audio.playGrenadeThrow();
        viewModel.throwGrenade();

        const forward = camera.getForwardRay().direction.normalize();
        const spawnPos = camera.position.add(forward.scale(8));
        projectileSystem.spawnGrenade({
          origin: spawnPos,
          direction: forward,
          throwSpeed: 340,
          upwardKick: 100,
          fuseTime: 2.4,
          onBounce() {
            audio.playBounce();
          },
          onExplode(pos) {
            audio.playExplosion();
            if (lightsEnabled) lightSystem.spawnImpactLight(pos, false);
            impactSystem.spawnImpact(pos, { size: 4.0 });
            const hits = enemySystem.handleExplosionDamage(pos, W_GRENADE.radius, W_GRENADE.damage);
            for (const h of hits) {
              kills += h.enemyDown ? 1 : 0;
              if (h.enemyDown) audio.playEnemyDeath();
              else audio.playEnemyHurt();
            }
            if (hits.length > 0) hud.notifyHit();
          },
        });
      }

    } else if (activeWeapon === "staff" && castCooldownTimer === 0) {
      castCooldownTimer = W_STAFF.cooldown;
      audio.playCastSpell();
      viewModel.castStaff();

      // Instant damage at range, visual bolt flies to hit point
      const hit = enemySystem.handleMeleeAttack(camera, W_STAFF.range, W_STAFF.damage);
      const targetPos = hit?.position ?? camera.position.add(camera.getForwardRay().direction.scale(W_STAFF.range));

      projectileSystem.spawnBolt({
        origin: camera.position.add(camera.getForwardRay().direction.scale(3)),
        target: targetPos,
        speed: 650,
        size: 1.2,
        onArrive(pos) {
          impactSystem.spawnImpact(pos, { isEnemy: hit?.type === "enemy", size: 1.8 });
          if (lightsEnabled) lightSystem.spawnImpactLight(pos, hit?.type === "enemy");
        },
      });

      if (hit?.type === "enemy") {
        hud.notifyHit();
        audio.playHit();
        if (hit.enemyDown) { kills += 1; audio.playEnemyDeath(); }
        else               { audio.playEnemyHurt(); }
      }
    }
  }

  const lateralInput = input.state.right ? 1 : input.state.left ? -1 : 0;
  viewModel.update(deltaTimeSeconds, lookDelta, lateralInput);
  flashlight.update(deltaTimeSeconds);
  impactSystem.update(deltaTimeSeconds);
  projectileSystem.update(deltaTimeSeconds);
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
    hud.notifyPlayerHurt();
    headBob.damageKick(damage);

    if (playerHealth <= 0 && !isDead) {
      isDead = true;
      deathTimer = RESPAWN_DELAY;
      audio.playDeath();
      hud.showDeath();
    }
  }

  enemySystem.update(deltaTimeSeconds, { playerPosition: camera.position });

  // ─── Enemy aggro alert ────────────────────────────────────────────────────
  const aggroAt = scene.metadata?.lastEnemyAggro?.at ?? 0;
  if (aggroAt > lastEnemyAggroAt) {
    lastEnemyAggroAt = aggroAt;
    audio.playEnemyAggro();
  }

  hud.update(deltaTimeSeconds, {
    health: playerHealth,
    armor: playerArmor,
    ammoText: activeWeapon === "shotgun"  ? String(ammoShells)
            : activeWeapon === "grenade" ? String(grenadeCount)
            : activeWeapon === "staff"   ? "∞"
            : "⚔",
    enemies: scene.metadata?.enemyCount ?? 0,
    pointerLocked: input.state.pointerLocked,
    kills,
    statusText: mapStatusText,
    activeWeapon,
  });
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});

import { Engine } from "@babylonjs/core/Engines/engine";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
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
import { createPauseMenu } from "./ui/pauseMenu.js";
import { applyRetroPipeline } from "./engine/retroPipeline.js";
import { createLightSystem } from "./engine/lightSystem.js";
import { createFlashlight } from "./player/flashlight.js";
import { createHeadBob } from "./player/headBob.js";
import { WEAPONS, WEAPON_ORDER } from "./gameConstants.js";

function parseFlag(value) {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function lerpColor(a, b, t) {
  return new Color3(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  );
}

function getProjectileBasis(camera) {
  const forward = camera.getForwardRay().direction.normalize();
  let right = Vector3.Cross(Vector3.Up(), forward);
  if (right.lengthSquared() < 0.0001) {
    right = new Vector3(1, 0, 0);
  } else {
    right.normalize();
  }
  const up = Vector3.Cross(forward, right).normalize();
  return { forward, right, up };
}

function getWeaponProjectileOrigin(camera, weapon) {
  const { forward, right, up } = getProjectileBasis(camera);
  const side = weapon === "pistol" ? 0.16 : 0.11;
  const down = weapon === "pistol" ? -0.1 : -0.14;
  const forwardOffset = weapon === "pistol" ? 1.1 : 1.0;
  return {
    forward,
    right,
    up,
    origin: camera.position
      .add(forward.scale(forwardOffset))
      .add(right.scale(side))
      .add(up.scale(down)),
  };
}

function applySpread(forward, right, up, horizontalSpread, verticalSpread) {
  return forward
    .add(right.scale(horizontalSpread))
    .add(up.scale(verticalSpread))
    .normalize();
}

function updateFogZoning(scene, camera, deltaTimeSeconds) {
  const zones = scene.metadata?.mapFogZones;
  const baseFogColor = scene.metadata?.baseFogColor;
  const baseFogDensity = scene.metadata?.baseFogDensity;

  if (!zones?.length || !baseFogColor || !Number.isFinite(baseFogDensity)) {
    return;
  }

  let weightTotal = 0;
  let densityTarget = baseFogDensity;
  let colorAccumulator = new Color3(0, 0, 0);

  for (const zone of zones) {
    const radius = Math.max(1, zone.radius ?? 1);
    const distance = Vector3.Distance(camera.position, zone.position);
    if (distance >= radius) continue;

    const t = 1 - distance / radius;
    const weight = t * t;
    weightTotal += weight;
    densityTarget += (zone.densityBoost ?? 0) * weight;
    colorAccumulator = colorAccumulator.add(zone.color.scale(weight));
  }

  const blend = clamp01(weightTotal * 0.8);
  const zoneColor = weightTotal > 0 ? colorAccumulator.scale(1 / weightTotal) : baseFogColor;
  const colorTarget = lerpColor(baseFogColor, zoneColor, blend);
  const smoothing = clamp01(deltaTimeSeconds * 2.8);

  scene.fogDensity += (densityTarget - scene.fogDensity) * smoothing;
  scene.fogColor = lerpColor(scene.fogColor, colorTarget, smoothing);
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
const pauseMenu = createPauseMenu(audio);
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

const retroFx = retroEnabled
  ? applyRetroPipeline(scene, camera, {
    scanlineIntensity: 0.06,
    noiseIntensity: 0.006,
    vignette: 0.08,
    curvature: 0,
    ditherScale: 1.0,
    chromaticAberration: 0.0,
    bloomStrength: 0.06,
    colorTint: 0.2,
  })
  : null;

document.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    if (pauseMenu.isPaused) {
      document.dispatchEvent(new Event("resumeGame"));
    } else {
      pauseMenu.isPaused = true;
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    }
  }
});

document.addEventListener("resumeGame", () => {
  pauseMenu.isPaused = false;
  canvas.requestPointerLock();
});

canvas.addEventListener("click", () => {
  audio.resume();
  if (!pauseMenu.isPaused) {
    canvas.requestPointerLock();
  }
});

// Destructure weapon constants from centralised config
const { shotgun: W_SHOTGUN, sword: W_SWORD, grenade: W_GRENADE, staff: W_STAFF } = WEAPONS;

// Projectile tuning — pellet and pistol stats not yet in gameConstants
const PISTOL_FIRE_COOLDOWN     = 0.15;
const PISTOL_PROJECTILE_SPEED  = 1400;
const PISTOL_PROJECTILE_DAMAGE = 24;
const PISTOL_PROJECTILE_LIFE   = 1.4;
const SHOTGUN_PELLET_COUNT     = 8;
const SHOTGUN_PELLET_DAMAGE    = 4;
const SHOTGUN_PELLET_SPEED     = 980;
const SHOTGUN_PELLET_LIFE      = 0.7;
const SHOTGUN_PELLET_SPREAD    = 0.045;

let playerHealth = 100;
let playerArmor = 0;
let ammoShells = 25;
let ammoNails = 36;
let lastEnemyAttackAt = 0;
let lastEnemyAggroAt  = 0;
let lastProjectileHitSoundAt = 0;
let lastProjectileHurtSoundAt = 0;
let kills = 0;
let fireCooldownTimer   = 0;
let meleeCooldownTimer  = 0;
let castCooldownTimer   = 0;
let activeWeapon = "shotgun";
let mapStatusText = "Loading map...";
const GOD_MODE = parseFlag(queryParams.get("godMode"));

// Landing detection state
let prevGrounded = true;
let peakFallSpeed = 0;

// Door system reference — populated after map loads, used by USE key
let activeDoorSystem = null;

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
  getDoorSystem: () => activeDoorSystem,
};

try {
  const mapResult = await loadMap(scene, {
    camera,
    debug: mapDebugOptions,
    doorCallbacks: {
      onOpen:  () => audio.playDoorOpen(),
      onClose: () => audio.playDoorClose(),
    },
    enemySystem,
    itemSystem,
    playerCollider,
    url: "/maps/comprehensive.map",
  });
  activeDoorSystem = mapResult?.doorSystem ?? null;
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
  const now = performance.now();

  if (pauseMenu.isPaused) {
    // Optionally update HUD to show pointer locked false
    hud.update(0, {
      health: playerHealth, armor: playerArmor, 
      ammoText: activeWeapon === "shotgun" ? ammoShells : activeWeapon === "pistol" ? ammoNails : "∞",
      enemies: scene.metadata?.enemyCount ?? 0,
      pointerLocked: false,
      kills, statusText: "PAUSED",
      activeWeapon,
    });
    scene.render();
    return;
  }

  // ── Death / respawn ────────────────────────────────────────────────────────
  if (isDead) {
    deathTimer -= deltaTimeSeconds;
    if (deathTimer <= 0) {
      isDead = false;
      playerHealth = 100;
      playerArmor = 0;
      ammoShells = 25;
      ammoNails = 36;
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

  // ── Moving state for soundtrack ───────────────────────────────────────────
  const playerSpeed = scene.metadata?.player?.horizontalSpeed ?? 0;
  const isMoving = playerSpeed > 10; // Threshold to count as 'moving'
  audio.setMoving(isMoving);
  retroFx?.setSprintAmount(clamp01((playerSpeed - 190) / 160));

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

  // ── USE key (E) — open doors in front of the player ──────────────────────
  if (input.consumeUse() && activeDoorSystem) {
    const yaw = camera.rotation.y;
    const pitch = camera.rotation.x;
    const forward = new Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    activeDoorSystem.activateByUse(camera.position, forward);
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
        scene.metadata ??= {};
        scene.metadata.lastPlayerShotAt = performance.now();
        audio.playShoot();
        if (lightsEnabled) lightSystem.spawnMuzzleFlash(camera);
        const { origin, forward, right, up } = getWeaponProjectileOrigin(camera, "shotgun");

        for (let pelletIndex = 0; pelletIndex < SHOTGUN_PELLET_COUNT; pelletIndex += 1) {
          const spreadX = (Math.random() * 2 - 1) * SHOTGUN_PELLET_SPREAD;
          const spreadY = (Math.random() * 2 - 1) * SHOTGUN_PELLET_SPREAD;
          const pelletDirection = applySpread(forward, right, up, spreadX, spreadY);

          projectileSystem.spawnSphereProjectile({
            color: new Color3(1.0, 0.78, 0.32),
            diameter: 0.11,
            direction: pelletDirection,
            lifeSeconds: SHOTGUN_PELLET_LIFE,
            origin,
            resolveHit(from, direction, distance) {
              return enemySystem.traceProjectile(from, direction, distance);
            },
            speed: SHOTGUN_PELLET_SPEED,
            onHit(hit) {
              if (hit.type === "enemy") {
                const result = enemySystem.applyProjectileDamage(hit.enemyId, SHOTGUN_PELLET_DAMAGE);
                if (!result) return;
                hud.notifyHit();
                if (performance.now() - lastProjectileHitSoundAt > 40) {
                  audio.playHit();
                  lastProjectileHitSoundAt = performance.now();
                }
                if (result.enemyDown) {
                  kills += 1;
                  audio.playEnemyDeath();
                } else if (performance.now() - lastProjectileHurtSoundAt > 75) {
                  audio.playEnemyHurt();
                  lastProjectileHurtSoundAt = performance.now();
                }
                impactSystem.spawnImpact(hit.position, { isEnemy: true, size: 1.15 });
                if (lightsEnabled) lightSystem.spawnImpactLight(hit.position, true);
              } else if (hit.type === "world") {
                impactSystem.spawnImpact(hit.position, { isEnemy: false, normal: hit.normal, size: 0.65 });
                if (lightsEnabled) lightSystem.spawnImpactLight(hit.position, false);
              }
            },
          });
        }

        viewModel.fire();
      }

    } else if (activeWeapon === "pistol" && fireCooldownTimer === 0) {
      if (ammoNails <= 0) {
        audio.playDryFire();
        fireCooldownTimer = 0.2;
      } else {
        ammoNails -= 1;
        fireCooldownTimer = PISTOL_FIRE_COOLDOWN;
        scene.metadata ??= {};
        scene.metadata.lastPlayerShotAt = performance.now();
        audio.playPistolShot();
        if (lightsEnabled) lightSystem.spawnMuzzleFlash(camera);
        const { origin, forward } = getWeaponProjectileOrigin(camera, "pistol");

        projectileSystem.spawnSphereProjectile({
          color: new Color3(1.0, 0.84, 0.4),
          diameter: 0.14,
          direction: forward,
          lifeSeconds: PISTOL_PROJECTILE_LIFE,
          lightIntensity: 1.8,
          lightRange: 10,
          origin,
          resolveHit(from, direction, distance) {
            return enemySystem.traceProjectile(from, direction, distance);
          },
          speed: PISTOL_PROJECTILE_SPEED,
          onHit(hit) {
            if (hit.type === "enemy") {
              const result = enemySystem.applyProjectileDamage(hit.enemyId, PISTOL_PROJECTILE_DAMAGE);
              if (!result) return;
              hud.notifyHit();
              audio.playHit();
              if (result.enemyDown) {
                kills += 1;
                audio.playEnemyDeath();
              } else {
                audio.playEnemyHurt();
              }
              impactSystem.spawnImpact(hit.position, { isEnemy: true, size: 1.35 });
              if (lightsEnabled) lightSystem.spawnImpactLight(hit.position, true);
            } else if (hit.type === "world") {
              impactSystem.spawnImpact(hit.position, { isEnemy: false, normal: hit.normal, size: 0.95 });
              if (lightsEnabled) lightSystem.spawnImpactLight(hit.position, false);
            }
          },
        });

        viewModel.firePistol();
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
        impactSystem.spawnImpact(hit.position, { isEnemy, normal: hit.normal, size: isEnemy ? 2.0 : 1.2 });
        if (lightsEnabled) lightSystem.spawnImpactLight(hit.position, isEnemy);
      }

      viewModel.swingMelee();

    } else if (activeWeapon === "staff" && castCooldownTimer === 0) {
      castCooldownTimer = W_STAFF.cooldown;
      audio.playCastSpell();
      viewModel.castStaff();

      // Instant damage at range — the bolt is cosmetic, damage is pre-computed
      const hit = enemySystem.handleMeleeAttack(camera, W_STAFF.range, W_STAFF.damage);
      const forwardDir = camera.getForwardRay().direction;
      const targetPos  = hit?.position ?? camera.position.add(forwardDir.scale(W_STAFF.range));

      projectileSystem.spawnStaffBolt({
        origin: camera.position.add(forwardDir.scale(3)),
        target: targetPos,
        speed: 750,
        size: 1.3,
        onArrive(pos) {
          // Ice-specific hit VFX (Frostball_Hit sprite + flash light)
          projectileSystem.spawnStaffImpact(pos);
          // Impact explosion sound
          audio.playStaffImpact();
          // Generic world impact decal / enemy flash (kept for consistency)
          if (hit?.type === "world") {
            impactSystem.spawnImpact(pos, { isEnemy: false, normal: hit.normal, size: 0.8 });
          }
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
  updateFogZoning(scene, camera, deltaTimeSeconds);

  // ── Item pickups ──────────────────────────────────────────────────────────
  const collectedItems = itemSystem.update(deltaTimeSeconds, camera.position);
  for (const item of collectedItems) {
    if (item.health)      playerHealth = Math.min(100, playerHealth + item.health);
    if (item.armor)       playerArmor  = Math.min(200, playerArmor  + item.armor);
    if (item.ammo_shells) ammoShells  += item.ammo_shells;
    if (item.ammo_nails)  ammoNails   += item.ammo_nails;
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
    retroFx?.triggerDamagePulse(clamp01(0.28 + damage / 65));
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
            : activeWeapon === "pistol" ? String(ammoNails)
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

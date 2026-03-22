import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Ray } from "@babylonjs/core/Culling/ray.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Sprite } from "@babylonjs/core/Sprites/sprite.js";
import { SpriteManager } from "@babylonjs/core/Sprites/spriteManager.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { getEnemyDefinition } from "./enemyDefinitions.js";
import { loadEnemyModel } from "./enemyModel3D.js";
import { loadEnemyModelSkeletal } from "./enemyModelSkeletal.js";

const FIRE_RANGE = 800;
const HIT_FLASH_MS = 90;
const ENEMY_GRAVITY_UNITS_PER_SECOND_SQUARED = 800;
const ENEMY_GROUNDED_DISTANCE_THRESHOLD = 1.5;
const ENEMY_GROUND_CHECK_DISTANCE = 2.5;
const ENEMY_GROUND_CHECK_START_ABOVE_FEET = 1;
const ENEMY_HEALTH_SCALE = 0.15;

function cloneVector3(source) {
  return new Vector3(source.x, source.y, source.z);
}

function getHorizontalDelta(from, to) {
  return new Vector3(to.x - from.x, 0, to.z - from.z);
}

function getEnemyHalfHeight(definition) {
  return Math.max(12, (definition.size ?? 48) / 2);
}

function getEnemyCollisionRadius(definition) {
  return Math.max(8, Math.min(definition.hitRadius ?? 18, (definition.size ?? 48) * 0.35));
}

function getMinimumHitbox(definition) {
  const size = definition.size ?? 48;
  return {
    halfHeight: Math.max(getEnemyHalfHeight(definition), size * 0.6),
    radius: Math.max(getEnemyCollisionRadius(definition), size * 0.45),
  };
}

function isGroundMovement(definition) {
  return (definition.movementMode ?? "ground") === "ground";
}

function getScaledHealth(definition) {
  const base = Number(definition.health ?? 1);
  return Math.max(1, Math.round(base * ENEMY_HEALTH_SCALE));
}

function createEnemyCollisionBody(scene, id, position, definition) {
  const halfHeight = getEnemyHalfHeight(definition);
  const radius = getEnemyCollisionRadius(definition);
  const body = MeshBuilder.CreateBox(
    `enemy-body-${id}`,
    {
      depth: radius * 2,
      height: halfHeight * 2,
      width: radius * 2,
    },
    scene,
  );
  body.isPickable = false;
  body.isVisible = false;
  body.checkCollisions = false;
  body.ellipsoid = new Vector3(radius, halfHeight, radius);
  body.ellipsoidOffset = Vector3.Zero();
  body.position.copyFrom(position);
  body.position.y += halfHeight;

  return {
    body,
    halfHeight,
    radius,
    baseHalfHeight: halfHeight,
    baseRadius: radius,
  };
}

function pickGroundHit(scene, body, halfHeight) {
  const rayOrigin = body.position.add(
    new Vector3(0, -(halfHeight - ENEMY_GROUND_CHECK_START_ABOVE_FEET), 0),
  );
  const ray = new Ray(
    rayOrigin,
    new Vector3(0, -1, 0),
    ENEMY_GROUND_CHECK_DISTANCE + ENEMY_GROUND_CHECK_START_ABOVE_FEET,
  );
  return scene.pickWithRay(ray, (mesh) => mesh !== body && Boolean(mesh?.checkCollisions));
}

function isBodyGrounded(scene, body, halfHeight) {
  const hit = pickGroundHit(scene, body, halfHeight);

  if (!hit?.hit) {
    return false;
  }

  return hit.distance <= ENEMY_GROUNDED_DISTANCE_THRESHOLD;
}

function syncEnemyBasePositionFromBody(enemy) {
  if (!enemy.collisionBody) {
    return;
  }

  enemy.basePosition.x = enemy.collisionBody.position.x;
  enemy.basePosition.y = enemy.collisionBody.position.y - enemy.collisionHalfHeight;
  enemy.basePosition.z = enemy.collisionBody.position.z;
}

function moveEnemyWithCollisions(scene, enemy, horizontalDisplacement, deltaTimeSeconds) {
  if (!enemy.collisionBody) {
    enemy.basePosition.addInPlace(horizontalDisplacement);
    return;
  }

  const groundedBeforeMove = isBodyGrounded(scene, enemy.collisionBody, enemy.collisionHalfHeight);

  if (groundedBeforeMove && enemy.verticalVelocity < 0) {
    enemy.verticalVelocity = 0;
  } else if (!groundedBeforeMove) {
    enemy.verticalVelocity -= ENEMY_GRAVITY_UNITS_PER_SECOND_SQUARED * deltaTimeSeconds;
  } else {
    enemy.verticalVelocity = -1;
  }

  const displacement = new Vector3(
    horizontalDisplacement.x,
    enemy.verticalVelocity * deltaTimeSeconds,
    horizontalDisplacement.z,
  );
  const previousPosition = enemy.collisionBody.position.clone();
  enemy.collisionBody.moveWithCollisions(displacement);
  const actualDisplacement = enemy.collisionBody.position.subtract(previousPosition);

  if (Math.abs(actualDisplacement.y) < 0.0001 && enemy.verticalVelocity < 0) {
    enemy.verticalVelocity = 0;
  }

  const groundHit = pickGroundHit(scene, enemy.collisionBody, enemy.collisionHalfHeight);
  enemy.grounded = Boolean(groundHit?.hit) && groundHit.distance <= ENEMY_GROUNDED_DISTANCE_THRESHOLD;
  if (enemy.grounded && groundHit?.pickedPoint && enemy.verticalVelocity <= 0) {
    enemy.collisionBody.position.y = groundHit.pickedPoint.y + enemy.collisionHalfHeight;
    enemy.verticalVelocity = 0;
  }
  syncEnemyBasePositionFromBody(enemy);
}

function intersectRaySphere(origin, direction, center, radius) {
  const offset = center.subtract(origin);
  const projection = Vector3.Dot(offset, direction);
  if (projection < 0) return null;
  const closest = origin.add(direction.scale(projection));
  const dist = Vector3.Distance(closest, center);
  if (dist > radius) return null;
  const thc = Math.sqrt(radius * radius - dist * dist);
  const entry = projection - thc;
  return entry >= 0 ? entry : projection + thc;
}

function intersectRayAabb(origin, direction, minPoint, maxPoint, maxDistance = Infinity) {
  let tMin = 0;
  let tMax = maxDistance;

  const originComponents = [origin.x, origin.y, origin.z];
  const directionComponents = [direction.x, direction.y, direction.z];
  const minComponents = [minPoint.x, minPoint.y, minPoint.z];
  const maxComponents = [maxPoint.x, maxPoint.y, maxPoint.z];

  for (let axis = 0; axis < 3; axis += 1) {
    const axisOrigin = originComponents[axis];
    const axisDirection = directionComponents[axis];
    const axisMin = minComponents[axis];
    const axisMax = maxComponents[axis];

    if (Math.abs(axisDirection) <= 0.00001) {
      if (axisOrigin < axisMin || axisOrigin > axisMax) {
        return null;
      }
      continue;
    }

    const inverse = 1 / axisDirection;
    let t1 = (axisMin - axisOrigin) * inverse;
    let t2 = (axisMax - axisOrigin) * inverse;

    if (t1 > t2) {
      const temp = t1;
      t1 = t2;
      t2 = temp;
    }

    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);

    if (tMin > tMax) {
      return null;
    }
  }

  return tMin <= maxDistance ? tMin : null;
}

function getEnemyHitbox(enemy) {
  if (enemy.model?.getHitbox) {
    const modelHitbox = enemy.model.getHitbox() ?? { halfHeight: 0, radius: 0 };
    const minimum = getMinimumHitbox(enemy.definition);
    const minHalfHeight = minimum.halfHeight;
    const minRadius = minimum.radius;
    const halfHeight = Math.max(modelHitbox.halfHeight ?? 0, minHalfHeight);
    const radius = Math.max(modelHitbox.radius ?? 0, minRadius);
    const center = enemy.collisionBody
      ? enemy.collisionBody.position
      : new Vector3(enemy.basePosition.x, enemy.basePosition.y + halfHeight, enemy.basePosition.z);
    return { center, halfHeight, radius, type: "capsule-ish" };
  }

  if (enemy.collisionBody) {
    const center = enemy.collisionBody.position;
    const halfHeight = enemy.collisionHalfHeight;
    const radius = enemy.collisionRadius ?? getEnemyCollisionRadius(enemy.definition);
    return {
      center,
      halfHeight,
      radius,
      type: "capsule-ish",
    };
  }

  return {
    center: enemy.kind === "sprite" ? enemy.sprite.position : enemy.basePosition,
    halfHeight: getEnemyHalfHeight(enemy.definition),
    radius: enemy.definition.hitRadius,
    type: "sphere",
  };
}

function intersectRayEnemy(origin, direction, enemy, maxDistance = FIRE_RANGE) {
  const hitbox = getEnemyHitbox(enemy);

  if (hitbox.type === "sphere") {
    const distance = intersectRaySphere(origin, direction, hitbox.center, hitbox.radius);
    if (distance === null || distance > maxDistance) {
      return null;
    }

    return {
      distance,
      point: origin.add(direction.scale(distance)),
    };
  }

  const minPoint = new Vector3(
    hitbox.center.x - hitbox.radius,
    hitbox.center.y - hitbox.halfHeight,
    hitbox.center.z - hitbox.radius,
  );
  const maxPoint = new Vector3(
    hitbox.center.x + hitbox.radius,
    hitbox.center.y + hitbox.halfHeight,
    hitbox.center.z + hitbox.radius,
  );
  const distance = intersectRayAabb(origin, direction, minPoint, maxPoint, maxDistance);

  if (distance === null) {
    return null;
  }

  return {
    distance,
    point: origin.add(direction.scale(distance)),
  };
}

// ── Sprite-based enemy (skull / fallback) ────────────────────────────────────

function getOrCreateManager(scene, managers, type, definition) {
  if (managers.has(type)) return managers.get(type);
  const manager = new SpriteManager(
    `enemy-${type}-manager`,
    definition.spriteSheetUrl,
    32,
    { width: definition.cellWidth, height: definition.cellHeight },
    scene,
  );
  manager.isPickable = false;
  manager.fogEnabled = false;
  managers.set(type, manager);
  return manager;
}

function spawnSpriteEnemy(scene, managers, id, position, definition) {
  const manager = getOrCreateManager(scene, managers, definition.name, definition);
  const sprite = new Sprite(id, manager);
  const collisionState = isGroundMovement(definition)
    ? createEnemyCollisionBody(scene, id, position, definition)
    : null;
  const basePosition = collisionState
    ? new Vector3(position.x, collisionState.body.position.y - collisionState.halfHeight, position.z)
    : cloneVector3(position);
  sprite.position = cloneVector3(basePosition);
  sprite.size = definition.size;
  sprite.color = new Color4(1, 1, 1, 1);
  sprite.playAnimation(
    definition.animation.from,
    definition.animation.to,
    true,
    definition.animation.delayMs,
  );

  return {
    kind: "sprite",
    id,
    basePosition: cloneVector3(basePosition),
    definition,
    bobOffset: Math.random() * Math.PI * 2,
    collisionBody: collisionState?.body ?? null,
    collisionHalfHeight: collisionState?.halfHeight ?? getEnemyHalfHeight(definition),
    collisionRadius: collisionState?.radius ?? getEnemyCollisionRadius(definition),
    collisionBaseHalfHeight: collisionState?.baseHalfHeight ?? getEnemyHalfHeight(definition),
    collisionBaseRadius: collisionState?.baseRadius ?? getEnemyCollisionRadius(definition),
    hitFlashRemaining: 0,
    attackCooldownRemaining: 0,
    currentHealth: getScaledHealth(definition),
    isDead: false,
    deathTimer: 0,
    grounded: false,
    sprite,
    model: null,
    movementMode: definition.movementMode ?? "ground",
    verticalVelocity: 0,

    getPosition() { return this.basePosition; },
    setVisualPosition(pos) {
      this.sprite.position.x = pos.x;
      this.sprite.position.y = pos.y;
      this.sprite.position.z = pos.z;
    },
    setHitFlash(active) {
      this.sprite.color = active ? new Color4(1, 0.45, 0.45, 1) : new Color4(1, 1, 1, 1);
    },
    dispose() {
      this.sprite.dispose();
      this.collisionBody?.dispose();
    },
  };
}

// ── 3D model enemy ────────────────────────────────────────────────────────────

function spawnModelEnemyAsync(scene, id, position, definition) {
  // Returns a placeholder immediately; model loads async.
  // The enemy object is valid for AI / collision — visual just won't render until loaded.
  const collisionState = isGroundMovement(definition)
    ? createEnemyCollisionBody(scene, id, position, definition)
    : null;
  const basePosition = collisionState
    ? new Vector3(position.x, collisionState.body.position.y - collisionState.halfHeight, position.z)
    : cloneVector3(position);
  const enemy = {
    kind: "model3d",
    id,
    basePosition: basePosition,
    definition,
    bobOffset: 0,
    collisionBody: collisionState?.body ?? null,
    collisionHalfHeight: collisionState?.halfHeight ?? getEnemyHalfHeight(definition),
    collisionRadius: collisionState?.radius ?? getEnemyCollisionRadius(definition),
    collisionBaseHalfHeight: collisionState?.baseHalfHeight ?? getEnemyHalfHeight(definition),
    collisionBaseRadius: collisionState?.baseRadius ?? getEnemyCollisionRadius(definition),
    hitFlashRemaining: 0,
    attackCooldownRemaining: 0,
    currentHealth: getScaledHealth(definition),
    isDead: false,
    deathTimer: 0,
    grounded: false,
    sprite: null,
    model: null,         // filled in once async load completes
    _modelLoading: true,
    _animState: "idle",  // "idle"|"walk"|"attack"|"pain"|"rising"|"death"
    _knockdownsLeft: definition.knockdownCount ?? 0,
    movementMode: definition.movementMode ?? "ground",
    verticalVelocity: 0,

    getPosition() { return this.basePosition; },
    setVisualPosition(pos) {
      this.model?.setPosition(pos);
    },
    setHitFlash(active) { this.model?.setHitFlash(active); },
    dispose() {
      this.model?.dispose();
      this.collisionBody?.dispose();
    },
  };

  loadEnemyModel(scene, definition.modelUrl, basePosition, {
    footLift: definition.modelFootLift,
    frameRate: definition.modelFrameRate,
  })
    .then((model) => {
      enemy.model = model;
      enemy._modelLoading = false;
      const hitbox = model.getHitbox?.();
      if (hitbox && enemy.collisionBody) {
        const minimum = getMinimumHitbox(definition);
        const minHalfHeight = Math.max(enemy.collisionBaseHalfHeight ?? 0, minimum.halfHeight);
        const minRadius = Math.max(enemy.collisionBaseRadius ?? 0, minimum.radius);
        const finalHalfHeight = Math.max(hitbox.halfHeight, minHalfHeight);
        const finalRadius = Math.max(hitbox.radius, minRadius);

        enemy.collisionHalfHeight = finalHalfHeight;
        enemy.collisionRadius = finalRadius;

        const heightScale = finalHalfHeight / minHalfHeight;
        const radiusScale = finalRadius / minRadius;
        enemy.collisionBody.scaling.y = heightScale;
        enemy.collisionBody.scaling.x = radiusScale;
        enemy.collisionBody.scaling.z = radiusScale;
        enemy.collisionBody.ellipsoid = new Vector3(finalRadius, finalHalfHeight, finalRadius);
        enemy.collisionBody.position.y = enemy.basePosition.y + finalHalfHeight;
      }
      model.playAnimation("walk", true, definition.modelAnimRates?.walk ?? null);
      enemy._animState = "walk";
      enemy._walking = true;
    })
    .catch((err) => {
      console.error(`[enemySystem] Failed to load model for ${id} (${definition.modelUrl}):`, err);
      enemy._modelLoading = false;
    });

  return enemy;
}


// -- Skeletal (rigged) model enemy ────────────────────────────────────────────

function spawnSkeletalEnemyAsync(scene, id, position, definition) {
  const collisionState = isGroundMovement(definition)
    ? createEnemyCollisionBody(scene, id, position, definition)
    : null;
  const basePosition = collisionState
    ? new Vector3(position.x, collisionState.body.position.y - collisionState.halfHeight, position.z)
    : cloneVector3(position);

  const enemy = {
    kind: "skeletal",
    id,
    basePosition,
    definition,
    bobOffset: 0,
    collisionBody:            collisionState?.body           ?? null,
    collisionHalfHeight:      collisionState?.halfHeight      ?? getEnemyHalfHeight(definition),
    collisionRadius:          collisionState?.radius          ?? getEnemyCollisionRadius(definition),
    collisionBaseHalfHeight:  collisionState?.baseHalfHeight  ?? getEnemyHalfHeight(definition),
    collisionBaseRadius:      collisionState?.baseRadius      ?? getEnemyCollisionRadius(definition),
    hitFlashRemaining:        0,
    attackCooldownRemaining:  0,
    currentHealth:            getScaledHealth(definition),
    isDead:                   false,
    deathTimer:               0,
    grounded:                 false,
    sprite:                   null,
    model:                    null,
    _modelLoading:            true,
    _animState:               "idle",
    _knockdownsLeft:          0,
    _attackToggle:            false,
    _walking:                 false,
    movementMode:             definition.movementMode ?? "ground",
    verticalVelocity:         0,

    getPosition()          { return this.basePosition; },
    setVisualPosition(pos) { this.model?.setPosition(pos); },
    setHitFlash(active)    { this.model?.setHitFlash(active); },
    dispose() {
      this.model?.dispose();
      this.collisionBody?.dispose();
    },
  };

  loadEnemyModelSkeletal(scene, definition.modelAnims, basePosition, {
    facingOffset: definition.modelFacingOffset ?? 0,
    halfHeight:   definition.modelHalfHeight   ?? getEnemyHalfHeight(definition),
    radius:       definition.modelRadius        ?? getEnemyCollisionRadius(definition),
  })
    .then((model) => {
      enemy.model = model;
      enemy._modelLoading = false;
      model.playAnimation("idle", true, definition.modelAnimRates?.idle ?? null);
      enemy._animState = "idle";
    })
    .catch((err) => {
      console.error("[enemySystem] Failed to load skeletal model for " + id + ":", err);
      enemy._modelLoading = false;
    });

  return enemy;
}
// Helper: get per-state fps override from definition, or null to use default.
function animRate(enemy, state) {
  return enemy.definition.modelAnimRates?.[state] ?? null;
}

// ── Enemy system ──────────────────────────────────────────────────────────────

export function createEnemySystem(scene) {
  const managers = new Map(); // sprite managers, keyed by type
  const enemies = [];

  function getEnemyById(enemyId) {
    return enemies.find((enemy) => enemy.id === enemyId) ?? null;
  }

  function findClosestEnemyHit(origin, direction, maxDistance) {
    let closestHit = null;

    enemies.forEach((enemy) => {
      if (enemy.isDead) return;
      const hit = intersectRayEnemy(origin, direction, enemy, maxDistance);
      if (!hit) return;
      if (!closestHit || hit.distance < closestHit.distance) {
        closestHit = { ...hit, enemy };
      }
    });

    return closestHit;
  }

  function findWorldHit(origin, direction, maxDistance) {
    const worldPick = scene.pickWithRay(
      new Ray(origin, direction, maxDistance),
      (mesh) => Boolean(mesh?.checkCollisions),
    );

    return worldPick?.hit
      ? {
          distance: worldPick.distance,
          position: worldPick.pickedPoint,
          normal: worldPick.getNormal(true) ?? direction.scale(-1),
          meshName: worldPick.pickedMesh?.name ?? null,
        }
      : null;
  }

  function traceHit(origin, direction, maxDistance) {
    const closestEnemyHit = findClosestEnemyHit(origin, direction, maxDistance);
    const worldHit = findWorldHit(origin, direction, maxDistance);
    const enemyDist = closestEnemyHit?.distance ?? Infinity;
    const worldDist = worldHit?.distance ?? Infinity;

    if (!closestEnemyHit && !worldHit) {
      return {
        type: "miss",
        distance: maxDistance,
        position: origin.add(direction.scale(maxDistance)),
      };
    }

    if (enemyDist <= worldDist) {
      return {
        type: "enemy",
        enemyId: closestEnemyHit.enemy.id,
        distance: enemyDist,
        position: closestEnemyHit.point,
      };
    }

    return {
      type: "world",
      distance: worldDist,
      position: worldHit.position,
      normal: worldHit.normal,
      meshName: worldHit.meshName,
    };
  }

  function applyDamageToEnemy(enemy, damage) {
    enemy.currentHealth -= damage;
    enemy.hitFlashRemaining = HIT_FLASH_MS;

    scene.metadata ??= {};
    scene.metadata.lastPlayerHit = {
      at: performance.now(),
      enemyId: enemy.id,
      remainingHealth: enemy.currentHealth,
    };

    if (enemy.currentHealth <= 0) {
      if ((enemy.kind === "model3d" || enemy.kind === "skeletal") && enemy.model) {
        if (enemy._knockdownsLeft > 0 &&
            enemy._animState !== "knockdown" && enemy._animState !== "rising") {
          enemy._knockdownsLeft--;
          enemy.currentHealth = 1;
          const fallAnim = enemy.model.hasAnimation("pain") ? "pain" : null;
          if (fallAnim) enemy.model.playAnimation(fallAnim, false, animRate(enemy, "pain") ?? 6);
          enemy._animState = "knockdown";
          enemy._walking = false;
        } else {
          enemy.isDead = true;
          enemy.deathTimer = 3.5;
          enemy._animState = "death";
          const isKnockdownType = (enemy.definition.knockdownCount ?? 0) > 0;
          const deathAnim = enemy.model.hasAnimation("death") ? "death"
                          : (!isKnockdownType && enemy.model.hasAnimation("pain")) ? "pain"
                          : null;
          if (deathAnim) {
            const deathRate = animRate(enemy, "death") ?? (deathAnim === "death" ? null : 10);
            enemy.model.playAnimation(deathAnim, false, deathRate);
          }
        }
      } else {
        enemy.dispose();
        const idx = enemies.indexOf(enemy);
        if (idx >= 0) enemies.splice(idx, 1);
      }
    } else if ((enemy.kind === "model3d" || enemy.kind === "skeletal") && enemy.model &&
               enemy.model.hasAnimation("pain") &&
               (enemy.definition.knockdownCount ?? 0) === 0 &&
               enemy._animState !== "pain" && enemy._animState !== "death" &&
               enemy._animState !== "knockdown" && enemy._animState !== "rising") {
      enemy.model.playAnimation("pain", false, animRate(enemy, "pain"));
      enemy._animState = "pain";
      enemy._walking = false;
    }

    return {
      enemyId: enemy.id,
      enemyDown: enemy.currentHealth <= 0,
      remainingHealth: enemy.currentHealth,
    };
  }

  return {
    spawnEnemy({ id, position, type }) {
      const definition = getEnemyDefinition(type);
      if (!definition) {
        console.warn(`Unknown enemy type: ${type}`);
        return null;
      }

      let enemy;
      if (definition.modelType === "skeletal" && definition.modelAnims) {
        enemy = spawnSkeletalEnemyAsync(scene, id, position, definition);
      } else if (definition.modelUrl) {
        enemy = spawnModelEnemyAsync(scene, id, position, definition);
      } else {
        enemy = spawnSpriteEnemy(scene, managers, id, position, definition);
      }

      enemies.push(enemy);
      return enemy;
    },

    update(deltaTimeSeconds, context = {}) {
      const playerPosition = context.playerPosition ?? null;
      const elapsedSeconds = performance.now() / 1000;

      for (let index = enemies.length - 1; index >= 0; index -= 1) {
        const enemy = enemies[index];
        if (enemy.isDead) {
          enemy.deathTimer -= deltaTimeSeconds;
          if ((enemy.kind === "model3d" || enemy.kind === "skeletal") && enemy.model) {
            enemy.model.update(deltaTimeSeconds);
            // Enemies without a dedicated death animation (e.g. imp) sink into
            // the ground so they visually disappear rather than just freezing.
            if (enemy._animState === "death" && !enemy.model.hasAnimation("death")) {
              const sinkRate = (enemy.definition.size ?? 56) / 1.8;
              enemy.basePosition.y -= sinkRate * deltaTimeSeconds;
            }
            enemy.setVisualPosition(enemy.basePosition);
          }
          if (enemy.deathTimer <= 0) {
            enemy.dispose();
            enemies.splice(index, 1);
          }
          continue;
        }

        enemy.attackCooldownRemaining = Math.max(0, enemy.attackCooldownRemaining - deltaTimeSeconds);
        enemy.hitFlashRemaining = Math.max(0, enemy.hitFlashRemaining - deltaTimeSeconds * 1000);

        if (playerPosition) {
          const toPlayer = getHorizontalDelta(enemy.basePosition, playerPosition);
          const dist = toPlayer.length();
          const { sightRange, attackRange, speed } = enemy.definition;
          const horizontalDisplacement = Vector3.Zero();

          // ── One-shot animation completion → resume walk/idle ───────────────
          if ((enemy.kind === "model3d" || enemy.kind === "skeletal") && enemy.model && enemy.model.isDone()) {
            if (enemy._animState === "attack" || enemy._animState === "pain") {
              if (dist <= sightRange) {
                enemy.model.playAnimation("walk", true, animRate(enemy, "walk"));
                enemy._animState = "walk";
                enemy._walking = true;
              } else {
                enemy.model.playAnimation("idle", true, animRate(enemy, "idle"));
                enemy._animState = "idle";
                enemy._walking = false;
              }
            } else if (enemy._animState === "knockdown") {
              // Fallen — now play the rise animation (pain in reverse)
              const riseAnim = enemy.model.hasAnimation("pain") ? "pain" : null;
              if (riseAnim) {
                enemy.model.playAnimationReverse(riseAnim, false, animRate(enemy, "pain") ?? 6);
              }
              enemy._animState = "rising";
            } else if (enemy._animState === "rising") {
              // Back on their feet — resume fighting
              enemy.currentHealth = Math.max(1, enemy.currentHealth);
              if (dist <= sightRange) {
                enemy.model.playAnimation("walk", true, animRate(enemy, "walk"));
                enemy._animState = "walk";
                enemy._walking = true;
              } else {
                enemy.model.playAnimation("idle", true, animRate(enemy, "idle"));
                enemy._animState = "idle";
                enemy._walking = false;
              }
            }
          }

          // ── Movement + animation decisions (frozen during pain/knockdown/rising) ──
          if (enemy._animState !== "pain" && enemy._animState !== "knockdown" && enemy._animState !== "rising") {
            if (dist <= sightRange && dist > attackRange) {
              toPlayer.normalize();
              const travel = Math.min(dist - attackRange, speed * deltaTimeSeconds);
              horizontalDisplacement.copyFrom(toPlayer.scale(travel));

              if ((enemy.kind === "model3d" || enemy.kind === "skeletal") && enemy.model && !enemy._walking) {
                enemy.model.playAnimation("walk", true, animRate(enemy, "walk"));
                enemy._animState = "walk";
                enemy._walking = true;
                // First aggro — alert sound (one per enemy activation)
                if (!enemy._aggroFired) {
                  enemy._aggroFired = true;
                  scene.metadata ??= {};
                  scene.metadata.lastEnemyAggro = { at: performance.now(), enemyId: enemy.id };
                }
              }
            } else if (dist <= attackRange && enemy.attackCooldownRemaining === 0) {
              scene.metadata ??= {};
              scene.metadata.lastEnemyAttack = {
                at: performance.now(),
                damage: enemy.definition.attackDamage,
                enemyId: enemy.id,
              };
              enemy.attackCooldownRemaining = enemy.definition.attackCooldownSeconds;

              if (enemy.kind === "model3d" && enemy.model) {
                enemy.model.playAnimation("attack", false, animRate(enemy, "attack"));
                enemy._animState = "attack";
                enemy._walking = false;
              } else if (enemy.kind === "skeletal" && enemy.model) {
                const atkAnim = (enemy._attackToggle && enemy.model.hasAnimation("attack2")) ? "attack2" : "attack";
                enemy._attackToggle = !enemy._attackToggle;
                enemy.model.playAnimation(atkAnim, false, animRate(enemy, "attack"));
                enemy._animState = "attack";
                enemy._walking = false;
              }
            } else if ((enemy.kind === "model3d" || enemy.kind === "skeletal") && enemy.model && enemy._walking && dist > sightRange) {
              enemy.model.playAnimation("idle", true, animRate(enemy, "idle"));
              enemy._animState = "idle";
              enemy._walking = false;
            }
          }

          if (isGroundMovement(enemy.definition)) {
            moveEnemyWithCollisions(scene, enemy, horizontalDisplacement, deltaTimeSeconds);
          } else if (horizontalDisplacement.lengthSquared() > 0) {
            enemy.basePosition.addInPlace(horizontalDisplacement);
          }
        } else if (isGroundMovement(enemy.definition)) {
          moveEnemyWithCollisions(scene, enemy, Vector3.Zero(), deltaTimeSeconds);
        }

        // Update 3D model animation, facing, and position
        if ((enemy.kind === "model3d" || enemy.kind === "skeletal") && enemy.model) {
          enemy.model.update(deltaTimeSeconds);
          enemy.setVisualPosition(enemy.basePosition);
          if (playerPosition) {
            const toPlayer = getHorizontalDelta(enemy.basePosition, playerPosition);
            const yaw = Math.atan2(toPlayer.x, toPlayer.z);
            enemy.model.setFacing(yaw);
          }
        }

        // Hit flash for 3D models
        if (enemy.kind === "model3d" || enemy.kind === "skeletal") {
          enemy.setHitFlash(enemy.hitFlashRemaining > 0);
        }

        // Sprite bob
        if (enemy.kind === "sprite") {
          const { bobSpeed, bobAmplitude } = enemy.definition;
          const visualY = enemy.basePosition.y + Math.sin(elapsedSeconds * bobSpeed + enemy.bobOffset) * bobAmplitude;
          enemy.setVisualPosition(new Vector3(enemy.basePosition.x, visualY, enemy.basePosition.z));
          enemy.setHitFlash(enemy.hitFlashRemaining > 0);
        }
      }

      scene.metadata ??= {};
      scene.metadata.enemyCount = enemies.length;
    },

    handlePrimaryFire(camera) {
      const origin = cloneVector3(camera.position);
      const direction = camera.getForwardRay().direction.normalize();
      scene.metadata ??= {};
      scene.metadata.lastPlayerShotAt = performance.now();
      const hit = traceHit(origin, direction, FIRE_RANGE);

      if (hit.type === "miss") {
        scene.metadata.lastPlayerHit = null;
        return hit;
      }

      if (hit.type === "enemy") {
        const enemy = getEnemyById(hit.enemyId);
        if (!enemy) {
          scene.metadata.lastPlayerHit = null;
          return { type: "miss", distance: FIRE_RANGE, position: hit.position };
        }
        return { ...hit, ...applyDamageToEnemy(enemy, 10) };
      }

      scene.metadata.lastPlayerHit = null;
      return hit;
    },

    // Short-range melee attack — same ray logic as handlePrimaryFire but with
    // a configurable range cap and per-hit damage value.
    handleMeleeAttack(camera, range = 128, damage = 50) {
      const origin = cloneVector3(camera.position);
      const direction = camera.getForwardRay().direction.normalize();
      scene.metadata ??= {};
      scene.metadata.lastPlayerShotAt = performance.now();
      const hit = traceHit(origin, direction, range);

      if (hit.type === "enemy") {
        const enemy = getEnemyById(hit.enemyId);
        if (!enemy) {
          scene.metadata.lastPlayerHit = null;
          return { type: "miss", distance: range, position: hit.position };
        }
        return { ...hit, ...applyDamageToEnemy(enemy, damage) };
      }

      if (hit.type === "world") {
        scene.metadata.lastPlayerHit = null;
      }

      return hit;
    },

    traceProjectile(origin, direction, maxDistance = FIRE_RANGE) {
      return traceHit(origin, direction, maxDistance);
    },

    applyProjectileDamage(enemyId, damage) {
      const enemy = getEnemyById(enemyId);
      if (!enemy || enemy.isDead) {
        return null;
      }
      return applyDamageToEnemy(enemy, damage);
    },

    handleExplosionDamage(position, radius, damage) {
      const hits = [];
      for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        if (enemy.isDead) continue;
        const dist = Vector3.Distance(position, enemy.basePosition);
        if (dist > radius) continue;
        const falloff = 1 - dist / radius;
        const actualDamage = Math.round(damage * falloff);
        if (actualDamage <= 0) continue;
        enemy.currentHealth -= actualDamage;
        enemy.hitFlashRemaining = HIT_FLASH_MS;
        const enemyDown = enemy.currentHealth <= 0;
        if (enemyDown) {
          if ((enemy.kind === "model3d" || enemy.kind === "skeletal") && enemy.model) {
            enemy.isDead = true;
            enemy.deathTimer = 3.5;
            enemy._animState = "death";
            const isKnockdownType = (enemy.definition.knockdownCount ?? 0) > 0;
            const deathAnim = enemy.model.hasAnimation("death") ? "death"
                            : (!isKnockdownType && enemy.model.hasAnimation("pain")) ? "pain"
                            : null;
            if (deathAnim) enemy.model.playAnimation(deathAnim, false, animRate(enemy, "death") ?? null);
          } else {
            enemy.dispose();
            enemies.splice(i, 1);
          }
        }
        hits.push({ enemyId: enemy.id, damage: actualDamage, enemyDown, position: enemy.basePosition.clone() });
      }
      return hits;
    },

    getEnemies() { return enemies; },
    getManager(type) { return type ? (managers.get(type) ?? null) : null; },
  };
}

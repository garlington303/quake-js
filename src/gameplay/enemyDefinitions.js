const SKULL_SHEET_URL = new URL("../../assets/enemies/skull_sheet.png", import.meta.url).href;

// Base URL for the Meshy imp model folder.
// "character output.glb" has a space — we encode it so URL parsing stays clean.
const IMP_BASE = "/models/enemies/meshy_monster_imp";

export const ENEMY_DEFINITIONS = {
  // ── Meshy AI rigged enemy ────────────────────────────────────────────────
  imp: {
    // Gameplay stats
    name:                   "imp",
    health:                 30,
    attackDamage:           12,
    attackRange:            72,          // claw reach (Quake units)
    attackCooldownSeconds:  0.9,
    sightRange:             480,
    speed:                  54,          // fast, skittery

    // Ground movement
    movementMode:           "ground",
    hitRadius:              18,
    size:                   56,
    knockdownCount:         0,           // dies cleanly, no knockdown phase

    // ── Skeletal animation setup ──────────────────────────────────────────
    modelType: "skeletal",

    // One GLB per animation clip (Meshy AI export format).
    // Keys must match what enemySystem.js requests: idle / walk / attack / pain / death.
    modelAnims: {
      idle:    `${IMP_BASE}/character_output.glb`,   // standing / base pose
      walk:    `${IMP_BASE}/monster_imp_walking.glb`,
      run:     `${IMP_BASE}/monster_imp_running.glb`,  // used when closing distance fast
      attack:  `${IMP_BASE}/monster_imp_attack.glb`,
      attack2: `${IMP_BASE}/monster_imp_attack2.glb`,  // alternate claw combo
    },

    // Model tuning — tweak if the imp floats or clips into the floor.
    modelFootLift: 0,

    // Rotation offset (radians) applied on top of setFacing yaw.
    // Meshy GLBs typically face –Z after glTF import → add Math.PI to flip.
    // If the imp faces backwards in-game, toggle between 0 and Math.PI here.
    modelFacingOffset: 0,

    // Hitbox override (Quake units) — used by getHitbox() in the skeletal loader.
    modelHalfHeight: 28,
    modelRadius:     16,

    // Animation playback rates (fps) per state - tuned per character feel
    modelAnimRates: {
      idle:   10,  // base pose, slow
      walk:   12,  // skittery scuttle
      attack: 18,  // fast claw strike
      pain:   14,
      death:  10,
    },

    // Sprite fallbacks (unused but required by the shared interface)
    animation:    { delayMs: 100, from: 0, to: 3 },
    bobAmplitude: 0,
    bobSpeed:     0,
    cellHeight:   256,
    cellWidth:    256,
    spriteSheetUrl: SKULL_SHEET_URL,
  },

  // ── Stubs — replace spriteSheetUrl when sprite sheets are available ──────
  grunt: {
    animation: { delayMs: 120, from: 0, to: 3 },
    attackCooldownSeconds: 1.5,
    attackDamage: 10,
    attackRange: 200,
    bobAmplitude: 0,
    bobSpeed: 0,
    cellHeight: 256,
    cellWidth: 256,
    health: 40,
    hitRadius: 20,
    name: "grunt",
    movementMode: "ground",
    sightRange: 400,
    size: 56,
    speed: 36,
    modelAnimRates: { idle: 8, walk: 10, attack: 14, pain: 10, death: 8 },
    spriteSheetUrl: SKULL_SHEET_URL, // placeholder
    modelUrl: "/models/enemies/soldier.glb",
  },

  zombie: {
    animation: { delayMs: 150, from: 0, to: 3 },
    attackCooldownSeconds: 2.0,
    attackDamage: 15,
    attackRange: 64,
    bobAmplitude: 0,
    bobSpeed: 0,
    cellHeight: 256,
    cellWidth: 256,
    health: 60,
    hitRadius: 20,
    name: "zombie",
    movementMode: "ground",
    sightRange: 300,
    size: 56,
    speed: 24,
    spriteSheetUrl: SKULL_SHEET_URL, // placeholder
    modelUrl: "/models/enemies/zombie.glb",
    modelFrameRate: 2.5,
    modelAnimRates: {
      idle:   3,   // lurching stand
      walk:   4,   // shambling walk
      attack: 6,   // toss arm
      pain:   5,   // slow collapse / knockdown fall
      death:  6,   // zdie_ falling over
    },
    modelFootLift: 10,
    knockdownCount: 1,
  },

  knight: {
    animation: { delayMs: 100, from: 0, to: 3 },
    attackCooldownSeconds: 1.2,
    attackDamage: 20,
    attackRange: 80,
    bobAmplitude: 0,
    bobSpeed: 0,
    cellHeight: 256,
    cellWidth: 256,
    health: 75,
    hitRadius: 22,
    name: "knight",
    movementMode: "ground",
    sightRange: 420,
    size: 64,
    speed: 40,
    modelAnimRates: { idle: 8, walk: 10, attack: 14, pain: 10, death: 8 },
    spriteSheetUrl: SKULL_SHEET_URL, // placeholder
    modelUrl: "/models/enemies/knight.glb",
    modelFootLift: 10,
  },

  ogre: {
    animation: { delayMs: 110, from: 0, to: 3 },
    attackCooldownSeconds: 1.8,
    attackDamage: 25,
    attackRange: 320,
    bobAmplitude: 0,
    bobSpeed: 0,
    cellHeight: 256,
    cellWidth: 256,
    health: 100,
    hitRadius: 28,
    name: "ogre",
    movementMode: "ground",
    sightRange: 450,
    size: 72,
    speed: 30,
    modelAnimRates: { idle: 7, walk: 9, attack: 12, pain: 9, death: 7 },
    spriteSheetUrl: SKULL_SHEET_URL, // placeholder
    modelUrl: "/models/enemies/ogre.glb",
  },

  fiend: {
    animation: { delayMs: 90, from: 0, to: 3 },
    attackCooldownSeconds: 0.8,
    attackDamage: 30,
    attackRange: 96,
    bobAmplitude: 0,
    bobSpeed: 0,
    cellHeight: 256,
    cellWidth: 256,
    health: 120,
    hitRadius: 30,
    name: "fiend",
    movementMode: "ground",
    sightRange: 500,
    size: 72,
    speed: 58,
    modelAnimRates: { idle: 10, walk: 14, attack: 18, pain: 12, death: 10 },
    spriteSheetUrl: SKULL_SHEET_URL, // placeholder
    modelUrl: "/models/enemies/fiend.glb",
  },

  shambler: {
    animation: { delayMs: 130, from: 0, to: 3 },
    attackCooldownSeconds: 2.5,
    attackDamage: 50,
    attackRange: 96,
    bobAmplitude: 0,
    bobSpeed: 0,
    cellHeight: 256,
    cellWidth: 256,
    health: 250,
    hitRadius: 40,
    name: "shambler",
    movementMode: "ground",
    sightRange: 600,
    size: 96,
    speed: 28,
    modelAnimRates: { idle: 6, walk: 8, attack: 10, pain: 8, death: 6 },
    spriteSheetUrl: SKULL_SHEET_URL,
    modelUrl: "/models/enemies/shambler.glb",
  },

  soldier: {
    animation: { delayMs: 120, from: 0, to: 3 },
    attackCooldownSeconds: 1.5,
    attackDamage: 10,
    attackRange: 200,
    bobAmplitude: 0, bobSpeed: 0,
    cellHeight: 256, cellWidth: 256,
    health: 30, hitRadius: 20,
    name: "soldier",
    movementMode: "ground",
    sightRange: 400,
    size: 56,
    speed: 36,
    modelAnimRates: { idle: 8, walk: 10, attack: 12, pain: 10, death: 8 },
    spriteSheetUrl: SKULL_SHEET_URL,
    modelUrl: "/models/enemies/soldier.glb",
  },

  dog: {
    animation: { delayMs: 80, from: 0, to: 3 },
    attackCooldownSeconds: 0.7,
    attackDamage: 8,
    attackRange: 64,
    bobAmplitude: 0, bobSpeed: 0,
    cellHeight: 256, cellWidth: 256,
    health: 25, hitRadius: 18,
    name: "dog",
    movementMode: "ground",
    sightRange: 350,
    size: 40,
    speed: 64,
    modelAnimRates: { idle: 10, walk: 16, attack: 18, pain: 12, death: 10 },
    modelFootLift: 20, // Lift dog character above its bounding box floor
    spriteSheetUrl: SKULL_SHEET_URL,
    modelUrl: "/models/enemies/dog.glb",
  },

  hell_knight: {
    animation: { delayMs: 100, from: 0, to: 3 },
    attackCooldownSeconds: 1.0,
    attackDamage: 25,
    attackRange: 96,
    bobAmplitude: 0, bobSpeed: 0,
    cellHeight: 256, cellWidth: 256,
    health: 90, hitRadius: 28,
    name: "hell_knight",
    movementMode: "ground",
    sightRange: 500,
    size: 72,
    speed: 50,
    modelAnimRates: { idle: 8, walk: 11, attack: 14, pain: 10, death: 8 },
    spriteSheetUrl: SKULL_SHEET_URL,
    modelUrl: "/models/enemies/hell_knight.glb",
  },

  wizard: {
    animation: { delayMs: 90, from: 0, to: 3 },
    attackCooldownSeconds: 1.2,
    attackDamage: 15,
    attackRange: 300,
    bobAmplitude: 4, bobSpeed: 2.0,
    cellHeight: 256, cellWidth: 256,
    health: 80, hitRadius: 22,
    name: "wizard",
    movementMode: "hover",
    sightRange: 480,
    size: 56,
    speed: 48,
    modelAnimRates: { idle: 9, walk: 11, attack: 14, pain: 10, death: 9 },
    spriteSheetUrl: SKULL_SHEET_URL,
    modelUrl: "/models/enemies/wizard.glb",
  },

  shalrath: {
    animation: { delayMs: 110, from: 0, to: 3 },
    attackCooldownSeconds: 2.0,
    attackDamage: 20,
    attackRange: 350,
    bobAmplitude: 0, bobSpeed: 0,
    cellHeight: 256, cellWidth: 256,
    health: 200, hitRadius: 32,
    name: "shalrath",
    movementMode: "ground",
    sightRange: 520,
    size: 80,
    speed: 36,
    modelAnimRates: { idle: 8, walk: 10, attack: 11, pain: 9, death: 8 },
    spriteSheetUrl: SKULL_SHEET_URL,
    modelUrl: "/models/enemies/shalrath.glb",
  },

  tarbaby: {
    animation: { delayMs: 100, from: 0, to: 3 },
    attackCooldownSeconds: 0.5,
    attackDamage: 40,
    attackRange: 64,
    bobAmplitude: 2, bobSpeed: 3.0,
    cellHeight: 256, cellWidth: 256,
    health: 80, hitRadius: 20,
    name: "tarbaby",
    movementMode: "hover",
    sightRange: 300,
    size: 40,
    speed: 72,
    modelAnimRates: { idle: 10, walk: 14, attack: 16, pain: 10, death: 12 },
    spriteSheetUrl: SKULL_SHEET_URL,
    modelUrl: "/models/enemies/tarbaby.glb",
  },

  fish: {
    animation: { delayMs: 90, from: 0, to: 3 },
    attackCooldownSeconds: 0.8,
    attackDamage: 10,
    attackRange: 64,
    bobAmplitude: 3, bobSpeed: 2.5,
    cellHeight: 256, cellWidth: 256,
    health: 25, hitRadius: 18,
    name: "fish",
    movementMode: "hover",
    sightRange: 280,
    size: 40,
    speed: 56,
    modelAnimRates: { idle: 10, walk: 12, attack: 14, pain: 10, death: 10 },
    spriteSheetUrl: SKULL_SHEET_URL,
    modelUrl: "/models/enemies/fish.glb",
  },
};

export function getEnemyDefinition(type) {
  return ENEMY_DEFINITIONS[type] ?? null;
}

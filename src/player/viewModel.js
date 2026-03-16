import { Color3, Mesh, MeshBuilder, PointLight, Quaternion, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF";
import { createPixelSpriteEffect } from "../gameplay/pixelSpriteEffect.js";

const VM_OFFSET = new Vector3(0, -0.36, 0.72);
const PROCEDURAL_VM_SCALE = 0.045;

// ── Shotgun ──────────────────────────────────────────────────────────────────
const SHOTGUN_GLB_URL = "/models/shotgun_1.glb";
const SHOTGUN_MODEL_OFFSET = new Vector3(0, -0.3, 0.42);
const SHOTGUN_MODEL_SCALE = 1.1;
const SHOTGUN_MODEL_ROTATION = Quaternion.FromEulerAngles(0, Math.PI / 2, 0);

// ── Grenade ───────────────────────────────────────────────────────────────────
const GRENADE_GLB_URL = "/models/Items%20&%20Weapons/frag_grenade.glb";
const GRENADE_MODEL_OFFSET = new Vector3(0.13, -0.30, 0.54);
const GRENADE_MODEL_SCALE = 0.025;
const GRENADE_MODEL_ROTATION = Quaternion.FromEulerAngles(0.3, 0.2, 0.4);

// ── Staff ─────────────────────────────────────────────────────────────────────
const STAFF_GLB_URL = "/models/Items%20&%20Weapons/ice_mace_staff.glb";
const STAFF_MODEL_OFFSET = new Vector3(0.16, -0.32, 0.50);
const STAFF_MODEL_SCALE = 0.85;
const STAFF_MODEL_ROTATION = Quaternion.FromEulerAngles(Math.PI / 2, 0.15, 0.10);

// ── Sword ─────────────────────────────────────────────────────────────────────
// sword_test.glb: single mesh, no rig, bbox min[-0.11,-0.95,-0.04] max[0.11,0.95,0.04].
// The blade runs along the Y-axis.  We tilt it ~40 ° counter-clockwise in Z so it
// reads as a diagonal one-handed slash weapon held in the lower-right.
const SWORD_GLB_URL = "/models/sword_test.glb";
// Handle off-screen at lower-right; blade runs forward into the scene and angles
// inward toward screen center — identical grammar to the shotgun barrel.
const SWORD_MODEL_OFFSET = new Vector3(0.18, -0.08, 0.10);
const SWORD_MODEL_SCALE = 0.70;
// x: +PI/2 maps blade Y → +Z (forward),  y: -0.20 yaws tip toward screen center,
// z: slight clockwise roll for right-hand grip.
const SWORD_MODEL_ROTATION = Quaternion.FromEulerAngles(Math.PI / 2, -0.20, 0.12);

// ── Mouse sway (weapon inertia) ───────────────────────────────────────────────
const SWAY_SCALE_X = 0.0018;   // horizontal mouse → weapon offset (opposite dir)
const SWAY_SCALE_Y = 0.0008;   // vertical mouse → weapon offset
const SWAY_MAX     = 0.025;    // clamp so fast flicks don't overshoot
const SWAY_LERP    = 8;        // decay rate toward zero (per second)

// ── Strafe tilt ───────────────────────────────────────────────────────────────
const STRAFE_TILT      = 0.055;  // max roll angle (radians) at full strafe
const STRAFE_TILT_LERP = 6;      // smoothing speed

// ── Shared bob ───────────────────────────────────────────────────────────────
const BOB_SPEED_WALK = 4.5;
const BOB_AMP_X_WALK = 0.006;
const BOB_AMP_Y_WALK = 0.008;
const BOB_SPEED_IDLE = 1.2;
const BOB_AMP_Y_IDLE = 0.002;

// ── Grenade throw ────────────────────────────────────────────────────────────
const THROW_DURATION = 0.32;
const THROW_Z = 0.14;
const THROW_ROT_Z = 0.35;

// ── Staff cast ────────────────────────────────────────────────────────────────
const CAST_DURATION = 0.28;
const CAST_Z = 0.10;
const CAST_ROT_X = -0.12;

// ── Shotgun recoil / pump ────────────────────────────────────────────────────
const RECOIL_KICK_Z = -0.20;
const RECOIL_KICK_ROT = -0.14;
const RECOIL_DURATION = 0.11;
const PUMP_DURATION = 0.40;
const PUMP_SLIDE_Z = -0.08;

// ── Sword swing ───────────────────────────────────────────────────────────────
const SWING_DURATION = 0.40;
const THRUST_Z     =  0.62;   // hard lunge forward
const THRUST_Y     = -0.04;   // slight dip
const THRUST_ROT_X =  0;      // no screen-tilt — lunge is pure translation

function configureImportedMaterial(material) {
  if (!material) return;

  // Quake-derived meshes often have thin geometry/cards; disable culling so
  // textured faces do not disappear when viewed from the opposite side.
  material.backFaceCulling = false;
  if ("twoSidedLighting" in material) {
    material.twoSidedLighting = true;
  }

  // Keep alpha-tested textures (fences/cards/decals) rendering consistently.
  if ("useAlphaFromDiffuseTexture" in material) {
    material.useAlphaFromDiffuseTexture = true;
  }
  if ("useAlphaFromAlbedoTexture" in material) {
    material.useAlphaFromAlbedoTexture = true;
  }

  if (Array.isArray(material.subMaterials)) {
    material.subMaterials.forEach((sub) => configureImportedMaterial(sub));
  }
}

function buildFallbackShotgun(scene, parent) {
  const root = new TransformNode("viewmodel-fallback", scene);
  root.parent = parent;
  root.scaling.setAll(PROCEDURAL_VM_SCALE);

  const gunMat = new StandardMaterial("gun-metal", scene);
  gunMat.diffuseColor = new Color3(0.18, 0.18, 0.2);
  gunMat.specularColor = new Color3(0.35, 0.35, 0.38);
  gunMat.specularPower = 40;

  const woodMat = new StandardMaterial("gun-wood", scene);
  woodMat.diffuseColor = new Color3(0.38, 0.22, 0.1);
  woodMat.specularColor = new Color3(0.15, 0.1, 0.06);
  woodMat.specularPower = 12;

  const darkMat = new StandardMaterial("gun-dark", scene);
  darkMat.diffuseColor = new Color3(0.1, 0.1, 0.12);
  darkMat.specularColor = new Color3(0.2, 0.2, 0.22);
  darkMat.specularPower = 30;

  const barrel = MeshBuilder.CreateCylinder("barrel", {
    height: 10,
    diameterTop: 0.7,
    diameterBottom: 0.75,
    tessellation: 8,
  }, scene);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.3, 5);
  barrel.material = gunMat;
  barrel.parent = root;

  const barrel2 = barrel.clone("barrel2");
  barrel2.position.set(0, 0.85, 5);
  barrel2.parent = root;

  const shroud = MeshBuilder.CreateBox("shroud", {
    width: 1.2,
    height: 0.9,
    depth: 7,
  }, scene);
  shroud.position.set(0, 0.55, 5.8);
  shroud.material = darkMat;
  shroud.parent = root;

  const receiver = MeshBuilder.CreateBox("receiver", {
    width: 1.4,
    height: 1.6,
    depth: 4,
  }, scene);
  receiver.position.set(0, 0, 1.5);
  receiver.material = gunMat;
  receiver.parent = root;

  const receiverTop = MeshBuilder.CreateBox("receiver-top", {
    width: 1.2,
    height: 0.4,
    depth: 4.2,
  }, scene);
  receiverTop.position.set(0, 0.95, 1.5);
  receiverTop.material = darkMat;
  receiverTop.parent = root;

  const pump = MeshBuilder.CreateBox("pump", {
    width: 1,
    height: 0.8,
    depth: 2,
  }, scene);
  pump.position.set(0, -0.15, 4.2);
  pump.material = woodMat;
  pump.parent = root;

  const stock = MeshBuilder.CreateBox("stock", {
    width: 1,
    height: 1.2,
    depth: 3,
  }, scene);
  stock.position.set(0, -0.3, -1.2);
  stock.material = woodMat;
  stock.parent = root;

  const stockButt = MeshBuilder.CreateBox("stock-butt", {
    width: 1,
    height: 1.6,
    depth: 0.5,
  }, scene);
  stockButt.position.set(0, -0.5, -2.6);
  stockButt.material = woodMat;
  stockButt.parent = root;

  const triggerGuard = MeshBuilder.CreateBox("trigger-guard", {
    width: 0.3,
    height: 0.9,
    depth: 1.2,
  }, scene);
  triggerGuard.position.set(0, -0.9, 0.8);
  triggerGuard.material = gunMat;
  triggerGuard.parent = root;

  const muzzleRing = MeshBuilder.CreateTorus("muzzle-ring", {
    diameter: 1,
    thickness: 0.15,
    tessellation: 12,
  }, scene);
  muzzleRing.rotation.x = Math.PI / 2;
  muzzleRing.position.set(0, 0.55, 9.5);
  muzzleRing.material = darkMat;
  muzzleRing.parent = root;

  for (const mesh of root.getChildMeshes()) {
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.renderingGroupId = 1;
  }

  return {
    pump,
    root,
  };
}

async function loadShotgunModel(scene, parent) {
  const modelRoot = new TransformNode("viewmodel-shotgun-glb", scene);
  modelRoot.parent = parent;
  modelRoot.position.copyFrom(SHOTGUN_MODEL_OFFSET);
  modelRoot.scaling.setAll(SHOTGUN_MODEL_SCALE);
  modelRoot.rotationQuaternion = SHOTGUN_MODEL_ROTATION.clone();

  const response = await fetch(SHOTGUN_GLB_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch shotgun GLB: ${response.status} ${response.statusText}`);
  }

  const blob = new Blob([await response.arrayBuffer()], { type: "model/gltf-binary" });
  const blobUrl = URL.createObjectURL(blob);
  const result = await SceneLoader.ImportMeshAsync("", "", blobUrl, scene, undefined, ".glb");
  URL.revokeObjectURL(blobUrl);

  result.materials?.forEach((material) => configureImportedMaterial(material));
  const meshSet = new Set(result.meshes);
  const topLevelMeshes = result.meshes.filter((mesh) => !mesh.parent || !meshSet.has(mesh.parent));

  topLevelMeshes.forEach((mesh) => {
    mesh.parent = modelRoot;
  });

  result.meshes.forEach((mesh) => {
    configureImportedMaterial(mesh.material);
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.renderingGroupId = 1;
    mesh.alwaysSelectAsActiveMesh = true;
  });

  return {
    dispose() {
      modelRoot.dispose();
      result.meshes.forEach((mesh) => mesh.dispose());
    },
    root: modelRoot,
  };
}

async function loadSwordModel(scene, parent) {
  const modelRoot = new TransformNode("viewmodel-sword-glb", scene);
  modelRoot.parent = parent;
  modelRoot.position.copyFrom(SWORD_MODEL_OFFSET);
  modelRoot.scaling.setAll(SWORD_MODEL_SCALE);
  modelRoot.rotationQuaternion = SWORD_MODEL_ROTATION.clone();
  // Hidden by default — shotgun is the starting weapon.
  modelRoot.setEnabled(false);

  // Load via direct origin URL so dynamic-import paths resolve against the page.
  const result = await SceneLoader.ImportMeshAsync(
    "", window.location.origin + "/models/", "sword_test.glb", scene,
  );

  result.materials?.forEach((material) => configureImportedMaterial(material));
  const meshSet = new Set(result.meshes);
  const topLevelMeshes = result.meshes.filter((mesh) => !mesh.parent || !meshSet.has(mesh.parent));

  topLevelMeshes.forEach((mesh) => {
    mesh.parent = modelRoot;
  });

  result.meshes.forEach((mesh) => {
    configureImportedMaterial(mesh.material);
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.renderingGroupId = 1;
    mesh.alwaysSelectAsActiveMesh = true;
  });

  return {
    dispose() {
      modelRoot.dispose();
      result.meshes.forEach((mesh) => mesh.dispose());
    },
    root: modelRoot,
  };
}

async function loadGrenadeModel(scene, parent) {
  const modelRoot = new TransformNode("viewmodel-grenade-glb", scene);
  modelRoot.parent = parent;
  modelRoot.position.copyFrom(GRENADE_MODEL_OFFSET);
  modelRoot.scaling.setAll(GRENADE_MODEL_SCALE);
  modelRoot.rotationQuaternion = GRENADE_MODEL_ROTATION.clone();
  modelRoot.setEnabled(false);

  const result = await SceneLoader.ImportMeshAsync("", window.location.origin + "/models/Items%20&%20Weapons/", "frag_grenade.glb", scene);
  result.materials?.forEach((m) => configureImportedMaterial(m));
  const meshSet = new Set(result.meshes);
  result.meshes.filter((m) => !m.parent || !meshSet.has(m.parent)).forEach((m) => { m.parent = modelRoot; });
  result.meshes.forEach((mesh) => {
    configureImportedMaterial(mesh.material);
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.renderingGroupId = 1;
    mesh.alwaysSelectAsActiveMesh = true;
  });
  return { root: modelRoot };
}

async function loadStaffModel(scene, parent) {
  const modelRoot = new TransformNode("viewmodel-staff-glb", scene);
  modelRoot.parent = parent;
  modelRoot.position.copyFrom(STAFF_MODEL_OFFSET);
  modelRoot.scaling.setAll(STAFF_MODEL_SCALE);
  modelRoot.rotationQuaternion = STAFF_MODEL_ROTATION.clone();
  modelRoot.setEnabled(false);

  const result = await SceneLoader.ImportMeshAsync("", window.location.origin + "/models/Items%20&%20Weapons/", "ice_mace_staff.glb", scene);
  result.materials?.forEach((m) => configureImportedMaterial(m));
  const meshSet = new Set(result.meshes);
  result.meshes.filter((m) => !m.parent || !meshSet.has(m.parent)).forEach((m) => { m.parent = modelRoot; });
  result.meshes.forEach((mesh) => {
    configureImportedMaterial(mesh.material);
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.renderingGroupId = 1;
    mesh.alwaysSelectAsActiveMesh = true;
  });
  return { root: modelRoot };
}

// Flash is parented directly to the camera and pinned at the crosshair centre.
// Z distance is close enough to always appear in front of the gun but far enough
// not to clip with the near plane.
const MUZZLE_FLASH_Z = 0.9;
const MUZZLE_FLASH_SIZE = 0.28;

function createMuzzleFlash(scene, camera) {
  const flash = createPixelSpriteEffect(scene, {
    billboardMode: Mesh.BILLBOARDMODE_ALL,
    columns: 6,
    rows: 1,
    frameCount: 6,
    frameRate: 20,
    parent: camera,
    renderGroupId: 2,
    size: MUZZLE_FLASH_SIZE,
    textureUrl: "/ui/muzzle_flash.png?v=2",
  });
  // Crosshair centre — (0, 0, Z) in camera-local space is always dead-centre.
  flash.mesh.position.set(0, 0, MUZZLE_FLASH_Z);
  flash.mesh.isVisible = false;
  return flash;
}

export function createViewModel(scene, camera) {
  const root = new TransformNode("viewmodel-root", scene);
  root.parent = camera;
  root.position.copyFrom(VM_OFFSET);

  // Small fill light so the held weapon is always visible in dark areas.
  // Short range so it doesn't bleed into the world geometry.
  const vmLight = new PointLight("viewmodel-light", new Vector3(0.1, 0.0, 0.5), scene);
  vmLight.parent = camera;
  vmLight.diffuse = new Color3(0.85, 0.85, 0.9);
  vmLight.specular = new Color3(0.2, 0.2, 0.22);
  vmLight.intensity = 4.0;
  vmLight.range = 3.5;

  // ── Shotgun slot (fallback geometry until GLB loads) ──────────────────────
  const fallback = buildFallbackShotgun(scene, root);
  const flash = createMuzzleFlash(scene, camera);
  let activePump = fallback.pump;
  const pumpRestZ = fallback.pump.position.z;

  // Track loaded mesh roots for toggling visibility on weapon switch.
  let activeWeapon = "shotgun";
  let shotgunMeshRoot = null;
  let swordMeshRoot = null;
  let grenadeMeshRoot = null;
  let staffMeshRoot = null;
  let fallbackActive = true;

  loadShotgunModel(scene, root)
    .then((model) => {
      fallback.root.dispose();
      fallbackActive = false;
      activePump = null;
      shotgunMeshRoot = model.root;
      // If the player already switched away, stay hidden.
      shotgunMeshRoot.setEnabled(activeWeapon === "shotgun");
    })
    .catch((error) => {
      console.warn("Failed to load shotgun GLB viewmodel, using fallback mesh.", error);
    });

  loadSwordModel(scene, root)
    .then((model) => {
      swordMeshRoot = model.root;
      swordMeshRoot.setEnabled(activeWeapon === "sword");
    })
    .catch((error) => {
      console.warn("Failed to load sword GLB viewmodel.", error);
    });

  loadGrenadeModel(scene, root)
    .then((model) => {
      grenadeMeshRoot = model.root;
      grenadeMeshRoot.setEnabled(activeWeapon === "grenade");
    })
    .catch((error) => {
      console.warn("Failed to load grenade GLB viewmodel.", error);
    });

  loadStaffModel(scene, root)
    .then((model) => {
      staffMeshRoot = model.root;
      staffMeshRoot.setEnabled(activeWeapon === "staff");
    })
    .catch((error) => {
      console.warn("Failed to load staff GLB viewmodel.", error);
    });

  // ── Animation state ───────────────────────────────────────────────────────
  let prevCamPos = camera.position.clone();
  let bobPhase = 0;
  let recoilTimer = -1;
  let pumpTimer = -1;
  let swingTimer = -1;
  let throwTimer = -1;   // grenade throw
  let castTimer = -1;    // staff cast
  let swayX = 0;         // mouse sway accumulators
  let swayY = 0;
  let strafeTilt = 0;    // current strafe roll (radians)

  // ── Public API ─────────────────────────────────────────────────────────────
  function setWeapon(weapon) {
    if (weapon === activeWeapon) return;
    activeWeapon = weapon;

    // Toggle shotgun (GLB or fallback geometry).
    const shotgunOn = weapon === "shotgun";
    if (shotgunMeshRoot) shotgunMeshRoot.setEnabled(shotgunOn);
    else if (fallbackActive) fallback.root.setEnabled(shotgunOn);
    flash.mesh.isVisible = false;

    if (swordMeshRoot) swordMeshRoot.setEnabled(weapon === "sword");
    if (grenadeMeshRoot) grenadeMeshRoot.setEnabled(weapon === "grenade");
    if (staffMeshRoot) staffMeshRoot.setEnabled(weapon === "staff");

    // Reset pending animations so they don't bleed across weapons.
    recoilTimer = -1;
    pumpTimer = -1;
    swingTimer = -1;
    throwTimer = -1;
    castTimer = -1;
    root.rotation.set(0, 0, 0);
  }

  function fire() {
    if (activeWeapon !== "shotgun") return;
    recoilTimer = RECOIL_DURATION;
    pumpTimer = PUMP_DURATION;
    flash.restart();
  }

  function swingMelee() {
    if (activeWeapon !== "sword") return;
    swingTimer = SWING_DURATION;
  }

  function throwGrenade() {
    if (activeWeapon !== "grenade") return;
    throwTimer = THROW_DURATION;
  }

  function castStaff() {
    if (activeWeapon !== "staff") return;
    castTimer = CAST_DURATION;
  }

  function update(dt, lookDelta = null, lateralInput = 0) {
    // ── Mouse sway ────────────────────────────────────────────────────────
    if (lookDelta) {
      // Accumulate opposite to look direction so weapon appears to lag behind
      swayX = Math.max(-SWAY_MAX, Math.min(SWAY_MAX, swayX - lookDelta.x * SWAY_SCALE_X));
      swayY = Math.max(-SWAY_MAX, Math.min(SWAY_MAX, swayY - lookDelta.y * SWAY_SCALE_Y));
    }
    const decay = Math.min(1, SWAY_LERP * dt);
    swayX -= swayX * decay;
    swayY -= swayY * decay;

    // ── Strafe tilt ───────────────────────────────────────────────────────
    const targetTilt = STRAFE_TILT * lateralInput;
    strafeTilt += (targetTilt - strafeTilt) * Math.min(1, STRAFE_TILT_LERP * dt);

    // ── Viewmodel bob (shared across weapons) ─────────────────────────────
    const camPos = camera.position;
    const dx = camPos.x - prevCamPos.x;
    const dz = camPos.z - prevCamPos.z;
    const speed = Math.sqrt(dx * dx + dz * dz) / Math.max(dt, 0.0001);
    prevCamPos.copyFrom(camPos);

    const isMoving = speed > 5;
    bobPhase += dt * (isMoving ? BOB_SPEED_WALK : BOB_SPEED_IDLE);
    const bobX = Math.sin(bobPhase) * (isMoving ? BOB_AMP_X_WALK : 0);
    const bobY = Math.sin(bobPhase * 2) * (isMoving ? BOB_AMP_Y_WALK : BOB_AMP_Y_IDLE);

    // ── Shotgun recoil + pump ────────────────────────────────────────────
    let recoilZ = 0;
    let recoilRot = 0;

    if (recoilTimer > 0) {
      recoilTimer -= dt;
      const normalized = Math.max(0, recoilTimer / RECOIL_DURATION);
      recoilZ = RECOIL_KICK_Z * normalized;
      recoilRot = RECOIL_KICK_ROT * normalized;
    }

    if (activePump && pumpTimer > 0) {
      pumpTimer -= dt;
      const tNorm = 1 - (pumpTimer / PUMP_DURATION);
      const pumpOffset = tNorm < 0.5
        ? PUMP_SLIDE_Z * (tNorm * 2)
        : PUMP_SLIDE_Z * (1 - (tNorm - 0.5) * 2);
      activePump.position.z = pumpRestZ + pumpOffset;
    } else if (activePump) {
      activePump.position.z = pumpRestZ;
    }

    if (flash.mesh.isVisible && flash.update(dt, false)) {
      flash.mesh.isVisible = false;
    }

    // ── Sword thrust ─────────────────────────────────────────────────────
    let swingY = 0, swingZ = 0, swingRotX = 0;

    if (swingTimer > 0) {
      swingTimer -= dt;
      const t   = 1 - swingTimer / SWING_DURATION;
      const env = Math.sin(t * Math.PI);
      swingZ    = THRUST_Z     * env;
      swingY    = THRUST_Y     * env;
      swingRotX = THRUST_ROT_X * env;
    }

    // ── Grenade throw ─────────────────────────────────────────────────────
    let throwZ = 0, throwRotZ = 0;
    if (throwTimer > 0) {
      throwTimer -= dt;
      const t   = 1 - throwTimer / THROW_DURATION;
      const env = Math.sin(t * Math.PI);
      throwZ    = THROW_Z     * env;
      throwRotZ = THROW_ROT_Z * env;
    }

    // ── Staff cast ────────────────────────────────────────────────────────
    let castZ = 0, castRotX = 0;
    if (castTimer > 0) {
      castTimer -= dt;
      const t   = 1 - castTimer / CAST_DURATION;
      const env = Math.sin(t * Math.PI);
      castZ    = CAST_Z     * env;
      castRotX = CAST_ROT_X * env;
    }

    // ── Apply combined offsets ────────────────────────────────────────────
    root.position.set(
      VM_OFFSET.x + bobX + swayX,
      VM_OFFSET.y + bobY + swingY + swayY,
      VM_OFFSET.z + recoilZ + swingZ + throwZ + castZ,
    );
    root.rotation.x = 0;
    root.rotation.z = strafeTilt;
  }

  return { fire, swingMelee, throwGrenade, castStaff, setWeapon, update, root };
}

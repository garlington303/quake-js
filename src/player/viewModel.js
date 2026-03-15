import { Color3, Mesh, MeshBuilder, Quaternion, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF";
import { createPixelSpriteEffect } from "../gameplay/pixelSpriteEffect.js";

const VM_OFFSET = new Vector3(0, -0.36, 0.72);
const PROCEDURAL_VM_SCALE = 0.045;
const SHOTGUN_GLB_URL = "/models/shotgun_1.glb";
const SHOTGUN_MODEL_OFFSET = new Vector3(0, -0.3, 0.42);
const SHOTGUN_MODEL_SCALE = 1.1;
// Explicit FPS orientation for this asset/camera setup:
// barrel points away from player and model stays upright.
const SHOTGUN_MODEL_ROTATION = Quaternion.FromEulerAngles(0, Math.PI / 2, 0);

const BOB_SPEED_WALK = 4.5;
const BOB_AMP_X_WALK = 0.006;
const BOB_AMP_Y_WALK = 0.008;
const BOB_SPEED_IDLE = 1.2;
const BOB_AMP_Y_IDLE = 0.002;

const RECOIL_KICK_Z = -0.20;      // was -0.12 — pronounced muzzle push
const RECOIL_KICK_ROT = -0.14;    // was -0.08 — visible barrel rise
const RECOIL_DURATION = 0.11;     // was 0.07  — brief hang at peak
const PUMP_DURATION = 0.40;       // was 0.28  — slow deliberate pump action
const PUMP_SLIDE_Z = -0.08;

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

// ── Procedural PSX-style hands ───────────────────────────────────────────────
// Positions derived from live bounding-box: gun in vmRoot-local space at
// X(0.18-0.25), Y(-0.10 to 0.17), Z(-0.39 to 1.19).
// Right hand wraps the grip (~Z 0.15-0.35), left hand supports the pump (~Z 0.65-0.85).
function buildHands(scene, parent) {
  const mat = new StandardMaterial("hand-mat", scene);
  // Quake-brown — dark tanned leather/skin, PSX low-light palette.
  mat.diffuseColor  = new Color3(0.46, 0.31, 0.18);
  mat.emissiveColor = new Color3(0.10, 0.06, 0.03);
  mat.specularColor = Color3.Black();
  mat.backFaceCulling = false;

  function box(name, w, h, d, x, y, z) {
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.position.set(x, y, z);
    m.material = mat;
    m.parent = parent;
    m.renderingGroupId = 1;
    m.isPickable = false;
    m.receiveShadows = false;
    m.alwaysSelectAsActiveMesh = true;
    return m;
  }

  // ── Right hand (dominant — trigger / grip) ───────────────────────────────
  box("hand-r-palm",    0.090, 0.060, 0.110,  0.19, -0.185, 0.270);
  box("hand-r-knuckle", 0.080, 0.032, 0.048,  0.18, -0.138, 0.305);
  box("hand-r-arm",     0.082, 0.130, 0.085,  0.19, -0.295, 0.200);

  // ── Left hand (support — under pump / forestock) ─────────────────────────
  box("hand-l-palm",    0.090, 0.058, 0.110,  0.20, -0.185, 0.775);
  box("hand-l-knuckle", 0.080, 0.030, 0.048,  0.19, -0.138, 0.810);
  box("hand-l-arm",     0.082, 0.130, 0.085,  0.20, -0.295, 0.705);
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

  const fallback = buildFallbackShotgun(scene, root);
  buildHands(scene, root);
  const flash = createMuzzleFlash(scene, camera);
  let activePump = fallback.pump;
  let prevCamPos = camera.position.clone();
  let bobPhase = 0;
  let recoilTimer = -1;
  let pumpTimer = -1;
  const pumpRestZ = fallback.pump.position.z;

  loadShotgunModel(scene, root)
    .then((model) => {
      fallback.root.dispose();
      activePump = null;
      return model;
    })
    .catch((error) => {
      console.warn("Failed to load shotgun GLB viewmodel, using fallback mesh.", error);
    });

  function fire() {
    recoilTimer = RECOIL_DURATION;
    pumpTimer = PUMP_DURATION;
    flash.restart();
  }

  function update(dt) {
    const camPos = camera.position;
    const dx = camPos.x - prevCamPos.x;
    const dz = camPos.z - prevCamPos.z;
    const speed = Math.sqrt(dx * dx + dz * dz) / Math.max(dt, 0.0001);
    prevCamPos.copyFrom(camPos);

    const isMoving = speed > 5;
    const bobSpeed = isMoving ? BOB_SPEED_WALK : BOB_SPEED_IDLE;
    const bobAmpX = isMoving ? BOB_AMP_X_WALK : 0;
    const bobAmpY = isMoving ? BOB_AMP_Y_WALK : BOB_AMP_Y_IDLE;
    bobPhase += dt * bobSpeed;

    const bobX = Math.sin(bobPhase) * bobAmpX;
    const bobY = Math.sin(bobPhase * 2) * bobAmpY;

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

    root.position.set(
      VM_OFFSET.x + bobX,
      VM_OFFSET.y + bobY,
      VM_OFFSET.z + recoilZ,
    );
    root.rotation.x = recoilRot;
  }

  return { fire, update, root };
}

import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Light } from "@babylonjs/core/Lights/light.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { SpotLight } from "@babylonjs/core/Lights/spotLight.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF";

const FLASHLIGHT_GLB_DIR = "/models/Items%20&%20Weapons/";
const FLASHLIGHT_GLB_FILE = "flashlight_1.glb";
const FLASHLIGHT_OFFSET = new Vector3(0.3, -0.3, 0.4);
const FLASHLIGHT_SCALE = 0.8;
const FLASHLIGHT_ROTATION = Quaternion.FromEulerAngles(0, Math.PI / 2, 0);

// Walk bob constants (matches viewModel feel)
const BOB_SPEED_WALK = 4.5;
const BOB_AMP_X_WALK = 0.005;
const BOB_AMP_Y_WALK = 0.007;
const BOB_SPEED_IDLE = 1.2;
const BOB_AMP_Y_IDLE = 0.0015;

// Subtle beam flicker
const FLICKER_SPEED = 7;
const FLICKER_AMOUNT = 0.06;
const BASE_INTENSITY = 14;

// Radial ambient glow from the flashlight body
const GLOW_INTENSITY = 2.1;
const GLOW_RANGE = 72;

export function createFlashlight(scene, camera) {
  const root = new TransformNode("flashlight-root", scene);
  root.parent = camera;
  root.position.copyFrom(FLASHLIGHT_OFFSET);
  root.rotationQuaternion = FLASHLIGHT_ROTATION.clone();

  const spotLight = new SpotLight(
    "flashlight-spot",
    new Vector3(0.25, -0.15, 0.8),
    new Vector3(0, 0, 1),
    Math.PI / 2.9,
    0.9,
    scene,
  );
  spotLight.diffuse = new Color3(1, 0.94, 0.86);
  spotLight.specular = new Color3(0.2, 0.2, 0.16);
  spotLight.intensity = BASE_INTENSITY;
  spotLight.falloffType = Light.FALLOFF_PHYSICAL;
  // A non-zero radius gives softer highlights and less "laser-point" response.
  spotLight.radius = 0.5;
  // Inner/outer cone separation creates a soft penumbra edge.
  spotLight.innerAngle = Math.PI / 5;
  spotLight.range = 220;
  spotLight.shadowMinZ = 0.1;
  spotLight.parent = camera;
  spotLight.setEnabled(false);

  // Radial ambient glow — lights up the area around the player softly
  const pointLight = new PointLight("flashlight-glow", new Vector3(0, 0, 0.5), scene);
  pointLight.diffuse = new Color3(0.9, 0.85, 0.7);
  pointLight.specular = new Color3(0.1, 0.1, 0.08);
  pointLight.intensity = GLOW_INTENSITY;
  pointLight.falloffType = Light.FALLOFF_PHYSICAL;
  pointLight.radius = 0.75;
  pointLight.range = GLOW_RANGE;
  pointLight.parent = camera;
  pointLight.setEnabled(false);

  let isOn = false;
  let bobPhase = 0;
  let prevCamPos = camera.position.clone();

  loadFlashlightModel(scene, root).then(() => {
    root.setEnabled(isOn);
  }).catch((err) => {
    console.warn("Failed to load flashlight GLB, using light only.", err);
  });

  root.setEnabled(false);

  function toggle() {
    isOn = !isOn;
    spotLight.setEnabled(isOn);
    pointLight.setEnabled(isOn);
    root.setEnabled(isOn);
    return isOn;
  }

  function update(dt) {
    if (!isOn) return;

    // Walk bob
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

    root.position.set(
      FLASHLIGHT_OFFSET.x + Math.sin(bobPhase) * bobAmpX,
      FLASHLIGHT_OFFSET.y + Math.sin(bobPhase * 2) * bobAmpY,
      FLASHLIGHT_OFFSET.z,
    );

    // Subtle beam flicker
    const flicker = 1 - FLICKER_AMOUNT * 0.5 + Math.sin(performance.now() * 0.001 * FLICKER_SPEED) * FLICKER_AMOUNT * 0.5;
    spotLight.intensity = BASE_INTENSITY * flicker;
    pointLight.intensity = GLOW_INTENSITY * flicker;
  }

  return { toggle, update, get isOn() { return isOn; } };
}

async function loadFlashlightModel(scene, parent) {
  const result = await SceneLoader.ImportMeshAsync("", FLASHLIGHT_GLB_DIR, FLASHLIGHT_GLB_FILE, scene);

  const meshSet = new Set(result.meshes);
  const topLevel = result.meshes.filter((m) => !m.parent || !meshSet.has(m.parent));
  topLevel.forEach((m) => { m.parent = parent; });

  parent.scaling.setAll(FLASHLIGHT_SCALE);

  result.meshes.forEach((mesh) => {
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.renderingGroupId = 1;
    mesh.alwaysSelectAsActiveMesh = true;
  });
}

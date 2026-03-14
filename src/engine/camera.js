import { UniversalCamera, Vector3 } from "@babylonjs/core";

const PITCH_LIMIT = Math.PI / 2 - 0.05;

export function setupCamera(scene, canvas) {
  const camera = new UniversalCamera("player-camera", new Vector3(0, 1.8, -8), scene);

  camera.minZ = 0.1;
  camera.speed = 0;
  camera.inertia = 0;
  camera.angularSensibility = 4000;
  camera.fov = 1.2;

  camera.checkCollisions = false;
  camera.applyGravity = false;

  camera.keysUp = [];
  camera.keysDown = [];
  camera.keysLeft = [];
  camera.keysRight = [];
  camera.inputs.clear();
  camera.attachControl(canvas, true);

  scene.onBeforeRenderObservable.add(() => {
    camera.rotation.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, camera.rotation.x));
  });

  return camera;
}

import { Color3, DirectionalLight, HemisphericLight, ImageProcessingConfiguration, MeshBuilder, Scene, StandardMaterial, Vector3 } from "@babylonjs/core";

const GRAVITY_UNITS_PER_SECOND_SQUARED = 800;

function createGround(scene) {
  const ground = MeshBuilder.CreateGround(
    "ground",
    {
      width: 80,
      height: 80,
      subdivisions: 2,
    },
    scene,
  );

  const material = new StandardMaterial("ground-material", scene);
  material.diffuseColor = new Color3(0.28, 0.32, 0.24);
  material.specularColor = Color3.Black();

  ground.material = material;
  ground.position.y = 0;
  ground.checkCollisions = true;

  return ground;
}

function createTestEnvironment(scene) {
  const wallMaterial = new StandardMaterial("wall-material", scene);
  wallMaterial.diffuseColor = new Color3(0.45, 0.41, 0.37);
  wallMaterial.specularColor = Color3.Black();

  const blockDefinitions = [
    { name: "crate-a", position: new Vector3(6, 1.5, 6), size: 3 },
    { name: "crate-b", position: new Vector3(-8, 2, -4), size: 4 },
    { name: "pillar-a", position: new Vector3(-10, 3, 10), width: 2, depth: 2, height: 6 },
    { name: "pillar-b", position: new Vector3(12, 2.5, -10), width: 3, depth: 3, height: 5 },
    { name: "wall-a", position: new Vector3(0, 2, 18), width: 20, depth: 1.5, height: 4 },
    { name: "wall-b", position: new Vector3(-18, 2, 0), width: 1.5, depth: 20, height: 4 },
  ];

  blockDefinitions.forEach((definition) => {
    const box = MeshBuilder.CreateBox(
      definition.name,
      {
        size: definition.size,
        width: definition.width,
        depth: definition.depth,
        height: definition.height,
      },
      scene,
    );

    box.material = wallMaterial;
    box.position.copyFrom(definition.position);
    box.checkCollisions = true;
  });
}

export function createFallbackEnvironment(scene) {
  createGround(scene);
  createTestEnvironment(scene);
}

export function createScene(engine, canvas) {
  const scene = new Scene(engine);

  scene.clearColor.set(0.06, 0.08, 0.11, 1.0);
  scene.collisionsEnabled = true;
  scene.gravity = new Vector3(0, -GRAVITY_UNITS_PER_SECOND_SQUARED, 0);

  const keyLight = new DirectionalLight("key-light", new Vector3(-0.35, -1, -0.25), scene);
  keyLight.intensity = 1.15;
  keyLight.diffuse = new Color3(1, 0.96, 0.9);
  keyLight.specular = new Color3(0.5, 0.5, 0.5);

  const light = new HemisphericLight("sky-light", new Vector3(0.2, 1, 0.1), scene);
  light.intensity = 0.85;
  light.diffuse = new Color3(0.85, 0.9, 0.95);
  light.groundColor = new Color3(0.35, 0.38, 0.45);
  light.specular = Color3.Black();

  const fillLight = new HemisphericLight("fill-light", new Vector3(0, -1, 0), scene);
  fillLight.intensity = 0.25;
  fillLight.diffuse = new Color3(0.35, 0.38, 0.45);
  fillLight.groundColor = new Color3(0.5, 0.45, 0.4);
  fillLight.specular = Color3.Black();

  scene.ambientColor = new Color3(0.24, 0.24, 0.24);

  const imageProcessing = scene.imageProcessingConfiguration;
  imageProcessing.exposure = 1.1;
  imageProcessing.contrast = 1.25;
  imageProcessing.toneMappingEnabled = true;
  imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;

  canvas.addEventListener("click", () => {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  });

  return scene;
}

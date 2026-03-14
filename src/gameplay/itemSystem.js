import { Color3, MeshBuilder, StandardMaterial, Vector3 } from "@babylonjs/core";

const PICKUP_RADIUS = 32;

const PICKUP_CONFIG = {
  item_health: {
    color: new Color3(0.9, 0.15, 0.15),
    shape: "sphere",
    getValue: (props) => {
      const amounts = { small: 15, large: 25, mega: 100 };
      return { health: amounts[props.type ?? "small"] ?? 25 };
    },
  },
  item_armor: {
    color: new Color3(0.15, 0.75, 0.2),
    shape: "sphere",
    getValue: (props) => {
      const amounts = { green: 100, yellow: 150, red: 200 };
      return { armor: amounts[props.type ?? "green"] ?? 100 };
    },
  },
  item_ammo_shells: {
    color: new Color3(0.85, 0.55, 0.1),
    shape: "box",
    getValue: (props) => ({ ammo_shells: Number(props.amount ?? 20) }),
  },
  item_ammo_nails: {
    color: new Color3(0.85, 0.75, 0.1),
    shape: "box",
    getValue: (props) => ({ ammo_nails: Number(props.amount ?? 30) }),
  },
  item_ammo_rockets: {
    color: new Color3(0.9, 0.3, 0.1),
    shape: "box",
    getValue: (props) => ({ ammo_rockets: Number(props.amount ?? 5) }),
  },
  item_ammo_cells: {
    color: new Color3(0.2, 0.6, 0.9),
    shape: "box",
    getValue: (props) => ({ ammo_cells: Number(props.amount ?? 15) }),
  },
  weapon_shotgun:        { color: new Color3(0.3, 0.3, 0.9), shape: "box", getValue: () => ({ weapon: "shotgun" }) },
  weapon_supershotgun:   { color: new Color3(0.3, 0.3, 0.9), shape: "box", getValue: () => ({ weapon: "supershotgun" }) },
  weapon_nailgun:        { color: new Color3(0.3, 0.3, 0.9), shape: "box", getValue: () => ({ weapon: "nailgun" }) },
  weapon_rocketlauncher: { color: new Color3(0.3, 0.3, 0.9), shape: "box", getValue: () => ({ weapon: "rocketlauncher" }) },
  weapon_lightning:      { color: new Color3(0.3, 0.3, 0.9), shape: "box", getValue: () => ({ weapon: "lightning" }) },
};

function createPickupMesh(scene, classname, position) {
  const config = PICKUP_CONFIG[classname];
  if (!config) return null;

  const name = `pickup-${classname}-${position.x}-${position.z}`;
  let mesh;

  if (config.shape === "sphere") {
    mesh = MeshBuilder.CreateSphere(name, { diameter: 20 }, scene);
  } else {
    mesh = MeshBuilder.CreateBox(name, { size: 18 }, scene);
  }

  const mat = new StandardMaterial(`${name}-mat`, scene);
  mat.diffuseColor = config.color;
  mat.emissiveColor = config.color.scale(0.4);
  mesh.material = mat;
  mesh.position.copyFrom(position);
  mesh.position.y += 8;
  mesh.isPickable = false;
  mesh.checkCollisions = false;

  return mesh;
}

export function createItemSystem(scene) {
  const pickups = [];

  function spawnPickup({ classname, position, properties = {} }) {
    const config = PICKUP_CONFIG[classname];
    if (!config) return null;

    const mesh = createPickupMesh(scene, classname, position);
    if (!mesh) return null;

    const pickup = {
      classname,
      mesh,
      position: position.clone().addInPlace(new Vector3(0, 8, 0)),
      properties,
      bobOffset: Math.random() * Math.PI * 2,
      collected: false,
      getValue: () => config.getValue(properties),
    };

    pickups.push(pickup);
    return pickup;
  }

  function update(deltaTimeSeconds, playerPosition) {
    const collected = [];
    const elapsed = performance.now() / 1000;

    for (const pickup of pickups) {
      if (pickup.collected) continue;

      // Bob and rotate animation
      pickup.mesh.rotation.y += deltaTimeSeconds * 1.8;
      pickup.mesh.position.y = pickup.position.y + Math.sin(elapsed * 2.5 + pickup.bobOffset) * 4;

      // Collection check
      if (pickup.mesh.position.subtract(playerPosition).length() < PICKUP_RADIUS) {
        pickup.collected = true;
        pickup.mesh.dispose();
        collected.push(pickup.getValue());
      }
    }

    // Remove collected pickups from the active list
    for (let i = pickups.length - 1; i >= 0; i--) {
      if (pickups[i].collected) pickups.splice(i, 1);
    }

    return collected;
  }

  function dispose() {
    for (const pickup of pickups) {
      pickup.mesh.dispose();
    }
    pickups.length = 0;
  }

  return { spawnPickup, update, dispose };
}

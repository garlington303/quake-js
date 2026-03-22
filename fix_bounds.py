import re

with open('src/map/mapLoader.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace door bounds calculation
door_old = """      const { root, meshes } = buildBrushEntityMesh(scene, entity, {
        textureProvider,
        materialCache,
        entityIndex: i,
      });
      const bounds = computeEntityBounds(entity);
      doorSystem.registerDoor(entity, meshes, bounds, root);"""

door_new = """      const { root, meshes } = buildBrushEntityMesh(scene, entity, {
        textureProvider,
        materialCache,
        entityIndex: i,
      });
      
      let min = new Vector3(Infinity, Infinity, Infinity);
      let max = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const mesh of meshes) {
        mesh.computeWorldMatrix(true);
        const b = mesh.getBoundingInfo().boundingBox;
        min.minimizeInPlace(b.minimumWorld);
        max.maximizeInPlace(b.maximumWorld);
      }
      const bounds = { min, max };
      
      doorSystem.registerDoor(entity, meshes, bounds, root);"""

# Replace trigger bounds calculation
trigger_old = """    .forEach((entity) => {
      const bounds = computeEntityBounds(entity);
      triggerSystem.registerTrigger(entity, bounds);
    });"""

trigger_new = """    .forEach((entity) => {
      // Build temporary meshes just to extract accurate bounds, then dispose
      const { root, meshes } = buildBrushEntityMesh(scene, entity, {
        textureProvider,
        materialCache: new Map() // Isolated cache
      });
      
      let min = new Vector3(Infinity, Infinity, Infinity);
      let max = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const mesh of meshes) {
        mesh.computeWorldMatrix(true);
        const b = mesh.getBoundingInfo().boundingBox;
        min.minimizeInPlace(b.minimumWorld);
        max.maximizeInPlace(b.maximumWorld);
      }
      const bounds = { min, max };
      
      // Clean up temporary meshes
      root.dispose();
      for (const mesh of meshes) mesh.dispose();
      
      triggerSystem.registerTrigger(entity, bounds);
    });"""

content = content.replace(door_old, door_new)
content = content.replace(trigger_old, trigger_new)

with open('src/map/mapLoader.js', 'w', encoding='utf-8') as f:
    f.write(content)

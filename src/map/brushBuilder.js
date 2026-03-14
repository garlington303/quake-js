import { Color3, Mesh, StandardMaterial, Texture, TransformNode, Vector3, VertexData } from "@babylonjs/core";

const EPSILON = 0.01;
const TEXTURE_SIZE = 128;

function colorFromIndex(index) {
  const hue = ((index * 53) % 360) / 360;
  return Color3.FromHSV(hue, 0.7, 0.95);
}

function normalizeTextureName(textureName) {
  if (!textureName) {
    return "default";
  }

  const trimmed = textureName.trim();
  const parts = trimmed.split(/[\\/]/);
  const baseName = parts[parts.length - 1];
  const withoutExt = baseName.replace(/\.[^/.]+$/, "");
  return withoutExt.toLowerCase();
}

function getTextureNameCandidates(textureName) {
  if (!textureName) {
    return ["default"];
  }

  const trimmed = textureName.trim();
  const parts = trimmed.split(/[\\/]/);
  const baseName = parts[parts.length - 1];
  const withoutExt = baseName.replace(/\.[^/.]+$/, "");
  const normalized = withoutExt.toLowerCase();
  const candidates = [withoutExt, normalized];

  const deduped = [];
  for (const candidate of candidates) {
    if (candidate && !deduped.includes(candidate)) {
      deduped.push(candidate);
    }
  }

  return deduped.length ? deduped : ["default"];
}

function createTextureWithFallbacks(scene, textureName, material) {
  const extensions = [".png", ".jpg", ".jpeg", ".webp"];
  const candidates = getTextureNameCandidates(textureName);
  let index = 0;

  const urls = [];
  for (const candidate of candidates) {
    for (const extension of extensions) {
      urls.push(`/textures/${encodeURIComponent(candidate)}${extension}`);
    }
  }

  const tryNext = () => {
    if (index >= urls.length) {
      console.warn(`[brushBuilder] texture load failed for "${textureName}"`);
      return;
    }

    const url = urls[index++];

    const texture = new Texture(
      url,
      scene,
      false,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
      null,
      () => {
        texture.dispose();
        tryNext();
      },
    );
    texture.name = `${textureName}-texture`;
    texture.uScale = 1;
    texture.vScale = 1;
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;

    material.diffuseTexture = texture;
  };

  tryNext();
  return null;
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(vector, amount) {
  return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector) {
  const vectorLength = length(vector);

  if (vectorLength <= EPSILON) {
    return { x: 0, y: 0, z: 0 };
  }

  return scale(vector, 1 / vectorLength);
}

function averagePoint(points) {
  const sum = points.reduce((accumulator, point) => add(accumulator, point), { x: 0, y: 0, z: 0 });
  return scale(sum, 1 / points.length);
}

function almostEqual(a, b) {
  return Math.abs(a - b) <= EPSILON;
}

function pointsMatch(a, b) {
  return almostEqual(a.x, b.x) && almostEqual(a.y, b.y) && almostEqual(a.z, b.z);
}

function dedupePoints(points) {
  return points.filter((point, index) => {
    return points.findIndex((candidate) => pointsMatch(candidate, point)) === index;
  });
}

function radians(degrees) {
  return (degrees * Math.PI) / 180;
}

function quakeToBabylon(point) {
  return new Vector3(point.x, point.z, point.y);
}

function textureToColor(textureName) {
  let hash = 0;

  for (let index = 0; index < textureName.length; index += 1) {
    hash = (hash * 31 + textureName.charCodeAt(index)) >>> 0;
  }

  const hue = (hash % 360) / 360;
  const saturation = 0.25 + ((hash >> 3) % 20) / 100;
  const value = 0.5 + ((hash >> 7) % 20) / 100;

  return Color3.FromHSV(hue, saturation, value);
}

// Scroll speeds in UV units per second (full cycle = 1 / speed seconds).
// Horizon layers use parallax: near moves fastest, far slowest.
const SCROLL_SPEEDS = {
  sky:          0.02,  // clouds  ≈ 50 s cycle
  horizon_near: 0.05,  // close ridge ≈ 20 s cycle
  horizon_mid:  0.025, // mid range  ≈ 40 s cycle
  horizon_far:  0.01,  // distant haze ≈ 100 s cycle
};

function getScrollSpeed(normalizedName) {
  for (const [prefix, speed] of Object.entries(SCROLL_SPEEDS)) {
    if (normalizedName.startsWith(prefix)) return speed;
  }
  return null;
}

function createScrollingMaterial(scene, normalizedName, texturePath, speed) {
  const material = new StandardMaterial(`scroll-mat-${normalizedName}`, scene);
  material.specularColor = Color3.Black();
  material.diffuseColor = Color3.Black();
  material.backFaceCulling = false;
  material.disableLighting = true;

  const tex = new Texture(texturePath, scene, false, true, Texture.NEAREST_SAMPLINGMODE);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.uOffset = 0;
  material.emissiveTexture = tex;

  scene.registerBeforeRender(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    tex.uOffset = (tex.uOffset + speed * dt) % 1;
  });

  return material;
}

function getOrCreateMaterial(scene, cache, textureName, textureProvider = null) {
  const normalizedName = normalizeTextureName(textureName);
  if (cache.has(normalizedName)) {
    return cache.get(normalizedName);
  }

  // Sky / horizon faces get self-lit parallax-scrolling materials
  const scrollSpeed = getScrollSpeed(normalizedName);
  if (scrollSpeed !== null) {
    const texturePath = `/textures/${normalizedName}.png`;
    const material = createScrollingMaterial(scene, normalizedName, texturePath, scrollSpeed);
    cache.set(normalizedName, material);
    return material;
  }

  const material = new StandardMaterial(`brush-${normalizedName}`, scene);
  material.diffuseColor = textureToColor(normalizedName);
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;

  const wadTexture = textureProvider?.getTexture?.(normalizedName) ?? null;
  if (wadTexture) {
    wadTexture.name = `${normalizedName}-wad-texture`;
    if (Object.hasOwn(wadTexture, "wrapU")) {
      wadTexture.wrapU = Texture.WRAP_ADDRESSMODE;
      wadTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    }
    material.diffuseTexture = wadTexture;
  } else {
    createTextureWithFallbacks(scene, textureName, material);
  }

  cache.set(normalizedName, material);
  return material;
}

// Quake standard UV projection: pick world-aligned U/V axes from the face normal.
// The dominant axis of the normal selects which world plane to project onto —
// this matches TrenchBroom's "Standard" format exactly.
function getQuakeUvAxes(normal) {
  const absX = Math.abs(normal.x);
  const absY = Math.abs(normal.y);
  const absZ = Math.abs(normal.z);

  if (absZ >= absX && absZ >= absY) {
    // Floor / ceiling — Z dominant: project onto XY plane (U=+X, V=+Y)
    return { uAxis: { x: 1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 } };
  }

  if (absX >= absY) {
    // East / west wall — X dominant: project onto YZ plane (U=+Y, V=+Z)
    return { uAxis: { x: 0, y: 1, z: 0 }, vAxis: { x: 0, y: 0, z: 1 } };
  }

  // North / south wall — Y dominant: project onto XZ plane (U=+X, V=+Z)
  return { uAxis: { x: 1, y: 0, z: 0 }, vAxis: { x: 0, y: 0, z: 1 } };
}

function projectUv(point, face) {
  const { uAxis, vAxis } = getQuakeUvAxes(face.plane.normal);
  const rotation = radians(face.rotation ?? 0);

  const rawU = dot(point, uAxis);
  const rawV = dot(point, vAxis);

  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const rotU = rawU * cosR - rawV * sinR;
  const rotV = rawU * sinR + rawV * cosR;

  const scaleX = Math.abs(face.scaleX) > EPSILON ? face.scaleX : 1;
  const scaleY = Math.abs(face.scaleY) > EPSILON ? face.scaleY : 1;

  return {
    u: (rotU + face.offsetX) / (TEXTURE_SIZE * scaleX),
    v: (rotV + face.offsetY) / (TEXTURE_SIZE * scaleY),
  };
}

function orientFaces(brush) {
  const seedPoints = brush.faces.flatMap((face) => face.points);
  const interiorPoint = averagePoint(seedPoints);

  return brush.faces.map((face) => {
    const [pointA, pointB, pointC] = face.points;
    let normal = normalize(cross(subtract(pointB, pointA), subtract(pointC, pointA)));
    let distance = dot(normal, pointA);

    if (dot(normal, interiorPoint) > distance) {
      normal = scale(normal, -1);
      distance = dot(normal, pointA);
    }

    return {
      ...face,
      plane: {
        normal,
        distance,
      },
    };
  });
}

function intersectPlanes(planeA, planeB, planeC) {
  const crossBC = cross(planeB.normal, planeC.normal);
  const denominator = dot(planeA.normal, crossBC);

  if (Math.abs(denominator) <= EPSILON) {
    return null;
  }

  const termA = scale(crossBC, planeA.distance);
  const termB = scale(cross(planeC.normal, planeA.normal), planeB.distance);
  const termC = scale(cross(planeA.normal, planeB.normal), planeC.distance);

  return scale(add(add(termA, termB), termC), 1 / denominator);
}

function pointInsideBrush(point, faces) {
  return faces.every((face) => dot(face.plane.normal, point) <= face.plane.distance + EPSILON);
}

function pointStrictlyInsideBrush(point, faces) {
  const margin = 0.75;
  return faces.every((face) => dot(face.plane.normal, point) < face.plane.distance - margin);
}

function sortFacePoints(points, normal) {
  const center = averagePoint(points);
  const reference = Math.abs(normal.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const tangent = normalize(cross(reference, normal));
  const bitangent = normalize(cross(normal, tangent));

  return [...points].sort((pointA, pointB) => {
    const offsetA = subtract(pointA, center);
    const offsetB = subtract(pointB, center);
    const angleA = Math.atan2(dot(offsetA, bitangent), dot(offsetA, tangent));
    const angleB = Math.atan2(dot(offsetB, bitangent), dot(offsetB, tangent));
    return angleA - angleB;
  });
}

function buildFacePolygon(face, faces) {
  const points = [];

  for (let indexA = 0; indexA < faces.length - 1; indexA += 1) {
    for (let indexB = indexA + 1; indexB < faces.length; indexB += 1) {
      const otherFaceA = faces[indexA];
      const otherFaceB = faces[indexB];

      if (otherFaceA === face || otherFaceB === face) {
        continue;
      }

      const point = intersectPlanes(face.plane, otherFaceA.plane, otherFaceB.plane);

      if (!point || !pointInsideBrush(point, faces)) {
        continue;
      }

      if (Math.abs(dot(face.plane.normal, point) - face.plane.distance) <= EPSILON) {
        points.push(point);
      }
    }
  }

  const uniquePoints = dedupePoints(points);

  if (uniquePoints.length < 3) {
    return null;
  }

  return sortFacePoints(uniquePoints, face.plane.normal);
}

function computeBrushBounds(brush) {
  const seedPoints = brush.faces.flatMap((face) => face.points);

  return seedPoints.reduce(
    (bounds, point) => {
      bounds.min.x = Math.min(bounds.min.x, point.x);
      bounds.min.y = Math.min(bounds.min.y, point.y);
      bounds.min.z = Math.min(bounds.min.z, point.z);
      bounds.max.x = Math.max(bounds.max.x, point.x);
      bounds.max.y = Math.max(bounds.max.y, point.y);
      bounds.max.z = Math.max(bounds.max.z, point.z);
      return bounds;
    },
    {
      min: { x: Infinity, y: Infinity, z: Infinity },
      max: { x: -Infinity, y: -Infinity, z: -Infinity },
    },
  );
}

function polygonWithinBounds(points, bounds, padding = 1) {
  return points.every((point) => {
    return point.x >= bounds.min.x - padding
      && point.x <= bounds.max.x + padding
      && point.y >= bounds.min.y - padding
      && point.y <= bounds.max.y + padding
      && point.z >= bounds.min.z - padding
      && point.z <= bounds.max.z + padding;
  });
}

function buildBrushGeometry(brush, orientedFacesOverride = null, otherBrushes = []) {
  const orientedFaces = orientedFacesOverride ?? orientFaces(brush);
  const bounds = computeBrushBounds(brush);
  const positions = [];
  const indices = [];
  const uvs = [];
  let rejectionReason = null;
  let vertexOffset = 0;

  orientedFaces.forEach((face) => {
    const polygon = buildFacePolygon(face, orientedFaces);

    if (!polygon) {
      return;
    }

    if (otherBrushes.length > 0) {
      const polygonCenter = averagePoint(polygon);
      const isInterior = otherBrushes.some((other) => pointStrictlyInsideBrush(polygonCenter, other.faces));
      if (isInterior) {
        return;
      }
    }

    if (!polygonWithinBounds(polygon, bounds, 2)) {
      rejectionReason = "polygon_out_of_bounds";
      vertexOffset = -1;
      return;
    }

    polygon.forEach((point) => {
      const transformed = quakeToBabylon(point);
      const uv = projectUv(point, face);
      positions.push(transformed.x, transformed.y, transformed.z);
      uvs.push(uv.u, 1 - uv.v);
    });

    for (let pointIndex = 1; pointIndex < polygon.length - 1; pointIndex += 1) {
      indices.push(vertexOffset, vertexOffset + pointIndex, vertexOffset + pointIndex + 1);
    }

    vertexOffset += polygon.length;
  });

  if (vertexOffset < 0 || positions.length === 0 || indices.length === 0) {
    return {
      geometry: null,
      reason: rejectionReason ?? "empty_geometry",
    };
  }

  return {
    geometry: {
      indices,
      positions,
      uvs,
    },
    reason: null,
  };
}

// Returns a Map<normalizedTextureName, {positions, indices, uvs}> — one geometry
// group per unique texture used across the brush faces.
//
// The interior-face heuristic (pointStrictlyInsideBrush) is intentionally omitted
// here. That check compares face-polygon centers against the volumes of sibling
// brushes, which incorrectly culls visible surfaces when brushes spatially overlap
// (e.g. a floor slab whose top face center lies inside a raised platform brush that
// sits on top of it). Back-face culling is disabled on all materials, so any
// genuinely shared interior triangles are harmless overdraw;
// dedupeCollisionTriangles removes duplicates from the collision mesh.
function buildFaceGeometries(brush, orientedFaces) {
  const bounds = computeBrushBounds(brush);
  const byTexture = new Map();

  for (const face of orientedFaces) {
    const polygon = buildFacePolygon(face, orientedFaces);

    if (!polygon || !polygonWithinBounds(polygon, bounds, 2)) {
      continue;
    }

    const texName = normalizeTextureName(face.texture);

    if (!byTexture.has(texName)) {
      byTexture.set(texName, { positions: [], indices: [], uvs: [] });
    }

    const geom = byTexture.get(texName);
    const baseOffset = geom.positions.length / 3;

    for (const point of polygon) {
      const transformed = quakeToBabylon(point);
      const uv = projectUv(point, face);
      geom.positions.push(transformed.x, transformed.y, transformed.z);
      geom.uvs.push(uv.u, 1 - uv.v);
    }

    for (let i = 1; i < polygon.length - 1; i++) {
      geom.indices.push(baseOffset, baseOffset + i, baseOffset + i + 1);
    }
  }

  return byTexture;
}

function createDebugBrushMaterial(scene, cache, debugIndex, classname) {
  const key = `${classname}-${debugIndex}`;

  if (cache.has(key)) {
    return cache.get(key);
  }

  const color = colorFromIndex(debugIndex);
  const material = new StandardMaterial(`debug-brush-${key}`, scene);
  material.diffuseColor = color.scale(0.65);
  material.emissiveColor = color.scale(0.35);
  material.specularColor = Color3.Black();
  material.alpha = 0.85;
  material.backFaceCulling = false;

  cache.set(key, material);
  return material;
}

function createCollisionDebugMaterial(scene) {
  const material = new StandardMaterial("debug-world-collision", scene);
  material.diffuseColor = new Color3(1, 0.15, 0.15);
  material.emissiveColor = new Color3(0.35, 0.05, 0.05);
  material.specularColor = Color3.Black();
  material.alpha = 0.25;
  material.wireframe = true;
  material.backFaceCulling = false;
  return material;
}

function createMeshFromGeometry(scene, parent, geometry, material, name, checkCollisions = false) {
  const normals = [];
  VertexData.ComputeNormals(geometry.positions, geometry.indices, normals);

  const vertexData = new VertexData();
  vertexData.positions = geometry.positions;
  vertexData.indices = geometry.indices;
  vertexData.normals = normals;
  if (geometry.uvs?.length) {
    vertexData.uvs = geometry.uvs;
  }

  const mesh = new Mesh(name, scene);
  vertexData.applyToMesh(mesh);
  mesh.parent = parent;
  mesh.material = material;
  mesh.checkCollisions = checkCollisions;

  return mesh;
}

function appendGeometry(target, source) {
  const vertexOffset = target.positions.length / 3;
  target.positions.push(...source.positions);
  target.indices.push(...source.indices.map((index) => index + vertexOffset));
}

function quantize(value, step = 0.01) {
  return Math.round(value / step) * step;
}

function triangleAreaSq(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const crossX = aby * acz - abz * acy;
  const crossY = abz * acx - abx * acz;
  const crossZ = abx * acy - aby * acx;
  return crossX * crossX + crossY * crossY + crossZ * crossZ;
}

function dedupeCollisionTriangles(geometry) {
  const dedupedIndices = [];
  const seen = new Set();
  const { positions, indices } = geometry;

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i];
    const ib = indices[i + 1];
    const ic = indices[i + 2];

    const ax = positions[ia * 3];
    const ay = positions[ia * 3 + 1];
    const az = positions[ia * 3 + 2];
    const bx = positions[ib * 3];
    const by = positions[ib * 3 + 1];
    const bz = positions[ib * 3 + 2];
    const cx = positions[ic * 3];
    const cy = positions[ic * 3 + 1];
    const cz = positions[ic * 3 + 2];

    // Skip zero-area triangles that can cause unstable collision response.
    if (triangleAreaSq(ax, ay, az, bx, by, bz, cx, cy, cz) <= 1e-8) {
      continue;
    }

    const va = `${quantize(ax)},${quantize(ay)},${quantize(az)}`;
    const vb = `${quantize(bx)},${quantize(by)},${quantize(bz)}`;
    const vc = `${quantize(cx)},${quantize(cy)},${quantize(cz)}`;
    const key = [va, vb, vc].sort().join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    dedupedIndices.push(ia, ib, ic);
  }

  geometry.indices = dedupedIndices;
}

export function buildBrushMeshes(scene, mapData, options = {}) {
  const debug = options.debug ?? {};
  const debugEnabled = Boolean(debug.enabled);
  const textureProvider = options.textureProvider ?? null;
  const materialCache = new Map();
  const debugMaterialCache = new Map();
  const root = new TransformNode("map-root", scene);
  const collisionGeometry = {
    indices: [],
    positions: [],
    uvs: [],
  };
  const debugEntries = [];
  const meshes = [];
  let meshIndex = 0;

  mapData.entities.forEach((entity, entityIndex) => {
    const isWorldspawn = entity.classname === "worldspawn";
    const orientedBrushes = entity.brushes.map((brush) => ({
      brush,
      faces: orientFaces(brush),
    }));

    // Non-debug: accumulate geometry per-texture across all brushes of this entity,
    // then create ONE mesh per unique texture (massive draw-call reduction).
    const entityGeom = debugEnabled ? null : new Map();

    orientedBrushes.forEach((entry, brushIndex) => {
      const brushBounds = computeBrushBounds(entry.brush);
      const faceGeometries = buildFaceGeometries(entry.brush, entry.faces);
      const hasGeometry = faceGeometries.size > 0;

      if (debugEnabled) {
        const totalVertices = [...faceGeometries.values()].reduce(
          (sum, g) => sum + g.positions.length / 3,
          0,
        );
        debugEntries.push({
          bounds: brushBounds,
          brushIndex,
          classname: entity.classname,
          entityIndex,
          faceCount: entry.brush.faces.length,
          includedInCollision: false,
          meshName: null,
          reason: hasGeometry ? null : "empty_geometry",
          status: hasGeometry ? "built" : "skipped",
          texture: entry.brush.faces[0]?.texture ?? "default",
          vertexCount: totalVertices,
        });
      }

      if (!hasGeometry) {
        return;
      }

      if (debugEnabled) {
        // Debug path: one mesh per texture per brush so brush picking still works.
        faceGeometries.forEach((geom, textureName) => {
          const material = createDebugBrushMaterial(
            scene,
            debugMaterialCache,
            meshIndex,
            entity.classname,
          );
          const mesh = createMeshFromGeometry(scene, root, geom, material, `brush-${meshIndex}`);
          if (mesh) {
            mesh.metadata = { brushIndex, classname: entity.classname, entityIndex, source: "brush-render" };
            mesh.isPickable = true;
            meshes.push(mesh);
            const debugEntry = debugEntries[debugEntries.length - 1];
            debugEntry.meshName = mesh.name;
            meshIndex += 1;
          }
        });
      } else {
        // Batched path: merge into per-texture accumulator.
        faceGeometries.forEach((geom, texName) => {
          if (!entityGeom.has(texName)) {
            entityGeom.set(texName, { positions: [], indices: [], uvs: [] });
          }
          const merged = entityGeom.get(texName);
          const baseOffset = merged.positions.length / 3;
          merged.positions.push(...geom.positions);
          merged.uvs.push(...geom.uvs);
          geom.indices.forEach((i) => merged.indices.push(i + baseOffset));
        });
      }

      if (isWorldspawn) {
        faceGeometries.forEach((geom) => {
          appendGeometry(collisionGeometry, geom);
        });
        if (debugEnabled) {
          const debugEntry = debugEntries[debugEntries.length - 1];
          debugEntry.includedInCollision = true;
        }
      }
    });

    // Non-debug: emit one render mesh per unique texture for this entity.
    if (!debugEnabled && entityGeom) {
      entityGeom.forEach((geom, texName) => {
        const material = getOrCreateMaterial(scene, materialCache, texName, textureProvider);
        const mesh = createMeshFromGeometry(
          scene,
          root,
          geom,
          material,
          `entity-${entityIndex}-${texName}`,
        );
        if (mesh) {
          mesh.metadata = { classname: entity.classname, entityIndex, source: "brush-render" };
          meshes.push(mesh);
          meshIndex += 1;
        }
      });
    }
  });

  let collisionMesh = null;

  if (collisionGeometry.positions.length > 0 && collisionGeometry.indices.length > 0) {
    dedupeCollisionTriangles(collisionGeometry);

    collisionMesh = createMeshFromGeometry(
      scene,
      root,
      collisionGeometry,
      null,
      "world-collision",
      true,
    );

    if (collisionMesh) {
      if (typeof collisionMesh.forceSharedVertices === "function") {
        collisionMesh.forceSharedVertices();
      }
      collisionMesh.computeWorldMatrix(true);
      collisionMesh.metadata = {
        brushCount: debugEntries.filter((entry) => entry.includedInCollision).length,
        source: "world-collision",
      };
      collisionMesh.visibility = debug.showCollisionMesh ? 1 : 0;
      collisionMesh.isPickable = true;
      if (debug.showCollisionMesh) {
        collisionMesh.material = createCollisionDebugMaterial(scene);
      }
    }
  }

  const debugInfo = {
    collisionTriangleCount: collisionGeometry.indices.length / 3,
    enabled: debugEnabled,
    entries: debugEntries,
    renderedBrushCount: meshes.length,
    showCollisionMesh: Boolean(debug.showCollisionMesh),
    skippedBrushCount: debugEntries.filter((entry) => entry.status === "skipped").length,
    worldspawnBrushCount: debugEntries.filter((entry) => entry.classname === "worldspawn").length,
  };

  return {
    collisionMesh,
    debugInfo,
    root,
    meshes,
  };
}

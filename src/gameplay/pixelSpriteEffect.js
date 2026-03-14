import { Color3, Mesh, MeshBuilder, StandardMaterial, Texture } from "@babylonjs/core";

const DEFAULT_COLUMNS = 6;
const DEFAULT_ROWS = 4;

function applyFrame(texture, frameIndex, columns, rows) {
  const column = frameIndex % columns;
  const row = Math.floor(frameIndex / columns);

  texture.uScale = 1 / columns;
  texture.vScale = 1 / rows;
  texture.uOffset = column / columns;
  texture.vOffset = 1 - (row + 1) / rows;
}

export function createPixelSpriteEffect(scene, options = {}) {
  const {
    billboardMode = Mesh.BILLBOARDMODE_ALL,
    columns = DEFAULT_COLUMNS,
    emissiveColor = Color3.White(),
    frameCount = 1,
    frameRate = 12,
    parent = null,
    renderGroupId = 2,
    rows = DEFAULT_ROWS,
    size = 1,
    startFrame = 0,
    textureUrl,
  } = options;

  const mesh = MeshBuilder.CreatePlane(`pixel-effect-${Date.now()}`, { size }, scene);
  const material = new StandardMaterial(`pixel-effect-mat-${Date.now()}`, scene);
  const texture = new Texture(textureUrl, scene, false, true, Texture.NEAREST_SAMPLINGMODE);

  texture.hasAlpha = true;
  applyFrame(texture, startFrame, columns, rows);

  material.diffuseTexture = texture;
  material.emissiveColor = emissiveColor;
  material.disableLighting = true;
  material.opacityTexture = texture;
  material.specularColor = Color3.Black();
  material.useAlphaFromDiffuseTexture = true;
  material.backFaceCulling = false;

  mesh.material = material;
  mesh.billboardMode = billboardMode;
  mesh.isPickable = false;
  mesh.parent = parent;
  mesh.renderingGroupId = renderGroupId;

  let elapsed = 0;
  let finished = false;
  let frameIndex = 0;

  return {
    mesh,
    dispose() {
      mesh.dispose();
      material.dispose();
      texture.dispose();
    },
    isFinished() {
      return finished;
    },
    restart() {
      elapsed = 0;
      finished = false;
      frameIndex = 0;
      applyFrame(texture, startFrame, columns, rows);
      mesh.isVisible = true;
    },
    setPosition(position) {
      mesh.position.copyFrom(position);
    },
    update(deltaTimeSeconds, loop = false) {
      if (finished) {
        return true;
      }

      if (frameCount <= 1 || frameRate <= 0) {
        return false;
      }

      elapsed += deltaTimeSeconds;
      const frameDuration = 1 / frameRate;

      while (elapsed >= frameDuration) {
        elapsed -= frameDuration;
        frameIndex += 1;

        if (frameIndex >= frameCount) {
          if (loop) {
            frameIndex = 0;
          } else {
            frameIndex = frameCount - 1;
            finished = true;
            break;
          }
        }

        applyFrame(texture, startFrame + frameIndex, columns, rows);
      }

      return finished;
    },
  };
}
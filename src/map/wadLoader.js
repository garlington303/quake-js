import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";

const HEADER_SIZE = 12;
const LUMP_ENTRY_SIZE = 32;
const MIPTEX_HEADER_SIZE = 40;
const MAX_TEXTURE_SIZE = 2048;

function readString(bytes, offset, length) {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    const value = bytes[offset + index];
    if (!value) {
      break;
    }
    result += String.fromCharCode(value);
  }
  return result;
}

function normalizeName(value) {
  return value.trim().toLowerCase();
}

function buildGrayscalePalette() {
  const palette = new Uint8Array(256 * 3);
  for (let index = 0; index < 256; index += 1) {
    palette[index * 3] = index;
    palette[index * 3 + 1] = index;
    palette[index * 3 + 2] = index;
  }
  return palette;
}

function readMipTex(bytes, view, baseOffset, size, defaultPalette) {
  if (size < MIPTEX_HEADER_SIZE) {
    return null;
  }

  const name = normalizeName(readString(bytes, baseOffset, 16));
  const width = view.getInt32(16, true);
  const height = view.getInt32(20, true);
  const offsets = [
    view.getInt32(24, true),
    view.getInt32(28, true),
    view.getInt32(32, true),
    view.getInt32(36, true),
  ];

  if (!name || width <= 0 || height <= 0 || width > MAX_TEXTURE_SIZE || height > MAX_TEXTURE_SIZE) {
    return null;
  }

  if (offsets.some((offset) => offset < MIPTEX_HEADER_SIZE || offset >= size)) {
    return null;
  }

  const level0Size = width * height;
  if (offsets[0] + level0Size > size) {
    return null;
  }

  const pixels = new Uint8Array(bytes.buffer, baseOffset + offsets[0], level0Size).slice();

  const mip1Size = Math.max(1, (width >> 1) * (height >> 1));
  const mip2Size = Math.max(1, (width >> 2) * (height >> 2));
  const mip3Size = Math.max(1, (width >> 3) * (height >> 3));
  const paletteSizeOffset = offsets[3] + mip3Size;

  let palette = null;
  if (paletteSizeOffset + 2 <= size) {
    const paletteSize = view.getUint16(paletteSizeOffset, true);
    const paletteStart = paletteSizeOffset + 2;
    if (paletteSize > 0 && paletteStart + paletteSize * 3 <= size) {
      palette = new Uint8Array(bytes.buffer, baseOffset + paletteStart, paletteSize * 3).slice();
    }
  }

  if (!palette && defaultPalette) {
    palette = defaultPalette;
  }

  return {
    name,
    width,
    height,
    pixels,
    palette,
  };
}

export async function loadWad(url, options = {}) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load WAD ${url}: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const header = readString(bytes, 0, 4);

  if (header !== "WAD2" && header !== "WAD3") {
    throw new Error(`Unsupported WAD format: ${header || "unknown"}`);
  }

  const view = new DataView(buffer);
  const numLumps = view.getInt32(4, true);
  const dirOffset = view.getInt32(8, true);

  if (dirOffset <= 0 || dirOffset + numLumps * LUMP_ENTRY_SIZE > bytes.length) {
    throw new Error(`Invalid WAD directory for ${url}`);
  }

  const defaultPalette = options.defaultPalette ?? buildGrayscalePalette();
  const textures = new Map();
  let usedFallbackPalette = false;

  for (let index = 0; index < numLumps; index += 1) {
    const entryOffset = dirOffset + index * LUMP_ENTRY_SIZE;
    const filepos = view.getInt32(entryOffset, true);
    const disksize = view.getInt32(entryOffset + 4, true);
    const name = normalizeName(readString(bytes, entryOffset + 16, 16));

    if (filepos <= 0 || disksize <= 0 || filepos + disksize > bytes.length) {
      continue;
    }

    const lumpView = new DataView(buffer, filepos, disksize);
    const mipTex = readMipTex(bytes, lumpView, filepos, disksize, defaultPalette);

    if (!mipTex || !mipTex.name) {
      continue;
    }

    if (!mipTex.palette) {
      usedFallbackPalette = true;
    }

    textures.set(mipTex.name, mipTex);
    if (name && name !== mipTex.name && !textures.has(name)) {
      textures.set(name, mipTex);
    }
  }

  return {
    url,
    format: header,
    textures,
    usedFallbackPalette,
  };
}

export function createWadTextureProvider(scene, wadData) {
  const textureCache = new Map();

  return {
    getTexture(textureName) {
      if (!textureName) {
        return null;
      }

      const key = normalizeName(textureName);
      if (textureCache.has(key)) {
        return textureCache.get(key);
      }

      const entry = wadData.textures.get(key);
      if (!entry || !entry.palette) {
        return null;
      }

      const texture = new DynamicTexture(
        `wad-${key}`,
        { width: entry.width, height: entry.height },
        scene,
        false,
      );

      const context = texture.getContext();
      const imageData = context.createImageData(entry.width, entry.height);
      const pixelCount = entry.width * entry.height;

      for (let index = 0; index < pixelCount; index += 1) {
        const paletteIndex = entry.pixels[index] * 3;
        const outIndex = index * 4;
        imageData.data[outIndex] = entry.palette[paletteIndex];
        imageData.data[outIndex + 1] = entry.palette[paletteIndex + 1];
        imageData.data[outIndex + 2] = entry.palette[paletteIndex + 2];
        imageData.data[outIndex + 3] = 255;
      }

      context.putImageData(imageData, 0, 0);
      texture.update(false);
      texture.wrapU = Texture.WRAP_ADDRESSMODE;
      texture.wrapV = Texture.WRAP_ADDRESSMODE;

      textureCache.set(key, texture);
      return texture;
    },
  };
}

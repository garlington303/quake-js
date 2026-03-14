import { parseEntityBlock } from "./entityParser.js";

function extractEntityBlocks(mapText) {
  const entities = [];
  let depth = 0;
  let blockStartIndex = -1;

  for (let index = 0; index < mapText.length; index += 1) {
    const character = mapText[index];

    if (character === "{") {
      if (depth === 0) {
        blockStartIndex = index;
      }

      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0 && blockStartIndex >= 0) {
        entities.push(mapText.slice(blockStartIndex, index + 1));
        blockStartIndex = -1;
      }
    }
  }

  return entities;
}

export function parseMap(mapText) {
  const entities = extractEntityBlocks(mapText)
    .map(parseEntityBlock)
    .filter((entity) => entity.classname !== "unknown" || entity.brushes.length > 0);

  const worldspawn = entities.find((entity) => entity.classname === "worldspawn") ?? null;

  return {
    entities,
    worldspawn,
  };
}
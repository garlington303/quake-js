function parseQuotedProperty(line) {
  const match = line.match(/^"([^"]+)"\s+"([^"]*)"$/);

  if (!match) {
    return null;
  }

  return {
    key: match[1],
    value: match[2],
  };
}

function parseBrushFace(line) {
  const facePattern = /^\s*\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\)\s*\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\)\s*\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\)\s+(\S+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*$/;
  const match = line.match(facePattern);

  if (!match) {
    return null;
  }

  return {
    points: [
      { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) },
      { x: Number(match[4]), y: Number(match[5]), z: Number(match[6]) },
      { x: Number(match[7]), y: Number(match[8]), z: Number(match[9]) },
    ],
    texture: match[10],
    offsetX: Number(match[11]),
    offsetY: Number(match[12]),
    rotation: Number(match[13]),
    scaleX: Number(match[14]),
    scaleY: Number(match[15]),
  };
}

function parseBrush(blockText) {
  const faces = blockText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseBrushFace)
    .filter(Boolean);

  return {
    faces,
  };
}

function extractBrushBlocks(entityBody) {
  const brushes = [];
  let depth = 0;
  let brushStartIndex = -1;

  for (let index = 0; index < entityBody.length; index += 1) {
    const character = entityBody[index];

    if (character === "{") {
      if (depth === 0) {
        brushStartIndex = index + 1;
      }

      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0 && brushStartIndex >= 0) {
        brushes.push(entityBody.slice(brushStartIndex, index));
        brushStartIndex = -1;
      }
    }
  }

  return brushes;
}

function stripBrushBlocks(entityBody) {
  let stripped = "";
  let depth = 0;

  for (let index = 0; index < entityBody.length; index += 1) {
    const character = entityBody[index];

    if (character === "{") {
      depth += 1;
    }

    if (depth === 0) {
      stripped += character;
    }

    if (character === "}") {
      depth -= 1;
    }
  }

  return stripped;
}

export function parseEntityBlock(entityBlockText) {
  const entityBody = entityBlockText.trim().replace(/^\{/, "").replace(/\}$/, "").trim();
  const brushBlocks = extractBrushBlocks(entityBody);
  const properties = {};

  stripBrushBlocks(entityBody)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const property = parseQuotedProperty(line);

      if (property) {
        properties[property.key] = property.value;
      }
    });

  const brushes = brushBlocks.map(parseBrush).filter((brush) => brush.faces.length >= 4);

  return {
    classname: properties.classname ?? "unknown",
    properties,
    brushes,
  };
}
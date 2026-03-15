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

// Shared prefix: three plane points + texture name
// ( x y z ) ( x y z ) ( x y z ) TEXNAME …
const PLANE_PREFIX =
  /^\s*\(\s*([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s*\)\s*\(\s*([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s*\)\s*\(\s*([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s*\)\s+(\S+)\s+/;

// Standard (Quake id) format: offsetX offsetY rotation scaleX scaleY
const STANDARD_TAIL = /([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s*$/;

// Valve 220 format:  [ ux uy uz offsetU ] [ vx vy vz offsetV ] rotation scaleU scaleV
const VALVE_TAIL =
  /\[\s*([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s*\]\s*\[\s*([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s*\]\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s*$/;

function parseBrushFace(line) {
  const prefixMatch = line.match(PLANE_PREFIX);
  if (!prefixMatch) return null;

  const points = [
    { x: Number(prefixMatch[1]), y: Number(prefixMatch[2]), z: Number(prefixMatch[3]) },
    { x: Number(prefixMatch[4]), y: Number(prefixMatch[5]), z: Number(prefixMatch[6]) },
    { x: Number(prefixMatch[7]), y: Number(prefixMatch[8]), z: Number(prefixMatch[9]) },
  ];
  const texture = prefixMatch[10];
  const tail = line.slice(prefixMatch[0].length);

  // Try Valve 220 first (has square brackets)
  const valveMatch = tail.match(VALVE_TAIL);
  if (valveMatch) {
    return {
      points,
      texture,
      uvFormat: "valve",
      // Explicit UV axes (in Quake/world space)
      uAxis:   { x: Number(valveMatch[1]),  y: Number(valveMatch[2]),  z: Number(valveMatch[3])  },
      offsetX:   Number(valveMatch[4]),
      vAxis:   { x: Number(valveMatch[5]),  y: Number(valveMatch[6]),  z: Number(valveMatch[7])  },
      offsetY:   Number(valveMatch[8]),
      rotation:  Number(valveMatch[9]),
      scaleX:    Number(valveMatch[10]),
      scaleY:    Number(valveMatch[11]),
    };
  }

  // Fall back to Standard format
  const stdMatch = tail.match(STANDARD_TAIL);
  if (stdMatch) {
    return {
      points,
      texture,
      uvFormat: "standard",
      offsetX:  Number(stdMatch[1]),
      offsetY:  Number(stdMatch[2]),
      rotation: Number(stdMatch[3]),
      scaleX:   Number(stdMatch[4]),
      scaleY:   Number(stdMatch[5]),
    };
  }

  return null;
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
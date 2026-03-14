"""
mdl_to_glb.py  — Quake MDL → GLB batch converter for Blender 4.x
Run via:
  blender --background --python scripts/mdl_to_glb.py -- <input_dir> <output_dir>

Parses Quake MDL format (IDPO version 6), creates a Blender mesh with:
  - Static skin texture (first skin, palette-decoded to RGBA)
  - Shape keys (morph targets) for every frame — grouped by animation
  - Exports each model as a separate .glb file

Animation frame groups in Quake MDL:
  - Simple frame  (type=0): single pose
  - Group frame   (type=1): sequence of poses with per-frame timing

The script tags frames with their group names so Babylon.js morph-target
animation can select the right range.
"""

import bpy
import struct
import sys
import os
from pathlib import Path
from mathutils import Vector

# ── Quake palette (standard, hardcoded) ──────────────────────────────────────
QUAKE_PALETTE = [
    0x00,0x00,0x00, 0x0f,0x0f,0x0f, 0x1f,0x1f,0x1f, 0x2f,0x2f,0x2f,
    0x3f,0x3f,0x3f, 0x4b,0x4b,0x4b, 0x5b,0x5b,0x5b, 0x6b,0x6b,0x6b,
    0x7b,0x7b,0x7b, 0x8b,0x8b,0x8b, 0x9b,0x9b,0x9b, 0xab,0xab,0xab,
    0xbb,0xbb,0xbb, 0xcb,0xcb,0xcb, 0xdb,0xdb,0xdb, 0xeb,0xeb,0xeb,
    0x0f,0x0b,0x07, 0x17,0x0f,0x0b, 0x1f,0x17,0x0b, 0x27,0x1b,0x0f,
    0x2f,0x23,0x13, 0x37,0x2b,0x17, 0x3f,0x2f,0x17, 0x4b,0x37,0x1b,
    0x53,0x3b,0x1b, 0x5b,0x43,0x1f, 0x6b,0x4b,0x1f, 0x77,0x53,0x23,
    0x7f,0x57,0x27, 0x87,0x5b,0x27, 0x8f,0x5f,0x2b, 0x9f,0x67,0x2f,
    0x3f,0x17,0x07, 0x4f,0x1f,0x0b, 0x5f,0x27,0x0f, 0x6f,0x2f,0x13,
    0x7f,0x3b,0x13, 0x8f,0x43,0x17, 0x9f,0x4f,0x17, 0xaf,0x5b,0x1b,
    0xbf,0x67,0x1b, 0xcf,0x73,0x1b, 0xdf,0x7f,0x1f, 0xef,0x8b,0x23,
    0xff,0x97,0x27, 0xff,0x9f,0x2b, 0xff,0xa7,0x2f, 0xff,0xaf,0x33,
    0x17,0x07,0x00, 0x27,0x0b,0x00, 0x37,0x13,0x00, 0x47,0x17,0x00,
    0x57,0x1f,0x00, 0x67,0x23,0x00, 0x77,0x2b,0x00, 0x87,0x33,0x00,
    0x97,0x3b,0x07, 0xa7,0x3f,0x07, 0xb7,0x47,0x07, 0xc7,0x4f,0x07,
    0xd7,0x57,0x0f, 0xe7,0x5f,0x0f, 0xf7,0x67,0x0f, 0xff,0x73,0x13,
    0x0b,0x07,0x00, 0x17,0x0f,0x00, 0x23,0x13,0x00, 0x2f,0x17,0x07,
    0x3b,0x1f,0x07, 0x47,0x23,0x07, 0x53,0x27,0x0b, 0x5f,0x2f,0x0f,
    0x6b,0x37,0x0f, 0x77,0x3f,0x13, 0x83,0x47,0x13, 0x8f,0x4f,0x17,
    0x9b,0x53,0x1b, 0xa7,0x5b,0x1b, 0xb3,0x63,0x1f, 0xbf,0x6b,0x1f,
    0x07,0x00,0x00, 0x17,0x03,0x00, 0x27,0x07,0x00, 0x37,0x0b,0x00,
    0x47,0x0f,0x00, 0x57,0x17,0x00, 0x67,0x1b,0x00, 0x77,0x1f,0x00,
    0x87,0x23,0x00, 0x97,0x2b,0x00, 0xa7,0x2f,0x00, 0xb7,0x37,0x00,
    0xc7,0x3b,0x07, 0xd7,0x43,0x07, 0xe7,0x4b,0x07, 0xf7,0x53,0x0f,
    0x17,0x0b,0x00, 0x23,0x0f,0x00, 0x33,0x17,0x00, 0x3f,0x1b,0x00,
    0x4f,0x23,0x00, 0x5b,0x27,0x00, 0x6b,0x2f,0x00, 0x77,0x33,0x00,
    0x87,0x3b,0x00, 0x93,0x3f,0x00, 0xa3,0x47,0x00, 0xb3,0x4b,0x00,
    0xc3,0x53,0x00, 0xd3,0x57,0x00, 0xe3,0x5f,0x00, 0xf3,0x67,0x00,
    0x6b,0x4b,0x00, 0x7b,0x53,0x00, 0x8b,0x5b,0x00, 0x9b,0x5f,0x00,
    0xa7,0x67,0x00, 0xb7,0x6f,0x00, 0xc7,0x77,0x00, 0xd7,0x7f,0x00,
    0xe7,0x87,0x03, 0xf7,0x8f,0x07, 0xff,0x9b,0x0f, 0xff,0xa3,0x17,
    0x13,0x0b,0x07, 0x1b,0x13,0x0b, 0x23,0x1b,0x0f, 0x2b,0x23,0x13,
    0x33,0x2b,0x17, 0x3b,0x33,0x1b, 0x43,0x3b,0x1f, 0x4b,0x43,0x23,
    0x53,0x4b,0x2b, 0x5b,0x57,0x2f, 0x63,0x5f,0x37, 0x6b,0x67,0x3b,
    0x73,0x73,0x43, 0x7b,0x7b,0x4b, 0x83,0x83,0x53, 0x8b,0x8b,0x5b,
    0x17,0x0b,0x00, 0x1f,0x13,0x00, 0x2f,0x1b,0x07, 0x3b,0x23,0x0b,
    0x47,0x2f,0x0f, 0x53,0x3b,0x17, 0x63,0x47,0x1b, 0x73,0x53,0x23,
    0x7f,0x5f,0x2b, 0x8f,0x6b,0x37, 0x9f,0x7b,0x3f, 0xaf,0x87,0x4b,
    0xbf,0x97,0x57, 0xcf,0xa7,0x67, 0xdf,0xb7,0x77, 0xef,0xcb,0x8b,
    0x0b,0x07,0x00, 0x17,0x0f,0x00, 0x1f,0x17,0x00, 0x27,0x1b,0x00,
    0x2f,0x23,0x07, 0x37,0x2b,0x07, 0x3f,0x33,0x0f, 0x47,0x3b,0x13,
    0x53,0x47,0x1b, 0x5f,0x53,0x23, 0x6b,0x5f,0x2b, 0x77,0x6b,0x37,
    0x83,0x77,0x3f, 0x8f,0x87,0x4b, 0x9b,0x93,0x53, 0xab,0xa3,0x5f,
    0x57,0x3f,0x1f, 0x63,0x4b,0x27, 0x6f,0x57,0x2f, 0x7b,0x67,0x37,
    0x87,0x73,0x3f, 0x97,0x83,0x4b, 0xa7,0x93,0x57, 0xbb,0xa7,0x67,
    0xcb,0xb7,0x77, 0xd7,0xc7,0x87, 0xe7,0xd7,0x9b, 0xf3,0xeb,0xaf,
    0x0f,0x0b,0x07, 0x1b,0x13,0x0b, 0x27,0x1b,0x0f, 0x33,0x23,0x17,
    0x3f,0x2b,0x1b, 0x4b,0x37,0x23, 0x57,0x3f,0x2b, 0x63,0x4b,0x33,
    0x6f,0x53,0x3b, 0x7b,0x5f,0x43, 0x8b,0x6f,0x4f, 0x97,0x7b,0x57,
    0xa7,0x8b,0x63, 0xb7,0x9b,0x73, 0xc7,0xab,0x83, 0xd7,0xbb,0x8f,
    0x07,0x07,0x27, 0x13,0x0f,0x37, 0x1b,0x1b,0x47, 0x27,0x27,0x57,
    0x33,0x33,0x63, 0x3f,0x3f,0x73, 0x4b,0x4b,0x83, 0x57,0x57,0x97,
    0x63,0x63,0xa7, 0x73,0x73,0xb3, 0x7f,0x83,0xc3, 0x8f,0x8f,0xcf,
    0x9b,0x9f,0xdb, 0xab,0xab,0xe7, 0xbb,0xbb,0xef, 0xcf,0xcf,0xf7,
    0x0b,0x0b,0x0b, 0x13,0x13,0x13, 0x1b,0x1b,0x1b, 0x27,0x27,0x27,
    0x2f,0x2f,0x2f, 0x37,0x37,0x37, 0x3f,0x3f,0x3f, 0x47,0x47,0x47,
    0x4f,0x4f,0x4f, 0x57,0x57,0x57, 0x5f,0x5f,0x5f, 0x67,0x67,0x67,
    0x6f,0x6f,0x6f, 0x77,0x77,0x77, 0x7f,0x7f,0x7f, 0x87,0x87,0x87,
    0x8f,0x8f,0x8f, 0x97,0x97,0x97, 0x9f,0x9f,0x9f, 0xa7,0xa7,0xa7,
    0xaf,0xaf,0xaf, 0xb7,0xb7,0xb7, 0xbf,0xbf,0xbf, 0xc7,0xc7,0xc7,
    0xcf,0xcf,0xcf, 0xd7,0xd7,0xd7, 0xdf,0xdf,0xdf, 0xe7,0xe7,0xe7,
    0xef,0xef,0xef, 0xf7,0xf7,0xf7,
    # last 2 entries (fullbright) repeated as black
    0x00,0x00,0x00, 0x00,0x00,0x00,
]

# Pre-build palette as list of (r,g,b) tuples
PALETTE = [(QUAKE_PALETTE[i*3]/255, QUAKE_PALETTE[i*3+1]/255, QUAKE_PALETTE[i*3+2]/255)
           for i in range(256)]


# ── MDL parser ────────────────────────────────────────────────────────────────

def parse_mdl(data: bytes):
    offset = 0

    def read(fmt):
        nonlocal offset
        size = struct.calcsize(fmt)
        values = struct.unpack_from(fmt, data, offset)
        offset += size
        return values

    magic, version = read("4si")
    assert magic == b"IDPO" and version == 6, f"Not a Quake MDL (magic={magic}, ver={version})"

    scale = read("3f")
    origin = read("3f")
    boundingradius = read("f")[0]
    eyeposition = read("3f")

    num_skins, skin_width, skin_height = read("3i")
    num_verts, num_tris, num_frames = read("3i")
    synctype, flags = read("2i")
    size_val = read("f")[0]

    # ── Skins ──────────────────────────────────────────────────────────────
    skin_pixels = skin_width * skin_height
    skins = []
    for _ in range(num_skins):
        skin_type = read("i")[0]
        if skin_type == 0:  # single skin
            pixels = data[offset:offset + skin_pixels]
            offset += skin_pixels
            skins.append(pixels)
        else:  # skin group — read count + intervals + frames
            num_group = read("i")[0]
            offset += num_group * 4  # skip intervals
            # Use the first frame of the group
            first_pixels = data[offset:offset + skin_pixels]
            offset += skin_pixels * num_group
            skins.append(first_pixels)

    # ── Texture coordinates ────────────────────────────────────────────────
    stverts = []
    for _ in range(num_verts):
        on_seam, s, t = read("3i")
        stverts.append((on_seam, s, t))

    # ── Triangles ─────────────────────────────────────────────────────────
    triangles = []
    for _ in range(num_tris):
        front, verts = read("i"), read("3i")
        triangles.append((front[0], verts))

    # ── Frames ────────────────────────────────────────────────────────────
    # Each compressed vertex: 3 bytes (packed), 1 byte (normal index)
    def read_frame_verts(n):
        verts = []
        for _ in range(n):
            packed = data[offset_ref[0]:offset_ref[0]+4]
            offset_ref[0] += 4
            x = packed[0] * scale[0] + origin[0]
            y = packed[1] * scale[1] + origin[1]
            z = packed[2] * scale[2] + origin[2]
            verts.append((x, y, z))
        return verts

    offset_ref = [offset]  # use list so inner func can mutate

    frames = []  # list of {name, verts}
    for fi in range(num_frames):
        frame_type = struct.unpack_from("i", data, offset_ref[0])[0]
        offset_ref[0] += 4

        if frame_type == 0:  # simple frame
            offset_ref[0] += 8  # skip bboxmin, bboxmax (4 bytes each)
            name_bytes = data[offset_ref[0]:offset_ref[0]+16]
            name = name_bytes.split(b"\x00")[0].decode("ascii", errors="replace")
            offset_ref[0] += 16
            verts = read_frame_verts(num_verts)
            frames.append({"name": name, "verts": verts})
        else:  # group frame
            num_group = struct.unpack_from("i", data, offset_ref[0])[0]
            offset_ref[0] += 4
            offset_ref[0] += 8  # skip group bboxmin/max
            offset_ref[0] += num_group * 4  # skip intervals
            for gi in range(num_group):
                offset_ref[0] += 8  # skip sub-bboxmin/max
                name_bytes = data[offset_ref[0]:offset_ref[0]+16]
                name = name_bytes.split(b"\x00")[0].decode("ascii", errors="replace")
                offset_ref[0] += 16
                verts = read_frame_verts(num_verts)
                frames.append({"name": name, "verts": verts})

    return {
        "skin_width": skin_width,
        "skin_height": skin_height,
        "skin_pixels": skins[0] if skins else b"",
        "stverts": stverts,
        "triangles": triangles,
        "frames": frames,
        "scale": scale,
        "origin": origin,
    }


# ── Build Blender mesh from parsed MDL ────────────────────────────────────────

def build_mesh(mdl_name: str, mdl: dict) -> bpy.types.Object:
    skin_w = mdl["skin_width"]
    skin_h = mdl["skin_height"]
    triangles = mdl["triangles"]
    stverts = mdl["stverts"]
    frames = mdl["frames"]

    if not frames:
        raise ValueError("MDL has no frames")

    # Use frame 0 as the base mesh
    base_verts = frames[0]["verts"]

    # Build vertex + face arrays
    # Quake MDL uses per-triangle UV (front/back seam handling)
    verts_3d = []
    faces = []
    uvs = []

    # We expand vertices to avoid seam issues:
    # map (tri_index, vert_slot) → new vertex index
    vert_map = {}
    new_verts = []
    new_uvs = []

    for tri_idx, (front, tri_verts) in enumerate(triangles):
        face = []
        tri_uvs = []
        for slot, vi in enumerate(tri_verts):
            on_seam, s, t = stverts[vi]
            if on_seam and not front:
                s += skin_w // 2
            u = (s + 0.5) / skin_w
            v = 1.0 - (t + 0.5) / skin_h
            key = (vi, s, t)
            if key not in vert_map:
                vert_map[key] = len(new_verts)
                px, py, pz = base_verts[vi]
                # Quake → Y-up: swap Y/Z, negate new-Y
                new_verts.append((-px * 0.02, pz * 0.02, py * 0.02))
                new_uvs.append((u, v))
            face.append(vert_map[key])
            tri_uvs.append((u, v))
        faces.append(face)
        uvs.extend(tri_uvs)

    # Create mesh
    mesh = bpy.data.meshes.new(mdl_name)
    obj = bpy.data.objects.new(mdl_name, mesh)
    bpy.context.collection.objects.link(obj)

    mesh.from_pydata(new_verts, [], faces)
    mesh.update()

    # UV map
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            loop = mesh.loops[loop_index]
            vi = loop.vertex_index
            # Find UV for this vertex/face combo
            # Since we expanded verts to be unique per seam, UV is stored per new_vert
            uv_layer.data[loop_index].uv = new_uvs[vi]

    # Skin texture
    skin_pixels = mdl["skin_pixels"]
    if skin_pixels and len(skin_pixels) == skin_w * skin_h:
        img = bpy.data.images.new(f"{mdl_name}_skin", width=skin_w, height=skin_h, alpha=False)
        pixels = []
        for row in range(skin_h - 1, -1, -1):  # flip vertically
            for col in range(skin_w):
                idx = skin_pixels[row * skin_w + col]
                r, g, b = PALETTE[idx]
                pixels.extend([r, g, b, 1.0])
        img.pixels = pixels
        img.update()

        mat = bpy.data.materials.new(f"{mdl_name}_mat")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        tex_node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex_node.image = img
        tex_node.interpolation = "Closest"
        mat.node_tree.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 1.0
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
        if mesh.materials:
            mesh.materials[0] = mat
        else:
            mesh.materials.append(mat)

    # Shape keys (morph targets) for animation frames
    obj.shape_key_add(name="Basis", from_mix=False)
    for frame in frames[1:]:
        sk = obj.shape_key_add(name=frame["name"], from_mix=False)
        for key, new_vi in vert_map.items():
            vi = key[0]
            px, py, pz = frame["verts"][vi]
            sk.data[new_vi].co = Vector((-px * 0.02, pz * 0.02, py * 0.02))

    return obj


# ── Main ──────────────────────────────────────────────────────────────────────

MONSTER_MDL_MAP = {
    "soldier":    "progs/soldier.mdl",
    "dog":        "progs/dog.mdl",
    "ogre":       "progs/ogre.mdl",
    "knight":     "progs/knight.mdl",
    "hell_knight":"progs/hknight.mdl",
    "zombie":     "progs/zombie.mdl",
    "wizard":     "progs/wizard.mdl",
    "fiend":      "progs/demon.mdl",
    "shambler":   "progs/shambler.mdl",
    "shalrath":   "progs/shalrath.mdl",
    "tarbaby":    "progs/tarbaby.mdl",
    "fish":       "progs/fish.mdl",
}

def main():
    argv = sys.argv
    try:
        sep = argv.index("--")
        args = argv[sep + 1:]
    except ValueError:
        args = []

    if len(args) < 2:
        print("Usage: blender --background --python mdl_to_glb.py -- <pak_extracted_dir> <output_dir>")
        sys.exit(1)

    input_dir = Path(args[0])
    output_dir = Path(args[1])
    output_dir.mkdir(parents=True, exist_ok=True)

    for name, rel_path in MONSTER_MDL_MAP.items():
        mdl_path = input_dir / rel_path
        if not mdl_path.exists():
            print(f"  SKIP (not found): {mdl_path}")
            continue

        out_path = output_dir / f"{name}.glb"
        print(f"Converting {name}: {mdl_path} → {out_path}")

        try:
            # Clear scene
            bpy.ops.wm.read_factory_settings(use_empty=True)
            for col in bpy.data.collections:
                bpy.context.scene.collection.children.unlink(col)
                bpy.data.collections.remove(col)

            data = mdl_path.read_bytes()
            mdl = parse_mdl(data)
            obj = build_mesh(name, mdl)

            bpy.context.view_layer.update()
            bpy.ops.export_scene.gltf(
                filepath=str(out_path),
                export_format="GLB",
                export_selected=False,
                export_apply=False,
                export_morph=True,
                export_morph_normal=False,
                export_morph_tangent=False,
                export_animations=False,
            )
            print(f"  OK — {len(mdl['frames'])} frames, {len(mdl['triangles'])} tris")
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()

    print("\nAll done.")

main()

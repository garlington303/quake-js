#!/usr/bin/env python3
"""
reskin_mdl.py  —  Replace placeholder skins in the pack's official MDL files
                   with properly-quantised textures from the PNG atlas.

The PSX Mega Pack ships MDL files that already have correct geometry + UV
mapping, but their embedded skin is a tiny placeholder (usually 8x8, solid).
This script:
  1. Reads every .mdl in <mdl_dir> (recursively)
  2. Finds the matching PNG texture via the sibling OBJ/MTL or a recursive
     catalog built from <texture_root>
  3. Quantises the PNG to the Quake 256-colour palette at <skin_size>
  4. Rescales the ST vertex coordinates to match the new skin size
  5. Writes the patched MDL to <output_dir>

Usage:
    python scripts/reskin_mdl.py  <mdl_dir>  <output_dir>  [options]

Options:
    --obj-dir        <path>   OBJ folder (same tree, used to find MTL files)
                              Default: auto-detect sibling "other-formats/OBJ"
    --texture-root   <path>   Root to scan recursively for PNG/JPG textures
    --skin-size      N        Output skin resolution  (default: 128)

Requires:  pip install Pillow
"""

import os
import sys
import struct
import math
from pathlib import Path

# ── Quake palette (identical to obj_to_mdl.py) ────────────────────────────────
_PAL_RAW = [
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
    0x83,0x77,0x3b, 0x8f,0x7f,0x43, 0x9f,0x8f,0x4f, 0xaf,0x9f,0x5f,
    0xbf,0xaf,0x6f, 0xcf,0xbf,0x7f, 0xdf,0xcf,0x8f, 0xef,0xdf,0x9f,
    0x17,0x0f,0x00, 0x1f,0x17,0x07, 0x2f,0x23,0x0b, 0x3f,0x2f,0x0f,
    0x4f,0x3b,0x17, 0x5f,0x47,0x1b, 0x6f,0x57,0x23, 0x7f,0x67,0x2f,
    0x8f,0x77,0x3b, 0x9f,0x87,0x47, 0xaf,0x97,0x57, 0xbf,0xa7,0x63,
    0xcf,0xbb,0x73, 0xdf,0xcb,0x83, 0xef,0xdb,0x97, 0xff,0xeb,0xa7,
    0x6f,0x83,0x7b, 0x5f,0x73,0x6b, 0x53,0x67,0x5f, 0x47,0x5b,0x53,
    0x3b,0x4f,0x47, 0x2f,0x43,0x3b, 0x23,0x37,0x2f, 0x17,0x2b,0x23,
    0x0b,0x1f,0x17, 0x0b,0x13,0x0f, 0x0b,0x0b,0x0b, 0x13,0x13,0x13,
    0x1b,0x1b,0x1b, 0x27,0x27,0x27, 0x33,0x33,0x33, 0x3f,0x3f,0x3f,
    0x4b,0x4b,0x4b, 0x57,0x57,0x57, 0x63,0x63,0x63, 0x73,0x73,0x73,
    0x83,0x83,0x83, 0x97,0x97,0x97, 0xa7,0xa7,0xa7, 0xb7,0xb7,0xb7,
    0xcb,0xcb,0xcb, 0xdb,0xdb,0xdb, 0xeb,0xeb,0xeb, 0xff,0xff,0xff,
    0x9f,0x5b,0x53, 0x6b,0x2f,0x2b, 0x57,0x23,0x1f, 0x4b,0x17,0x13,
    0x37,0x0f,0x0b, 0x2b,0x07,0x07, 0x1f,0x03,0x03, 0x13,0x00,0x00,
    0x6b,0x3b,0x17, 0x6b,0x33,0x13, 0x5f,0x2f,0x0f, 0x53,0x2b,0x0b,
    0x4b,0x23,0x0b, 0x43,0x1f,0x07, 0x3b,0x1b,0x07, 0x33,0x17,0x07,
    0x2b,0x13,0x03, 0x23,0x0f,0x03, 0x1b,0x0b,0x03, 0x13,0x07,0x00,
    0x0f,0x07,0x00, 0x0b,0x03,0x00, 0x07,0x00,0x00, 0xff,0xff,0xff,
]
while len(_PAL_RAW) < 768:
    _PAL_RAW += [0, 0, 0]
PALETTE = [(_PAL_RAW[i*3], _PAL_RAW[i*3+1], _PAL_RAW[i*3+2]) for i in range(256)]


def nearest_palette_idx(r, g, b):
    best_i, best_d = 0, 10**9
    for i, (pr, pg, pb) in enumerate(PALETTE):
        d = (r-pr)**2 + (g-pg)**2 + (b-pb)**2
        if d < best_d:
            best_d, best_i = d, i
            if d == 0:
                break
    return best_i


def _solid_skin(w, h, idx=4):
    return bytes([idx]) * (w * h)


def load_and_quantise(tex_path: Path, w: int, h: int) -> bytes:
    try:
        from PIL import Image
        img = Image.open(tex_path).convert("RGB").resize((w, h), Image.LANCZOS)
        return bytes(nearest_palette_idx(r, g, b) for r, g, b in img.getdata())
    except ImportError:
        print("  [warn] Pillow not installed: pip install Pillow")
        return _solid_skin(w, h)
    except Exception as exc:
        print(f"  [warn] Texture load failed: {exc}")
        return _solid_skin(w, h)


def build_texture_catalog(root: Path) -> dict:
    exts = {".png", ".tga", ".jpg", ".jpeg", ".bmp"}
    catalog: dict = {}
    for p in root.rglob("*"):
        if p.suffix.lower() in exts:
            key = p.name.lower()
            if key not in catalog or len(p.parts) < len(catalog[key].parts):
                catalog[key] = p
    return catalog


def find_texture_for_mdl(mdl_path: Path, obj_dir: Path | None,
                          catalog: dict | None) -> Path | None:
    """
    Find PNG texture for mdl_path.
    Strategy:
      1. Same-name PNG sibling to the MDL
      2. MTL map_Kd from the matching OBJ file in obj_dir
      3. Catalog lookup by stem
    """
    exts = (".png", ".tga", ".jpg", ".jpeg", ".bmp")
    stem = mdl_path.stem

    # 1. Sibling to MDL
    for ext in exts:
        p = mdl_path.with_suffix(ext)
        if p.exists():
            return p

    # 2. From the matching OBJ's MTL
    mtl_tex_name = None
    if obj_dir:
        # search recursively for the matching OBJ
        for obj_path in obj_dir.rglob(f"{stem}.obj"):
            mtl = obj_path.with_suffix(".mtl")
            if mtl.exists():
                try:
                    with open(mtl, encoding="utf-8", errors="replace") as f:
                        for line in f:
                            tok = line.strip().split()
                            if tok and tok[0].lower() == "map_kd":
                                mtl_tex_name = Path(tok[-1]).name
                                # beside OBJ
                                c = obj_path.parent / mtl_tex_name
                                if c.exists():
                                    return c
                                # catalog
                                if catalog:
                                    hit = catalog.get(mtl_tex_name.lower())
                                    if hit:
                                        return hit
                                break
                except Exception:
                    pass
            break  # only try first match

    # 3. Stem in catalog
    if catalog:
        for ext in exts:
            hit = catalog.get(f"{stem.lower()}{ext}")
            if hit:
                return hit

    return None


def reskin_mdl(src_path: Path, out_path: Path,
               obj_dir: Path | None, catalog: dict | None,
               new_skin_size: int, world_scale: float = 1.0) -> bool:
    """
    Read src_path (official MDL with placeholder skin), replace the skin
    with a properly-quantised texture, rescale ST verts, write to out_path.
    """
    try:
        data = bytearray(src_path.read_bytes())
    except Exception as exc:
        print(f"  [ERROR reading: {exc}]")
        return False

    if data[:4] != b"IDPO" or struct.unpack_from("<i", data, 4)[0] != 6:
        print(f"  [SKIP - not IDPO v6]")
        return False

    old_skinw = struct.unpack_from("<i", data, 52)[0]
    old_skinh = struct.unpack_from("<i", data, 56)[0]
    numverts  = struct.unpack_from("<i", data, 60)[0]
    numtris   = struct.unpack_from("<i", data, 64)[0]

    new_skinw = new_skin_size
    new_skinh = new_skin_size
    scale_s   = new_skinw / max(old_skinw, 1)
    scale_t   = new_skinh / max(old_skinh, 1)

    # Locate sections
    # Header = 84 bytes
    # Skin section: 4 bytes type + old_skinw*old_skinh bytes
    skin_type_off   = 84
    skin_type       = struct.unpack_from("<i", data, skin_type_off)[0]
    if skin_type != 0:
        print(f"  [SKIP - skin group not supported (type={skin_type})]")
        return False

    old_skin_off    = skin_type_off + 4
    old_skin_size   = old_skinw * old_skinh
    stvert_off      = old_skin_off + old_skin_size
    tri_off         = stvert_off + numverts * 12
    # Everything after the triangles (frame data, etc.)
    after_tris_off  = tri_off + numtris * 16

    # Load the texture
    tex_path = find_texture_for_mdl(src_path, obj_dir, catalog)
    if tex_path:
        new_skin = load_and_quantise(tex_path, new_skinw, new_skinh)
        tex_label = tex_path.name
    else:
        new_skin  = _solid_skin(new_skinw, new_skinh)
        tex_label = "NO TEX (solid)"

    # Rescale ST verts in-place and collect new bytes
    new_stverts = bytearray()
    for i in range(numverts):
        off = stvert_off + i * 12
        seam, s, t = struct.unpack_from("<3i", data, off)
        new_s = min(int(round(s * scale_s)), new_skinw - 1)
        new_t = min(int(round(t * scale_t)), new_skinh - 1)
        new_stverts += struct.pack("<3i", seam, new_s, new_t)

    # Rebuild MDL binary
    buf = bytearray()
    # Header: patch scale, origin, boundingradius, eyepos, skinw, skinh
    # Offsets: 0=magic(4) 4=ver(4) 8=scale(12) 20=origin(12) 32=bradius(4)
    #          36=eyepos(12) 48=numskins(4) 52=skinw(4) 56=skinh(4) 60=numverts..
    buf += data[0:8]                                 # magic + version (unchanged)
    sx, sy, sz = struct.unpack_from("<3f", data, 8)
    buf += struct.pack("<3f", sx*world_scale, sy*world_scale, sz*world_scale)
    ox, oy, oz = struct.unpack_from("<3f", data, 20)
    buf += struct.pack("<3f", ox*world_scale, oy*world_scale, oz*world_scale)
    br = struct.unpack_from("<f", data, 32)[0]
    buf += struct.pack("<f", br * world_scale)
    ex, ey, ez = struct.unpack_from("<3f", data, 36)
    buf += struct.pack("<3f", ex*world_scale, ey*world_scale, ez*world_scale)
    buf += data[48:52]                               # numskins (unchanged)
    buf += struct.pack("<2i", new_skinw, new_skinh)  # patch skin dims
    buf += data[60:84]                               # rest of header unchanged

    # Skin
    buf += struct.pack("<i", 0)   # skin type = single
    buf += new_skin

    # ST verts (rescaled)
    buf += new_stverts

    # Triangles + everything after (frames, etc.) — unchanged
    buf += data[tri_off:]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(bytes(buf))
    print(f"  [tex: {tex_label}  {old_skinw}x{old_skinh} -> {new_skinw}x{new_skinh}]  OK")
    return True


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)

    mdl_dir    = Path(args[0])
    output_dir = Path(args[1])

    if not mdl_dir.is_dir():
        print(f"ERROR: MDL directory not found: {mdl_dir}")
        sys.exit(1)

    skin_size   = 128
    world_scale = 50.0
    obj_dir:  Path | None = None
    tex_root: Path | None = None

    i = 2
    while i < len(args):
        if args[i] == "--skin-size" and i + 1 < len(args):
            skin_size = max(8, int(args[i + 1]))
            i += 2
        elif args[i] == "--scale" and i + 1 < len(args):
            world_scale = float(args[i + 1])
            i += 2
        elif args[i] == "--obj-dir" and i + 1 < len(args):
            obj_dir = Path(args[i + 1])
            if not obj_dir.is_dir():
                print(f"WARNING: --obj-dir not found: {obj_dir}")
                obj_dir = None
            i += 2
        elif args[i] == "--texture-root" and i + 1 < len(args):
            tex_root = Path(args[i + 1])
            if not tex_root.is_dir():
                print(f"WARNING: --texture-root not found: {tex_root}")
                tex_root = None
            i += 2
        else:
            i += 1

    # Auto-detect OBJ dir (sibling of MDL dir: Models/MDL -> Models/other-formats/OBJ)
    if obj_dir is None:
        candidate = mdl_dir.parent / "other-formats" / "OBJ"
        if candidate.is_dir():
            obj_dir = candidate
            print(f"Auto-detected OBJ dir: {obj_dir}")

    # Build texture catalog
    catalog = None
    if tex_root:
        print(f"Scanning texture catalog: {tex_root}")
        catalog = build_texture_catalog(tex_root)
        print(f"  {len(catalog)} textures indexed")

    mdl_files = sorted(mdl_dir.rglob("*.mdl"))
    if not mdl_files:
        print(f"No MDL files found in {mdl_dir}")
        sys.exit(1)

    print(f"reskin_mdl -- {len(mdl_files)} files  skin -> {skin_size}x{skin_size}  scale x{world_scale}")
    print(f"  source : {mdl_dir}")
    print(f"  output : {output_dir}")
    print()

    ok = fail = 0
    for src in mdl_files:
        out = output_dir / src.name
        print(f"  {src.name}", end="  ", flush=True)
        if reskin_mdl(src, out, obj_dir, catalog, skin_size, world_scale):
            ok += 1
        else:
            fail += 1

    print()
    print("-" * 60)
    print(f"Done.  {ok} reskinned, {fail} failed.")
    print(f"Output: {output_dir}")


if __name__ == "__main__":
    main()

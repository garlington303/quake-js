#!/usr/bin/env python3
"""
obj_to_mdl.py — Batch OBJ → Quake MDL (IDPO v6) converter
Pure Python, no Blender required.  Pillow used for texture quantisation.

Usage:
    python scripts/obj_to_mdl.py <input_dir> <output_dir> [options]

Options:
    --skin-size  N    Skin texture resolution (default: 128, must be ≥8)
    --scale      N    OBJ→Quake unit multiplier  (default: 50 = 1 m → 50 qu)
    --recursive       Also search sub-directories of <input_dir>

For every .obj found in <input_dir>:
  • Parses vertices, UVs, faces  (quads/n-gons → triangles automatically)
  • Looks for a matching texture next to the .obj, or reads the MTL map_Kd
    Supported: .png  .tga  .jpg  .jpeg  .bmp
  • Quantises the texture to the standard Quake 256-colour palette
  • Writes a single-frame, single-skin MDL to <output_dir>/<name>.mdl

Coordinate mapping (inverse of mdl_to_glb.py):
    OBJ  (Y-up, -Z forward)  →  Quake  (Z-up, X-forward)
        mdl_x = -obj_x * scale
        mdl_y =  obj_z * scale
        mdl_z =  obj_y * scale

If Pillow is not installed:
    pip install Pillow
"""

import struct
import sys
import os
import math
from pathlib import Path

# ── Quake anisotropic vertex normals (162 precomputed directions) ───────────────
# From Quake's anorms.h — used to pick the closest normal index per vertex.
_ANORMS = [
    (-0.525731, 0.000000, 0.850651), (-0.442863, 0.238856, 0.864188),
    (-0.295242, 0.000000, 0.955423), (-0.309017, 0.500000, 0.809017),
    (-0.162460, 0.262866, 0.951056), ( 0.000000, 0.000000, 1.000000),
    ( 0.000000, 0.850651, 0.525731), (-0.147621, 0.716567, 0.681718),
    ( 0.147621, 0.716567, 0.681718), ( 0.000000, 0.525731, 0.850651),
    ( 0.309017, 0.500000, 0.809017), ( 0.525731, 0.000000, 0.850651),
    ( 0.295242, 0.000000, 0.955423), ( 0.442863, 0.238856, 0.864188),
    ( 0.162460, 0.262866, 0.951056), (-0.681718, 0.147621, 0.716567),
    (-0.809017, 0.309017, 0.500000), (-0.587785, 0.425325, 0.688191),
    (-0.850651, 0.525731, 0.000000), (-0.864188, 0.442863, 0.238856),
    (-0.716567, 0.681718, 0.147621), (-0.688191, 0.587785, 0.425325),
    (-0.500000, 0.809017, 0.309017), (-0.238856, 0.864188, 0.442863),
    (-0.425325, 0.688191, 0.587785), (-0.716567, 0.681718,-0.147621),
    (-0.500000, 0.809017,-0.309017), (-0.525731, 0.850651, 0.000000),
    ( 0.000000, 0.850651,-0.525731), (-0.238856, 0.864188,-0.442863),
    ( 0.000000, 0.955423,-0.295242), (-0.262866, 0.951056,-0.162460),
    ( 0.000000, 1.000000, 0.000000), ( 0.000000, 0.955423, 0.295242),
    (-0.262866, 0.951056, 0.162460), ( 0.238856, 0.864188, 0.442863),
    ( 0.262866, 0.951056, 0.162460), ( 0.500000, 0.809017, 0.309017),
    ( 0.238856, 0.864188,-0.442863), ( 0.262866, 0.951056,-0.162460),
    ( 0.500000, 0.809017,-0.309017), ( 0.850651, 0.525731, 0.000000),
    ( 0.716567, 0.681718, 0.147621), ( 0.716567, 0.681718,-0.147621),
    ( 0.525731, 0.850651, 0.000000), ( 0.425325, 0.688191, 0.587785),
    ( 0.864188, 0.442863, 0.238856), ( 0.688191, 0.587785, 0.425325),
    ( 0.809017, 0.309017, 0.500000), ( 0.681718, 0.147621, 0.716567),
    ( 0.587785, 0.425325, 0.688191), ( 0.955423, 0.295242, 0.000000),
    ( 1.000000, 0.000000, 0.000000), ( 0.951056, 0.162460, 0.262866),
    ( 0.850651,-0.525731, 0.000000), ( 0.955423,-0.295242, 0.000000),
    ( 0.864188,-0.442863, 0.238856), ( 0.951056,-0.162460, 0.262866),
    ( 0.809017,-0.309017, 0.500000), ( 0.681718,-0.147621, 0.716567),
    ( 0.850651, 0.000000, 0.525731), ( 0.864188, 0.442863,-0.238856),
    ( 0.809017, 0.309017,-0.500000), ( 0.951056, 0.162460,-0.262866),
    ( 0.525731, 0.000000,-0.850651), ( 0.681718, 0.147621,-0.716567),
    ( 0.681718,-0.147621,-0.716567), ( 0.850651, 0.000000,-0.525731),
    ( 0.809017,-0.309017,-0.500000), ( 0.864188,-0.442863,-0.238856),
    ( 0.951056,-0.162460,-0.262866), ( 0.147621, 0.716567,-0.681718),
    ( 0.309017, 0.500000,-0.809017), ( 0.425325, 0.688191,-0.587785),
    ( 0.442863, 0.238856,-0.864188), ( 0.587785, 0.425325,-0.688191),
    ( 0.688191, 0.587785,-0.425325), (-0.147621, 0.716567,-0.681718),
    (-0.309017, 0.500000,-0.809017), ( 0.000000, 0.525731,-0.850651),
    (-0.525731, 0.000000,-0.850651), (-0.442863, 0.238856,-0.864188),
    (-0.295242, 0.000000,-0.955423), (-0.162460, 0.262866,-0.951056),
    ( 0.000000, 0.000000,-1.000000), ( 0.295242, 0.000000,-0.955423),
    ( 0.162460, 0.262866,-0.951056), (-0.442863,-0.238856,-0.864188),
    (-0.309017,-0.500000,-0.809017), (-0.162460,-0.262866,-0.951056),
    ( 0.000000,-0.850651,-0.525731), (-0.147621,-0.716567,-0.681718),
    ( 0.147621,-0.716567,-0.681718), ( 0.000000,-0.525731,-0.850651),
    ( 0.309017,-0.500000,-0.809017), ( 0.442863,-0.238856,-0.864188),
    ( 0.162460,-0.262866,-0.951056), ( 0.238856,-0.864188,-0.442863),
    ( 0.500000,-0.809017,-0.309017), ( 0.425325,-0.688191,-0.587785),
    ( 0.716567,-0.681718,-0.147621), ( 0.688191,-0.587785,-0.425325),
    ( 0.587785,-0.425325,-0.688191), ( 0.000000,-0.955423,-0.295242),
    ( 0.000000,-1.000000, 0.000000), ( 0.262866,-0.951056,-0.162460),
    ( 0.000000,-0.850651, 0.525731), ( 0.000000,-0.955423, 0.295242),
    ( 0.238856,-0.864188, 0.442863), ( 0.262866,-0.951056, 0.162460),
    ( 0.500000,-0.809017, 0.309017), ( 0.716567,-0.681718, 0.147621),
    ( 0.525731,-0.850651, 0.000000), (-0.238856,-0.864188,-0.442863),
    (-0.500000,-0.809017,-0.309017), (-0.262866,-0.951056,-0.162460),
    (-0.850651,-0.525731, 0.000000), (-0.716567,-0.681718,-0.147621),
    (-0.716567,-0.681718, 0.147621), (-0.525731,-0.850651, 0.000000),
    (-0.500000,-0.809017, 0.309017), (-0.238856,-0.864188, 0.442863),
    (-0.262866,-0.951056, 0.162460), (-0.864188,-0.442863, 0.238856),
    (-0.809017,-0.309017, 0.500000), (-0.688191,-0.587785, 0.425325),
    (-0.681718,-0.147621, 0.716567), (-0.442863,-0.238856, 0.864188),
    (-0.587785,-0.425325, 0.688191), (-0.309017,-0.500000, 0.809017),
    (-0.147621,-0.716567, 0.681718), ( 0.000000,-0.525731, 0.850651),
    (-0.425325,-0.688191, 0.587785), ( 0.147621,-0.716567, 0.681718),
    ( 0.309017,-0.500000, 0.809017), ( 0.425425,-0.688191, 0.587785),
    ( 0.442863,-0.238856, 0.864188), ( 0.587785,-0.425325, 0.688191),
    ( 0.688191,-0.587785, 0.425325), (-0.955423, 0.295242, 0.000000),
    (-0.951056, 0.162460, 0.262866), (-1.000000, 0.000000, 0.000000),
    (-0.850651, 0.000000, 0.525731), (-0.955423,-0.295242, 0.000000),
    (-0.951056,-0.162460, 0.262866), (-0.864188, 0.442863,-0.238856),
    (-0.951056, 0.162460,-0.262866), (-0.809017, 0.309017,-0.500000),
    (-0.864188,-0.442863,-0.238856), (-0.951056,-0.162460,-0.262866),
    (-0.809017,-0.309017,-0.500000), (-0.681718, 0.147621,-0.716567),
    (-0.681718,-0.147621,-0.716567), (-0.850651, 0.000000,-0.525731),
    (-0.688191, 0.587785,-0.425325), (-0.587785, 0.425325,-0.688191),
    (-0.425325, 0.688191,-0.587785), (-0.425325,-0.688191,-0.587785),
    (-0.587785,-0.425325,-0.688191), (-0.688191,-0.587785,-0.425325),
]

def _nearest_anorm(nx: float, ny: float, nz: float) -> int:
    """Return the index of the closest Quake anisotropic normal."""
    best_i, best_dot = 0, -2.0
    for i, (ax, ay, az) in enumerate(_ANORMS):
        d = nx*ax + ny*ay + nz*az
        if d > best_dot:
            best_dot, best_i = d, i
    return best_i

# ── Quake palette (256 × RGB) ──────────────────────────────────────────────────
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
    # Entries 248-255: Quake fullbright reds/yellows (used for flashes; rarely in model skins)
    0xff,0x00,0x00, 0xff,0x33,0x00, 0xff,0x66,0x00, 0xff,0x99,0x00,
    0xff,0xcc,0x00, 0xff,0xff,0x00, 0xff,0xff,0x33, 0xff,0xff,0x66,
]
# Pad to exactly 256 entries in case of minor count drift (fill with black)
while len(_PAL_RAW) < 768:
    _PAL_RAW += [0, 0, 0]
PALETTE = [(_PAL_RAW[i*3], _PAL_RAW[i*3+1], _PAL_RAW[i*3+2]) for i in range(256)]

# Pre-build a lookup cube for fast quantisation (8-bit → 4-bit per channel = 16³ = 4096 entries)
_QUANT_CACHE: dict[tuple, int] = {}

def nearest_palette_idx(r: int, g: int, b: int) -> int:
    """Return index of the closest Quake palette entry to (r, g, b) [0-255]."""
    key = (r >> 2, g >> 2, b >> 2)   # ~6-bit precision cache key
    if key in _QUANT_CACHE:
        return _QUANT_CACHE[key]
    best_i, best_d = 0, float("inf")
    for i, (pr, pg, pb) in enumerate(PALETTE):
        d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if d < best_d:
            best_d, best_i = d, i
            if d == 0:
                break
    _QUANT_CACHE[key] = best_i
    return best_i


# ── Texture loading ────────────────────────────────────────────────────────────

def _solid_skin(w: int, h: int, idx: int = 0x97) -> bytes:
    """Flat palette-indexed skin (brownish-grey by default)."""
    return bytes([idx] * (w * h))


def _make_pal_image():
    """Build a Pillow palette image from the Quake palette (cached)."""
    from PIL import Image
    pal_img = Image.new("P", (1, 1))
    flat = []
    for r, g, b in PALETTE:
        flat += [r, g, b]
    while len(flat) < 768:
        flat += [0, 0, 0]
    pal_img.putpalette(flat)
    return pal_img

_PIL_PAL_IMG = None   # module-level cache


def load_and_quantise(tex_path: Path, w: int, h: int) -> bytes:
    """Load any image, resize to (w, h), quantise to Quake palette with dithering."""
    global _PIL_PAL_IMG
    try:
        from PIL import Image
        if _PIL_PAL_IMG is None:
            _PIL_PAL_IMG = _make_pal_image()
        img = Image.open(tex_path).convert("RGB").resize((w, h), Image.LANCZOS)
        quantized = img.quantize(palette=_PIL_PAL_IMG, dither=1)   # Floyd-Steinberg
        return bytes(quantized.tobytes())
    except ImportError:
        print("    [warn] Pillow not installed — run: pip install Pillow")
        return _solid_skin(w, h)
    except Exception as exc:
        print(f"    [warn] Texture load failed ({exc}); using solid skin")
        return _solid_skin(w, h)


def build_texture_catalog(root: Path) -> dict:
    """
    Recursively scan *root* for image files and return a dict mapping
    lowercase basename -> Path.  When a name appears in multiple places the
    shallowest (fewest path parts) entry wins; ties broken alphabetically.
    """
    exts = {".png", ".tga", ".jpg", ".jpeg", ".bmp"}
    catalog: dict = {}
    for p in root.rglob("*"):
        if p.suffix.lower() in exts:
            key = p.name.lower()
            if key not in catalog:
                catalog[key] = p
            else:
                # prefer shallower path
                if len(p.parts) < len(catalog[key].parts):
                    catalog[key] = p
    return catalog


def find_texture(obj_path: Path, tex_dir: Path | None = None,
                 catalog: dict | None = None) -> Path | None:
    """
    Search for a texture for this .obj.
    Priority:
      1. Same-name image beside the .obj  (e.g. chair.png next to chair.obj)
      2. map_Kd filename from the .mtl:
           a. beside the .obj
           b. in tex_dir (flat)
           c. in catalog  (recursive scan of entire texture root)
      3. Same stem in tex_dir (flat)
      4. Same stem in catalog
    """
    exts = (".png", ".tga", ".jpg", ".jpeg", ".bmp")

    # 1. Same-name sibling in the same folder
    for ext in exts:
        p = obj_path.with_suffix(ext)
        if p.exists():
            return p

    # 2. MTL map_Kd reference
    mtl_tex_name: str | None = None
    mtl = obj_path.with_suffix(".mtl")
    if mtl.exists():
        try:
            with open(mtl, encoding="utf-8", errors="replace") as f:
                for line in f:
                    tok = line.strip().split()
                    if tok and tok[0].lower() == "map_kd":
                        mtl_tex_name = Path(tok[-1]).name   # just the filename
                        # 2a. beside .obj
                        candidate = obj_path.parent / mtl_tex_name
                        if candidate.exists():
                            return candidate
                        # 2b. flat tex_dir
                        if tex_dir:
                            candidate = tex_dir / mtl_tex_name
                            if candidate.exists():
                                return candidate
                        # 2c. recursive catalog
                        if catalog:
                            hit = catalog.get(mtl_tex_name.lower())
                            if hit:
                                return hit
                        break
        except Exception:
            pass

    # 3. Same stem in tex_dir (flat)
    if tex_dir:
        stem = obj_path.stem
        for ext in exts:
            candidate = tex_dir / f"{stem}{ext}"
            if candidate.exists():
                return candidate

    # 4. Same stem in catalog
    if catalog:
        stem = obj_path.stem.lower()
        for ext in exts:
            hit = catalog.get(f"{stem}{ext}")
            if hit:
                return hit

    return None


# ── OBJ parser ─────────────────────────────────────────────────────────────────

def parse_obj(path: Path):
    """
    Parse a .obj file into raw geometry.
    Returns:
        positions     : list of (x, y, z)   — OBJ space
        uvs           : list of (u, v)
        faces         : list of [(pos_idx, uv_idx), ...] — already triangulated
                        uv_idx is -1 if no UV data
        face_materials: list of str — material name for each triangulated face
    """
    positions: list[tuple] = []
    uvs: list[tuple] = []
    raw_faces: list[list] = []
    raw_face_mats: list[str] = []
    cur_mat: str = "__default__"

    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            cmd = parts[0].lower()

            if cmd == "v":
                positions.append((float(parts[1]), float(parts[2]), float(parts[3])))

            elif cmd == "vt":
                u = float(parts[1])
                v = float(parts[2]) if len(parts) > 2 else 0.0
                uvs.append((u, v))

            elif cmd == "usemtl" and len(parts) > 1:
                cur_mat = parts[1]

            elif cmd == "f":
                face = []
                for token in parts[1:]:
                    spl = token.split("/")
                    pi = int(spl[0])
                    pi = pi - 1 if pi > 0 else len(positions) + pi
                    ui = -1
                    if len(spl) > 1 and spl[1]:
                        ui_raw = int(spl[1])
                        ui = ui_raw - 1 if ui_raw > 0 else len(uvs) + ui_raw
                    face.append((pi, ui))
                raw_faces.append(face)
                raw_face_mats.append(cur_mat)

    # Fan-triangulate n-gons (each n-gon → n-2 triangles, same material)
    faces: list[list] = []
    face_materials: list[str] = []
    for face, mat in zip(raw_faces, raw_face_mats):
        if len(face) < 3:
            continue
        for i in range(1, len(face) - 1):
            faces.append([face[0], face[i], face[i + 1]])
            face_materials.append(mat)

    return positions, uvs, faces, face_materials


def resolve_material_textures(obj_path: Path, catalog: dict | None) -> dict:
    """
    Parse the .mtl file next to obj_path and return {material_name: Path or None}
    for every material referenced.  Falls back to catalog lookup by texture basename.
    """
    exts = [".png", ".tga", ".jpg", ".jpeg", ".bmp", ".webp"]
    mat_tex: dict = {}
    mtl_path = obj_path.with_suffix(".mtl")
    if not mtl_path.exists():
        return mat_tex

    cur_mat = None
    with open(mtl_path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            parts = line.split()
            if not parts:
                continue
            if parts[0].lower() == "newmtl" and len(parts) > 1:
                cur_mat = parts[1]
                if cur_mat not in mat_tex:
                    mat_tex[cur_mat] = None
            elif parts[0].lower() == "map_kd" and cur_mat and len(parts) > 1:
                tex_name = Path(parts[-1]).name
                # Try sibling of OBJ
                candidate = obj_path.parent / tex_name
                if candidate.exists():
                    mat_tex[cur_mat] = candidate
                    continue
                # Try catalog
                if catalog:
                    hit = catalog.get(tex_name.lower())
                    if hit:
                        mat_tex[cur_mat] = hit
                        continue
                # Try catalog by stem + each ext
                stem = Path(tex_name).stem.lower()
                if catalog:
                    for ext in exts:
                        hit = catalog.get(stem + ext)
                        if hit:
                            mat_tex[cur_mat] = hit
                            break
    return mat_tex


def build_atlas(mat_order: list, mat_tex: dict,
                skin_size: int) -> tuple:
    """
    Pack per-material textures into a skin_size×skin_size atlas using a 2D grid
    so each slot stays roughly square instead of a narrow horizontal strip.

    Returns:
        atlas_pixels : bytes  (palette-indexed, skin_size × skin_size)
        uv_offsets   : dict {mat_name: (u_start, v_start, u_scale, v_scale)}
    """
    try:
        from PIL import Image
    except ImportError:
        return None, {}

    n    = len(mat_order)
    cols = math.ceil(math.sqrt(n))
    rows = math.ceil(n / cols)
    slot_w = max(1, skin_size // cols)
    slot_h = max(1, skin_size // rows)

    canvas = Image.new("RGBA", (cols * slot_w, rows * slot_h), (64, 64, 64, 255))

    for i, mat in enumerate(mat_order):
        col = i % cols
        row = i // cols
        tex_path = mat_tex.get(mat)
        if tex_path and Path(tex_path).exists():
            try:
                img = Image.open(tex_path).convert("RGBA").resize(
                    (slot_w, slot_h), Image.LANCZOS)
                canvas.paste(img, (col * slot_w, row * slot_h))
            except Exception:
                pass

    # Resize to exact skin_size × skin_size, then quantise with dithering
    canvas = canvas.resize((skin_size, skin_size), Image.LANCZOS)
    global _PIL_PAL_IMG
    if _PIL_PAL_IMG is None:
        _PIL_PAL_IMG = _make_pal_image()
    atlas_p      = canvas.convert("RGB").quantize(palette=_PIL_PAL_IMG, dither=1)
    atlas_pixels = bytes(atlas_p.tobytes())

    uv_offsets = {}
    for i, mat in enumerate(mat_order):
        col = i % cols
        row = i // cols
        uv_offsets[mat] = (col / cols, row / rows, 1.0 / cols, 1.0 / rows)

    return atlas_pixels, uv_offsets


# ── Geometry conversion ────────────────────────────────────────────────────────

def build_mdl_geometry(positions, uvs, faces, skin_w: int, skin_h: int, unit_scale: float,
                       face_materials=None, uv_offsets=None):
    """
    Produce MDL-compatible vertex / ST-vert / triangle lists.

    MDL requires ONE (s, t) UV per vertex — we 'unweld' vertices so that
    every unique (position_index, uv_index) pair gets its own MDL vertex.

    Coordinate mapping (inverse of mdl_to_glb.py):
        mdl_x = -obj_x * unit_scale
        mdl_y =  obj_z * unit_scale   (OBJ -Z forward → Quake Y axis)
        mdl_z =  obj_y * unit_scale   (OBJ  Y up      → Quake Z axis)

    Returns:
        mdl_verts    : list of (qx, qy, qz)  Quake-unit positions
        mdl_stverts  : list of (on_seam, s, t)
        mdl_tris     : list of (faces_front, [v0, v1, v2])
        mdl_normidxs : list of int  (Quake anisotropic normal index per vertex)
    """
    vert_map: dict = {}
    mdl_verts:    list = []
    mdl_stverts:  list = []
    mdl_tris:     list = []
    # Accumulate face normals per (pi, ui) key for smooth shading
    norm_accum: dict = {}   # key -> [nx, ny, nz]

    def uv_to_st(u: float, v: float, mat: str) -> tuple[int, int]:
        # Wrap tiled UVs into [0,1) — clamp 1.0 to just below 1.0 to avoid wrap to 0
        uf = u % 1.0 if u % 1.0 != 0.0 or u == 0.0 else 1.0 - 1e-6
        vf = (1.0 - v)
        vf = vf % 1.0 if vf % 1.0 != 0.0 or vf == 0.0 else 1.0 - 1e-6
        if uv_offsets and mat in uv_offsets:
            u_start, v_start, u_scale, v_scale = uv_offsets[mat]
            uf = u_start + uf * u_scale
            vf = v_start + vf * v_scale
        s = min(int(uf * skin_w), skin_w - 1)
        t = min(int(vf * skin_h), skin_h - 1)
        return s, t

    def cross(a, b):
        return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])

    for fi, face in enumerate(faces):
        mat = (face_materials[fi] if face_materials and fi < len(face_materials)
               else "__default__")
        tri_indices = []
        for pi, ui in face:
            key = (pi, ui, mat)   # include mat so same pos/uv in different mat stays split
            if key not in vert_map:
                vert_map[key] = len(mdl_verts)

                ox, oy, oz = positions[pi]
                # OBJ (Y-up, -Z forward) → Quake (Z-up, X-forward)
                qx = -ox * unit_scale
                qy =  oz * unit_scale
                qz =  oy * unit_scale
                mdl_verts.append((qx, qy, qz))

                if ui >= 0 and ui < len(uvs):
                    u, v = uvs[ui]
                    s, t = uv_to_st(u, v, mat)
                else:
                    s, t = 0, 0
                mdl_stverts.append((0, s, t))   # on_seam=0
                norm_accum[key] = [0.0, 0.0, 0.0]

            tri_indices.append(vert_map[key])

        # Compute face normal in Quake space and accumulate
        if len(tri_indices) == 3:
            v0 = mdl_verts[tri_indices[0]]
            v1 = mdl_verts[tri_indices[1]]
            v2 = mdl_verts[tri_indices[2]]
            e1 = (v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2])
            e2 = (v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2])
            fn = cross(e1, e2)
            for (fpi, fui), fkey in zip(face, [(face[j][0], face[j][1], mat) for j in range(3)]):
                na = norm_accum[fkey]
                na[0] += fn[0]; na[1] += fn[1]; na[2] += fn[2]

        mdl_tris.append((1, tri_indices))   # faces_front=1

    # Convert accumulated normals → closest Quake anorm index
    mdl_normidxs: list = []
    for key in sorted(vert_map, key=lambda k: vert_map[k]):
        na = norm_accum[key]
        length = math.sqrt(na[0]**2 + na[1]**2 + na[2]**2)
        if length > 0:
            nx, ny, nz = na[0]/length, na[1]/length, na[2]/length
        else:
            nx, ny, nz = 0.0, 0.0, 1.0
        mdl_normidxs.append(_nearest_anorm(nx, ny, nz))

    return mdl_verts, mdl_stverts, mdl_tris, mdl_normidxs


# ── Vertex compression ─────────────────────────────────────────────────────────

def compress_vertices(mdl_verts):
    """
    Compute MDL header scale/origin and compress each vertex to 3 unsigned bytes.

    MDL stores each coordinate as:
        compressed_byte = round((world_coord - origin[axis]) / scale[axis])
    clamped to [0, 255].

    Returns: scale (3-list), origin (3-list), compressed (list of (bx, by, bz))
    """
    if not mdl_verts:
        return [1.0, 1.0, 1.0], [0.0, 0.0, 0.0], []

    xs = [v[0] for v in mdl_verts]
    ys = [v[1] for v in mdl_verts]
    zs = [v[2] for v in mdl_verts]

    origin = [min(xs), min(ys), min(zs)]
    ranges = [max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)]
    scale  = [max(r, 1e-6) / 255.0 for r in ranges]

    compressed = []
    for qx, qy, qz in mdl_verts:
        bx = max(0, min(255, round((qx - origin[0]) / scale[0])))
        by = max(0, min(255, round((qy - origin[1]) / scale[1])))
        bz = max(0, min(255, round((qz - origin[2]) / scale[2])))
        compressed.append((bx, by, bz))

    return scale, origin, compressed


# ── MDL writer ─────────────────────────────────────────────────────────────────

def write_mdl(
    out_path: Path,
    mdl_verts, mdl_stverts, mdl_tris, mdl_normidxs,
    compressed_verts, scale, origin,
    skin_pixels: bytes, skin_w: int, skin_h: int,
    model_name: str,
) -> None:
    """Serialise everything into a Quake MDL binary (IDPO version 6)."""

    num_verts  = len(mdl_verts)
    num_tris   = len(mdl_tris)
    num_frames = 1
    num_skins  = 1

    # Bounding radius (from origin)
    bounding_radius = max(
        (math.sqrt(x*x + y*y + z*z) for x, y, z in mdl_verts),
        default=1.0,
    )

    # Average triangle edge length (Quake's 'size' field, used for LOD hints)
    size_val = 0.0
    if mdl_tris:
        total = 0.0
        for _, verts in mdl_tris:
            v0, v1, v2 = (mdl_verts[v] for v in verts)
            e = [
                math.sqrt(sum((v0[i]-v1[i])**2 for i in range(3))),
                math.sqrt(sum((v1[i]-v2[i])**2 for i in range(3))),
                math.sqrt(sum((v2[i]-v0[i])**2 for i in range(3))),
            ]
            total += sum(e) / 3.0
        size_val = total / len(mdl_tris)

    buf = bytearray()

    # ── Header ─────────────────────────────────────────────────────────────
    buf += b"IDPO"
    buf += struct.pack("<i",  6)                        # version
    buf += struct.pack("<3f", *scale)
    buf += struct.pack("<3f", *origin)
    buf += struct.pack("<f",  bounding_radius)
    buf += struct.pack("<3f", 0.0, 0.0, 24.0)           # eye_position (reasonable default)
    buf += struct.pack("<3i", num_skins, skin_w, skin_h)
    buf += struct.pack("<3i", num_verts, num_tris, num_frames)
    buf += struct.pack("<2i", 0, 0)                     # synctype=0, flags=0
    buf += struct.pack("<f",  size_val)

    # ── Skin (single, palette-indexed pixels) ───────────────────────────────
    buf += struct.pack("<i", 0)     # skin type = single
    buf += skin_pixels

    # ── ST verts ───────────────────────────────────────────────────────────
    for on_seam, s, t in mdl_stverts:
        buf += struct.pack("<3i", on_seam, s, t)

    # ── Triangles ──────────────────────────────────────────────────────────
    for faces_front, verts in mdl_tris:
        buf += struct.pack("<i",  faces_front)
        buf += struct.pack("<3i", *verts)

    # ── Single static frame ─────────────────────────────────────────────────
    bmin = [min(v[i] for v in compressed_verts) for i in range(3)] if compressed_verts else [0, 0, 0]
    bmax = [max(v[i] for v in compressed_verts) for i in range(3)] if compressed_verts else [0, 0, 0]

    buf += struct.pack("<i", 0)                         # frame type = simple
    buf += bytes([bmin[0], bmin[1], bmin[2], 0])        # bboxmin (xyz + normal_idx)
    buf += bytes([bmax[0], bmax[1], bmax[2], 0])        # bboxmax

    name_b = model_name[:15].encode("ascii", errors="replace")
    buf += name_b + bytes(16 - len(name_b))             # frame name, padded to 16

    for i, (bx, by, bz) in enumerate(compressed_verts):
        ni = mdl_normidxs[i] if i < len(mdl_normidxs) else 0
        buf += bytes([bx, by, bz, ni])                  # trivert: xyz + normal_idx

    out_path.write_bytes(bytes(buf))


# ── Per-file conversion ────────────────────────────────────────────────────────

def convert_obj(obj_path: Path, out_dir: Path, skin_size: int, unit_scale: float,
                tex_dir: Path | None = None, catalog: dict | None = None) -> bool:
    name = obj_path.stem
    out_path = out_dir / f"{name}.mdl"

    print(f"  {obj_path.name}  ->  {out_path.name}", end="  ", flush=True)

    try:
        positions, uvs, faces, face_materials = parse_obj(obj_path)
    except Exception as exc:
        print(f"[ERROR parsing OBJ: {exc}]")
        return False

    if not faces:
        print("[SKIP - no faces found]")
        return False

    skin_w = skin_h = skin_size

    # Resolve per-material textures and build atlas for multi-material models
    mat_tex   = resolve_material_textures(obj_path, catalog)
    mat_order = list(dict.fromkeys(face_materials))   # unique materials, insertion order

    # Filter to only materials that have a texture (or at least exist in mat_tex)
    mats_with_tex = [m for m in mat_order if mat_tex.get(m)]

    if len(mats_with_tex) > 1:
        skin_pixels, uv_offsets = build_atlas(mats_with_tex, mat_tex, skin_size)
        if skin_pixels is None:
            # Pillow not available — fall back to first material
            uv_offsets  = None
            tex_path    = mat_tex.get(mats_with_tex[0])
            skin_pixels = load_and_quantise(tex_path, skin_w, skin_h) if tex_path else _solid_skin(skin_w, skin_h)
        print(f"[atlas {len(mats_with_tex)} mats]", end="  ", flush=True)
    elif mats_with_tex:
        uv_offsets  = None
        tex_path    = mat_tex.get(mats_with_tex[0])
        skin_pixels = load_and_quantise(tex_path, skin_w, skin_h) if tex_path else _solid_skin(skin_w, skin_h)
        print(f"[tex: {Path(tex_path).name}]", end="  ", flush=True)
    else:
        # Fall back to old single-texture lookup
        uv_offsets  = None
        tex_path    = find_texture(obj_path, tex_dir, catalog)
        if tex_path:
            skin_pixels = load_and_quantise(tex_path, skin_w, skin_h)
            print(f"[tex: {tex_path.name}]", end="  ", flush=True)
        else:
            skin_pixels = _solid_skin(skin_w, skin_h)
            print("[no tex]", end="  ", flush=True)

    mdl_verts, mdl_stverts, mdl_tris, mdl_normidxs = build_mdl_geometry(
        positions, uvs, faces, skin_w, skin_h, unit_scale,
        face_materials=face_materials, uv_offsets=uv_offsets
    )

    scale, origin, compressed = compress_vertices(mdl_verts)
    write_mdl(
        out_path, mdl_verts, mdl_stverts, mdl_tris, mdl_normidxs,
        compressed, scale, origin,
        skin_pixels, skin_w, skin_h, name,
    )

    print(f"OK  ({len(mdl_verts)} verts, {len(mdl_tris)} tris)")
    return True


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    args = sys.argv[1:]
    if len(args) < 2 or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0 if args and args[0] in ("-h", "--help") else 1)

    input_dir  = Path(args[0])
    output_dir = Path(args[1])

    if not input_dir.is_dir():
        print(f"ERROR: input directory not found: {input_dir}")
        sys.exit(1)

    # Parse optional flags
    skin_size  = 128
    unit_scale = 50.0
    recursive  = False
    tex_dir:  Path | None = None
    tex_root: Path | None = None

    i = 2
    while i < len(args):
        if args[i] == "--skin-size" and i + 1 < len(args):
            skin_size = max(8, int(args[i + 1]))
            i += 2
        elif args[i] == "--scale" and i + 1 < len(args):
            unit_scale = float(args[i + 1])
            i += 2
        elif args[i] == "--texture-dir" and i + 1 < len(args):
            tex_dir = Path(args[i + 1])
            if not tex_dir.is_dir():
                print(f"WARNING: --texture-dir not found: {tex_dir}")
                tex_dir = None
            i += 2
        elif args[i] == "--texture-root" and i + 1 < len(args):
            tex_root = Path(args[i + 1])
            if not tex_root.is_dir():
                print(f"WARNING: --texture-root not found: {tex_root}")
                tex_root = None
            i += 2
        elif args[i] == "--recursive":
            recursive = True
            i += 1
        else:
            i += 1

    output_dir.mkdir(parents=True, exist_ok=True)

    # Build recursive texture catalog if a root was given
    catalog: dict | None = None
    if tex_root:
        print(f"Scanning texture catalog under: {tex_root}")
        catalog = build_texture_catalog(tex_root)
        print(f"  {len(catalog)} unique texture filenames indexed")

    pattern = "**/*.obj" if recursive else "*.obj"
    obj_files = sorted(input_dir.glob(pattern))

    if not obj_files:
        print(f"No .obj files found in {input_dir}"
              + (" (add --recursive to search sub-dirs)" if not recursive else ""))
        sys.exit(1)

    print(f"obj_to_mdl -- {len(obj_files)} file(s)  |  skin {skin_size}x{skin_size}  |  scale x{unit_scale}")
    print(f"  input    : {input_dir}")
    print(f"  output   : {output_dir}")
    if tex_dir:
        print(f"  textures : {tex_dir}")
    if tex_root:
        print(f"  tex-root : {tex_root}  ({len(catalog)} files)")
    print()

    ok = fail = 0
    for obj_path in obj_files:
        if convert_obj(obj_path, output_dir, skin_size, unit_scale, tex_dir, catalog):
            ok += 1
        else:
            fail += 1

    print("\n" + "-" * 60)
    print(f"Done.  {ok} converted, {fail} failed.")
    if ok:
        print(f"MDL files written to: {output_dir}")


if __name__ == "__main__":
    main()

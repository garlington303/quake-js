"""
generate_prop_fgd.py
Scans all .mdl files in public/pak-extracted/progs/custom/
and generates a TrenchBroom FGD with one @PointClass per model.

Each entity has the model path hardcoded so TrenchBroom previews
it automatically — no typing required. Just right-click > place entity.

If preview models exist in public/preview/ (same stem), they are preferred:
  preview/{stem}.md3 → preview/{stem}.obj → pak-extracted/progs/custom/{stem}.mdl

Usage:
    python scripts/generate_prop_fgd.py
Output:
    trenchbroom/props.fgd
    (also copied to AppData TrenchBroom games folder)
"""

import os
import re
import shutil

MDL_DIR   = "public/pak-extracted/progs/custom"
PREVIEW_DIR = "public/preview"
OUT_FGD   = "trenchbroom/props.fgd"
TB_DEST   = os.path.expanduser(
    r"~\AppData\Roaming\TrenchBroom\games\QuakeJS\props.fgd"
)

# Prefer modern preview formats when available (TrenchBroom supports MD3/OBJ/MDL)
PREVIEW_EXTS = [".md3", ".obj"]
DEFAULT_SCALE = 32.0

# ── Name helpers ─────────────────────────────────────────────────────────────

def stem_to_classname(stem):
    """Convert a filename stem to a valid FGD classname: prop_<sanitized>"""
    s = re.sub(r"[^a-zA-Z0-9_]", "_", stem)
    if s and s[0].isdigit():
        s = "m_" + s
    return "prop_" + s.lower()

def stem_to_label(stem):
    """Human-readable label from stem: ammo_box_1 -> Ammo Box 1"""
    return stem.replace("_", " ").replace("-", " ").title()

# ── Category prefix → FGD group comment ──────────────────────────────────────

CATEGORIES = [
    ("ammo",        "AMMO"),
    ("barrel",      "BARRELS"),
    ("box",         "BOXES"),
    ("bucket",      "BUCKETS / CONTAINERS"),
    ("cabinet",     "CABINETS"),
    ("can",         "CANS"),
    ("car",         "CARS / VEHICLES"),
    ("chair",       "CHAIRS / FURNITURE"),
    ("crate",       "CRATES"),
    ("door",        "DOORS"),
    ("fence",       "FENCES"),
    ("fire",        "FIRE / EFFECTS"),
    ("flag",        "FLAGS"),
    ("floor",       "FLOOR DETAILS"),
    ("gun",         "GUNS / WEAPONS"),
    ("lamp",        "LAMPS / LIGHTS"),
    ("locker",      "LOCKERS"),
    ("pipe",        "PIPES"),
    ("plant",       "PLANTS"),
    ("rack",        "RACKS"),
    ("road",        "ROAD / SIGNS"),
    ("shelf",       "SHELVES"),
    ("sign",        "SIGNS"),
    ("soldier",     "SOLDIERS / CHARACTERS"),
    ("table",       "TABLES"),
    ("tire",        "TIRES"),
    ("trash",       "TRASH / DEBRIS"),
    ("tree",        "TREES / VEGETATION"),
    ("vent",        "VENTS / GRATES"),
    ("wall",        "WALLS / STRUCTURE"),
    ("weapon",      "WEAPONS"),
    ("window",      "WINDOWS"),
    ("wire",        "WIRES / CABLES"),
    ("wood",        "WOOD / PLANKS"),
]

def category_for(stem):
    sl = stem.lower()
    for prefix, label in CATEGORIES:
        if sl.startswith(prefix):
            return label
    return "MISC"

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project    = os.path.dirname(script_dir)

    mdl_dir  = os.path.join(project, MDL_DIR)
    preview_dir = os.path.join(project, PREVIEW_DIR)
    out_path = os.path.join(project, OUT_FGD)

    mdl_files = sorted(
        f for f in os.listdir(mdl_dir) if f.lower().endswith(".mdl")
    )

    if not mdl_files:
        print("No MDL files found in", mdl_dir)
        return

    # group by category
    from collections import defaultdict
    groups = defaultdict(list)
    for fname in mdl_files:
        stem = os.path.splitext(fname)[0]
        groups[category_for(stem)].append(stem)

    lines = [
        "// props.fgd — Auto-generated prop entities",
        "// Source: " + MDL_DIR,
        "// DO NOT EDIT BY HAND — regenerate with scripts/generate_prop_fgd.py",
        "//",
        f"// {len(mdl_files)} models",
        "",
    ]

    total = 0
    def resolve_model_path(stem):
        # Prefer preview models (OBJ/MD3) if present
        for ext in PREVIEW_EXTS:
            candidate = os.path.join(preview_dir, stem, f"{stem}{ext}")
            if os.path.exists(candidate):
                return f"preview/{stem}/{stem}{ext}"
        # Fall back to MDL
        return f"pak-extracted/progs/custom/{stem}.mdl"

    for cat_label in sorted(groups.keys()):
        stems = groups[cat_label]
        lines += [
            "",
            "// " + "=" * 60,
            "// PROPS - " + cat_label,
            "// " + "=" * 60,
            "",
        ]
        for stem in stems:
            classname  = stem_to_classname(stem)
            label      = stem_to_label(stem)
            model_path = resolve_model_path(stem)
            lines += [
                f'@PointClass model("{model_path}") size(-16 -16 -16, 16 16 16) color(0 255 128) = {classname} : "{label}"',
                "[",
                '    angle(angle) : "Yaw rotation (0=North, 90=East)" : 0',
                f'    scale(float) : "Uniform scale" : {DEFAULT_SCALE}',
                "]",
                "",
            ]
            total += 1

    content = "\n".join(lines)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"Written {total} prop entities -> {out_path}")

    # copy to TrenchBroom
    try:
        shutil.copy2(out_path, TB_DEST)
        print(f"Copied -> {TB_DEST}")
    except Exception as e:
        print(f"Could not copy to TrenchBroom: {e}")
        print(f"Copy manually: {out_path}  ->  {TB_DEST}")

if __name__ == "__main__":
    main()

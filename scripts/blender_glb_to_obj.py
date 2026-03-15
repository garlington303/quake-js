"""
Blender helper: batch-convert GLB to OBJ (with MTL + copied textures).

Run via:
  blender -b -P scripts/blender_glb_to_obj.py -- --input <glb_dir> --output <obj_dir>
"""

import os
import sys

try:
    import bpy
    import addon_utils
except ImportError as exc:
    raise SystemExit("This script must be run inside Blender.") from exc


def parse_args():
    if "--" not in sys.argv:
        return None
    idx = sys.argv.index("--")
    args = sys.argv[idx + 1 :]
    params = {"--input": None, "--output": None}
    for i in range(0, len(args), 2):
        if i + 1 >= len(args):
            break
        key = args[i]
        val = args[i + 1]
        if key in params:
            params[key] = val
    if not params["--input"] or not params["--output"]:
        return None
    return params["--input"], params["--output"]


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)
    for block in bpy.data.images:
        bpy.data.images.remove(block)


def export_obj(out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    out_dir = os.path.dirname(out_path)

    # Ensure embedded textures are written out so OBJ/MTL can reference them
    for image in bpy.data.images:
        if image.source != "FILE" and not image.packed_file:
            continue
        name = os.path.splitext(os.path.basename(image.name))[0]
        if not name:
            continue
        tex_path = os.path.join(out_dir, f"{name}.png")
        try:
            image.filepath_raw = tex_path
            try:
                image.filepath = tex_path
            except Exception:
                pass
            image.file_format = "PNG"
            image.save()
        except Exception:
            try:
                image.save_render(tex_path)
            except Exception:
                pass

    if hasattr(bpy.ops.wm, "obj_export"):
        bpy.ops.wm.obj_export(
            filepath=out_path,
            export_selected_objects=False,
            export_materials=True,
            export_uv=True,
            path_mode="RELATIVE",
            forward_axis="NEGATIVE_Z",
            up_axis="Y",
        )
        return

    addon_utils.enable("io_scene_obj", default_set=True, persistent=True)
    bpy.ops.export_scene.obj(
        filepath=out_path,
        use_selection=False,
        use_materials=True,
        use_uvs=True,
        path_mode="RELATIVE",
        axis_forward="-Z",
        axis_up="Y",
    )


def main():
    parsed = parse_args()
    if not parsed:
        raise SystemExit("Usage: blender -b -P scripts/blender_glb_to_obj.py -- --input <glb_dir> --output <obj_dir>")

    input_dir, output_dir = parsed
    input_dir = os.path.abspath(input_dir)
    output_dir = os.path.abspath(output_dir)

    glb_files = []
    for root, _, files in os.walk(input_dir):
        for fname in files:
            if fname.lower().endswith(".glb"):
                glb_files.append(os.path.join(root, fname))

    if not glb_files:
        print("No GLB files found in", input_dir)
        return

    for glb in glb_files:
        stem = os.path.splitext(os.path.basename(glb))[0]
        out_folder = os.path.join(output_dir, stem)
        out_obj = os.path.join(out_folder, f"{stem}.obj")

        clear_scene()
        bpy.ops.import_scene.gltf(filepath=glb)

        # Scale up for Quake/TrenchBroom unit expectations (GLB meters → Quake units)
        preview_scale = 32.0
        for obj in bpy.context.scene.objects:
            if obj.type == "MESH":
                obj.scale = (obj.scale[0] * preview_scale, obj.scale[1] * preview_scale, obj.scale[2] * preview_scale)
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        export_obj(out_obj)

        print("Converted", glb, "->", out_obj)


if __name__ == "__main__":
    main()

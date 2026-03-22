import re

with open("src/player/viewModel.js", "r") as f:
    content = f.read()

# 1. Add Revolver constants
if "REVOLVER_GLB_URL" not in content:
    revolver_constants = """// ── Revolver ──────────────────────────────────────────────────────────────────
const REVOLVER_GLB_URL = "/models/Items%20&%20Weapons/pistol_mp_1.glb";
const REVOLVER_MODEL_OFFSET = new Vector3(0.12, -0.20, 0.52);
const REVOLVER_MODEL_SCALE  = 3.12;
const REVOLVER_MODEL_ROTATION = Quaternion.FromEulerAngles(0, Math.PI / 2, 0);

"""
    content = content.replace("// ── Sword ─", revolver_constants + "// ── Sword ─")

# 2. Add Revolver Recoil constants
if "REVOLVER_RECOIL_Z" not in content:
    revolver_recoil = """// ── Revolver recoil ───────────────────────────────────────────────────────────
const REVOLVER_RECOIL_Z   = -0.12;
const REVOLVER_RECOIL_ROT = -0.18;
const REVOLVER_RECOIL_DUR = 0.14;

"""
    content = content.replace("// ── Sword swing ─", revolver_recoil + "// ── Sword swing ─")

# 3. Add loadRevolverModel function
if "loadRevolverModel" not in content:
    revolver_func = """async function loadRevolverModel(scene, parent) {
  const modelRoot = new TransformNode("viewmodel-revolver-glb", scene);
  modelRoot.parent = parent;
  modelRoot.position.copyFrom(REVOLVER_MODEL_OFFSET);
  modelRoot.scaling.setAll(REVOLVER_MODEL_SCALE);
  modelRoot.rotationQuaternion = REVOLVER_MODEL_ROTATION.clone();
  modelRoot.setEnabled(false);

  const result = await SceneLoader.ImportMeshAsync("", "", window.location.origin + REVOLVER_GLB_URL, scene);
  result.materials?.forEach((m) => configureImportedMaterial(m));
  const meshSet = new Set(result.meshes);
  result.meshes.filter((m) => !m.parent || !meshSet.has(m.parent)).forEach((m) => { m.parent = modelRoot; });
  result.meshes.forEach((mesh) => {
    configureImportedMaterial(mesh.material);
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.renderingGroupId = 1;
    mesh.alwaysSelectAsActiveMesh = true;
  });
  return { root: modelRoot };
}

"""
    content = content.replace("// Flash is parented", revolver_func + "// Flash is parented")

# 4. Add revolver vars inside createViewModel
if "revolverMeshRoot" not in content:
    content = content.replace("let staffMeshRoot = null;", "let staffMeshRoot = null;\n  let revolverMeshRoot = null;")

if "loadRevolverModel(scene, root)" not in content:
    revolver_load_call = """
  loadRevolverModel(scene, root)
    .then((model) => {
      revolverMeshRoot = model.root;
      revolverMeshRoot.setEnabled(activeWeapon === "revolver");
    })
    .catch((error) => {
      console.warn("Failed to load revolver GLB viewmodel.", error);
    });
"""
    content = content.replace("  // ── Animation state ─", revolver_load_call + "\n  // ── Animation state ─")

# 5. Add Animation state vars
if "let swingCombo =" not in content:
    content = content.replace("let swingTimer = -1;", "let swingTimer = -1;\n  let swingCombo = 0;")
if "let revolverRecoilTimer =" not in content:
    content = content.replace("let castTimer = -1;    // staff cast", "let castTimer = -1;    // staff cast\n  let revolverRecoilTimer = -1;")

# 6. Add to setWeapon
if "revolverMeshRoot.setEnabled" not in content:
    content = content.replace("if (staffMeshRoot) staffMeshRoot.setEnabled(weapon === \"staff\");", "if (staffMeshRoot) staffMeshRoot.setEnabled(weapon === \"staff\");\n    if (revolverMeshRoot) revolverMeshRoot.setEnabled(weapon === \"revolver\");")
if "revolverRecoilTimer = -1" not in content:
    content = content.replace("castTimer = -1;", "castTimer = -1;\n    revolverRecoilTimer = -1;")

# 7. Add fireRevolver
if "function fireRevolver" not in content:
    fire_rev = """
  function fireRevolver() {
    if (activeWeapon !== "revolver") return;
    revolverRecoilTimer = REVOLVER_RECOIL_DUR;
    flash.restart();
  }
"""
    content = content.replace("function update(dt", fire_rev + "\n  function update(dt")

# 8. Update swingMelee
swing_melee_new = """  function swingMelee() {
    if (activeWeapon !== "sword") return;
    swingTimer = SWING_DURATION;
    swingCombo = (swingCombo + 1) % 3;
  }"""
content = re.sub(r"function swingMelee\(\) \{.*?\}", swing_melee_new, content, flags=re.DOTALL)

# 9. Update sword swing in update()
sword_swing_old = """    // ── Sword thrust ─────────────────────────────────────────────────────
    let swingY = 0, swingZ = 0, swingRotX = 0;

    if (swingTimer > 0) {
      swingTimer -= dt;
      const t   = 1 - swingTimer / SWING_DURATION;
      const env = Math.sin(t * Math.PI);
      swingZ    = THRUST_Z     * env;
      swingY    = THRUST_Y     * env;
      swingRotX = THRUST_ROT_X * env;
    }"""
sword_swing_new = """    // ── Sword swing ─────────────────────────────────────────────────────
    let swingX = 0, swingY = 0, swingZ = 0, swingRotX = 0, swingRotY = 0, swingRotZ = 0;

    if (swingTimer > 0) {
      swingTimer -= dt;
      const t = Math.max(0, 1 - swingTimer / SWING_DURATION);
      
      const isStrike = t < 0.3;
      const env = isStrike 
        ? Math.sin((t / 0.3) * (Math.PI / 2)) 
        : Math.cos(((t - 0.3) / 0.7) * (Math.PI / 2));

      if (swingCombo === 0) {
        // Right-to-Left slash
        swingX    = -0.40 * env;
        swingZ    =  0.30 * env;
        swingRotY = -0.80 * env; 
        swingRotZ = -0.40 * env;
      } else if (swingCombo === 1) {
        // Left-to-Right slash
        swingX    =  0.30 * env;
        swingY    =  0.10 * env;
        swingZ    =  0.30 * env;
        swingRotY =  0.80 * env;
        swingRotZ =  0.40 * env;
      } else {
        // Thrust
        swingZ    = THRUST_Z     * env;
        swingY    = THRUST_Y     * env;
        swingRotX = THRUST_ROT_X * env;
      }
    }"""
content = content.replace(sword_swing_old, sword_swing_new)

# 10. Add revolver recoil in update()
if "revolverZ = 0" not in content:
    rev_recoil = """
    // ── Revolver recoil ───────────────────────────────────────────────────
    let revolverZ = 0, revolverRot = 0;
    if (revolverRecoilTimer > 0) {
      revolverRecoilTimer -= dt;
      const normalized = Math.max(0, revolverRecoilTimer / REVOLVER_RECOIL_DUR);
      revolverZ   = REVOLVER_RECOIL_Z   * normalized;
      revolverRot = REVOLVER_RECOIL_ROT * normalized;
    }
"""
    content = content.replace("// ── Apply combined offsets ─", rev_recoil + "\n    // ── Apply combined offsets ─")

# 11. Update apply combined offsets
apply_old = """    // ── Apply combined offsets ────────────────────────────────────────────
    root.position.set(
      VM_OFFSET.x + bobX + swayX,
      VM_OFFSET.y + bobY + swingY + swayY,
      VM_OFFSET.z + recoilZ + swingZ + throwZ + castZ,
    );
    root.rotation.x = 0;
    root.rotation.z = strafeTilt;"""

apply_new = """    // ── Apply combined offsets ────────────────────────────────────────────
    root.position.set(
      VM_OFFSET.x + bobX + swayX + swingX,
      VM_OFFSET.y + bobY + swingY + swayY,
      VM_OFFSET.z + recoilZ + swingZ + throwZ + castZ + revolverZ,
    );
    root.rotation.x = swingRotX + castRotX + revolverRot;
    root.rotation.y = swingRotY;
    root.rotation.z = strafeTilt + throwRotZ + swingRotZ;"""
if apply_old in content:
    content = content.replace(apply_old, apply_new)
else:
    # Try a slightly different old string match in case castRotX was present
    apply_old_alt = """    // ── Apply combined offsets ────────────────────────────────────────────
    root.position.set(
      VM_OFFSET.x + bobX + swayX,
      VM_OFFSET.y + bobY + swingY + swayY,
      VM_OFFSET.z + recoilZ + swingZ + throwZ + castZ,
    );
    root.rotation.x = swingRotX + castRotX;
    root.rotation.y = 0;
    root.rotation.z = strafeTilt + throwRotZ;"""
    
    apply_old_alt_2 = """    // ── Apply combined offsets ────────────────────────────────────────────
    root.position.set(
      VM_OFFSET.x + bobX + swayX,
      VM_OFFSET.y + bobY + swingY + swayY,
      VM_OFFSET.z + recoilZ + swingZ + throwZ + castZ,
    );
    root.rotation.x = swingRotX + castRotX;
    root.rotation.z = strafeTilt + throwRotZ;"""
    
    # Simple regex replace for offsets block
    content = re.sub(
        r"// ── Apply combined offsets ─+\s+root\.position\.set\([^)]+\);\s+root\.rotation\.x = [^;]+;\s*(root\.rotation\.y = [^;]+;\s*)?root\.rotation\.z = [^;]+;",
        apply_new,
        content
    )

# 12. Update return
if "fireRevolver" not in content.split("return {")[1]:
    content = re.sub(r"return \{ (.*?) \};", r"return { \1, fireRevolver };", content)

with open("src/player/viewModel.js", "w") as f:
    f.write(content)

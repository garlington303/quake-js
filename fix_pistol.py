import re
import os

def replace_in_file(filepath, old_str, new_str):
    with open(filepath, 'r') as f:
        content = f.read()
    content = content.replace(old_str, new_str)
    with open(filepath, 'w') as f:
        f.write(content)

replace_in_file('src/main.js', 'revolver', 'pistol')
replace_in_file('src/main.js', 'REVOLVER', 'PISTOL')
replace_in_file('src/main.js', 'Revolver', 'Pistol')

replace_in_file('src/engine/input.js', 'revolver', 'pistol')
replace_in_file('src/engine/input.js', 'REVOLVER', 'PISTOL')

replace_in_file('src/engine/audioSystem.js', 'revolver', 'pistol')
replace_in_file('src/engine/audioSystem.js', 'REVOLVER', 'PISTOL')
replace_in_file('src/engine/audioSystem.js', 'Revolver', 'Pistol')

# Fix viewModel.js
with open('src/player/viewModel.js', 'r') as f:
    content = f.read()

# Replace revolver with pistol globally
content = content.replace('revolver', 'pistol')
content = content.replace('REVOLVER', 'PISTOL')
content = content.replace('Revolver', 'Pistol')

# Fix return { root: modelRoot, firePistol } inside loaders
content = content.replace('return { root: modelRoot, firePistol };', 'return { root: modelRoot };')

# Add missing PISTOL_RECOIL_DUR etc if missing
if 'PISTOL_RECOIL_Z' not in content:
    pistol_recoil = """
// ── Pistol recoil ───────────────────────────────────────────────────────────
const PISTOL_RECOIL_Z   = -0.12;
const PISTOL_RECOIL_ROT = -0.18;
const PISTOL_RECOIL_DUR = 0.14;
"""
    content = content.replace('// ── Sword swing', pistol_recoil + '\n// ── Sword swing')
    
# Check if PISTOL_GLB_URL is defined
if 'PISTOL_GLB_URL' not in content:
    pistol_consts = """
// ── Pistol ──────────────────────────────────────────────────────────────────
const PISTOL_GLB_URL = "/models/Items%20&%20Weapons/pistol_mp_1.glb";
const PISTOL_MODEL_OFFSET = new Vector3(0.12, -0.20, 0.52);
const PISTOL_MODEL_SCALE  = 3.12;
const PISTOL_MODEL_ROTATION = Quaternion.FromEulerAngles(0, Math.PI / 2, 0);
"""
    content = content.replace('// ── Sword', pistol_consts + '\n// ── Sword')
    
if 'loadPistolModel' not in content:
    pistol_loader = """
async function loadPistolModel(scene, parent) {
  const modelRoot = new TransformNode("viewmodel-pistol-glb", scene);
  modelRoot.parent = parent;
  modelRoot.position.copyFrom(PISTOL_MODEL_OFFSET);
  modelRoot.scaling.setAll(PISTOL_MODEL_SCALE);
  modelRoot.rotationQuaternion = PISTOL_MODEL_ROTATION.clone();
  modelRoot.setEnabled(false);

  const result = await SceneLoader.ImportMeshAsync("", "", window.location.origin + PISTOL_GLB_URL, scene);
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
    content = content.replace('// Flash is parented', pistol_loader + '\n// Flash is parented')
    
if 'let pistolMeshRoot' not in content:
    content = content.replace('let staffMeshRoot = null;', 'let staffMeshRoot = null;\n  let pistolMeshRoot = null;')
    
if 'loadPistolModel(scene, root)' not in content:
    pistol_call = """
  loadPistolModel(scene, root)
    .then((model) => {
      pistolMeshRoot = model.root;
      pistolMeshRoot.setEnabled(activeWeapon === "pistol");
    })
    .catch((error) => {
      console.warn("Failed to load pistol GLB viewmodel.", error);
    });
"""
    content = content.replace('// ── Animation state', pistol_call + '\n  // ── Animation state')

if 'let pistolRecoilTimer =' not in content:
    content = content.replace('let castTimer = -1;    // staff cast', 'let castTimer = -1;    // staff cast\n  let pistolRecoilTimer = -1;')

if 'if (pistolMeshRoot) pistolMeshRoot.setEnabled' not in content:
    content = content.replace('if (staffMeshRoot) staffMeshRoot.setEnabled(weapon === "staff");', 'if (staffMeshRoot) staffMeshRoot.setEnabled(weapon === "staff");\n    if (pistolMeshRoot) pistolMeshRoot.setEnabled(weapon === "pistol");')
    
if 'pistolRecoilTimer = -1' not in content:
    content = content.replace('castTimer = -1;', 'castTimer = -1;\n    pistolRecoilTimer = -1;')
    
if 'function firePistol()' not in content:
    fire_p = """
  function firePistol() {
    if (activeWeapon !== "pistol") return;
    pistolRecoilTimer = PISTOL_RECOIL_DUR;
    flash.restart();
  }
"""
    content = content.replace('function update(dt', fire_p + '\n  function update(dt')
    
if 'let pistolZ = 0, pistolRot = 0;' not in content:
    recoil_p = """
    // ── Pistol recoil ───────────────────────────────────────────────────
    let pistolZ = 0, pistolRot = 0;
    if (pistolRecoilTimer > 0) {
      pistolRecoilTimer -= dt;
      const normalized = Math.max(0, pistolRecoilTimer / PISTOL_RECOIL_DUR);
      pistolZ   = PISTOL_RECOIL_Z   * normalized;
      pistolRot = PISTOL_RECOIL_ROT * normalized;
    }
"""
    content = content.replace('// ── Apply combined offsets', recoil_p + '\n    // ── Apply combined offsets')
    
if 'pistolZ' not in content.split('// ── Apply combined offsets')[1]:
    content = re.sub(
        r'(root\.position\.set\([\s\S]+?VM_OFFSET\.z \+ recoilZ \+ swingZ \+ throwZ \+ castZ)',
        r'\1 + pistolZ',
        content
    )
    content = re.sub(
        r'(root\.rotation\.x = swingRotX)',
        r'\1 + pistolRot',
        content
    )

if 'firePistol' not in content.split('return {')[1]:
    content = re.sub(r'return \{ (.*?) \};', r'return { \1, firePistol };', content)


with open('src/player/viewModel.js', 'w') as f:
    f.write(content)

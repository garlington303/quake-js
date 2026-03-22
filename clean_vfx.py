import re

with open('src/player/viewModel.js', 'r') as f:
    lines = f.readlines()

new_lines = []
skip_block = False

# Patterns to remove
remove_patterns = [
    r'import \{ createPixelSpriteEffect \}',
    r'const MUZZLE_FLASH_Z',
    r'const MUZZLE_FLASH_SIZE',
    r'function createMuzzleFlash',
    r'const flash = createMuzzleFlash',
    r'flash\.mesh\.isVisible = false;',
    r'flash\.restart\(\);',
    r'if \(flash\.mesh\.isVisible && flash\.update\(dt, false\)\)'
]

i = 0
while i < len(lines):
    line = lines[i]
    
    # Handle the multi-line if block for flash update
    if 'if (flash.mesh.isVisible && flash.update(dt, false))' in line:
        # Skip this line and the next two lines (the brace block)
        i += 3
        continue
        
    # Handle the multi-line createMuzzleFlash function
    if 'function createMuzzleFlash' in line:
        while i < len(lines) and '}' not in lines[i]:
            i += 1
        i += 1 # skip the closing brace line
        continue

    # Simple one-line removals
    if any(re.search(p, line) for p in remove_patterns):
        i += 1
        continue
        
    new_lines.append(line)
    i += 1

with open('src/player/viewModel.js', 'w') as f:
    f.writelines(new_lines)

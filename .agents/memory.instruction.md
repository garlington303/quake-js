---
applyTo: '**'
---
# Studio Preferences
- Engine: Babylon.js (v8.x)
- Level Editor: TrenchBroom (Quake .map format)
- Language: JavaScript (ES Modules)
- Aesthetic: Retro / Quake-inspired (pixelated, low-poly, billboard sprites)
- Scale: Quake units (Player height ~56, Door height ~128)
- Coordinate System: Quake-style (X, Y, Z)

# Project Architecture
- `src/engine`: Core systems (audio, input, camera, light, scene, retro pipeline)
- `src/map`: Map loading and parsing (brush builder, entity parser, wad loader)
- `src/gameplay`: Gameplay logic (enemies, items, projectiles, impact effects)
- `src/player`: Player-specific logic (controller, view model, flashlight, head bob)
- `src/ui`: User interface (HUD, menus)

# Documentation Patterns
- Use structured Markdown with emoji headers.
- Always include "Success Criteria" section.
- Reference local files and Quake-style conventions.

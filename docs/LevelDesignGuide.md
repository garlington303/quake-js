# TrenchFPS – Level Design Guide
**Date:** March 15, 2026
**Version:** 1.0.0

## 🎯 Overview
This guide covers the best practices and technical constraints for creating levels for TrenchFPS using **TrenchBroom**. TrenchFPS uses a direct `.map` parsing pipeline, meaning your level design is immediately playable without an intermediate "baking" step.

## 📏 Scale & Units
TrenchFPS follows the Quake coordinate system and unit scale. Consistent scaling is critical for player movement and collision detection.

- **Coordinates:** X (East/West), Y (North/South), Z (Up/Down).
- **Player Size:** ~56 units tall, ~32 units wide.
- **Step Height:** Up to 18 units (maximum stair height the player can "step up" without jumping).
- **Jump Height:** ~45 units (standard jump clearance).
- **Door Height:** Recommended 128 units for standard clearance.
- **Wall Thickness:** Recommended 8 or 16 units for standard geometry.

## 🎨 Textures & WADs
- **Format:** Place textures in `public/textures/` as `.png` or `.svg`.
- **WADs:** Place `.wad` files in `public/wads/`.
- **Worldspawn:** In TrenchBroom, select the `worldspawn` entity and set the `wad` property to your WAD file name (e.g., `wad1.wad;wad2.wad`).
- **Mapping:** Texture names in the `.map` file must match the filenames (minus extension) in your texture folders.

## 🗺️ Entity Reference

### Static World (`worldspawn`)
The `worldspawn` entity contains all static level geometry.
- **`classname`:** `worldspawn`
- **`wad`:** Semicolon-separated list of WAD files.
- **`mapversion`:** Must be `1` (Quake 1 format).

### Player Start
- **`classname`:** `player_start`
- **`origin`:** Location to spawn the player.
- **`angle`:** (Optional) Facing direction (degrees).

### Lights
- **`classname`:** `light`
- **`origin`:** Position of the light.
- **`light`:** (Optional) Intensity/Brightness (default: 300).
- **`_color`:** (Optional) RGB color (e.g., `1 0.5 0` for orange).

### Enemy Spawners
- **`classname`:** `enemy_spawn`
- **`origin`:** Location to spawn the enemy.
- **`type`:** The internal name of the enemy (e.g., `imp`, `knight`, `shambler`).
- **`angle`:** Facing direction for the enemy.

### Moving Doors
Doors are "brush entities" — you must select one or more brushes in TrenchBroom and convert them to this entity.
- **`classname`:** `func_door`
- **`targetname`:** Unique ID (e.g., `secret_door_1`).
- **`speed`:** Movement speed (default: 100).
- **`wait`:** Time to stay open before closing (default: 4 seconds).
- **`angle`:** Direction the door moves (e.g., `-1` for UP, `90` for North).

### Triggers
Triggers are invisible volumes that activate other entities.
- **`classname`:** `trigger`
- **`target`:** The `targetname` of the entity to activate (e.g., `secret_door_1`).

## 💡 Best Practices
1. **Grid Snapping:** ALWAYS use grid snapping (Grid 8 or 16) to avoid "leaks" and alignment issues.
2. **Simplified Brushes:** Keep geometry relatively simple. Complex brushes should be composed of multiple convex pieces.
3. **Z-Fighting:** Ensure faces don't overlap exactly (flush against each other).
4. **Lighting Balance:** Use fewer, brighter lights for better performance and cleaner visuals.
5. **Entity Naming:** Use clear, descriptive `targetname` values for complex interactive sections.

## ✅ Success Criteria
- [x] Clear definition of Quake-style units and player scale.
- [x] Comprehensive list of supported entities and their properties.
- [x] Instructions for texture and WAD management.
- [x] Tips for efficient brush-based level design.
---

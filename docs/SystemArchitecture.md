# TrenchFPS – System Architecture
**Date:** March 15, 2026
**Version:** 1.0.0

## 🎯 Purpose
This document provides a technical overview of the TrenchFPS engine's internal architecture, explaining how core systems interact to transform raw `.map` files into a playable Babylon.js scene.

## ⚙️ Project Structure Overview
The codebase is organized into four primary domains:

### 1. Engine Core (`/src/engine`)
The foundational systems for rendering, audio, and user input.
- **`scene.js`:** Orchestrates the Babylon.js scene, camera, and global lighting.
- **`retroPipeline.js`:** Implements post-processing effects (pixelation, color grading) to achieve the retro aesthetic.
- **`input.js`:** Unified input handling for keyboard, mouse (pointer lock), and movement controls.
- **`audioSystem.js`:** Handles spatialized 3D audio, weapon sounds, and ambient tracks.

### 2. Map Pipeline (`/src/map`)
The most complex part of the engine, responsible for translating Quake-format levels.
- **`mapLoader.js`:** The entry point for level loading. It orchestrates parsing, mesh building, and entity spawning.
- **`mapParser.js`:** A low-level text parser that converts `.map` file syntax into structured JavaScript objects.
- **`brushBuilder.js`:** Translates brush plane definitions (the "half-space" representation) into 3D meshes (vertices, indices) compatible with Babylon.js.
- **`wadLoader.js`:** Loads and decodes texture archives (WADs) into usable textures for the scene.
- **`entityParser.js`:** Extracts and categorizes entities (worldspawn, point entities, brush entities).

### 3. Gameplay Logic (`/src/gameplay`)
Systems defining the interaction and AI behavior.
- **`enemySystem.js`:** The primary AI controller, managing spawns, state machines (Idle/Chase/Attack/Death), and hitbox detection.
- **`enemyDefinitions.js`:** The "database" for all enemy types, containing their stats (health, speed, damage) and model/sprite references.
- **`itemSystem.js`:** Handles pickups, ammo, and inventory management.
- **`projectileSystem.js` & `impactSystem.js`:** Manages hit detection for weapons and the visual feedback of impacts.

### 4. Player Systems (`/src/player`)
The components making up the first-person experience.
- **`playerController.js`:** Core movement logic, including collision resolution and jump physics.
- **`viewModel.js`:** Manages the first-person weapon model, animations (firing, reloading), and weapon sway.
- **`flashlight.js` & `headBob.js`:** Immersive details attached to the player camera.

## 🗺️ The Map-to-Scene Pipeline
The process of loading a level follows this sequence:
1. **Load `.map` File:** Fetch the text file from `public/maps/`.
2. **Parsing:** Extract `worldspawn` (static world geometry) and subsequent entities.
3. **Brush Reconstruction:**
   - Convert planes into vertices by calculating intersections.
   - Triangulate the resulting faces for Babylon.js.
   - Merge brushes with identical textures to minimize draw calls.
4. **Entity Initialization:**
   - **Lights:** Spawn point lights in the scene.
   - **Enemies:** Queue enemy spawners.
   - **Doors/Triggers:** Link brush geometry to `doorSystem.js` or `triggerSystem.js` logic.
5. **Finalize Scene:** Apply post-processing and start the render loop.

## 🧩 Key System Dependencies
| System | Depends On | Responsible For |
|--------|------------|-----------------|
| `mapLoader` | `brushBuilder`, `entityParser` | Level assembly |
| `enemySystem` | `scene`, `enemyDefinitions` | AI Lifecycle |
| `playerController` | `input`, `scene` | Movement & Collision |
| `viewModel` | `playerController` | First-person presence |

## ✅ Success Criteria
- [x] Clear explanation of folder structure.
- [x] Documented map-to-mesh pipeline.
- [x] Defined roles for core engine and gameplay systems.
- [x] Identified cross-system dependencies.
---

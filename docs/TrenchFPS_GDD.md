# TrenchFPS – Game Design Document
**Date:** March 15, 2026
**Version:** 1.0.0

## 🎯 Overview
TrenchFPS is a retro-styled, browser-based first-person shooter that blends 90s brush-based level design (via TrenchBroom) with modern web rendering (via Babylon.js). The game emphasizes high-speed movement, tight corridors, and a mix of sprite-based and low-poly 3D enemies in a dark, atmospheric setting.

**Context Assumptions**
- Engine: Babylon.js (v8.x)
- Style: 90s Retro (Quake-inspired, pixelated aesthetic)
- Editor: TrenchBroom (.map format)
- Objective: Create a polished, mod-friendly browser FPS core.

## ⚙️ Core Loop
1. **Explore:** Navigate intricate, brush-based levels with Quake-style movement.
2. **Engage:** Combat diverse enemy types (imps, knights, shamblers) using hitscan and projectile weapons.
3. **Interact:** Activate triggers, find keys, and manipulate `func_door` entities to progress.
4. **Survive:** Manage health and ammo pickups while reaching the level exit.

## 🎭 World & Aesthetic
The world is a "Trench-Punk" dark fantasy/sci-fi hybrid. Environments are composed of gritty, industrial, and gothic brushes, lit by sharp point lights and ambient gloom.
- **Visuals:** Low-resolution textures, pixelation post-processing (via `retroPipeline.js`), and a mix of 2D billboards and skeletal 3D models.
- **Audio:** Gritty sound effects for weapons and monster growls, echoing through 3D spatialized audio.

## 🧩 Gameplay Systems

### Player Movement
- **Quake-style:** Fast walking, air control, and high-jump mechanics.
- **Tactical:** Head bobbing for immersion, step climbing for brush navigation, and a dynamic flashlight.

### Combat & Weapons
- **Primary Fire:** Hitscan-based shooting with range falloff and impact effects.
- **Melee:** Short-range, high-damage attacks for close encounters.
- **View Model:** Swaying weapon models with firing animations (via `viewModel.js`).

### Enemy AI
Enemies have distinct states:
- **Idle/Sleep:** Stationary until the player enters sight range.
- **Chase:** Skittery or grounded pathing towards the player.
- **Attack:** Ranged projectiles (wizards/shamblers) or melee combos (imps/knights).
- **Pain/Knockdown:** Procedural reactions to damage, including the ability for some (zombies) to rise after being "downed."

## 🗺️ Level Entities
Levels are built in TrenchBroom using the following entities:
- `player_start`: Primary spawn location.
- `light`: Dynamic light sources with intensity and color support.
- `trigger`: Collision-based event volumes.
- `func_door`: Moving brush geometry for gates and secret panels.
- `enemy_spawn`: Dynamic spawning of the 14+ defined enemy types.

## 🧭 Roadmap / Milestones
- [x] Core Map Parsing & Brush Building
- [x] Basic Player Controller & Shooting
- [x] Enemy System (Sprites & Skeletal Models)
- [ ] Multi-stage Boss Encounters
- [ ] In-game Map Editor / Live Reloading
- [ ] Advanced Particle Systems for Impacts

## ✅ Success Criteria
- [x] Documentation reflects current implementation in `src/gameplay` and `src/map`.
- [x] Game loop is clearly defined for developers and designers.
- [x] Coordinate system and scale conventions are documented.
- [x] Aesthetic direction (retro/pixel) is explicit.
---

# TrenchFPS – Visual Layout Document
**Date:** March 15, 2026
**Version:** 1.0.0

## 🎯 Objective
This document outlines the visual hierarchy, UI layout, and post-processing architecture of the Babylon TrenchFPS prototype. It serves as a definitive reference for maintaining the game's retro "Trench-Punk" aesthetic, ensuring consistency across environmental design, UI overlays, and visual effects.

**Context Assumptions**
- Engine: Babylon.js (v8.x) + HTML/CSS Overlay
- Style: 90s Retro (Quake-inspired, pixelated aesthetic, CRT filter)
- Display: Cinematic Letterbox (2.39 Aspect Ratio)

## 🎨 Color & Mood Palette
The visual tone is gritty, industrial, and oppressive, contrasted by sharp, legible UI elements.

- **HUD Primary Text:** Off-white/Beige (`#e8edf2`, `#e8dfc0`)
- **HUD Accent/Labels:** Muted Gold/Brown (`rgba(190, 160, 100, 0.9)`, `rgba(210, 190, 150, 0.85)`)
- **HUD Shadows:** Deep Brown/Black drop shadows (`0 0 12px rgba(210, 130, 30, 0.7), 1px 1px 0 rgba(0, 0, 0, 0.95)`)
- **Damage/Death Overlays:** Crimson/Blood Red (`rgba(200, 0, 0, 0.72)`, `rgba(160, 0, 0, 0.72)`)
- **Environment:** Low-saturation browns, grays, and dark greens (brick, metal, slime, concrete).

## 🖥️ Screen Composition & Cinematic Framing
The game utilizes a forced anamorphic/cinematic aspect ratio to heighten immersion.

- **Letterboxing (`--cinema-ratio: 2.39`):** Black bars (`--bar-h`) constrain the viewport on the top and bottom, creating a wide-screen cinematic feel.
- **HUD Inset:** All HUD elements are inset within the cinematic frame, ensuring they are never obscured by the black bars.

## 🧩 UI Hierarchy & Interaction Zones
The HUD is implemented in HTML/CSS (`index.html`) over the WebGL canvas, using `mix-blend-mode: screen` and `image-rendering: pixelated` to fuse with the 3D scene.

### Zone 1: Top-Left (Vitals)
- **Structure:** Stacked layout for HP and Armor.
- **Visuals:** Custom pixelated graphical bars (`hud_hp_bar.png`, `hud_hp_fill.png`).
- **Typography:** Tabular numbers for rapid reading.

### Zone 2: Bottom-Center (Combat & Ammo)
- **Structure:** Flex row (`hud-taskbar`) containing the Ammo panel and Combat stats.
- **Ammo Panel:** A prominent 140x140 graphical panel (`hud_ammo_panel.png`) emphasizing the current ammo count.
- **Combat Stats:** Minimalist text for "Enemies" and "Kills".

### Zone 3: Center (Crosshair & Toast)
- **Crosshair:** 32x32 pixelated sprite. On hit detection, it gains a red drop-shadow (`rgba(255, 80, 80, 0.8)`).
- **Weapon Toast:** Temporarily appears just below the center when switching weapons, utilizing heavy letter-spacing and gold text-shadows.

### Zone 4: Full-Screen Overlays
- **Hurt Vignette:** A radial gradient (`rgba(200,0,0,0.72)`) that flashes upon taking damage, controlled by `hud.js`.
- **Death Screen:** A solid crimson overlay with "YOU DIED" in large, spaced monospace font, dominating the z-index hierarchy.

## ⚙️ Post-Processing (Retro Pipeline)
The 3D scene is filtered through `src/engine/retroPipeline.js` using a custom CRT fragment shader (`retroCrt`).

- **Curvature (0.12):** Warps the screen edges to simulate a CRT monitor tube.
- **Scanlines (0.15 intensity):** Horizontal sine-wave darkening.
- **Vignette (0.15 intensity):** Soft radial darkening towards the corners.
- **Dither & Noise (Scale 1.0, Intensity 0.02):** Introduces procedural pixel-level noise to break up smooth gradients and enforce the low-fi aesthetic.

## 🗺️ Asset Strategy
- **Textures (`public/textures/`):** Utilizes flat, low-resolution Quake-style PNGs (e.g., `brick_1.png`, `metal_mp_1.png`, `slime_wall.png`).
- **Enemies:** A blend of 2D billboard sprites (from `skull_sheet.png`) and low-poly skeletal models (`.glb`), visually unified by the retro pipeline's dithering and resolution downscaling.

---

## ✅ Success Criteria
- [x] Cinematic framing and aspect ratio documented.
- [x] UI layout mapped to specific HTML/CSS interaction zones.
- [x] Post-processing parameters (CRT, noise, scanlines) defined.
- [x] Color palette extracted from DOM styles and HUD logic.
- [x] Adherence to studio visual formatting patterns.

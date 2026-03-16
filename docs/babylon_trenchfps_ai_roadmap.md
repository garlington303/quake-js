# Babylon TrenchFPS --- AI Implementation Roadmap

Engine: Babylon.js\
Level Editor: TrenchBroom\
Map Format: Quake .map

This document defines a **phase-based implementation roadmap** for
building a browser FPS that loads TrenchBroom maps directly.

The roadmap is designed for use with AI coding agents and follows a
progressive vertical‑slice architecture.

------------------------------------------------------------------------

# Phase Overview

    PHASE 0  Project Setup
    PHASE 1  FPS Camera + Movement
    PHASE 2  MAP File Loader
    PHASE 3  Brush Geometry Builder
    PHASE 4  Texture System
    PHASE 5  Entity System
    PHASE 6  Weapons
    PHASE 7  Enemy System
    PHASE 8  Trigger System
    PHASE 9  Doors + Moving Geometry
    PHASE 10 Gameplay Polish

Each phase should produce a **working playable state**.

------------------------------------------------------------------------

# PHASE 0 --- Project Setup

Goal: create a runnable Babylon.js project.

Requirements:

-   Vite project setup
-   Babylon.js scene
-   render loop
-   basic lighting
-   ground plane
-   WASD placeholder movement

Project structure:

    src/
       main.js
       engine/
       gameplay/
    assets/
    maps/

Deliverable:

A browser page rendering a Babylon scene.

------------------------------------------------------------------------

# PHASE 1 --- FPS Camera

Goal: basic first‑person movement.

Features:

    WASD movement
    mouse look
    jump
    gravity
    collision

Implementation notes:

Use:

    BABYLON.UniversalCamera

Add:

    pointer lock
    movement acceleration
    step height

Deliverable:

Player can walk around a test level.

------------------------------------------------------------------------

# PHASE 2 --- MAP File Loader

Goal: load raw `.map` files.

Responsibilities:

    read .map file
    parse brush blocks
    parse entity blocks
    return structured data

Output structure:

    {
      brushes: [],
      entities: []
    }

Deliverable:

Console logs showing parsed geometry and entities.

------------------------------------------------------------------------

# PHASE 3 --- Brush Geometry Builder

Goal: convert brushes into meshes.

Pipeline:

    planes
    → vertex generation
    → triangulation
    → Babylon Mesh

Optimization:

    merge meshes
    enable collision

Deliverable:

Level geometry appears in Babylon.

------------------------------------------------------------------------

# PHASE 4 --- Texture System

Goal: apply textures referenced in maps.

Map texture example:

    brick
    stone
    metal

Material pipeline:

    texture name
    → load PNG
    → create Babylon material
    → assign to mesh

Deliverable:

Map geometry shows textured surfaces.

------------------------------------------------------------------------

# PHASE 5 --- Entity System

Goal: interpret map entities.

Example entity block:

    {
    "classname" "player_start"
    "origin" "0 0 32"
    }

Supported entities:

  classname      function
  -------------- ----------------
  player_start   spawn player
  enemy_spawn    enemy spawn
  light          scene light
  trigger        trigger volume
  func_door      moving door

Deliverable:

Player spawns at correct position.

------------------------------------------------------------------------

# PHASE 6 --- Weapons

Goal: simple weapon system.

Prototype weapons:

    pistol
    shotgun
    magic staff

Firing pipeline:

    mouse click
    → raycast
    → detect hit
    → apply damage

Optional features:

    muzzle flash
    sound
    recoil

Deliverable:

Player can shoot targets.

------------------------------------------------------------------------

# PHASE 7 --- Enemy System

Goal: add enemies.

Enemy rendering:

    billboard sprite
    always faces camera

States:

    idle
    chase
    attack
    dead

Basic AI:

    distance check
    line of sight
    move toward player
    attack when close

Deliverable:

Enemies chase and damage player.

------------------------------------------------------------------------

# PHASE 8 --- Trigger System

Goal: support triggers from maps.

Example:

    {
    "classname" "trigger"
    "target" "door1"
    }

Runtime:

    player enters trigger
    → activate target

Deliverable:

Triggers activate objects.

------------------------------------------------------------------------

# PHASE 9 --- Doors

Goal: moving geometry.

Entity:

    func_door

Behavior:

    slide open
    wait
    close

Animation:

    BABYLON.Animation

Deliverable:

Doors open when triggered.

------------------------------------------------------------------------

# PHASE 10 --- Gameplay Polish

Add:

    health system
    enemy damage feedback
    weapon switching
    sound
    UI

Optional upgrades:

    lightmaps
    BSP support
    advanced AI
    multiplayer

Deliverable:

Playable vertical slice.

------------------------------------------------------------------------

# Vertical Slice Goal

The first complete demo should include:

    spawn room
    ↓
    hallway
    ↓
    enemy encounter
    ↓
    locked door
    ↓
    switch trigger
    ↓
    exit room

------------------------------------------------------------------------

# Long Term Expansion

Possible directions:

    procedural maps
    modding support
    network multiplayer
    Quake BSP support
    advanced physics

------------------------------------------------------------------------

# Summary

This roadmap provides a structured path for building a **browser‑based
FPS engine** that uses **TrenchBroom as a level editor** and
**Babylon.js as the runtime renderer**.

The architecture enables:

-   fast iteration
-   browser deployment
-   moddable maps

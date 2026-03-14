# Babylon TrenchFPS --- Technical Specification

## Overview

Babylon TrenchFPS is a browser-based first-person shooter prototype that
uses **TrenchBroom** as a level editor and **Babylon.js** as the runtime
engine.

Levels are authored in `.map` format and loaded directly by the game
engine using a JavaScript parser. This allows designers to create levels
using a professional brush-based editor while keeping the game fully
web-based.

Core design goal:

    TrenchBroom → .map file → JS parser → Babylon.js scene → Playable FPS

------------------------------------------------------------------------

# Goals

## Primary Goals

-   Build a browser-based FPS prototype
-   Use TrenchBroom for level design
-   Parse `.map` files directly in JavaScript
-   Convert brush geometry to Babylon meshes
-   Support basic gameplay systems

## Prototype Scope

The vertical slice should include:

-   1 playable map
-   Player movement and shooting
-   One enemy type
-   A door or trigger interaction
-   Basic collision and lighting

------------------------------------------------------------------------

# Technology Stack

  Component      Technology
  -------------- ---------------------------------------
  Engine         Babylon.js
  Level Editor   TrenchBroom
  Map Format     Quake `.map`
  Language       JavaScript / TypeScript
  Rendering      WebGL
  Physics        Babylon collision or simple ray tests

------------------------------------------------------------------------

# Project Structure

    babylon-trenchfps/
    │
    ├ engine/
    │  ├ mapLoader.js
    │  ├ brushBuilder.js
    │  ├ entitySystem.js
    │
    ├ gameplay/
    │  ├ playerController.js
    │  ├ weapons.js
    │  ├ enemies.js
    │
    ├ assets/
    │  ├ textures/
    │  ├ sprites/
    │  ├ sounds/
    │
    ├ maps/
    │  ├ test.map
    │
    └ main.js

------------------------------------------------------------------------

# Map Loader System

## Responsibilities

The MAP loader parses three main components:

    brush geometry
    textures
    entities

### Pipeline

    .map file
    ↓
    parse brushes
    ↓
    generate geometry
    ↓
    apply textures
    ↓
    spawn entities

------------------------------------------------------------------------

# Brush Geometry System

Quake `.map` brushes are defined by planes.

Example:

    {
    ( -64 -64 0 ) ( 64 -64 0 ) ( 64 64 0 ) brick 0 0 0 1 1
    }

Brush pipeline:

    planes
    ↓
    vertex generation
    ↓
    triangulation
    ↓
    Babylon mesh

Output:

    BABYLON.Mesh

Multiple brushes can be merged into a single mesh for performance.

------------------------------------------------------------------------

# Texture Pipeline

Textures referenced in `.map`:

    brick
    stone
    metal

Mapped to asset files:

    assets/textures/brick.png

Material setup:

    Babylon StandardMaterial
    → diffuseTexture

------------------------------------------------------------------------

# Entity System

Entities are parsed from `.map` blocks.

Example:

    {
    "classname" "player_start"
    "origin" "0 0 32"
    }

The engine converts these into gameplay objects.

------------------------------------------------------------------------

## Supported Prototype Entities

  classname       Function
  --------------- --------------------
  player_start    Player spawn point
  enemy_spawn     Enemy spawner
  light           Point light
  trigger         Trigger volume
  weapon_pickup   Weapon item
  func_door       Moving door

------------------------------------------------------------------------

# Player Controller

Core player features:

    WASD movement
    mouse look
    jump
    gravity
    collision

Suggested implementation:

    Babylon UniversalCamera
    + custom movement logic

Additional features:

    step climbing
    slope handling
    head bob

------------------------------------------------------------------------

# Collision System

Simplest approach:

    level mesh
    ↓
    collision enabled
    ↓
    player collider checks

Alternative:

    separate collision mesh

------------------------------------------------------------------------

# Weapon System

Prototype weapons:

    pistol
    shotgun
    magic staff

Firing pipeline:

    mouse click
    ↓
    raycast
    ↓
    hit detection
    ↓
    apply damage

Optional features:

    impact particles
    weapon recoil
    ammo system

------------------------------------------------------------------------

# Enemy System

Enemies are billboard sprites.

Structure:

    enemy
    ↓
    billboard quad
    ↓
    sprite texture
    ↓
    always face camera

Enemy states:

    idle
    chase
    attack
    dead

Example enemy types:

    floating skull
    wizard
    ghost
    slime

------------------------------------------------------------------------

# Trigger System

Triggers are volumes defined in the map.

Example entity:

    {
    "classname" "trigger"
    "target" "door1"
    }

Runtime logic:

    player enters trigger
    ↓
    target entity activated

------------------------------------------------------------------------

# Doors

Map entity:

    func_door

Door pipeline:

    brush mesh
    ↓
    convert to entity
    ↓
    animate position

Animation method:

    BABYLON.Animation

------------------------------------------------------------------------

# Lighting

Prototype lighting:

    ambient light
    point lights
    spot lights

Future upgrade:

    baked lightmaps

------------------------------------------------------------------------

# Vertical Slice Level Example

    spawn room
    ↓
    hallway
    ↓
    enemy encounter
    ↓
    locked door
    ↓
    trigger switch
    ↓
    exit

Goal: demonstrate core systems.

------------------------------------------------------------------------

# Runtime Engine Flow

    loadMap()
    ↓
    parse brushes
    ↓
    generate meshes
    ↓
    apply textures
    ↓
    spawn entities
    ↓
    start gameplay loop

------------------------------------------------------------------------

# Future Features

Possible expansions:

    BSP support
    lightmaps
    multiplayer
    procedural levels
    mod support
    advanced AI

------------------------------------------------------------------------

# Advantages of This Workflow

Using TrenchBroom provides:

    professional level editor
    fast iteration
    brush-based design
    entity placement

Combined with Babylon.js:

    browser deployment
    fast rendering
    JavaScript ecosystem

------------------------------------------------------------------------

# Summary

Babylon TrenchFPS combines the power of a classic brush-based level
editor with a modern browser rendering engine.

This architecture allows:

-   rapid level prototyping
-   mod-friendly workflows
-   simple web deployment

The system is designed to start small and expand into a more advanced
FPS engine if desired.

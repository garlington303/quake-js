# Babylon TrenchFPS --- Map Format Specification

This document defines the `.map` conventions used by the Babylon
TrenchFPS engine. Maps are authored in **TrenchBroom** using the Quake
`.map` format and interpreted by the Babylon.js runtime.

The goal is to treat TrenchBroom as a **custom level editor** for the
browser engine.

------------------------------------------------------------------------

# File Format

Maps are stored as standard Quake `.map` text files.

Structure:

    entity
    {
        keyvalue pairs
        brush definitions
    }

Each map contains:

    worldspawn
    additional entities
    brush geometry

------------------------------------------------------------------------

# Worldspawn

The first entity must be `worldspawn`.

Example:

    {
    "classname" "worldspawn"
    "mapversion" "1"
    }

Responsibilities:

-   contains world geometry
-   contains map metadata

Optional properties:

  Key       Purpose
  --------- ------------------
  mapname   display name
  skybox    sky texture
  music     background music

------------------------------------------------------------------------

# Brush Geometry

Brushes define solid world geometry.

Example brush:

    {
    ( -64 -64 0 ) ( 64 -64 0 ) ( 64 64 0 ) brick 0 0 0 1 1
    ( -64 -64 128 ) ( -64 64 128 ) ( 64 64 128 ) brick 0 0 0 1 1
    }

Brush pipeline:

    planes
    → polygon generation
    → triangulation
    → Babylon mesh

All brushes inside `worldspawn` become static level geometry.

------------------------------------------------------------------------

# Texture References

Texture names inside brushes map to asset files.

Example:

    brick
    stone
    metal

Runtime mapping:

    assets/textures/brick.png

Material creation:

    Babylon StandardMaterial

------------------------------------------------------------------------

# Entity System

Entities are defined as blocks with key/value pairs.

Example:

    {
    "classname" "enemy_spawn"
    "origin" "128 64 32"
    "type" "skull"
    }

The engine parses these blocks and spawns gameplay objects.

------------------------------------------------------------------------

# Supported Entities

## Player Spawn

    classname: player_start

Properties:

  key      meaning
  -------- ------------------------
  origin   spawn position
  angle    spawn facing direction

Example:

    {
    "classname" "player_start"
    "origin" "0 0 32"
    }

------------------------------------------------------------------------

## Enemy Spawn

    classname: enemy_spawn

Properties:

  key      meaning
  -------- ----------------
  origin   spawn location
  type     enemy type

Example:

    {
    "classname" "enemy_spawn"
    "origin" "128 64 32"
    "type" "skull"
    }

------------------------------------------------------------------------

## Light

    classname: light

Properties:

  key         meaning
  ----------- ------------
  origin      position
  intensity   brightness
  color       rgb color

Example:

    {
    "classname" "light"
    "origin" "0 128 128"
    "intensity" "2"
    }

------------------------------------------------------------------------

## Trigger Volume

    classname: trigger

Triggers activate target entities when the player enters them.

Properties:

  key          meaning
  ------------ --------------------
  target       entity to activate
  targetname   identifier

Example:

    {
    "classname" "trigger"
    "target" "door1"
    }

------------------------------------------------------------------------

## Doors

Doors use brush geometry converted into entities.

    classname: func_door

Properties:

  key          meaning
  ------------ ----------------------
  targetname   door identifier
  speed        movement speed
  wait         delay before closing

Example:

    {
    "classname" "func_door"
    "targetname" "door1"
    }

------------------------------------------------------------------------

# Coordinate System

Coordinates follow the Quake convention:

    X → east/west
    Y → north/south
    Z → height

Units are treated as **engine units**.

Typical scale:

    player height ≈ 56 units
    door height ≈ 128 units

------------------------------------------------------------------------

# Runtime Parsing Flow

The engine loads maps with the following pipeline:

    load .map file
    ↓
    parse entities
    ↓
    parse brushes
    ↓
    generate meshes
    ↓
    spawn gameplay objects

------------------------------------------------------------------------

# Example Minimal Map

    {
    "classname" "worldspawn"
    }

    {
    "classname" "player_start"
    "origin" "0 0 32"
    }

    {
    "classname" "enemy_spawn"
    "origin" "128 0 32"
    "type" "skull"
    }

------------------------------------------------------------------------

# Best Practices

When designing levels in TrenchBroom:

-   keep brush geometry simple
-   use grid snapping
-   place gameplay objects as entities
-   avoid extremely complex brushes

Recommended grid size:

    16 or 32 units

------------------------------------------------------------------------

# Future Extensions

The format can be extended with:

    weapon_spawn
    dialog_trigger
    teleport
    moving_platform
    npc_spawn

These entities allow the `.map` file to serve as a full **gameplay
scripting layer**.

------------------------------------------------------------------------

# Summary

This specification allows TrenchBroom maps to function as **native level
files** for the Babylon TrenchFPS engine.

Benefits:

-   powerful visual level editing
-   simple text-based map format
-   easy modding and custom content

// src/map/doorSystem.js
// Handles func_door — sliding brush doors.

import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";

/**
 * Parse the Quake `angle` property into a Babylon-space unit direction vector.
 *
 * Quake angle convention (degrees, 0 = north = +Y in Quake space):
 *   0   → north  → Babylon +Z
 *   90  → east   → Babylon +X
 *   180 → south  → Babylon -Z
 *   270 → west   → Babylon -X
 *   -1  → up     → Babylon +Y
 *   -2  → down   → Babylon -Y
 *
 * @param {number} angle
 * @returns {Vector3}
 */
function parseMoveDirection(angle) {
    if (angle === -1) return new Vector3(0, 1, 0);
    if (angle === -2) return new Vector3(0, -1, 0);

    // Convert compass degrees to Babylon direction.
    // Quake 0° is north (+Z in Babylon), angles increase clockwise when viewed from above.
    const rad = (angle * Math.PI) / 180;
    return new Vector3(Math.sin(rad), 0, Math.cos(rad));
}

/**
 * Compute how far along `direction` the bounds extend, then subtract `lip`.
 * The extent is the projection of the AABB diagonal onto the move direction.
 *
 * @param {{ min: Vector3, max: Vector3 }} bounds  AABB in Babylon space
 * @param {Vector3} direction  Unit vector
 * @param {number} lip  Units left visible (reduces travel)
 * @returns {number}  Travel distance in Babylon units
 */
function computeTravelDistance(bounds, direction, lip) {
    const size = bounds.max.subtract(bounds.min);
    // Dot the size vector against the absolute direction to get extent along axis.
    const extent =
        Math.abs(size.x * direction.x) +
        Math.abs(size.y * direction.y) +
        Math.abs(size.z * direction.z);
    return Math.max(0, extent - lip);
}

/**
 * Create a door system that manages func_door brush entities.
 *
 * @param {import("@babylonjs/core").Scene} scene
 * @returns {{ registerDoor, activate, update, checkProximityTrigger, getDoorByTargetname }}
 */
export function createDoorSystem(scene) {
    /** @type {Map<string, DoorRecord>} Keyed by targetname (may be empty string for self-triggering) */
    const doorsByTargetname = new Map();

    /** @type {DoorRecord[]} All registered doors, for iteration */
    const allDoors = [];

    /**
     * @typedef {Object} DoorRecord
     * @property {string}          targetname
     * @property {Vector3}         moveDir       Unit direction in Babylon space
     * @property {number}          speed         Units per second
     * @property {number}          wait          Seconds to stay open (-1 = forever)
     * @property {number}          travelDist    Total slide distance
     * @property {TransformNode}   root          Parent node for all door meshes
     * @property {"closed"|"opening"|"open"|"closing"} state
     * @property {number}          traveled      Current displacement (0 = closed)
     * @property {number}          waitTimer     Countdown while open
     */

    /**
     * Register a func_door entity.
     *
     * @param {Object} entity         Parsed .map entity
     * @param {import("@babylonjs/core").Mesh[]} meshes  Rendered meshes
     * @param {{ min: Vector3, max: Vector3 }} bounds    AABB in Babylon space
     * @returns {DoorRecord}
     */
    function registerDoor(entity, meshes, bounds) {
        const props = entity.properties || {};

        const targetname = props.targetname || "";
        const speed      = parseFloat(props.speed ?? "100") || 100;
        const wait       = parseFloat(props.wait  ?? "3");
        const lip        = parseFloat(props.lip   ?? "8");
        const angle      = parseFloat(props.angle ?? "0");

        const moveDir    = parseMoveDirection(angle);
        const travelDist = computeTravelDistance(bounds, moveDir, lip);

        // Create a TransformNode to act as a sliding parent for all door meshes.
        const root = new TransformNode(`door_root_${targetname || allDoors.length}`, scene);

        // Re-parent all meshes under the door root, preserving world positions.
        for (const mesh of meshes) {
            mesh.setParent(root);
        }

        /** @type {DoorRecord} */
        const door = {
            targetname,
            moveDir,
            speed,
            wait,
            travelDist,
            root,
            state:     "closed",
            traveled:  0,
            waitTimer: 0,
        };

        allDoors.push(door);

        // Doors without a targetname are self-triggering (proximity); we still
        // store them in the map under a synthetic key for completeness.
        const key = targetname || `__auto_${allDoors.length}`;
        doorsByTargetname.set(key, door);

        return door;
    }

    /**
     * Begin opening a door identified by its targetname.
     * - Already open  → reset the close timer so it stays open longer.
     * - Closing       → reverse to opening from the current position.
     * - Closed        → start opening.
     *
     * @param {string} targetname
     */
    function activate(targetname) {
        const door = doorsByTargetname.get(targetname);
        if (!door) return;

        switch (door.state) {
            case "closed":
                door.state = "opening";
                break;
            case "open":
                // Reset the wait timer so the door stays open.
                door.waitTimer = door.wait;
                break;
            case "closing":
                door.state = "opening";
                break;
            case "opening":
                // Already moving — nothing to do.
                break;
        }
    }

    /**
     * Advance all door animations.  Call once per frame.
     *
     * @param {number} dt  Delta time in seconds
     */
    function update(dt) {
        for (const door of allDoors) {
            switch (door.state) {
                case "opening": {
                    const step = door.speed * dt;
                    door.traveled = Math.min(door.traveled + step, door.travelDist);

                    // Apply displacement from the closed origin.
                    door.root.position = door.moveDir.scale(door.traveled);

                    if (door.traveled >= door.travelDist) {
                        door.state = "open";
                        door.waitTimer = door.wait; // may be -1 (stay open forever)
                    }
                    break;
                }

                case "open": {
                    if (door.wait === -1) break; // stay open forever

                    door.waitTimer -= dt;
                    if (door.waitTimer <= 0) {
                        door.state = "closing";
                    }
                    break;
                }

                case "closing": {
                    const step = door.speed * dt;
                    door.traveled = Math.max(door.traveled - step, 0);

                    door.root.position = door.moveDir.scale(door.traveled);

                    if (door.traveled <= 0) {
                        door.state = "closed";
                    }
                    break;
                }

                case "closed":
                default:
                    break;
            }
        }
    }

    /**
     * Auto-open any self-triggering doors (no targetname) whose root position
     * is within `radius` units of the player.
     *
     * @param {Vector3} playerPos
     * @param {number}  [radius=80]
     */
    function checkProximityTrigger(playerPos, radius = 80) {
        for (const door of allDoors) {
            // Only self-triggering doors respond to proximity.
            if (door.targetname) continue;

            // Compare against the door's closed-origin world position.
            // door.root.position reflects the current slide offset; the pivot
            // (closed origin) is at the node's absolute position minus that offset.
            const closedOrigin = door.root.getAbsolutePosition().subtract(
                door.moveDir.scale(door.traveled)
            );

            const dist = Vector3.Distance(playerPos, closedOrigin);
            if (dist <= radius && door.state === "closed") {
                door.state = "opening";
            }
        }
    }

    /**
     * Look up a registered door by its targetname.
     *
     * @param {string} name
     * @returns {DoorRecord | undefined}
     */
    function getDoorByTargetname(name) {
        return doorsByTargetname.get(name);
    }

    return { registerDoor, activate, update, checkProximityTrigger, getDoorByTargetname };
}

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
    // Quake: 0 = East (+X), 90 = North (+Y in Quake, +Z in Babylon).
    const rad = (angle * Math.PI) / 180;
    return new Vector3(Math.cos(rad), 0, Math.sin(rad));
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
    function registerDoor(entity, meshes, bounds, existingRoot) {
        const props = entity.properties || {};

        const targetname = props.targetname || "";
        const speed      = parseFloat(props.speed ?? "100") || 100;
        const wait       = parseFloat(props.wait  ?? "3");
        const lip        = parseFloat(props.lip   ?? "8");
        const angle      = parseFloat(props.angle ?? "0");

        const moveDir    = parseMoveDirection(angle);
        const travelDist = computeTravelDistance(bounds, moveDir, lip);

        // Use the existing root provided by buildBrushEntityMesh
        const root = existingRoot;
        root.name = `door_root_${targetname || allDoors.length}`;

        // Centre of the door AABB in world space — stable reference for
        // distance checks regardless of where the root TransformNode sits.
        const center = bounds.min.add(bounds.max).scale(0.5);
        console.log(`Registered door ${root.name}: center=${center}, dist=${travelDist}, min=${bounds.min}, max=${bounds.max}`);

        /** @type {DoorRecord} */
        const door = {
            targetname,
            moveDir,
            speed,
            wait,
            travelDist,
            center,
            bounds,
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
     * @param {{ onOpen?: () => void, onClose?: () => void }} [callbacks]
     */
    function update(dt, callbacks = {}) {
        for (const door of allDoors) {
            const prevState = door.state;
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

            // Fire audio callbacks on state entry
            if (door.state !== prevState) {
                if (door.state === "opening" && callbacks.onOpen)  callbacks.onOpen();
                if (door.state === "closing" && callbacks.onClose) callbacks.onClose();
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
    function checkProximityTrigger(playerPos, radius = 120) {
        for (const door of allDoors) {
            // Only self-triggering doors respond to proximity.
            if (door.targetname) continue;

            const dx = playerPos.x - door.center.x;
            const dz = playerPos.z - door.center.z;
            const dist = Math.hypot(dx, dz);
            
            // Check vertical distance loosely (allow +/- 120 units from center)
            const dy = Math.abs(playerPos.y - door.center.y);

            if (dist <= radius && dy <= 160 && door.state === "closed") {
                door.state = "opening";
            }
        }
    }

    /**
     * Activate any door within reach when the player presses USE (E).
     * Works for both named and unnamed doors.
     *
     * @param {Vector3} playerPos   Player eye / camera position
     * @param {Vector3} forward     Unit forward vector in Babylon space
     * @param {number}  [maxDist=120]  Max reach distance in Babylon units
     */
    function activateByUse(playerPos, forward, maxDist = 400) {
        let activated = 0;
        for (const door of allDoors) {
            // Use the stored AABB centre.
            const toDoor = door.center.subtract(playerPos);
            // Ignore Y-axis vertical difference for the reach check
            // so tall doors don't fail just because their center is high.
            const horizontalDist = Math.hypot(toDoor.x, toDoor.z);
            if (horizontalDist > maxDist) continue;

            let dot = 0;
            const toDoorNorm = toDoor.clone();
            toDoorNorm.y = 0; // Flatten for dot product
            if (toDoorNorm.lengthSquared() > 0.001) {
                toDoorNorm.normalize();
                const forwardFlat = forward.clone();
                forwardFlat.y = 0;
                forwardFlat.normalize();
                
                dot = Vector3.Dot(forwardFlat, toDoorNorm);
                // Door must be somewhere in the forward 180 degrees.
                if (dot < 0.0) continue;
            }

            if (door.state === "open") {
                // Reset close timer so it stays open after the player uses it again.
                door.waitTimer = door.wait;
                activated++;
                console.debug(`[door] USE reset timer on open door (dist=${horizontalDist.toFixed(1)})`);
                continue;
            }
            if (door.state === "opening") {
                activated++;
                continue;
            }

            door.state = "opening";
            activated++;
            console.debug(`[door] USE activated door (dist=${horizontalDist.toFixed(1)}, dot=${dot.toFixed(2)}, travel=${door.travelDist.toFixed(1)}, dir=${JSON.stringify(door.moveDir)})`);
        }
        if (activated === 0) {
            console.debug(`[door] USE pressed but no door in range (checked ${allDoors.length} doors)`);
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

    return { registerDoor, activate, update, checkProximityTrigger, activateByUse, getDoorByTargetname };
}

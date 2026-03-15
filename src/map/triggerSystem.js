// src/map/triggerSystem.js
// Handles trigger_once and trigger_multiple touch volumes.

import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

/**
 * The AABB inset (in Babylon units) applied on each side before the inside
 * test so that partial player overlap is enough to activate a trigger.
 */
const INSIDE_MARGIN = 16;

/**
 * Test whether `point` is inside the axis-aligned bounding box defined by
 * `min`/`max`, expanded inward by `margin` on each face.
 *
 * A positive margin makes the effective box *smaller* (stricter), which means
 * the player's centre must be at least `margin` units inside the shell —
 * i.e. partial overlap is sufficient without requiring the player to be fully
 * inside the raw bounds.
 *
 * @param {Vector3} point
 * @param {Vector3} min
 * @param {Vector3} max
 * @param {number}  margin
 * @returns {boolean}
 */
function isInsideAABB(point, min, max, margin) {
    return (
        point.x >= min.x + margin && point.x <= max.x - margin &&
        point.y >= min.y + margin && point.y <= max.y - margin &&
        point.z >= min.z + margin && point.z <= max.z - margin
    );
}

/**
 * Create a trigger system that manages trigger_once and trigger_multiple
 * brush entities.
 *
 * @returns {{ registerTrigger, update, reset }}
 */
export function createTriggerSystem() {
    /**
     * @typedef {Object} TriggerRecord
     * @property {string}  classname   "trigger_once" | "trigger_multiple"
     * @property {string}  target      Targetname to fire when activated
     * @property {number}  wait        Cooldown in seconds (trigger_multiple only)
     * @property {number}  delay       Seconds before the fire event is dispatched
     * @property {Vector3} min         AABB min in Babylon space
     * @property {Vector3} max         AABB max in Babylon space
     * @property {boolean} enabled     False after trigger_once fires
     * @property {number}  cooldown    Remaining cooldown seconds
     * @property {number|null} pendingFire  Remaining delay before firing, or null
     */

    /** @type {TriggerRecord[]} */
    const triggers = [];

    /**
     * Register a trigger brush entity.
     *
     * @param {Object} entity  Parsed .map entity (classname + properties)
     * @param {{ min: Vector3, max: Vector3 }} bounds  AABB in Babylon space
     * @returns {TriggerRecord}
     */
    function registerTrigger(entity, bounds) {
        const props     = entity.properties || {};
        const classname = entity.classname  || "trigger_multiple";

        const target = props.target || "";
        const delay  = parseFloat(props.delay ?? "0") || 0;

        // trigger_multiple uses `wait` as a cooldown; trigger_once ignores it.
        const isOnce = classname === "trigger_once";
        const wait   = isOnce ? 0 : (parseFloat(props.wait ?? "0.5") || 0.5);

        /** @type {TriggerRecord} */
        const record = {
            classname,
            target,
            wait,
            delay,
            min:         bounds.min.clone(),
            max:         bounds.max.clone(),
            enabled:     true,
            cooldown:    0,
            pendingFire: null,
        };

        triggers.push(record);
        return record;
    }

    /**
     * Advance trigger logic.  Call once per frame.
     *
     * @param {number}   dt        Delta time in seconds
     * @param {Vector3}  playerPos Player position in Babylon space
     * @param {(target: string) => void} onFire  Called when a trigger activates
     */
    function update(dt, playerPos, onFire) {
        for (const trig of triggers) {
            // Tick cooldown regardless of player position.
            if (trig.cooldown > 0) {
                trig.cooldown = Math.max(0, trig.cooldown - dt);
            }

            // Tick pending-fire delay.
            if (trig.pendingFire !== null) {
                trig.pendingFire -= dt;
                if (trig.pendingFire <= 0) {
                    trig.pendingFire = null;
                    _fire(trig, onFire);
                }
                // While a delayed fire is pending we skip new activation checks.
                continue;
            }

            if (!trig.enabled || trig.cooldown > 0) continue;

            const inside = isInsideAABB(playerPos, trig.min, trig.max, INSIDE_MARGIN);
            if (!inside) continue;

            // Player is inside the trigger volume — activate.
            if (trig.delay > 0) {
                // Schedule a deferred fire.
                trig.pendingFire = trig.delay;
            } else {
                _fire(trig, onFire);
            }
        }
    }

    /**
     * Internal: dispatch the fire event and apply post-fire state changes.
     *
     * @param {TriggerRecord} trig
     * @param {(target: string) => void} onFire
     */
    function _fire(trig, onFire) {
        if (trig.target) {
            onFire(trig.target);
        }

        if (trig.classname === "trigger_once") {
            // Permanently disable after the first activation.
            trig.enabled = false;
        } else {
            // Start cooldown so the trigger cannot immediately re-fire.
            trig.cooldown = trig.wait;
        }
    }

    /**
     * Re-enable all triggers (e.g. on map restart or checkpoint reload).
     */
    function reset() {
        for (const trig of triggers) {
            trig.enabled     = true;
            trig.cooldown    = 0;
            trig.pendingFire = null;
        }
    }

    return { registerTrigger, update, reset };
}

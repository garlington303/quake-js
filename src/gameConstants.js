// Centralised weapon / gameplay tuning knobs.
// Tweak values here instead of hunting through main.js.

export const WEAPONS = {
  shotgun: {
    cooldown: 0.85,
    dryFireCooldown: 0.3,
  },
  sword: {
    cooldown: 0.42,
    range: 128,
    damage: 50,
  },
  grenade: {
    cooldown: 0.80,
    radius: 180,
    damage: 80,
    dryFireCooldown: 0.3,
  },
  staff: {
    cooldown: 0.50,
    range: 900,
    damage: 35,
  },
};

export const WEAPON_ORDER = ["shotgun", "sword", "grenade", "staff"];

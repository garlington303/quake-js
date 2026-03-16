const HIT_MARKER_DURATION = 0.14;
const WEAPON_TOAST_DURATION = 1.4; // seconds the weapon name stays visible

const WEAPON_LABELS = {
  shotgun: "SHOTGUN",
  sword:   "SWORD",
};

function getOrCreateDeathOverlay() {
  let el = document.getElementById("death-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "death-overlay";
    Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(160, 0, 0, 0.72)",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      color: "#fff",
      fontFamily: "monospace",
      textAlign: "center",
      zIndex: "200",
      pointerEvents: "none",
    });
    el.innerHTML = `
      <div style="font-size:52px;letter-spacing:6px;text-shadow:0 0 24px #f00">YOU DIED</div>
      <div style="font-size:18px;margin-top:18px;opacity:0.8">Respawning...</div>
    `;
    document.body.appendChild(el);
  }
  return el;
}

function getOrCreateWeaponToast() {
  let el = document.getElementById("weapon-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "weapon-toast";
    Object.assign(el.style, {
      position: "absolute",
      left: "50%",
      top: "62%",
      transform: "translateX(-50%)",
      color: "rgba(240, 220, 160, 0.95)",
      fontFamily: "monospace",
      fontSize: "13px",
      letterSpacing: "0.22em",
      textTransform: "uppercase",
      textShadow: "0 0 10px rgba(210,130,30,0.7), 1px 1px 0 rgba(0,0,0,0.95)",
      pointerEvents: "none",
      zIndex: "20",
      opacity: "0",
      transition: "opacity 0.15s ease",
    });
    // Insert into the existing HUD container if present
    const hud = document.getElementById("hud");
    (hud ?? document.body).appendChild(el);
  }
  return el;
}


const HURT_VIGNETTE_DURATION = 0.55;

function getOrCreateHurtVignette() {
  let el = document.getElementById("hud-hurt");
  if (!el) {
    el = document.createElement("div");
    el.id = "hud-hurt";
    el.style.cssText = [
      "position:fixed", "inset:0", "pointer-events:none",
      "opacity:0", "transition:none",
      "background:radial-gradient(ellipse at center, transparent 35%, rgba(200,0,0,0.72) 100%)",
      "z-index:80",
    ].join(";");
    document.body.appendChild(el);
  }
  return el;
}
export function createHud() {
  const healthValue = document.getElementById("hud-health");
  const hurtVignette = getOrCreateHurtVignette();
  const armorValue  = document.getElementById("hud-armor");
  const ammoValue   = document.getElementById("hud-ammo");
  const enemyValue  = document.getElementById("hud-enemies");
  const killsValue  = document.getElementById("hud-kills");
  const healthBar   = document.getElementById("hud-health-bar");
  const armorBar    = document.getElementById("hud-armor-bar");
  const statusEl    = document.getElementById("hud-status");
  const crosshair   = document.getElementById("crosshair");
  const deathOverlay = getOrCreateDeathOverlay();
  const weaponToast  = getOrCreateWeaponToast();

  let hitMarkerRemaining = 0;
  let weaponToastRemaining = 0;
  let hurtVignetteRemaining = 0;
  let lastStatusText = null;

  return {
    notifyHit() {
      hitMarkerRemaining = HIT_MARKER_DURATION;
    },

    notifyPlayerHurt() {
      hurtVignetteRemaining = HURT_VIGNETTE_DURATION;
      hurtVignette.style.opacity = "0.85";
    },

    notifyWeaponSwitch(weapon) {
      const label = WEAPON_LABELS[weapon] ?? weapon.toUpperCase();
      weaponToast.textContent = label;
      weaponToast.style.opacity = "1";
      weaponToastRemaining = WEAPON_TOAST_DURATION;
    },

    showDeath() {
      deathOverlay.style.display = "flex";
    },

    hideDeath() {
      deathOverlay.style.display = "none";
    },

    update(deltaTimeSeconds, data) {
      if (healthValue) {
        const health = data.health ?? 0;
        const display = health <= 0 ? "0" : Math.round(health).toString();
        healthValue.textContent = display;
        if (healthBar) {
          const pct = Math.max(0, Math.min(health, 100)) / 100;
          healthBar.style.clipPath = `inset(0 ${((1 - pct) * 100).toFixed(1)}% 0 0)`;
        }
      }
      if (armorValue) {
        const armor = data.armor ?? 0;
        armorValue.textContent = Math.round(armor).toString();
        if (armorBar) {
          const pct = Math.max(0, Math.min(armor, 200)) / 200;
          armorBar.style.clipPath = `inset(0 ${((1 - pct) * 100).toFixed(1)}% 0 0)`;
        }
      }
      if (ammoValue) {
        ammoValue.textContent = data.ammoText ?? "∞";
      }
      if (enemyValue) {
        enemyValue.textContent = data.enemies?.toString() ?? "0";
      }
      if (killsValue) {
        killsValue.textContent = data.kills?.toString() ?? "0";
      }

      // Status text (map loading messages, errors)
      if (statusEl) {
        const text = data.statusText ?? null;
        if (text !== lastStatusText) {
          lastStatusText = text;
          statusEl.textContent = text ?? "";
          statusEl.style.display = text ? "block" : "none";
        }
      }

      // Hurt vignette fade-out
      if (hurtVignetteRemaining > 0) {
        hurtVignetteRemaining = Math.max(0, hurtVignetteRemaining - deltaTimeSeconds);
        const t = hurtVignetteRemaining / HURT_VIGNETTE_DURATION;
        hurtVignette.style.opacity = String((t * t * 0.85).toFixed(3)); // eased fade
      }

      // Hit marker
      if (hitMarkerRemaining > 0) {
        hitMarkerRemaining = Math.max(0, hitMarkerRemaining - deltaTimeSeconds);
      }

      if (crosshair) {
        if (hitMarkerRemaining > 0) {
          crosshair.classList.add("hit");
        } else {
          crosshair.classList.remove("hit");
        }
      }

      // Weapon toast fade-out
      if (weaponToastRemaining > 0) {
        weaponToastRemaining = Math.max(0, weaponToastRemaining - deltaTimeSeconds);
        if (weaponToastRemaining <= 0) {
          weaponToast.style.opacity = "0";
        }
      }
    },
  };
}

const HIT_MARKER_DURATION = 0.14;

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

export function createHud() {
  const healthValue = document.getElementById("hud-health");
  const armorValue  = document.getElementById("hud-armor");
  const ammoValue   = document.getElementById("hud-ammo");
  const enemyValue  = document.getElementById("hud-enemies");
  const shotsValue  = document.getElementById("hud-shots");
  const killsValue  = document.getElementById("hud-kills");
  const statusValue = document.getElementById("hud-status");
  const healthBar   = document.getElementById("hud-health-bar");
  const armorBar    = document.getElementById("hud-armor-bar");
  const crosshair   = document.getElementById("crosshair");
  const deathOverlay = getOrCreateDeathOverlay();

  let hitMarkerRemaining = 0;

  return {
    notifyHit() {
      hitMarkerRemaining = HIT_MARKER_DURATION;
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
      if (shotsValue) {
        shotsValue.textContent = data.shotsFired?.toString() ?? "0";
      }
      if (killsValue) {
        killsValue.textContent = data.kills?.toString() ?? "0";
      }
      if (statusValue) {
        if (data.statusText) {
          statusValue.textContent = data.statusText;
        } else {
          statusValue.textContent = data.pointerLocked ? "Pointer locked" : "Click to lock pointer";
        }
      }

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
    },
  };
}

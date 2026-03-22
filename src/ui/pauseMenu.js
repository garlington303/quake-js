export function createPauseMenu(audioSystem) {
  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
  overlay.style.color = "#fff";
  overlay.style.display = "none";
  overlay.style.flexDirection = "column";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.fontFamily = "monospace";
  overlay.style.zIndex = "9999";

  const title = document.createElement("h1");
  title.innerText = "PAUSED";
  title.style.fontSize = "48px";
  title.style.marginBottom = "30px";
  title.style.textShadow = "2px 2px #f00";
  overlay.appendChild(title);

  const soundOptions = document.createElement("div");
  soundOptions.style.backgroundColor = "rgba(50, 0, 0, 0.8)";
  soundOptions.style.padding = "20px";
  soundOptions.style.border = "2px solid #800";
  soundOptions.style.borderRadius = "8px";

  const subtitle = document.createElement("h2");
  subtitle.innerText = "Soundtrack Settings";
  subtitle.style.marginTop = "0";
  subtitle.style.borderBottom = "1px solid #800";
  subtitle.style.paddingBottom = "10px";
  soundOptions.appendChild(subtitle);

  // Helper row creator
  const createSlider = (labelText, min, max, step, initial, onChange) => {
    const row = document.createElement("div");
    row.style.margin = "15px 0";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.width = "300px";

    const label = document.createElement("label");
    label.innerText = labelText;
    
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = initial;
    
    const valDisplay = document.createElement("span");
    valDisplay.innerText = initial;
    valDisplay.style.display = "inline-block";
    valDisplay.style.width = "40px";
    valDisplay.style.textAlign = "right";

    slider.addEventListener("input", (e) => {
      onChange(parseFloat(e.target.value));
      valDisplay.innerText = parseFloat(e.target.value).toFixed(1);
    });

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(valDisplay);
    return row;
  };

  const st = () => audioSystem.soundtrack; // Evaluate lazily if not created

  soundOptions.appendChild(createSlider("Volume", 0, 1, 0.1, 0.5, (val) => {
    if (st()) st().setVolume(val);
  }));

  soundOptions.appendChild(createSlider("Bass Drive", 0, 1, 0.1, 0.8, (val) => {
    if (st()) st().setBassDrive(val);
  }));

  soundOptions.appendChild(createSlider("Tempo (BPM)", 60, 200, 1, 120, (val) => {
    if (st()) st().setTempo(val);
  }));

  overlay.appendChild(soundOptions);

  const resumeBtn = document.createElement("button");
  resumeBtn.innerText = "RESUME";
  resumeBtn.style.marginTop = "30px";
  resumeBtn.style.padding = "10px 20px";
  resumeBtn.style.fontSize = "24px";
  resumeBtn.style.backgroundColor = "#500";
  resumeBtn.style.color = "#fff";
  resumeBtn.style.border = "none";
  resumeBtn.style.cursor = "pointer";
  resumeBtn.style.fontFamily = "monospace";
  
  resumeBtn.onmouseenter = () => resumeBtn.style.backgroundColor = "#800";
  resumeBtn.onmouseleave = () => resumeBtn.style.backgroundColor = "#500";

  overlay.appendChild(resumeBtn);

  document.body.appendChild(overlay);

  let isPaused = false;

  const toggle = () => {
    isPaused = !isPaused;
    if (isPaused) {
      overlay.style.display = "flex";
      // Let engine/main handle unlocking pointer and pausing systems
    } else {
      overlay.style.display = "none";
    }
  };

  resumeBtn.addEventListener("click", () => {
    if (isPaused) {
      // Dispatch an event or callback
      document.dispatchEvent(new Event("resumeGame"));
    }
  });

  return {
    toggle,
    get isPaused() { return isPaused; },
    set isPaused(val) {
      if (isPaused !== val) toggle();
    }
  };
}

(() => {
  const BASE_SPEED = 7,
    SPEEDUP_EVERY = 5,
    SPEEDUP_STEP = 0.6;

  function gridForWidth(w) {
    if (w < 360) return 13;
    if (w < 480) return 15;
    if (w < 768) return 17;
    return 21;
  }

  const SWIPE_MIN_PX_BASE = 14,
    SWIPE_MIN_RATIO = 0.06,
    SWIPE_VEL_BONUS_MS = 120;

  const THEME_KEY = "theme_v2";
  const TOGGLE_KEY = "dpadEnabled_v1";
  const HAPTICS_KEY = "hapticsEnabled_v1";
  const HIGH_KEY = "snakeHighScore_v1";
  const MODE_KEY = "snakeMode_v1";

  const THEMES = {
    neon: {
      "--bg": "#0f1226",
      "--panel": "#191d3a",
      "--accent": "#29f19c",
      "--accent-2": "#6aa8ff",
      "--text": "#e7e8f1",
      "--danger": "#ff6b6b",
      "--grid": "#252a52",
      "--glow": "0 0 12px rgba(41,241,156,.6)",
      "--food": "#ffcf6b",
    },
    violet: {
      "--bg": "#1b0f26",
      "--panel": "#29193a",
      "--accent": "#bd7bff",
      "--accent-2": "#ff6ad5",
      "--text": "#f2e7f5",
      "--danger": "#ff6b6b",
      "--grid": "#3b2752",
      "--glow": "0 0 12px rgba(189,123,255,.6)",
      "--food": "#ffd86b",
    },
    sunset: {
      "--bg": "#26110f",
      "--panel": "#3a1e19",
      "--accent": "#ff7a59",
      "--accent-2": "#ff4fb6",
      "--text": "#f3e9e7",
      "--danger": "#ff6b6b",
      "--grid": "#523025",
      "--glow": "0 0 12px rgba(255,122,89,.6)",
      "--food": "#ffe16b",
    },
    ice: {
      "--bg": "#0f1f26",
      "--panel": "#19313a",
      "--accent": "#5af0ff",
      "--accent-2": "#6aa8ff",
      "--text": "#e7f0f1",
      "--danger": "#ff6b6b",
      "--grid": "#254652",
      "--glow": "0 0 12px rgba(90,240,255,.6)",
      "--food": "#c8ff6b",
    },
  };

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlayText");
  const btnStart = document.getElementById("btnStart");
  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");
  const dpadEl = document.getElementById("dpad");

  const btnSettings = document.getElementById("btnSettings");
  const settingsOverlay = document.getElementById("settingsOverlay");
  const btnSettingsClose = document.getElementById("btnSettingsClose");
  const toggleDpadEl = document.getElementById("toggleDpad");
  const toggleHapticsEl = document.getElementById("toggleHaptics");
  const themeSelect = document.getElementById("themeSelect");
  const modeSelect = document.getElementById("modeSelect");

  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  function resizeCanvas() {
    const display = Math.floor(canvas.clientWidth * DPR);
    canvas.width = display;
    canvas.height = display;
  }
  new ResizeObserver(resizeCanvas).observe(canvas);
  resizeCanvas();

  let currentMode = localStorage.getItem(MODE_KEY) || "classic";
  if (modeSelect) {
    modeSelect.value = currentMode;
    modeSelect.addEventListener("change", (e) => {
      currentMode = e.target.value;
      localStorage.setItem(MODE_KEY, currentMode);
      initGame();
    });
  }

  let best = Number(localStorage.getItem(HIGH_KEY) || 0);
  bestEl.textContent = best;

  let dpadEnabled = JSON.parse(localStorage.getItem(TOGGLE_KEY) ?? "true");
  let hapticsEnabled = JSON.parse(localStorage.getItem(HAPTICS_KEY) ?? "true");
  let currentTheme = localStorage.getItem(THEME_KEY) || "neon";

  const COLORS = {
    bg: "#191d3a",
    grid: "#252a52",
    snake: "#29f19c",
    snakeHead: "#6aa8ff",
    food: "#ffcf6b",
  };
  function refreshColors() {
    const cs = getComputedStyle(document.documentElement);
    COLORS.bg = cs.getPropertyValue("--panel").trim() || COLORS.bg;
    COLORS.grid = cs.getPropertyValue("--grid").trim() || COLORS.grid;
    COLORS.snake = cs.getPropertyValue("--accent").trim() || COLORS.snake;
    COLORS.snakeHead =
      cs.getPropertyValue("--accent-2").trim() || COLORS.snakeHead;
    COLORS.food = cs.getPropertyValue("--food").trim() || COLORS.food;
  }

  function applyTheme(name) {
    const vars = THEMES[name] || THEMES.neon;
    const root = document.documentElement;
    Object.keys(vars).forEach((k) => root.style.setProperty(k, vars[k]));
    localStorage.setItem(THEME_KEY, name);
    currentTheme = name;
    refreshColors();
  }

  function vibrate(ms) {
    if (!hapticsEnabled) return;
    if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(ms);
      } catch {}
    }
  }

  let cells = gridForWidth(window.innerWidth),
    cell,
    snake,
    dir,
    pendingDir,
    food,
    score,
    alive,
    paused,
    started = false,
    movesPerSec,
    lastStepAt,
    accumulator;

  let dirAnimFrames = 0,
    dirAnimVec = { x: 0, y: 0 };

  const TRAIL_MS = 600;
  let trail = [];
  let particles = [];
  let walls = [];
  let lastRenderTS = performance.now();

  const root = document.documentElement;
  const headerEl = document.querySelector("header");

  function fitLayout() {
    const isMobile = window.innerWidth < 600;
    root.classList.toggle("no-scroll", isMobile);
    document.body.classList.toggle("no-scroll", isMobile);

    if (!isMobile) {
      root.style.setProperty("--board-max", "520px");
      root.style.setProperty("--dpad-btn", "64px");
      root.style.setProperty("--dpad-gap", "10px");
      return;
    }

    const vh = window.innerHeight;
    const headerH = headerEl?.getBoundingClientRect().height || 0;
    const topGaps = 16,
      bottomSafe = 18;
    let available = vh - headerH - topGaps - bottomSafe;

    const gap = 8;
    let btn = 56;
    const minBoard = 300;
    const maxBoard = Math.min(420, Math.floor(window.innerWidth * 0.92));

    if (!dpadEnabled) {
      const boardSize = Math.max(minBoard, Math.min(maxBoard, available - 8));
      root.style.setProperty("--dpad-gap", `${gap}px`);
      root.style.setProperty("--dpad-btn", `0px`);
      root.style.setProperty("--board-max", `${Math.round(boardSize)}px`);
      return;
    }

    function fits(btnSize) {
      const dpadHeight = 3 * btnSize + 2 * gap;
      const boardTarget = Math.min(maxBoard, available - dpadHeight - 12);
      return boardTarget >= minBoard ? boardTarget : null;
    }

    const candidates = [64, 60, 56, 52, 48, 44];
    let boardSize = null;
    for (const size of candidates) {
      const ok = fits(size);
      if (ok) {
        btn = size;
        boardSize = ok;
        break;
      }
    }
    if (!boardSize) {
      btn = 44;
      const dpadHeight = 3 * btn + 2 * gap;
      boardSize = Math.max(minBoard, available - dpadHeight - 8);
    }

    root.style.setProperty("--dpad-gap", `${gap}px`);
    root.style.setProperty("--dpad-btn", `${btn}px`);
    root.style.setProperty("--board-max", `${Math.round(boardSize)}px`);
  }

  function pauseForSettings() {
    if (alive && started && !paused) {
      paused = true;
      btnPause.setAttribute("aria-pressed", "true");
      btnPause.textContent = "Resume";
      setOverlay(true, "Paused — Settings");
    }
  }
  function openSettings() {
    settingsOverlay.classList.add("active");
    pauseForSettings();
    btnSettingsClose?.focus({ preventScroll: true });
  }
  function closeSettings() {
    settingsOverlay.classList.remove("active");
    btnSettings?.focus({ preventScroll: true });
  }

  btnSettings?.addEventListener("click", openSettings);
  btnSettingsClose?.addEventListener("click", closeSettings);
  settingsOverlay?.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });
  window.addEventListener("keydown", (e) => {
    if (settingsOverlay.classList.contains("active") && e.key === "Escape")
      closeSettings();
  });

  function applyDpadPreference() {
    document.body.classList.toggle("dpad-off", !dpadEnabled);
    if (toggleDpadEl) toggleDpadEl.checked = dpadEnabled;
    localStorage.setItem(TOGGLE_KEY, JSON.stringify(dpadEnabled));
    fitLayout();
  }
  function applyHapticsPreference() {
    if (toggleHapticsEl) toggleHapticsEl.checked = hapticsEnabled;
    localStorage.setItem(HAPTICS_KEY, JSON.stringify(hapticsEnabled));
  }

  toggleDpadEl?.addEventListener("change", (e) => {
    dpadEnabled = e.target.checked;
    applyDpadPreference();
  });
  toggleHapticsEl?.addEventListener("change", (e) => {
    hapticsEnabled = e.target.checked;
    applyHapticsPreference();
  });
  themeSelect?.addEventListener("change", (e) => {
    applyTheme(e.target.value);
    refreshColors();
  });

  applyTheme(currentTheme);
  applyDpadPreference();
  applyHapticsPreference();
  fitLayout();

  window.addEventListener(
    "resize",
    debounce(() => {
      fitLayout();
      const cls = gridForWidth(window.innerWidth);
      if (cls !== cells && (!started || paused || !alive)) {
        cells = cls;
        initGame();
        setOverlay(true, "Click Start to Play");
      }
    }, 120)
  );

  function initGame() {
    cells = gridForWidth(window.innerWidth);
    const cx = Math.floor(cells / 2),
      cy = Math.floor(cells / 2);
    snake = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
    ];
    dir = { x: 1, y: 0 };
    pendingDir = dir;
    score = 0;
    movesPerSec = BASE_SPEED;
    alive = true;
    paused = true;
    started = false;
    lastStepAt = performance.now();
    accumulator = 0;
    trail = [];
    particles = [];
    walls = [];

    if (currentMode === "obstacles") generateWalls();

    placeFood();
    updateScore(0);
    setOverlay(true, "Click Start to Play");
  }

  function setOverlay(show, text = "Paused") {
    overlay.hidden = !show;
    overlayText.textContent = text;
  }

  function updateScore(delta) {
    score += delta;
    if (delta > 0) vibrate(15);
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      localStorage.setItem(HIGH_KEY, String(best));
    }

    if (currentMode !== "neonFeast") {
      const target =
        BASE_SPEED + Math.floor(score / SPEEDUP_EVERY) * SPEEDUP_STEP;
      movesPerSec = Math.min(20, target);
    }
  }

  function rndCell() {
    return {
      x: Math.floor(Math.random() * cells),
      y: Math.floor(Math.random() * cells),
    };
  }
  function generateWalls() {
    for (let i = 0; i < 10; i++) {
      let pos;
      do {
        pos = rndCell();
      } while (snake.some((s) => s.x === pos.x && s.y === pos.y));
      walls.push(pos);
    }
  }
  function placeFood() {
    if (currentMode === "neonFeast") {
      const types = ["normal", "speed", "slow", "bonus"];
      const type = types[Math.floor(Math.random() * types.length)];
      do {
        food = { ...rndCell(), type };
      } while (
        snake.some((s) => s.x === food.x && s.y === food.y) ||
        walls.some((w) => w.x === food.x && w.y === food.y)
      );
    } else {
      do {
        food = { ...rndCell(), type: "normal" };
      } while (
        snake.some((s) => s.x === food.x && s.y === food.y) ||
        walls.some((w) => w.x === food.x && w.y === food.y)
      );
    }
  }

  let speedEffectUntil = 0;

  function step() {
    if (!alive || paused) return;

    const now = performance.now();

    if (
      currentMode === "neonFeast" &&
      speedEffectUntil &&
      now > speedEffectUntil
    ) {
      speedEffectUntil = 0;
      movesPerSec = BASE_SPEED;
    }

    if (pendingDir.x !== -dir.x || pendingDir.y !== -dir.y) dir = pendingDir;

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.y < 0 || head.x >= cells || head.y >= cells)
      return die();
    if (snake.some((s, i) => i > 0 && s.x === head.x && s.y === head.y))
      return die();
    if (
      currentMode === "obstacles" &&
      walls.some((w) => w.x === head.x && w.y === head.y)
    )
      return die();

    snake.unshift(head);
    trail.push({ x: head.x, y: head.y, t: now });

    const cutoff = now - TRAIL_MS - 50;
    while (trail.length && trail[0].t < cutoff) trail.shift();

    if (head.x === food.x && head.y === food.y) {
      if (currentMode === "neonFeast") {
        switch (food.type) {
          case "normal":
            updateScore(1);
            showScorePopup(food.x, food.y, "+1");
            break;
          case "speed":
            movesPerSec = Math.min(20, BASE_SPEED + 5);
            speedEffectUntil = now + 5000;
            updateScore(1);
            showScorePopup(food.x, food.y, "+Speed");
            break;
          case "slow":
            movesPerSec = Math.max(2, BASE_SPEED - 2);
            speedEffectUntil = now + 5000;
            updateScore(1);
            showScorePopup(food.x, food.y, "Slow");
            break;
          case "bonus":
            updateScore(5);
            showScorePopup(food.x, food.y, "+5");
            break;
        }
      } else {
        updateScore(1);
        showScorePopup(food.x, food.y, "+1");
      }

      showFoodFlash(food.x, food.y);
      placeFood();
    } else {
      snake.pop();
    }

    if (currentMode === "survival") {
      movesPerSec = Math.min(22, movesPerSec + 0.002);
    }
  }

  function die() {
    vibrate([80, 40, 80]);
    spawnDeathParticles();
    alive = false;
    paused = true;
    setOverlay(true, `Game Over — Score ${score}`);
    btnStart.hidden = false;
    btnStart.textContent = "Start";
    started = false;
  }

  function draw() {
    const now = performance.now();
    const dt = Math.min(64, now - lastRenderTS);
    lastRenderTS = now;

    const w = canvas.width,
      h = canvas.height;
    cell = Math.floor(Math.min(w, h) / cells);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = Math.max(1, DPR);
    ctx.globalAlpha = 0.55 + 0.15 * Math.sin(now / 1200);
    ctx.beginPath();
    for (let i = 1; i < cells; i++) {
      ctx.moveTo(i * cell + 0.5, 0);
      ctx.lineTo(i * cell + 0.5, cells * cell);
      ctx.moveTo(0, i * cell + 0.5);
      ctx.lineTo(cells * cell, i * cell + 0.5);
    }
    ctx.stroke();
    ctx.restore();

    if (currentMode === "obstacles" && walls.length) {
      const a = 0.7 + 0.3 * Math.sin(now / 350);
      ctx.save();
      ctx.globalAlpha = a;
      walls.forEach((w1) => {
        drawRoundedRect(
          w1.x * cell,
          w1.y * cell,
          cell,
          cell,
          Math.floor(cell * 0.2),
          "#ff00ff"
        );
      });
      ctx.restore();
    }

    const pulse = 1 + 0.08 * Math.sin(now / 150);
    const fx = food.x * cell + (cell * (1 - pulse)) / 2;
    const fy = food.y * cell + (cell * (1 - pulse)) / 2;
    const fs = cell * pulse;

    if (currentMode === "neonFeast") {
      const foodColors = {
        normal: COLORS.food,
        speed: "#ff6b6b",
        slow: "#6aa8ff",
        bonus: "#ffd700",
      };
      const fc = foodColors[food.type] || COLORS.food;

      ctx.save();
      ctx.shadowColor = fc;
      ctx.shadowBlur = 20 + 10 * Math.sin(now / 200);
      drawRoundedRect(fx, fy, fs, fs, Math.floor(cell * 0.25), fc);
      ctx.restore();
    } else {
      ctx.save();
      ctx.shadowColor = COLORS.food;
      ctx.shadowBlur = 15;
      drawRoundedRect(fx, fy, fs, fs, Math.floor(cell * 0.25), COLORS.food);
      ctx.restore();
    }

    drawTrail(now);

    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i],
        isHead = i === 0;
      drawRoundedRect(
        s.x * cell,
        s.y * cell,
        cell,
        cell,
        Math.floor(cell * 0.2),
        isHead ? COLORS.snakeHead : COLORS.snake
      );
      if (isHead) drawEyes(s);
    }

    if (dirAnimFrames > 0 && snake[0]) {
      const head = snake[0];
      const cx = head.x * cell + cell / 2,
        cy = head.y * cell + cell / 2;
      const len = cell * 0.55,
        w2 = cell * 0.35;
      const ax = cx + dirAnimVec.x * (cell * 0.6),
        ay = cy + dirAnimVec.y * (cell * 0.6);
      ctx.save();
      ctx.globalAlpha = Math.max(0, dirAnimFrames / 10);
      ctx.fillStyle = COLORS.snakeHead;
      ctx.beginPath();
      if (dirAnimVec.x !== 0) {
        const sgn = Math.sign(dirAnimVec.x);
        ctx.moveTo(ax + sgn * len * 0.5, ay);
        ctx.lineTo(ax - sgn * len * 0.4, ay - w2 * 0.5);
        ctx.lineTo(ax - sgn * len * 0.4, ay + w2 * 0.5);
      } else {
        const sgn = Math.sign(dirAnimVec.y);
        ctx.moveTo(ax, ay + sgn * len * 0.5);
        ctx.lineTo(ax - w2 * 0.5, ay - sgn * len * 0.4);
        ctx.lineTo(ax + w2 * 0.5, ay - sgn * len * 0.4);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      dirAnimFrames--;
    }

    updateAndDrawParticles(dt);
  }

  function drawRoundedRect(x, y, w, h, r, fill) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
    ctx.fill();
  }

  function drawEyes(head) {
    const cx = head.x * cell + cell / 2,
      cy = head.y * cell + cell / 2;
    const eyeOffset = 0.18 * cell,
      eyeR = Math.max(1.2 * DPR, 0.09 * cell);
    ctx.fillStyle = "white";
    if (dir.x !== 0) {
      ctx.beginPath();
      ctx.arc(
        cx + Math.sign(dir.x) * eyeOffset,
        cy - eyeOffset / 2,
        eyeR,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.beginPath();
      ctx.arc(
        cx + Math.sign(dir.x) * eyeOffset,
        cy + eyeOffset / 2,
        eyeR,
        0,
        Math.PI * 2
      );
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(
        cx - eyeOffset / 2,
        cy + Math.sign(dir.y) * eyeOffset,
        eyeR,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.beginPath();
      ctx.arc(
        cx + eyeOffset / 2,
        cy + Math.sign(dir.y) * eyeOffset,
        eyeR,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  function drawTrail(now) {
    if (trail.length === 0) return;
    ctx.save();
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      const age = now - p.t;
      if (age > TRAIL_MS) continue;
      const a = 1 - age / TRAIL_MS;
      const size = cell * (0.75 + 0.25 * a);
      const px = p.x * cell + (cell - size) / 2;
      const py = p.y * cell + (cell - size) / 2;
      ctx.globalAlpha = a * 0.6;
      ctx.shadowColor = COLORS.snake;
      ctx.shadowBlur = 12;
      drawRoundedRect(px, py, size, size, Math.floor(size * 0.2), COLORS.snake);
    }
    ctx.restore();
  }

  function spawnDeathParticles() {
    particles = [];
    const head = snake[0];
    for (let i = 0; i < snake.length; i++) {
      const s = snake[i];
      const px = s.x * cell + cell / 2;
      const py = s.y * cell + cell / 2;
      const ang =
        Math.atan2(
          py - (head.y * cell + cell / 2),
          px - (head.x * cell + cell / 2)
        ) +
        (Math.random() - 0.5) * 0.8;
      const speed = cell * (0.05 + Math.random() * 0.25);
      particles.push({
        x: px,
        y: py,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - cell * 0.02,
        life: 700 + Math.random() * 400,
        age: 0,
        size: Math.max(2, cell * 0.2 + Math.random() * cell * 0.2),
        color: i === 0 ? COLORS.snakeHead : COLORS.snake,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.04,
      });
    }
  }

  function updateAndDrawParticles(dt) {
    if (particles.length === 0) return;
    const g = cell * 0.0004 * dt;
    ctx.save();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;

      const a = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, a);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.restore();
  }

  function loop(now) {
    const stepInterval = 1000 / movesPerSec;
    accumulator += now - (lastStepAt || now);
    lastStepAt = now;
    while (accumulator >= stepInterval) {
      step();
      accumulator -= stepInterval;
    }
    draw();
    requestAnimationFrame(loop);
  }

  const KEYS = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    a: { x: -1, y: 0 },
    d: { x: 1, y: 0 },
  };
  function setDir(d) {
    if (!alive || paused) return;
    if (d.x === -dir.x && d.y === -dir.y) return;
    pendingDir = d;
    dirAnimVec = { x: d.x, y: d.y };
    dirAnimFrames = 10;
    vibrate(8);
  }

  window.addEventListener("keydown", (e) => {
    const k = e.key;
    if (k === " ") {
      if (!started) return;
      togglePause();
      e.preventDefault();
      return;
    }
    if (k === "r" || k === "R") {
      restart();
      return;
    }
    if (k === "Enter") {
      startGame();
      return;
    }
    if (KEYS[k]) {
      setDir(KEYS[k]);
      e.preventDefault();
    }
  });

  btnPause?.addEventListener("click", () => {
    if (!started) return;
    togglePause();
  });
  btnRestart?.addEventListener("click", restart);
  btnStart?.addEventListener("click", startGame);

  dpadEl?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-dir]");
    if (!b) return;
    vibrate(20);
    const map = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    setDir(map[b.getAttribute("data-dir")]);
  });

  let touchStart = null;
  canvas.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      if (!t) return;
      touchStart = {
        x: t.clientX,
        y: t.clientY,
        time: performance.now(),
        decided: false,
      };
    },
    { passive: true }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (!touchStart || touchStart.decided) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - touchStart.x,
        dy = t.clientY - touchStart.y;
      const ax = Math.abs(dx),
        ay = Math.abs(dy);
      const vw = Math.min(window.innerWidth, window.innerHeight);
      let threshold = Math.max(SWIPE_MIN_PX_BASE, vw * SWIPE_MIN_RATIO);
      const dt = performance.now() - touchStart.time;
      if (dt < SWIPE_VEL_BONUS_MS) threshold *= 0.7;
      if (Math.max(ax, ay) < threshold) return;
      if (ax > ay) setDir({ x: Math.sign(dx), y: 0 });
      else setDir({ x: 0, y: Math.sign(dy) });
      touchStart.decided = true;
      e.preventDefault();
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchend",
    () => {
      touchStart = null;
    },
    { passive: true }
  );

  function startGame() {
    started = true;
    paused = false;
    setOverlay(false);
    btnStart.hidden = true;
    btnPause.textContent = "Pause";
    initIfNeeded();
  }
  function initIfNeeded() {
    if (!alive) {
      initGame();
      paused = false;
      setOverlay(false);
    }
  }
  function togglePause() {
    if (!alive) return;
    paused = !paused;
    btnPause.setAttribute("aria-pressed", String(paused));
    btnPause.textContent = paused ? "Resume" : "Pause";
    setOverlay(paused, "Paused");
  }
  function restart() {
    initGame();
    started = true;
    paused = false;
    setOverlay(false);
    btnStart.hidden = true;
    btnPause.textContent = "Pause";
  }

  function showFoodFlash(gridX, gridY) {
    const el = document.createElement("div");
    el.className = "food-flash";
    const size = cell;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.left = `${gridX * cell}px`;
    el.style.top = `${gridY * cell}px`;
    canvas.parentElement.appendChild(el);
    setTimeout(() => el.remove(), 400);
  }

  function showScorePopup(gridX, gridY, text) {
    const el = document.createElement("div");
    el.className = "score-popup";
    el.textContent = text;
    el.style.left = `${gridX * cell + cell / 4}px`;
    el.style.top = `${gridY * cell - cell / 2}px`;
    el.style.color = "white";
    el.style.textShadow = "0 0 6px rgba(255,255,255,0.8)";
    canvas.parentElement.appendChild(el);

    el.animate(
      [
        { transform: "translateY(0px)", opacity: 1 },
        { transform: "translateY(-20px)", opacity: 0 },
      ],
      { duration: 600, easing: "ease-out" }
    );

    setTimeout(() => el.remove(), 600);
  }

  function debounce(fn, wait) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), wait);
    };
  }

  applyTheme(currentTheme);
  refreshColors();
  initGame();
  requestAnimationFrame(loop);
})();

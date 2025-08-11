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

  const SWIPE_MIN_PX_BASE = 14;
  const SWIPE_MIN_RATIO = 0.06;
  const SWIPE_VEL_BONUS_MS = 120;
  function vibrate(ms) {
    if (!hapticsEnabled) return;
    if (navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch {}
    }
  }

  const COLORS = {
    bg:
      getComputedStyle(document.documentElement)
        .getPropertyValue("--panel")
        .trim() || "#191d3a",
    grid:
      getComputedStyle(document.documentElement)
        .getPropertyValue("--grid")
        .trim() || "#252a52",
    snake: "#29f19c",
    snakeHead: "#6aa8ff",
    food: "#ffcf6b",
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
  const toggleDpadEl = document.getElementById("toggleDpad");
  const toggleHapticsEl = document.getElementById("toggleHaptics");
  const HAPTICS_KEY = "hapticsEnabled_v1";
  let hapticsEnabled = JSON.parse(localStorage.getItem(HAPTICS_KEY) ?? "true");

  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  function resizeCanvas() {
    const display = Math.floor(canvas.clientWidth * DPR);
    canvas.width = display;
    canvas.height = display;
  }
  new ResizeObserver(resizeCanvas).observe(canvas);
  resizeCanvas();

  const storageKey = "snakeHighScore_v1";
  let best = Number(localStorage.getItem(storageKey) || 0);
  bestEl.textContent = best;

  const TOGGLE_KEY = "dpadEnabled_v1";
  let dpadEnabled = JSON.parse(localStorage.getItem(TOGGLE_KEY) ?? "true");

  function applyDpadPreference() {
    document.body.classList.toggle("dpad-off", !dpadEnabled);
    if (toggleDpadEl) toggleDpadEl.checked = dpadEnabled;
    fitLayout();
  }
  if (toggleDpadEl) {
    toggleDpadEl.addEventListener("change", (e) => {
      dpadEnabled = e.target.checked;
      localStorage.setItem(TOGGLE_KEY, JSON.stringify(dpadEnabled));
      applyDpadPreference();
    });
  }

  function applyHapticsPreference() {
    if (toggleHapticsEl) toggleHapticsEl.checked = hapticsEnabled;
  }
  if (toggleHapticsEl) {
    toggleHapticsEl.addEventListener("change", (e) => {
      hapticsEnabled = e.target.checked;
      localStorage.setItem(HAPTICS_KEY, JSON.stringify(hapticsEnabled));
      applyHapticsPreference();
    });
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

  const root = document.documentElement;
  const headerEl = document.querySelector("header");
  const controlsWrap = document.querySelector(".controls");

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
    const topGaps = 16;
    const bottomSafe = 18;
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

  fitLayout();
  applyDpadPreference();
  applyHapticsPreference();

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

    const cx = Math.floor(cells / 2);
    const cy = Math.floor(cells / 2);

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
    lastStepAt = performance.now();
    accumulator = 0;

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
      localStorage.setItem(storageKey, String(best));
    }
    const target =
      BASE_SPEED + Math.floor(score / SPEEDUP_EVERY) * SPEEDUP_STEP;
    movesPerSec = Math.min(20, target);
  }

  function rndCell() {
    return {
      x: Math.floor(Math.random() * cells),
      y: Math.floor(Math.random() * cells),
    };
  }
  function placeFood() {
    do {
      food = rndCell();
    } while (snake.some((s) => s.x === food.x && s.y === food.y));
  }

  function step() {
    if (!alive || paused) return;
    if (pendingDir.x !== -dir.x || pendingDir.y !== -dir.y) dir = pendingDir;

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= cells || head.y >= cells)
      return die();
    if (snake.some((s, i) => i > 0 && s.x === head.x && s.y === head.y))
      return die();

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      updateScore(1);
      placeFood();
    } else {
      snake.pop();
    }
  }

  function die() {
    vibrate(70);
    alive = false;
    paused = true;
    setOverlay(true, `Game Over — Score ${score}`);
    btnStart.hidden = false;
    btnStart.textContent = "Start";
    started = false;
  }

  function draw() {
    const w = canvas.width,
      h = canvas.height;
    cell = Math.floor(Math.min(w, h) / cells);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    // grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = Math.max(1, DPR);
    ctx.beginPath();
    for (let i = 1; i < cells; i++) {
      ctx.moveTo(i * cell + 0.5, 0);
      ctx.lineTo(i * cell + 0.5, cells * cell);
      ctx.moveTo(0, i * cell + 0.5);
      ctx.lineTo(cells * cell, i * cell + 0.5);
    }
    ctx.stroke();

    drawRoundedRect(
      food.x * cell,
      food.y * cell,
      cell,
      cell,
      Math.floor(cell * 0.25),
      COLORS.food
    );

    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      const isHead = i === 0;
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

    if (dirAnimFrames > 0) {
      const head = snake[0];
      const cx = head.x * cell + cell / 2;
      const cy = head.y * cell + cell / 2;
      const len = cell * 0.55;
      const w2 = cell * 0.35;
      const ax = cx + dirAnimVec.x * (cell * 0.6);
      const ay = cy + dirAnimVec.y * (cell * 0.6);

      ctx.save();
      ctx.globalAlpha = Math.max(0, dirAnimFrames / 10);
      ctx.fillStyle = COLORS.snakeHead;
      ctx.beginPath();
      if (dirAnimVec.x !== 0) {
        const s = Math.sign(dirAnimVec.x);
        ctx.moveTo(ax + s * len * 0.5, ay);
        ctx.lineTo(ax - s * len * 0.4, ay - w2 * 0.5);
        ctx.lineTo(ax - s * len * 0.4, ay + w2 * 0.5);
      } else {
        const s = Math.sign(dirAnimVec.y);
        ctx.moveTo(ax, ay + s * len * 0.5);
        ctx.lineTo(ax - w2 * 0.5, ay - s * len * 0.4);
        ctx.lineTo(ax + w2 * 0.5, ay - s * len * 0.4);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      dirAnimFrames--;
    }
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
      cy = head.y * cell + cell / 2,
      eyeOffset = 0.18 * cell,
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

  btnPause.addEventListener("click", () => {
    if (!started) return;
    togglePause();
  });
  btnRestart.addEventListener("click", restart);
  btnStart.addEventListener("click", startGame);

  dpadEl.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-dir]");
    if (!b) return;
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

      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
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

  function debounce(fn, wait) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), wait);
    };
  }

  initGame();
  requestAnimationFrame(loop);
})();

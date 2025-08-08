(() => {
  // ====== Config ======
  const BASE_SPEED = 7,
    SPEEDUP_EVERY = 5,
    SPEEDUP_STEP = 0.6;

  // Responsive GRID size based on viewport
  function gridForWidth(w) {
    if (w < 360) return 13; // very small phones
    if (w < 480) return 15; // small phones
    if (w < 768) return 17; // phones / small tablets
    return 21; // tablets / desktop
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

  // ====== State ======
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlayText");
  const btnStart = document.getElementById("btnStart");
  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");

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

  let cells = gridForWidth(window.innerWidth), // responsive cell count
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

  function initGame() {
    // update grid for current viewport
    cells = gridForWidth(window.innerWidth);

    // start snake near the center for any grid size
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
    paused = true; // start paused until user clicks Start
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

    // food
    drawRoundedRect(
      food.x * cell,
      food.y * cell,
      cell,
      cell,
      Math.floor(cell * 0.25),
      COLORS.food
    );

    // snake (head last for eyes)
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

  document.getElementById("dpad").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-dir]");
    if (!b) return;
    const d = b.getAttribute("data-dir");
    const map = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    setDir(map[d]);
  });

  let touchStart = null;
  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (!e.touches[0]) return;
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    { passive: true }
  );
  canvas.addEventListener(
    "touchend",
    (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x,
        dy = t.clientY - touchStart.y;
      const ax = Math.abs(dx),
        ay = Math.abs(dy);
      if (Math.max(ax, ay) < 20) return;
      if (ax > ay) setDir({ x: Math.sign(dx), y: 0 });
      else setDir({ x: 0, y: Math.sign(dy) });
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

  let lastClass = gridForWidth(window.innerWidth);
  window.addEventListener(
    "resize",
    debounce(() => {
      const cls = gridForWidth(window.innerWidth);
      if (cls !== lastClass) {
        lastClass = cls;
        if (!started || paused || !alive) initGame();
      }
    }, 150)
  );

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  initGame();
  requestAnimationFrame(loop);
})();

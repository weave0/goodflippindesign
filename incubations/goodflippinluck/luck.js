(function () {
  "use strict";

  var canvas = document.getElementById("gameCanvas");
  var ctx = canvas ? canvas.getContext("2d") : null;
  var fanfareCanvas = document.getElementById("fanfareCanvas");
  var fanfareCtx = fanfareCanvas ? fanfareCanvas.getContext("2d") : null;

  if (!canvas || !ctx || !fanfareCanvas || !fanfareCtx || !Array.isArray(window.FORTUNE_POOL)) {
    return;
  }

  var scoreEl = document.getElementById("score");
  var trapsEl = document.getElementById("traps");
  var speedEl = document.getElementById("speed");
  var goalEl = document.getElementById("goal");
  var runStatusEl = document.getElementById("runStatus");
  var themeNeonBtn = document.getElementById("themeNeon");
  var themeSoftBtn = document.getElementById("themeSoft");
  var modeQuickBtn = document.getElementById("modeQuick");
  var modeClassicBtn = document.getElementById("modeClassic");
  var startRunBtn = document.getElementById("startRun");
  var resetRunBtn = document.getElementById("resetRun");
  var toggleFullscreenBtn = document.getElementById("toggleFullscreen");
  var dpadButtons = document.querySelectorAll(".dpad-btn");
  var gameSection = document.getElementById("gameSection");
  var fortuneCard = document.getElementById("fortuneCard");
  var emptyState = document.getElementById("emptyState");
  var fortuneTier = document.getElementById("fortuneTier");
  var fortuneText = document.getElementById("fortuneText");
  var fortuneMeta = document.getElementById("fortuneMeta");
  var copyLinkBtn = document.getElementById("copyLink");
  var shareX = document.getElementById("shareX");

  var gridSize = 20;
  var cell = 20;
  var modes = {
    quick: { target: 10, baseSpeed: 108 },
    classic: { target: 14, baseSpeed: 122 }
  };
  var currentMode = "quick";
  var currentTheme = "neon";
  var targetScore = modes[currentMode].target;
  var trapCount = 0;
  var score = 0;
  var slowTicks = 0;
  var streak = 0;
  var hasWon = false;
  var running = false;
  var pulsePhase = 0;
  var zoomMode = false;

  var snake = createStartingSnake();

  var direction = { x: 1, y: 0 };
  var queuedDir = { x: 1, y: 0 };

  var walls = buildMazeWalls();
  var food = spawnFood();
  var clover = spawnClover();

  var spritePacks = {
    neon: {
      head: "assets/img/icon-snake-head.svg",
      body: "assets/img/icon-snake-body.svg",
      wall: "assets/img/icon-wall.svg",
      food: "assets/img/icon-star.svg",
      clover: "assets/img/icon-clover.svg"
    },
    soft: {
      head: "assets/img/icon-snake-head-soft.svg",
      body: "assets/img/icon-snake-body-soft.svg",
      wall: "assets/img/icon-wall-soft.svg",
      food: "assets/img/icon-star-soft.svg",
      clover: "assets/img/icon-clover-soft.svg"
    }
  };
  var sprites = {
    neon: {},
    soft: {}
  };
  var spritesReady = {
    neon: false,
    soft: false
  };

  preloadSprites("neon");
  preloadSprites("soft");

  function isExpandedView() {
    return zoomMode || document.fullscreenElement === gameSection || document.webkitFullscreenElement === gameSection;
  }

  function resizeBoard() {
    var viewportWidth = window.innerWidth || 1280;
    var isFullscreen = isExpandedView();
    var normalMax = 500;
    var fullscreenMax = 860;
    var maxForScreen = isFullscreen
      ? Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.9)
      : (viewportWidth < 900 ? Math.floor(viewportWidth * 0.84) : normalMax);
    var bounded = Math.max(340, Math.min(isFullscreen ? fullscreenMax : normalMax, maxForScreen));
    var snapped = Math.floor(bounded / gridSize) * gridSize;

    canvas.width = snapped;
    canvas.height = snapped;
    cell = canvas.width / gridSize;
  }

  function syncFullscreenButton() {
    if (!toggleFullscreenBtn) {
      return;
    }

    var active = isExpandedView();
    toggleFullscreenBtn.textContent = active ? "Exit Full Screen" : "Full Screen";
    toggleFullscreenBtn.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function setZoomMode(active) {
    zoomMode = active;

    if (gameSection) {
      gameSection.classList.toggle("zoom-mode", active);
    }

    document.body.classList.toggle("game-zoom-mode", active);
    syncFullscreenButton();
    resizeBoard();
  }

  function toggleFullscreen() {
    if (!gameSection) {
      return;
    }

    var active = isExpandedView();

    if (!active) {
      if (gameSection.requestFullscreen) {
        try {
          var fsPromise = gameSection.requestFullscreen();
          if (fsPromise && typeof fsPromise.then === "function") {
            fsPromise.then(function () {
              setZoomMode(false);
            }).catch(function () {
              setZoomMode(true);
            });
          }
        } catch (error) {
          setZoomMode(true);
        }

        // Some embedded browsers neither resolve nor reject promptly.
        setTimeout(function () {
          if (!isExpandedView()) {
            setZoomMode(true);
          }
        }, 260);
      } else if (gameSection.webkitRequestFullscreen) {
        gameSection.webkitRequestFullscreen();
        setZoomMode(false);

        setTimeout(function () {
          if (!isExpandedView()) {
            setZoomMode(true);
          }
        }, 260);
      } else {
        setZoomMode(true);
      }
      return;
    }

    if (zoomMode) {
      setZoomMode(false);
      return;
    }

    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }

  function createStartingSnake() {
    return [
      { x: 4, y: 4 },
      { x: 3, y: 4 },
      { x: 2, y: 4 }
    ];
  }

  function buildMazeWalls() {
    var set = new Set();

    for (var i = 2; i < 18; i += 1) {
      if (i !== 9 && i !== 10) {
        set.add("8," + i);
      }
    }

    for (var j = 1; j < 17; j += 1) {
      if (j !== 6 && j !== 12) {
        set.add(j + ",11");
      }
    }

    for (var k = 4; k < 15; k += 1) {
      if (k !== 10) {
        set.add("14," + k);
      }
    }

    return set;
  }

  function spawnFood() {
    while (true) {
      var x = Math.floor(Math.random() * gridSize);
      var y = Math.floor(Math.random() * gridSize);
      var key = x + "," + y;
      var hitsSnake = snake.some(function (part) {
        return part.x === x && part.y === y;
      });
      if (!walls.has(key) && !hitsSnake) {
        return { x: x, y: y };
      }
    }
  }

  function spawnClover() {
    if (Math.random() > 0.45) {
      return null;
    }

    while (true) {
      var x = Math.floor(Math.random() * gridSize);
      var y = Math.floor(Math.random() * gridSize);
      var key = x + "," + y;
      var hitsSnake = snake.some(function (part) {
        return part.x === x && part.y === y;
      });
      var onFood = food && food.x === x && food.y === y;

      if (!walls.has(key) && !hitsSnake && !onFood) {
        return { x: x, y: y };
      }
    }
  }

  function drawCell(x, y, color, radius, glow) {
    var px = x * cell + 2;
    var py = y * cell + 2;
    var size = cell - 4;
    var r = typeof radius === "number" ? radius : 6;

    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 14;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px + r, py);
    ctx.arcTo(px + size, py, px + size, py + size, r);
    ctx.arcTo(px + size, py + size, px, py + size, r);
    ctx.arcTo(px, py + size, px, py, r);
    ctx.arcTo(px, py, px + size, py, r);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function preloadSprites(theme) {
    var sources = spritePacks[theme];
    if (!sources) {
      return;
    }

    var keys = Object.keys(sources);
    var loaded = 0;

    function markDone() {
      loaded += 1;
      if (loaded >= keys.length) {
        spritesReady[theme] = true;
      }
    }

    keys.forEach(function (key) {
      var image = new Image();
      image.onload = function () {
        markDone();
      };
      image.onerror = function () {
        markDone();
      };
      image.src = sources[key];
      sprites[theme][key] = image;
    });
  }

  function drawSprite(name, x, y, options) {
    if (!spritesReady[currentTheme] || !sprites[currentTheme][name] || !sprites[currentTheme][name].complete) {
      return false;
    }

    var opts = options || {};
    var pad = typeof opts.pad === "number" ? opts.pad : 1.5;
    var px = x * cell + pad;
    var py = y * cell + pad;
    var size = cell - pad * 2;

    ctx.save();

    if (opts.glow) {
      ctx.shadowColor = opts.glow;
      ctx.shadowBlur = 15;
    }

    if (opts.alpha) {
      ctx.globalAlpha = opts.alpha;
    }

    if (opts.rotation) {
      var cx = px + size / 2;
      var cy = py + size / 2;
      ctx.translate(cx, cy);
      ctx.rotate(opts.rotation);
      ctx.drawImage(sprites[currentTheme][name], -size / 2, -size / 2, size, size);
    } else {
      ctx.drawImage(sprites[currentTheme][name], px, py, size, size);
    }

    ctx.restore();
    return true;
  }

  function directionAngle() {
    if (direction.x === 1) {
      return 0;
    }
    if (direction.x === -1) {
      return Math.PI;
    }
    if (direction.y === 1) {
      return Math.PI / 2;
    }
    return -Math.PI / 2;
  }

  function drawGridGlow() {
    var alpha = 0.07 + Math.sin(pulsePhase) * 0.02;
    ctx.strokeStyle = "rgba(90, 130, 180, " + alpha.toFixed(3) + ")";
    ctx.lineWidth = 1;

    for (var i = 1; i < gridSize; i += 1) {
      var p = i * cell;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, canvas.width);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(canvas.width, p);
      ctx.stroke();
    }
  }

  function drawStar(x, y) {
    var cx = x * cell + cell / 2;
    var cy = y * cell + cell / 2;
    var spikes = 5;
    var outer = cell * 0.34;
    var inner = cell * 0.16;
    var rot = Math.PI / 2 * 3;
    var step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outer);

    for (var i = 0; i < spikes; i += 1) {
      ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
      rot += step;
    }

    ctx.closePath();
    ctx.fillStyle = "#f9c74f";
    ctx.shadowColor = "rgba(249, 199, 79, 0.8)";
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function draw() {
    ctx.fillStyle = "#0b1726";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGridGlow();

    walls.forEach(function (entry) {
      var parts = entry.split(",");
      var wallX = Number(parts[0]);
      var wallY = Number(parts[1]);
      var didDrawWall = drawSprite("wall", wallX, wallY, {
        pad: 2,
        rotation: ((wallX + wallY) % 2 === 0 ? 0 : Math.PI / 2)
      });
      if (!didDrawWall) {
        drawCell(wallX, wallY, "#2a4864", 4);
      }
    });

    if (!drawSprite("food", food.x, food.y, { pad: 1.2, glow: "rgba(249, 199, 79, 0.75)" })) {
      drawStar(food.x, food.y);
    }

    if (clover) {
      if (!drawSprite("clover", clover.x, clover.y, { pad: 1.4, glow: "rgba(155, 255, 250, 0.8)" })) {
        drawCell(clover.x, clover.y, "#9bfffa", 10, "rgba(155, 255, 250, 0.7)");
      }
    }

    for (var i = 0; i < snake.length; i += 1) {
      if (i === 0) {
        if (!drawSprite("head", snake[i].x, snake[i].y, { pad: 1.1, rotation: directionAngle(), glow: "rgba(0, 224, 164, 0.85)" })) {
          drawCell(snake[i].x, snake[i].y, "#00e0a4", 9, "rgba(0, 224, 164, 0.8)");
        }
      } else {
        if (!drawSprite("body", snake[i].x, snake[i].y, { pad: 1.8, alpha: i === snake.length - 1 ? 0.82 : 1 })) {
          drawCell(snake[i].x, snake[i].y, "#6ef3ce", 7);
        }
      }
    }

    pulsePhase += 0.08;
  }

  function updateHud() {
    if (scoreEl) {
      scoreEl.textContent = String(score);
    }
    if (trapsEl) {
      trapsEl.textContent = String(trapCount);
    }
    if (speedEl) {
      speedEl.textContent = slowTicks > 0 ? "Slowed" : "Normal";
    }
    if (goalEl) {
      goalEl.textContent = String(targetScore);
    }
    if (runStatusEl && !hasWon) {
      var remaining = Math.max(0, targetScore - score);
      runStatusEl.textContent = remaining === 0
        ? "Fortune unlocked!"
        : (running ? remaining + " stars to fortune. Streak: " + streak : "Paused. Press Start Run when ready.");
    }
  }

  function applyTrapPenalty() {
    trapCount += 1;
    score = Math.max(0, score - 1);
    slowTicks = 6;
    streak = 0;

    // Teleport the head to a nearby safe tile instead of ending the run.
    var head = snake[0];
    var candidates = [
      { x: head.x + 1, y: head.y },
      { x: head.x - 1, y: head.y },
      { x: head.x, y: head.y + 1 },
      { x: head.x, y: head.y - 1 },
      { x: 1, y: 1 },
      { x: 18, y: 18 }
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      var c = candidates[i];
      var inBounds = c.x >= 0 && c.x < gridSize && c.y >= 0 && c.y < gridSize;
      var blocked = walls.has(c.x + "," + c.y);
      if (inBounds && !blocked) {
        snake[0] = c;
        return;
      }
    }
  }

  function move() {
    if (hasWon || !running) {
      return;
    }

    direction = queuedDir;
    var head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

    var outOfBounds = head.x < 0 || head.x >= gridSize || head.y < 0 || head.y >= gridSize;
    var isWall = walls.has(head.x + "," + head.y);

    if (outOfBounds || isWall) {
      applyTrapPenalty();
      updateHud();
      return;
    }

    var hitsSelf = snake.some(function (part) {
      return part.x === head.x && part.y === head.y;
    });

    if (hitsSelf) {
      applyTrapPenalty();
      updateHud();
      return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      score += 1;
      streak += 1;

      // Reward consistent play with occasional bonus score pulses.
      if (streak > 0 && streak % 4 === 0) {
        score += 1;
      }

      food = spawnFood();

      if (!clover || Math.random() > 0.6) {
        clover = spawnClover();
      }

      if (score >= targetScore) {
        triggerVictory();
      }
    } else {
      snake.pop();
    }

    if (clover && head.x === clover.x && head.y === clover.y) {
      score += 2;
      slowTicks = 0;
      clover = null;
      if (score >= targetScore) {
        triggerVictory();
      }
    }

    if (slowTicks > 0) {
      slowTicks -= 1;
    }

    updateHud();
  }

  function tickSpeed() {
    return slowTicks > 0 ? 180 : modes[currentMode].baseSpeed;
  }

  function setMode(mode) {
    if (!modes[mode] || hasWon) {
      return;
    }

    currentMode = mode;
    targetScore = modes[mode].target;

    if (modeQuickBtn && modeClassicBtn) {
      modeQuickBtn.classList.toggle("active", mode === "quick");
      modeClassicBtn.classList.toggle("active", mode === "classic");
    }

    if (runStatusEl) {
      runStatusEl.textContent = mode === "quick"
        ? "Quick Run active. First fortune at 10 stars."
        : "Classic active. Bigger run, bigger bragging rights.";
    }

    updateHud();
  }

  function setTheme(theme) {
    if (!spritePacks[theme]) {
      return;
    }

    currentTheme = theme;
    document.body.setAttribute("data-theme", theme);

    if (themeNeonBtn && themeSoftBtn) {
      themeNeonBtn.classList.toggle("active", theme === "neon");
      themeSoftBtn.classList.toggle("active", theme === "soft");
    }

    if (!spritesReady[theme]) {
      preloadSprites(theme);
    }

    draw();
  }

  function setDirection(next) {
    if (next === "up" && direction.y !== 1) {
      queuedDir = { x: 0, y: -1 };
    } else if (next === "down" && direction.y !== -1) {
      queuedDir = { x: 0, y: 1 };
    } else if (next === "left" && direction.x !== 1) {
      queuedDir = { x: -1, y: 0 };
    } else if (next === "right" && direction.x !== -1) {
      queuedDir = { x: 1, y: 0 };
    }
  }

  function resetRun() {
    score = 0;
    trapCount = 0;
    slowTicks = 0;
    streak = 0;
    hasWon = false;
    running = false;
    snake = createStartingSnake();
    direction = { x: 1, y: 0 };
    queuedDir = { x: 1, y: 0 };
    food = spawnFood();
    clover = spawnClover();

    if (fortuneCard) {
      fortuneCard.hidden = true;
    }
    if (emptyState) {
      emptyState.hidden = false;
    }
    if (startRunBtn) {
      startRunBtn.textContent = "Start Run";
    }
    if (runStatusEl) {
      runStatusEl.textContent = "Ready. Press Start Run.";
    }

    updateHud();
    draw();
  }

  function toggleRun() {
    if (hasWon) {
      resetRun();
      return;
    }

    running = !running;
    if (startRunBtn) {
      startRunBtn.textContent = running ? "Pause Run" : "Start Run";
    }
    updateHud();
  }

  if (modeQuickBtn && modeClassicBtn) {
    modeQuickBtn.addEventListener("click", function () {
      setMode("quick");
    });

    modeClassicBtn.addEventListener("click", function () {
      setMode("classic");
    });
  }

  if (themeNeonBtn && themeSoftBtn) {
    themeNeonBtn.addEventListener("click", function () {
      setTheme("neon");
    });

    themeSoftBtn.addEventListener("click", function () {
      setTheme("soft");
    });
  }

  document.addEventListener("keydown", function (event) {
    var key = event.key.toLowerCase();

    if (key === "arrowup" || key === "w") {
      event.preventDefault();
      setDirection("up");
    } else if (key === "arrowdown" || key === "s") {
      event.preventDefault();
      setDirection("down");
    } else if (key === "arrowleft" || key === "a") {
      event.preventDefault();
      setDirection("left");
    } else if (key === "arrowright" || key === "d") {
      event.preventDefault();
      setDirection("right");
    } else if (key === " ") {
      event.preventDefault();
      toggleRun();
    } else if (key === "r") {
      event.preventDefault();
      resetRun();
    } else if (key === "f") {
      event.preventDefault();
      toggleFullscreen();
    } else if (key === "escape" && zoomMode) {
      event.preventDefault();
      setZoomMode(false);
    }
  });

  if (startRunBtn) {
    startRunBtn.addEventListener("click", toggleRun);
  }

  if (resetRunBtn) {
    resetRunBtn.addEventListener("click", resetRun);
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (target && target.id === "toggleFullscreen") {
      event.preventDefault();
      toggleFullscreen();
    }
  });

  if (dpadButtons && dpadButtons.length > 0) {
    dpadButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var dir = btn.getAttribute("data-dir");
        if (dir) {
          setDirection(dir);
          if (!running) {
            toggleRun();
          }
        }
      });
    });
  }

  function pickByTier(weightedPool) {
    var total = weightedPool.reduce(function (sum, item) {
      return sum + item.weight;
    }, 0);
    var roll = Math.random() * total;

    for (var i = 0; i < weightedPool.length; i += 1) {
      roll -= weightedPool[i].weight;
      if (roll <= 0) {
        return weightedPool[i];
      }
    }

    return weightedPool[0];
  }

  function pickFortune() {
    var groups = {
      common: [],
      uncommon: [],
      rare: [],
      epic: [],
      legendary: [],
      mythic: []
    };

    for (var i = 0; i < window.FORTUNE_POOL.length; i += 1) {
      var item = window.FORTUNE_POOL[i];
      groups[item.tier].push(item);
    }

    var weightedTier = pickByTier([
      { tier: "common", weight: 60 },
      { tier: "uncommon", weight: 20 },
      { tier: "rare", weight: 10 },
      { tier: "epic", weight: 6 },
      { tier: "legendary", weight: 3 },
      { tier: "mythic", weight: 1 }
    ]);

    var pickGroup = groups[weightedTier.tier];
    return pickGroup[Math.floor(Math.random() * pickGroup.length)];
  }

  function tierLabel(tier) {
    return tier.toUpperCase() + " FORTUNE";
  }

  function updateShareLinks(payload, fortune) {
    var url = window.location.origin + window.location.pathname + "?victory=1&f=" + encodeURIComponent(String(payload.f)) + "&s=" + encodeURIComponent(String(payload.s)) + "&t=" + encodeURIComponent(payload.t);
    var text = "I beat Maze Snake Fortune and unlocked a " + fortune.tier + " blessing: \"" + fortune.text + "\"";

    shareX.href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url);

    copyLinkBtn.onclick = function () {
      navigator.clipboard.writeText(url).then(function () {
        copyLinkBtn.textContent = "Copied!";
        setTimeout(function () {
          copyLinkBtn.textContent = "Copy Victory Link";
        }, 1200);
      });
    };
  }

  function showFortune(fortune, scoreValue, fromSharedLink) {
    if (!fortune || !fortuneCard || !fortuneTier || !fortuneText || !fortuneMeta || !emptyState) {
      return;
    }

    emptyState.hidden = true;
    fortuneCard.hidden = false;
    fortuneTier.textContent = tierLabel(fortune.tier);
    fortuneText.textContent = fortune.text;
    fortuneMeta.textContent = fromSharedLink
      ? "Recovered from a shared victory link"
      : "Score " + scoreValue + " • Fortune #" + fortune.id;
  }

  function triggerVictory() {
    hasWon = true;
    var fortune = pickFortune();

    var payload = {
      f: fortune.id,
      s: score,
      t: Math.random().toString(36).slice(2, 10)
    };

    showFortune(fortune, score, false);
    updateShareLinks(payload, fortune);
    runFanfare();

    if (runStatusEl) {
      runStatusEl.textContent = "Victory. Your fortune is unlocked and share-ready.";
    }
  }

  function runFanfare() {
    resizeFanfare();
    var confetti = [];

    for (var i = 0; i < 140; i += 1) {
      confetti.push({
        x: Math.random() * fanfareCanvas.width,
        y: -20 - Math.random() * fanfareCanvas.height,
        r: 4 + Math.random() * 6,
        vy: 2 + Math.random() * 3,
        vx: -1 + Math.random() * 2,
        life: 120 + Math.floor(Math.random() * 80),
        c: ["#00e0a4", "#f9c74f", "#ff6b6b", "#9bfffa"][Math.floor(Math.random() * 4)]
      });
    }

    function frame() {
      fanfareCtx.clearRect(0, 0, fanfareCanvas.width, fanfareCanvas.height);

      for (var j = confetti.length - 1; j >= 0; j -= 1) {
        var p = confetti[j];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1;

        fanfareCtx.fillStyle = p.c;
        fanfareCtx.fillRect(p.x, p.y, p.r, p.r);

        if (p.life <= 0 || p.y > fanfareCanvas.height + 24) {
          confetti.splice(j, 1);
        }
      }

      if (confetti.length > 0) {
        requestAnimationFrame(frame);
      } else {
        fanfareCtx.clearRect(0, 0, fanfareCanvas.width, fanfareCanvas.height);
      }
    }

    frame();
  }

  function resizeFanfare() {
    fanfareCanvas.width = window.innerWidth;
    fanfareCanvas.height = window.innerHeight;
  }

  window.addEventListener("resize", resizeBoard);
  window.addEventListener("resize", resizeFanfare);
  document.addEventListener("fullscreenchange", function () {
    syncFullscreenButton();
    resizeBoard();
  });
  document.addEventListener("webkitfullscreenchange", function () {
    syncFullscreenButton();
    resizeBoard();
  });

  function recoverSharedVictory() {
    var params = new URLSearchParams(window.location.search);

    if (params.get("victory") !== "1") {
      return;
    }

    var id = Number(params.get("f"));
    var scoreValue = Number(params.get("s"));
    var item = window.FORTUNE_POOL.find(function (fortune) {
      return fortune.id === id;
    });

    if (item) {
      showFortune(item, scoreValue || 0, true);
      updateShareLinks({ f: item.id, s: scoreValue || 0, t: params.get("t") || "shared" }, item);
      runFanfare();
    }
  }

  resizeBoard();
  resizeFanfare();
  setTheme("neon");
  setMode("quick");
  syncFullscreenButton();
  resetRun();
  recoverSharedVictory();

  function gameLoop() {
    move();
    draw();
    setTimeout(gameLoop, tickSpeed());
  }

  gameLoop();
})();

(() => {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const WIN_LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  const STORE_KEY = "xo-aura-v1";
  const defaults = {
    stats: { games: 0, wins: 0, losses: 0, draws: 0, xp: 0 },
    history: [],
    theme: "nebula",
    mode: "classic",
    difficulty: "hard",
    sound: false,
    effects: true,
  };
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
  } catch {}
  const data = {
    ...defaults,
    ...saved,
    stats: { ...defaults.stats, ...(saved.stats || {}) },
    history: Array.isArray(saved.history) ? saved.history : [],
  };
  let board = Array(9).fill(null),
    current = "X",
    gameOver = false,
    round = 1,
    moveLog = [],
    winningLine = null,
    hintIndex = -1,
    aiTimer = null,
    toastTimer = null,
    audioCtx = null;
  const cells = $$(".cell");
  const statusText = $("#statusText");
  const toastEl = $("#toast");
  const modal = $("#modalBackdrop");

  function makeIcon(name, className = "icon") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    svg.setAttribute("class", className);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    use.setAttribute("href", `#icon-${name}`);
    svg.appendChild(use);
    return svg;
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch {}
  }
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2300);
  }
  function tone(freq = 440, duration = 0.06, type = "sine") {
    if (!data.sound) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(),
        g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.045, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(
        0.001,
        audioCtx.currentTime + duration,
      );
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + duration);
    } catch {}
  }
  function winner(b = board) {
    for (const line of WIN_LINES) {
      const [a, c, d] = line;
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return { mark: b[a], line };
    }
    return null;
  }
  function full(b = board) {
    return b.every(Boolean);
  }
  function available(b) {
    return b.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  }
  function render() {
    const won = winner();
    cells.forEach((cell, i) => {
      cell.classList.remove("x", "o", "winner", "hint");
      cell.textContent = board[i] === "X" ? "×" : board[i] === "O" ? "○" : "";
      if (board[i]) cell.classList.add(board[i].toLowerCase());
      cell.disabled =
        gameOver || !!board[i] || (data.mode !== "two" && current === "O");
      if (won && won.line.includes(i)) cell.classList.add("winner");
      if (i === hintIndex && !gameOver && !board[i]) cell.classList.add("hint");
      cell.setAttribute(
        "aria-label",
        `Row ${Math.floor(i / 3) + 1} column ${(i % 3) + 1}${board[i] ? `, ${board[i]}` : ""}`,
      );
    });
    const lineEl = $("#winLine");
    lineEl.classList.remove("visible");
    if (won) {
      const [a, , c] = won.line;
      const pos = (i) => ({
        x: (i % 3) * 100 + 50,
        y: Math.floor(i / 3) * 100 + 50,
      });
      const p1 = pos(a),
        p2 = pos(c);
      const line = $("line", lineEl);
      line.setAttribute("x1", p1.x);
      line.setAttribute("y1", p1.y);
      line.setAttribute("x2", p2.x);
      line.setAttribute("y2", p2.y);
      requestAnimationFrame(() => lineEl.classList.add("visible"));
    }
    $("#undoBtn").disabled = moveLog.length === 0 || gameOver;
    $("#roundPill").textContent = `ROUND ${String(round).padStart(2, "0")}`;
    $("#opponentName").textContent =
      data.mode === "two" ? "Player Two" : "Computer";
    $("#opponentLabel").textContent =
      data.mode === "two"
        ? "LOCAL PLAYER"
        : data.difficulty === "hard"
          ? "PRO"
          : data.difficulty === "medium"
            ? "MEDIUM"
            : "EASY";
    $("#modeCaption").textContent = {
      classic: "CLASSIC · 3 × 3",
      quick: "QUICK MATCH · 3 × 3",
      zen: "ZEN MODE · 3 × 3",
      two: "LOCAL DUEL · 3 × 3",
    }[data.mode];
    statusText.textContent = gameOver
      ? won
        ? `${won.mark === "X" ? "You win" : (data.mode === "two" ? "Player Two" : "Computer") + " wins"} — game over`
        : "Draw — game over"
      : data.mode !== "two" && current === "O"
        ? "Computer is thinking…"
        : `${current === "X" ? "Your" : "Player Two’s"} turn — make a move`;
  }
  function paintStats() {
    $("#gamesStat").textContent = data.stats.games;
    $("#winsStat").textContent = data.stats.wins;
    $("#lossesStat").textContent = data.stats.losses;
    $("#drawsStat").textContent = data.stats.draws;
    const played = data.stats.games,
      rate = played ? Math.round((data.stats.wins / played) * 100) : 0;
    $("#winRate").textContent = played ? `${rate}%` : "—";
    $("#winRateBar").style.width = `${rate}%`;
    const xp = data.stats.xp,
      level = Math.floor(xp / 500) + 1,
      progress = xp % 500;
    $("#level").textContent = String(level).padStart(2, "0");
    $("#xpLabel").textContent = `${progress} / 500`;
    $("#xpBar").style.width = `${progress / 5}%`;
    const history = $("#historyList");
    history.innerHTML = "";
    if (!data.history.length) {
      history.innerHTML =
        '<div class="empty-history">Your match history will appear here.</div>';
      return;
    }
    data.history.slice(0, 5).forEach((item) => {
      const row = document.createElement("div");
      row.className = "history-row";
      const outcome =
        item.result === "win"
          ? "win"
          : item.result === "loss"
            ? "loss"
            : "draw";
      const opponent = item.opponent === "AURA AI" ? "Computer" : item.opponent;
      const mark = document.createElement("div");
      mark.className = `history-mark ${outcome}`;
      mark.appendChild(makeIcon(outcome, "icon"));

      const details = document.createElement("div");
      const name = document.createElement("b");
      name.textContent = opponent;
      const meta = document.createElement("small");
      meta.textContent = `${item.when} · ${item.mode}`;
      details.append(name, meta);

      const result = document.createElement("span");
      result.className = `result ${outcome}`;
      result.textContent = item.result === "win" ? "Win" : item.result === "loss" ? "Loss" : "Draw";

      const score = document.createElement("span");
      score.className = "score";
      const scoreX = document.createElement("span");
      scoreX.className = "sx";
      scoreX.textContent = "X";
      const scoreO = document.createElement("span");
      scoreO.className = "so";
      scoreO.textContent = "O";
      score.append(scoreX, ` ${item.scoreX} - ${item.scoreO} `, scoreO);
      row.append(mark, details, result, score);
      history.appendChild(row);
    });
  }
  function resetGame(increment = true) {
    clearTimeout(aiTimer);
    if (increment) round++;
    board = Array(9).fill(null);
    current = "X";
    gameOver = false;
    moveLog = [];
    winningLine = null;
    hintIndex = -1;
    modal.hidden = true;
    render();
    tone(330, 0.08);
  }
  function move(index, mark = current) {
    if (gameOver || board[index]) return;
    moveLog.push({ board: [...board], current, mark: index });
    board[index] = mark;
    hintIndex = -1;
    tone(mark === "X" ? 520 : 390, 0.07, mark === "X" ? "triangle" : "sine");
    const won = winner();
    if (won) {
      winningLine = won.line;
      finish(won.mark);
      render();
      return;
    }
    if (full()) {
      finish(null);
      render();
      return;
    }
    current = mark === "X" ? "O" : "X";
    render();
    if (data.mode !== "two" && current === "O")
      aiTimer = setTimeout(aiMove, data.mode === "quick" ? 180 : 420);
  }
  function finish(mark) {
    gameOver = true;
    const result =
      mark === null
        ? "draw"
        : mark === "X"
          ? "win"
          : data.mode === "two"
            ? "loss"
            : "loss";
    data.stats.games++;
    data.stats[
      result === "win" ? "wins" : result === "loss" ? "losses" : "draws"
    ]++;
    if (result === "win") data.stats.xp += 100;
    else if (result === "draw") data.stats.xp += 30;
    else data.stats.xp += 10;
    data.history.unshift({
      result,
      opponent: data.mode === "two" ? "Player Two" : "Computer",
      when: "Just now",
      mode: {
        classic: "Classic",
        quick: "Quick match",
        zen: "Zen",
        two: "Local duel",
      }[data.mode],
      scoreX: mark === "X" ? 1 : 0,
      scoreO: mark === "O" ? 1 : 0,
    });
    data.history = data.history.slice(0, 20);
    persist();
    paintStats();
    tone(result === "win" ? 760 : result === "draw" ? 420 : 220, 0.2, "sine");
    setTimeout(() => showResult(result), 350);
  }
  function showResult(result) {
    const modalUse = $("#modalSymbol use");
    modalUse.setAttribute(
      "href",
      result === "win"
        ? "#icon-win"
        : result === "draw"
          ? "#icon-draw"
          : "#icon-loss",
    );
    $("#modalTitle").textContent =
      result === "win"
        ? "You won."
        : result === "draw"
          ? "It's a draw."
          : "Computer wins.";
    $("#modalMessage").textContent =
      result === "win"
          ? "Nice work. You earned 100 XP."
        : result === "draw"
            ? "Neither side found a winning line. You earned 30 XP."
          : data.mode === "two"
              ? "Player Two takes this game. Play again?"
              : "You earned 10 XP. Try another game?";
    modal.hidden = false;
    $("#modalNewGame").focus();
  }
  function minimax(b, isMax, depth = 0) {
    const w = winner(b);
    if (w) return w.mark === "O" ? 10 - depth : depth - 10;
    if (full(b)) return 0;
    let best = isMax ? -Infinity : Infinity;
    for (const i of available(b)) {
      b[i] = isMax ? "O" : "X";
      const score = minimax(b, !isMax, depth + 1);
      b[i] = null;
      best = isMax ? Math.max(best, score) : Math.min(best, score);
    }
    return best;
  }
  function aiMove() {
    if (gameOver || current !== "O") return;
    const free = available(board);
    if (!free.length) return;
    let chosen;
    if (data.difficulty === "hard") {
      let best = -Infinity;
      free.forEach((i) => {
        board[i] = "O";
        const score = minimax(board, false);
        board[i] = null;
        if (score > best) {
          best = score;
          chosen = i;
        }
      });
    } else if (data.difficulty === "medium") {
      const shouldThink = Math.random() < 0.65;
      if (shouldThink) {
        let best = -Infinity;
        free.forEach((i) => {
          board[i] = "O";
          const score = minimax(board, false);
          board[i] = null;
          if (score > best) {
            best = score;
            chosen = i;
          }
        });
      } else chosen = free[Math.floor(Math.random() * free.length)];
    } else chosen = free[Math.floor(Math.random() * free.length)];
    move(chosen, "O");
  }
  function hint() {
    if (
      gameOver ||
      current !== "X" ||
      (data.mode === "two" && current === "O")
    ) {
      toast("Hints are available on your turn.");
      return;
    }
    const free = available(board);
    if (!free.length) return;
    let chosen = free[0],
      best = -Infinity;
    free.forEach((i) => {
      board[i] = "X";
      const score = minimax(board, false);
      board[i] = null;
      if (score > best) {
        best = score;
        chosen = i;
      }
    });
    hintIndex = chosen;
    render();
    toast(
      `Suggested move: row ${Math.floor(chosen / 3) + 1}, column ${(chosen % 3) + 1}`,
    );
    tone(680, 0.09);
    setTimeout(() => {
      if (hintIndex === chosen) {
        hintIndex = -1;
        render();
      }
    }, 2600);
  }
  function undo() {
    if (!moveLog.length || gameOver) return;
    clearTimeout(aiTimer);
    const steps = data.mode !== "two" && moveLog.length >= 2 ? 2 : 1;
    let state;
    for (let i = 0; i < steps; i++) state = moveLog.pop();
    if (state) {
      board = [...state.board];
      current = state.current;
      gameOver = false;
      hintIndex = -1;
      render();
      toast("Last move undone.");
    }
  }
  $$(".topnav a, .brand").forEach((link) =>
    link.addEventListener("click", (event) => {
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      history.pushState(null, "", link.hash);
      const activeLink = link.classList.contains("brand")
        ? $('.topnav a[href="#game"]')
        : link;
      $$(".topnav a").forEach((navLink) => {
        const active = navLink === activeLink;
        navLink.classList.toggle("nav-active", active);
        if (active) navLink.setAttribute("aria-current", "location");
        else navLink.removeAttribute("aria-current");
      });
      const top =
        target.id === "pageTop"
          ? 0
          : window.scrollY +
            target.getBoundingClientRect().top -
            $(".topbar").getBoundingClientRect().height -
            14;
      const reduceMotion =
        document.body.classList.contains("reduced-effects") ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({
        top: Math.max(0, top),
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }),
  );
  cells.forEach((cell) =>
    cell.addEventListener("click", () => {
      const i = Number(cell.dataset.cell);
      if (!gameOver && !board[i] && (data.mode === "two" || current === "X"))
        move(i);
    }),
  );
  $("#newGame").addEventListener("click", () => resetGame(true));
  $("#promoPlay").addEventListener("click", () => {
    resetGame(true);
    $("#game").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("#undoBtn").addEventListener("click", undo);
  $("#hintBtn").addEventListener("click", hint);
  $("#modalNewGame").addEventListener("click", () => resetGame(true));
  $("#modalDismiss").addEventListener("click", () => (modal.hidden = true));
  $("#modalClose").addEventListener("click", () => (modal.hidden = true));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.hidden = true;
  });
  $$(".mode-card").forEach((btn) =>
    btn.addEventListener("click", () => {
      data.mode = btn.dataset.mode;
      $$(".mode-card").forEach((b) => b.classList.toggle("active", b === btn));
      persist();
      resetGame(false);
      toast(`${btn.querySelector("b").textContent} selected`);
    }),
  );
  $$("#difficulty button").forEach((btn) =>
    btn.addEventListener("click", () => {
      data.difficulty = btn.dataset.difficulty;
      $$("#difficulty button").forEach((b) =>
        b.classList.toggle("active", b === btn),
      );
      $("#difficultyValue").textContent = {
        easy: "EASY",
        medium: "MEDIUM",
        hard: "PRO",
      }[data.difficulty];
      $("#opponentLabel").textContent =
        data.mode === "two"
          ? "LOCAL PLAYER"
          : data.difficulty === "hard"
            ? "PRO"
            : data.difficulty === "medium"
              ? "MEDIUM"
              : "EASY";
      persist();
      toast(`Computer level: ${btn.textContent}`);
    }),
  );
  const themes = ["nebula", "arctic", "matrix", "ember", "ultraviolet"];
  function setTheme(theme) {
    data.theme = theme;
    document.body.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      .setAttribute(
        "content",
        getComputedStyle(document.body).getPropertyValue("--bg").trim(),
      );
    $$(".theme-swatch").forEach((b) =>
      b.classList.toggle("active", b.dataset.theme === theme),
    );
    persist();
  }
  $$(".theme-swatch").forEach((btn) =>
    btn.addEventListener("click", () => setTheme(btn.dataset.theme)),
  );
  $("#cycleTheme").addEventListener("click", () => {
    const i = (themes.indexOf(data.theme) + 1) % themes.length;
    setTheme(themes[i]);
    toast(`${themes[i][0].toUpperCase() + themes[i].slice(1)} theme activated`);
  });
  $("#soundToggle").addEventListener("click", () => {
    data.sound = !data.sound;
    $("#soundToggle").classList.toggle("active", data.sound);
    $("#soundToggle").setAttribute("aria-pressed", String(data.sound));
    $("#soundIcon use").setAttribute(
      "href",
      data.sound ? "#icon-sound-on" : "#icon-sound-off",
    );
    persist();
    if (data.sound) tone(660, 0.08);
    toast(data.sound ? "Sound enabled" : "Sound muted");
  });
  $("#themeToggle").addEventListener("click", () => {
    data.effects = !data.effects;
    document.body.classList.toggle("reduced-effects", !data.effects);
    $("#themeToggle").setAttribute("aria-label", "Toggle reduced motion");
    $("#themeToggle").title = "Toggle reduced motion";
    $("#themeToggle").setAttribute("aria-pressed", String(!data.effects));
    $("#motionIcon use").setAttribute(
      "href",
      data.effects ? "#icon-motion" : "#icon-motion-off",
    );
    persist();
    toast(data.effects ? "Motion enabled" : "Reduced motion enabled");
  });
  $("#clearHistory").addEventListener("click", () => {
    if (!data.history.length) {
      toast("No match history to clear.");
      return;
    }
    data.history = [];
    persist();
    paintStats();
    toast("Match history cleared.");
  });
  $("#premiumBtn").addEventListener("click", () =>
    toast("AURA PLUS is a visual concept — all game modes are free."),
  );
  document.addEventListener("keydown", (e) => {
    if (
      e.key.toLowerCase() === "h" &&
      !/input|textarea/i.test(document.activeElement.tagName)
    )
      hint();
    if (e.key === "Escape") modal.hidden = true;
    if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey)
      resetGame(true);
  });
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    document.body.classList.add("reduced-effects");
  setTheme(data.theme);
  $$(".mode-card").forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === data.mode),
  );
  $$("#difficulty button").forEach((b) =>
    b.classList.toggle("active", b.dataset.difficulty === data.difficulty),
  );
  $("#difficultyValue").textContent = {
    easy: "EASY",
    medium: "MEDIUM",
    hard: "PRO",
  }[data.difficulty];
  $("#soundToggle").setAttribute("aria-pressed", String(data.sound));
  $("#soundIcon use").setAttribute(
    "href",
    data.sound ? "#icon-sound-on" : "#icon-sound-off",
  );
  document.body.classList.toggle("reduced-effects", !data.effects);
  $("#themeToggle").setAttribute("aria-label", "Toggle reduced motion");
  $("#themeToggle").title = "Toggle reduced motion";
  $("#themeToggle").setAttribute("aria-pressed", String(!data.effects));
  $("#motionIcon use").setAttribute(
    "href",
    data.effects ? "#icon-motion" : "#icon-motion-off",
  );
  paintStats();
  render();
})();

(() => {
  const STORAGE_KEY = "skct-practice-v1";
  const RECORDS_KEY = "skct-practice-records-v1";
  const SECTION_SIZE = 20;
  const SECTIONS = [
    { id: "lang", name: "언어이해" },
    { id: "data", name: "자료해석" },
    { id: "math", name: "창의수리" },
    { id: "verbal", name: "언어추리" },
    { id: "seq", name: "수열추리" },
  ];

  const emptyAnswers = () =>
    Object.fromEntries(SECTIONS.map((s) => [s.id, {}]));

  const defaultState = () => ({
    answers: emptyAnswers(),
    section: "lang",
    omrOpen: true,
    note: "",
    paint: "",
    paintColor: "#111827",
    paintWidth: 3,
    eraser: false,
    examMode: true,
    examIndex: 0,
    timerMinutes: 15,
    remainingMs: 15 * 60 * 1000,
    running: false,
    lastTick: null,
    sound: true,
    hideHelp: false,
    calcExpr: "",
    calcValue: "0",
    calcOverwrite: true,
    answerKeys: Object.fromEntries(SECTIONS.map((s) => [s.id, ""])),
  });

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  let state = load();
  let paintCtx = null;
  let drawing = false;
  let lastPoint = null;
  let undoStack = [];
  let saveTimer = null;
  let clock = null;

  const els = {
    workspace: $(".workspace"),
    omrPanel: $("#omr-panel"),
    omrList: $("#omr-list"),
    omrFilled: $("#omr-filled"),
    omrAllFilled: $("#omr-all-filled"),
    omrSections: $("#omr-sections"),
    omrToggle: $("#omr-toggle"),
    notepad: $("#notepad"),
    paint: $("#paint"),
    paintWrap: $("#paint-wrap"),
    paintTools: $("#paint-tools"),
    strokeWidth: $("#stroke-width"),
    eraserBtn: $("#eraser-btn"),
    timerNow: $("#timer-now"),
    timerTotal: $("#timer-total"),
    timerFace: $("#timer-face"),
    timerToggle: $("#timer-toggle"),
    examSubject: $("#exam-subject"),
    examStep: $("#exam-step"),
    examOverall: $("#exam-overall"),
    calcExpr: $("#calc-expr"),
    calcValue: $("#calc-value"),
    helpModal: $("#help-modal"),
    finishModal: $("#finish-modal"),
    finishMessage: $("#finish-message"),
    gradeModal: $("#grade-modal"),
    gradeIntro: $("#grade-intro"),
    gradeKeys: $("#grade-keys"),
    gradeSummary: $("#grade-summary"),
    gradeDetail: $("#grade-detail"),
    sectionToast: $("#section-toast"),
    recordName: $("#record-name"),
    recordSaveMsg: $("#record-save-msg"),
    recordsModal: $("#records-modal"),
    recordsList: $("#records-list"),
    recordsLead: $("#records-lead"),
    loginBtn: $("#login-btn"),
    logoutBtn: $("#logout-btn"),
    userChip: $("#user-chip"),
    userPhoto: $("#user-photo"),
    userName: $("#user-name"),
  };

  let currentUser = null;
  let cloudRecords = [];

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const raw = { ...defaultState(), ...parsed };
      raw.answers = normalizeAnswers(raw.answers);
      if (!SECTIONS.some((s) => s.id === raw.section)) raw.section = "lang";
      raw.answerKeys = { ...defaultState().answerKeys, ...(raw.answerKeys || {}) };
      raw.examMode = true;
      raw.timerMinutes = 15;
      raw.examIndex = Number.isInteger(raw.examIndex)
        ? Math.min(Math.max(raw.examIndex, 0), SECTIONS.length - 1)
        : 0;
      if (parsed.examMode !== true || Number(parsed.remainingMs) > 15 * 60 * 1000) {
        raw.examIndex = 0;
        raw.section = SECTIONS[0].id;
        raw.remainingMs = 15 * 60 * 1000;
        raw.running = false;
        raw.lastTick = null;
      }
      return raw;
    } catch {
      return defaultState();
    }
  }

  function normalizeAnswers(raw) {
    const next = emptyAnswers();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return next;
    if (SECTIONS.some((s) => raw[s.id] && typeof raw[s.id] === "object")) {
      SECTIONS.forEach((s) => {
        next[s.id] = { ...(raw[s.id] || {}) };
      });
      return next;
    }
    Object.entries(raw).forEach(([key, value]) => {
      const n = Number(key);
      if (!n || n < 1) return;
      const idx = Math.floor((n - 1) / SECTION_SIZE);
      const local = ((n - 1) % SECTION_SIZE) + 1;
      if (SECTIONS[idx]) next[SECTIONS[idx].id][local] = value;
    });
    return next;
  }

  function sectionAnswers() {
    if (!state.answers[state.section] || typeof state.answers[state.section] !== "object") {
      state.answers[state.section] = {};
    }
    return state.answers[state.section];
  }

  function currentSection() {
    return SECTIONS.find((s) => s.id === state.section) || SECTIONS[0];
  }

  function persist() {
    const snapshot = {
      ...state,
      running: false,
      lastTick: null,
      remainingMs: state.running
        ? Math.max(0, state.remainingMs - (Date.now() - (state.lastTick || Date.now())))
        : state.remainingMs,
      paint: els.paint.width ? els.paint.toDataURL("image/png") : state.paint,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      try {
        snapshot.paint = "";
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      } catch {
        /* ignore quota */
      }
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 250);
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}분 ${String(s).padStart(2, "0")}초`;
  }

  function examElapsedMs() {
    const usedInSection = 15 * 60 * 1000 - state.remainingMs;
    return state.examIndex * 15 * 60 * 1000 + Math.max(0, usedInSection);
  }

  function renderTimer() {
    const idx = Math.min(state.examIndex, SECTIONS.length - 1);
    const name = SECTIONS[idx].name;
    els.timerNow.textContent = formatTime(state.remainingMs);
    els.timerTotal.textContent = "/ 15분";
    if (els.examSubject) els.examSubject.textContent = name;
    if (els.examStep) els.examStep.textContent = `${idx + 1} / 5`;
    if (els.examOverall) {
      els.examOverall.textContent = `전체 ${formatTime(examElapsedMs())} / 75분`;
    }
    els.timerToggle.textContent = state.running ? "정지" : "시작";
    els.timerFace.classList.toggle("is-warn", state.remainingMs <= 60_000 && state.remainingMs > 0);
    els.timerFace.classList.toggle("is-over", state.remainingMs <= 0);
  }

  function armExam(fromStart = true) {
    state.examMode = true;
    state.timerMinutes = 15;
    if (fromStart) {
      state.examIndex = 0;
      state.section = SECTIONS[0].id;
    } else {
      const idx = SECTIONS.findIndex((s) => s.id === state.section);
      state.examIndex = idx >= 0 ? idx : 0;
      state.section = SECTIONS[state.examIndex].id;
    }
    state.remainingMs = 15 * 60 * 1000;
    state.running = false;
    state.lastTick = null;
    stopClock();
    renderOMR();
    renderTimer();
    persist();
  }

  function showToast(text) {
    if (!els.sectionToast) return;
    els.sectionToast.hidden = false;
    els.sectionToast.textContent = text;
    clearTimeout(showToast.hideTimer);
    showToast.hideTimer = setTimeout(() => {
      els.sectionToast.hidden = true;
    }, 4000);
  }

  function onSectionTimeUp() {
    const next = state.examIndex + 1;
    if (next >= SECTIONS.length) {
      beep("finish");
      state.running = false;
      state.remainingMs = 0;
      state.lastTick = null;
      stopClock();
      renderTimer();
      persist();
      document.title = "종료 · SKCT 연습창";
      if (els.gradeIntro) {
        els.gradeIntro.textContent =
          "5과목이 모두 끝났습니다. 각 과목 정답 20개를 붙여 넣고 전체 채점을 누르세요.";
      }
      openGradeModal(true);
      return;
    }
    beep("section");
    state.examIndex = next;
    state.section = SECTIONS[next].id;
    state.remainingMs = 15 * 60 * 1000;
    state.lastTick = Date.now();
    renderOMR();
    renderTimer();
    persist();
    const name = SECTIONS[next].name;
    document.title = `${name} · SKCT 연습창`;
    showToast(`15분 종료. ${name}으로 넘어갑니다.`);
  }

  function tick() {
    if (!state.running) return;
    const now = Date.now();
    state.remainingMs = Math.max(0, state.remainingMs - (now - state.lastTick));
    state.lastTick = now;
    renderTimer();
    if (state.remainingMs <= 0) {
      if (state.examMode) {
        onSectionTimeUp();
      } else {
        state.running = false;
        stopClock();
        persist();
        if (state.sound) beep("section");
      }
    }
  }

  function startClock() {
    stopClock();
    clock = setInterval(tick, 200);
  }

  function stopClock() {
    clearInterval(clock);
    clock = null;
  }

  let audioCtx = null;

  function ensureAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(ctx, freq, start, dur, vol = 0.22) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function beep(kind = "section") {
    const ctx = ensureAudio();
    if (!ctx) return;
    const play = () => {
      const t = ctx.currentTime;
      if (kind === "start") {
        tone(ctx, 740, t, 0.12, 0.12);
        return;
      }
      if (kind === "finish") {
        tone(ctx, 660, t, 0.35);
        tone(ctx, 880, t + 0.38, 0.35);
        tone(ctx, 1100, t + 0.76, 0.55);
        return;
      }
      tone(ctx, 880, t, 0.28);
      tone(ctx, 880, t + 0.38, 0.28);
      tone(ctx, 660, t + 0.76, 0.45);
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  }

  function renderSectionButtons() {
    const frag = document.createDocumentFragment();
    SECTIONS.forEach((sec) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "omr-sec";
      btn.dataset.section = sec.id;
      if (sec.id === state.section) btn.classList.add("is-active");
      const filled = Object.values(state.answers[sec.id] || {}).filter(Boolean).length;
      btn.innerHTML = `<span>${sec.name}</span><em>${filled}/20</em>`;
      frag.appendChild(btn);
    });
    els.omrSections.replaceChildren(frag);
  }

  function renderOMR() {
    els.workspace.classList.toggle("omr-hidden", !state.omrOpen);
    els.omrToggle.textContent = state.omrOpen ? "OMR숨김" : "OMR";
    renderSectionButtons();

    const answers = sectionAnswers();
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= SECTION_SIZE; i += 1) {
      const row = document.createElement("div");
      row.className = "omr-row";
      row.dataset.q = String(i);
      const num = document.createElement("div");
      num.className = "omr-num";
      num.textContent = String(i);
      const choices = document.createElement("div");
      choices.className = "omr-choices";
      for (let c = 1; c <= 5; c += 1) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "omr-choice";
        btn.textContent = String(c);
        btn.dataset.choice = String(c);
        if (Number(answers[i]) === c) btn.classList.add("is-on");
        choices.appendChild(btn);
      }
      row.append(num, choices);
      frag.appendChild(row);
    }
    els.omrList.replaceChildren(frag);
    updateFilled();
  }

  function updateFilled() {
    const current = Object.values(sectionAnswers()).filter(Boolean).length;
    const all = SECTIONS.reduce(
      (sum, sec) => sum + Object.values(state.answers[sec.id] || {}).filter(Boolean).length,
      0
    );
    els.omrFilled.textContent = String(current);
    if (els.omrAllFilled) els.omrAllFilled.textContent = String(all);
    renderSectionButtons();
  }

  function setupPaint() {
    const canvas = els.paint;
    const wrap = els.paintWrap;
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const snapshot = state.paint;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    paintCtx = canvas.getContext("2d");
    paintCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintCtx.lineCap = "round";
    paintCtx.lineJoin = "round";
    paintCtx.fillStyle = "#ffffff";
    paintCtx.fillRect(0, 0, rect.width, rect.height);

    if (snapshot) {
      const img = new Image();
      img.onload = () => paintCtx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = snapshot;
    }
    applyPaintStyle();
  }

  function applyPaintStyle() {
    if (!paintCtx) return;
    paintCtx.strokeStyle = state.eraser ? "#ffffff" : state.paintColor;
    paintCtx.lineWidth = state.eraser ? Math.max(8, state.paintWidth * 3) : state.paintWidth;
    els.paint.classList.toggle("is-eraser", state.eraser);
    els.eraserBtn.classList.toggle("is-active", state.eraser);
    els.strokeWidth.value = String(state.paintWidth);
    $$(".swatch").forEach((s) => s.classList.toggle("is-active", s.dataset.color === state.paintColor && !state.eraser));
  }

  function pointFromEvent(e) {
    const rect = els.paint.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function pushUndo() {
    try {
      undoStack.push(els.paint.toDataURL("image/png"));
      if (undoStack.length > 30) undoStack.shift();
    } catch {
      /* ignore quota */
    }
  }

  function startDraw(e) {
    if (els.paintWrap.hidden) return;
    e.preventDefault();
    drawing = true;
    lastPoint = pointFromEvent(e);
    pushUndo();
    paintCtx.beginPath();
    paintCtx.moveTo(lastPoint.x, lastPoint.y);
    paintCtx.lineTo(lastPoint.x + 0.01, lastPoint.y);
    paintCtx.stroke();
  }

  function moveDraw(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = pointFromEvent(e);
    paintCtx.beginPath();
    paintCtx.moveTo(lastPoint.x, lastPoint.y);
    paintCtx.lineTo(p.x, p.y);
    paintCtx.stroke();
    lastPoint = p;
  }

  function endDraw() {
    if (!drawing) return;
    drawing = false;
    lastPoint = null;
    state.paint = els.paint.toDataURL("image/png");
    scheduleSave();
  }

  function setMode(mode) {
    const note = mode === "note";
    els.notepad.hidden = !note;
    els.paintWrap.hidden = note;
    els.paintTools.hidden = note;
    $$(".mode-btn").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.mode === mode));
    if (!note) {
      els.notepad.blur();
      requestAnimationFrame(setupPaint);
    }
  }

  function tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
      const ch = expr[i];
      if (ch === " ") {
        i += 1;
        continue;
      }
      if ("+-×÷*/()%".includes(ch)) {
        const unary =
          (ch === "+" || ch === "-") &&
          (tokens.length === 0 || ["+", "-", "×", "÷", "*", "/", "("].includes(tokens[tokens.length - 1]));
        tokens.push(unary && ch === "-" ? "u-" : unary && ch === "+" ? "u+" : ch);
        i += 1;
        continue;
      }
      if ((ch >= "0" && ch <= "9") || ch === ".") {
        let num = ch;
        i += 1;
        while (i < expr.length && ((expr[i] >= "0" && expr[i] <= "9") || expr[i] === ".")) {
          num += expr[i];
          i += 1;
        }
        tokens.push(num);
        continue;
      }
      throw new Error("잘못된 수식");
    }
    return tokens;
  }

  function toRPN(tokens) {
    const out = [];
    const ops = [];
    const prec = { "u+": 5, "u-": 5, "%": 4, "×": 3, "÷": 3, "*": 3, "/": 3, "+": 2, "-": 2 };
    const right = new Set(["u+", "u-", "%"]);
    for (const t of tokens) {
      if (!Number.isNaN(Number(t))) {
        out.push(t);
      } else if (t === "(") {
        ops.push(t);
      } else if (t === ")") {
        while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop());
        if (ops.pop() !== "(") throw new Error("괄호 오류");
      } else {
        while (
          ops.length &&
          ops[ops.length - 1] !== "(" &&
          (prec[ops[ops.length - 1]] > prec[t] ||
            (prec[ops[ops.length - 1]] === prec[t] && !right.has(t)))
        ) {
          out.push(ops.pop());
        }
        ops.push(t);
      }
    }
    while (ops.length) {
      const op = ops.pop();
      if (op === "(" || op === ")") throw new Error("괄호 오류");
      out.push(op);
    }
    return out;
  }

  function evalRPN(rpn) {
    const st = [];
    for (const t of rpn) {
      if (!Number.isNaN(Number(t))) {
        st.push(Number(t));
        continue;
      }
      if (t === "u-") {
        st.push(-st.pop());
        continue;
      }
      if (t === "u+") {
        st.push(+st.pop());
        continue;
      }
      if (t === "%") {
        st.push(st.pop() / 100);
        continue;
      }
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) throw new Error("수식 오류");
      if (t === "+" ) st.push(a + b);
      else if (t === "-") st.push(a - b);
      else if (t === "×" || t === "*") st.push(a * b);
      else if (t === "÷" || t === "/") {
        if (b === 0) throw new Error("0으로 나눌 수 없음");
        st.push(a / b);
      }
    }
    if (st.length !== 1) throw new Error("수식 오류");
    return st[0];
  }

  function formatNumber(n) {
    if (!Number.isFinite(n)) return "Error";
    const rounded = Math.round(n * 1e12) / 1e12;
    return String(rounded);
  }

  function renderCalc() {
    els.calcExpr.textContent = state.calcExpr;
    els.calcValue.textContent = state.calcValue;
  }

  function inputCalc(key) {
    const ops = new Set(["+", "-", "×", "÷"]);
    if (key === "AC") {
      state.calcExpr = "";
      state.calcValue = "0";
      state.calcOverwrite = true;
    } else if (key === "C") {
      if (!state.calcOverwrite && state.calcValue.length > 1) {
        state.calcValue = state.calcValue.slice(0, -1);
      } else {
        state.calcValue = "0";
        state.calcOverwrite = true;
      }
    } else if (key === "±") {
      if (state.calcValue.startsWith("-")) state.calcValue = state.calcValue.slice(1);
      else if (state.calcValue !== "0") state.calcValue = `-${state.calcValue}`;
    } else if (key === "%") {
      state.calcValue = formatNumber(Number(state.calcValue) / 100);
      state.calcOverwrite = true;
    } else if (key === "=") {
      try {
        const expr = (state.calcExpr + state.calcValue).replace(/×/g, "×").replace(/÷/g, "÷");
        const result = evalRPN(toRPN(tokenize(expr)));
        state.calcExpr = "";
        state.calcValue = formatNumber(result);
        state.calcOverwrite = true;
      } catch (err) {
        state.calcValue = err.message;
        state.calcOverwrite = true;
      }
    } else if (ops.has(key)) {
      if (!state.calcOverwrite || state.calcValue === "Error" || state.calcValue.includes("오류") || state.calcValue.includes("없음")) {
        state.calcExpr += state.calcValue + key;
      } else if (state.calcExpr && ops.has(state.calcExpr.slice(-1))) {
        state.calcExpr = state.calcExpr.slice(0, -1) + key;
      } else {
        state.calcExpr += (state.calcExpr ? "" : state.calcValue) + key;
      }
      state.calcOverwrite = true;
    } else if (key === "(" || key === ")") {
      state.calcExpr += (state.calcOverwrite ? "" : state.calcValue) + key;
      if (!state.calcOverwrite) {
        state.calcValue = "0";
        state.calcOverwrite = true;
      }
    } else if (key === ".") {
      if (state.calcOverwrite) {
        state.calcValue = "0.";
        state.calcOverwrite = false;
      } else if (!state.calcValue.includes(".")) {
        state.calcValue += ".";
      }
    } else {
      if (state.calcOverwrite) {
        state.calcValue = key;
        state.calcOverwrite = false;
      } else {
        state.calcValue = state.calcValue === "0" ? key : state.calcValue + key;
      }
    }
    renderCalc();
    scheduleSave();
  }

  function typingInField() {
    const el = document.activeElement;
    return el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT");
  }

  function parseAnswerKey(raw) {
    return [...String(raw || "")].map(Number).filter((n) => n >= 1 && n <= 5);
  }

  function keyHint(length) {
    if (!length) return { cls: "", text: "0 / 20" };
    if (length < SECTION_SIZE) {
      return { cls: "is-error", text: "답안이 모두 입력되지 않았습니다." };
    }
    if (length > SECTION_SIZE) {
      return { cls: "is-warn", text: `답안이 20개를 넘었습니다. (${length}개)` };
    }
    return { cls: "is-ok", text: "20 / 20" };
  }

  function paintKeyHint(area) {
    const hint = area.parentElement.querySelector(".key-hint");
    if (!hint) return;
    const { cls, text } = keyHint(parseAnswerKey(area.value).length);
    hint.className = `key-hint ${cls}`.trim();
    hint.textContent = text;
  }

  function evaluateSection(id, keyRaw) {
    const key = parseAnswerKey(keyRaw);
    const answers = state.answers[id] || {};
    const items = [];
    let correct = 0;
    let wrongMarked = 0;
    let blank = 0;
    let marked = 0;
    for (let q = 1; q <= SECTION_SIZE; q += 1) {
      const mine = Number(answers[q] || 0);
      if (mine) marked += 1;
      const ans = key[q - 1];
      let status = "nokey";
      if (ans >= 1 && ans <= 5) {
        if (!mine) {
          status = "blank";
          blank += 1;
        } else if (mine === ans) {
          status = "correct";
          correct += 1;
        } else {
          status = "wrong";
          wrongMarked += 1;
        }
      }
      items.push({ q, mine, ans: ans >= 1 && ans <= 5 ? ans : 0, status });
    }
    return { correct, wrongMarked, blank, marked, keyed: key.length, items };
  }

  function collectKeysFromForm() {
    if (!state.answerKeys) state.answerKeys = defaultState().answerKeys;
    $$("#grade-keys textarea[data-section]").forEach((area) => {
      state.answerKeys[area.dataset.section] = area.value;
    });
  }

  function renderGradeKeys() {
    if (!els.gradeKeys) return;
    if (!state.answerKeys) state.answerKeys = defaultState().answerKeys;
    els.gradeKeys.innerHTML = SECTIONS.map(
      (sec) => `
        <label class="grade-key-block">
          <span class="field-label">${sec.name} 정답</span>
          <textarea data-section="${sec.id}" rows="2" placeholder="예: 12345214...">${
            state.answerKeys[sec.id] || ""
          }</textarea>
          <span class="key-hint">0 / 20</span>
        </label>`
    ).join("");
    els.gradeKeys.querySelectorAll("textarea[data-section]").forEach(paintKeyHint);
  }

  function applyOmrHighlight(result) {
    $$(".omr-row").forEach((row) => {
      row.classList.remove("is-correct", "is-wrong");
      const item = result.items.find((it) => it.q === Number(row.dataset.q));
      if (!item) return;
      if (item.status === "correct") row.classList.add("is-correct");
      if (item.status === "wrong" || item.status === "blank") row.classList.add("is-wrong");
    });
  }

  function showSectionDetail(id) {
    collectKeysFromForm();
    const sec = SECTIONS.find((s) => s.id === id);
    const result = evaluateSection(id, state.answerKeys[id] || "");
    state.section = id;
    renderOMR();
    applyOmrHighlight(result);
    const rows = result.items
      .map((it) => {
        const label =
          it.status === "correct"
            ? "맞음"
            : it.status === "wrong"
              ? "틀림"
              : it.status === "blank"
                ? "미표기"
                : "정답없음";
        const cls =
          it.status === "correct" ? "ok" : it.status === "wrong" || it.status === "blank" ? "bad" : "mute";
        const mine = it.mine || "-";
        const ans = it.ans || "-";
        return `<li class="${cls}"><strong>${it.q}</strong> ${label} · 내 답 ${mine} / 정답 ${ans}</li>`;
      })
      .join("");
    els.gradeDetail.hidden = false;
    els.gradeDetail.innerHTML = `
      <div class="grade-detail-head">
        <strong>${sec.name}</strong>
        맞음 ${result.correct} · 틀림 ${result.wrongMarked} · 미표기 ${result.blank}
      </div>
      <ol class="grade-detail-list">${rows}</ol>`;
    els.gradeDetail.scrollIntoView({ block: "nearest" });
  }

  function firebaseReady() {
    const cfg = window.FIREBASE_CONFIG || {};
    return Boolean(window.firebase && cfg.apiKey && cfg.projectId);
  }

  function initFirebase() {
    if (!firebaseReady() || firebase.apps.length) {
      renderAuth();
      return;
    }
    firebase.initializeApp(window.FIREBASE_CONFIG);
    firebase.auth().onAuthStateChanged(async (user) => {
      currentUser = user;
      renderAuth();
      if (user) {
        try {
          cloudRecords = await fetchCloudRecords();
          await maybeMigrateLocalRecords();
        } catch (err) {
          console.warn(err);
        }
      } else {
        cloudRecords = [];
      }
    });
  }

  function renderAuth() {
    const ready = firebaseReady();
    if (els.loginBtn) els.loginBtn.hidden = !ready || Boolean(currentUser);
    if (els.userChip) els.userChip.hidden = !currentUser;
    if (currentUser) {
      if (els.userName) els.userName.textContent = currentUser.displayName || currentUser.email || "로그인됨";
      if (els.userPhoto) {
        els.userPhoto.hidden = !currentUser.photoURL;
        els.userPhoto.src = currentUser.photoURL || "";
      }
    }
    if (els.recordsLead) {
      if (!ready) {
        els.recordsLead.textContent =
          "지금은 이 브라우저에만 저장됩니다. Firebase를 연결하면 구글 로그인으로 기록이 계정에 남습니다.";
      } else if (!currentUser) {
        els.recordsLead.textContent =
          "구글 로그인하면 기록이 계정에 남아 다른 컴퓨터에서도 볼 수 있습니다. 로그인 전에는 이 브라우저에만 남습니다.";
      } else {
        els.recordsLead.textContent = `${currentUser.displayName || "계정"}에 저장된 회차입니다. 이름을 눌러 불러오세요.`;
      }
    }
  }

  function recordsRef() {
    return firebase.firestore().collection("users").doc(currentUser.uid).collection("records");
  }

  async function fetchCloudRecords() {
    if (!currentUser) return [];
    const snap = await recordsRef().orderBy("savedAt", "desc").get();
    cloudRecords = snap.docs.map((doc) => doc.data());
    return cloudRecords;
  }

  async function maybeMigrateLocalRecords() {
    const local = loadLocalRecords();
    if (!local.length || !currentUser) return;
    const flag = `skct-migrated-${currentUser.uid}`;
    if (localStorage.getItem(flag)) return;
    if (!confirm("이 브라우저에 있는 회차 기록을 구글 계정에도 올릴까요?")) {
      localStorage.setItem(flag, "1");
      return;
    }
    for (const rec of local) {
      await recordsRef().doc(rec.id).set(rec);
    }
    localStorage.setItem(flag, "1");
    cloudRecords = await fetchCloudRecords();
  }

  async function signInGoogle() {
    if (!firebaseReady()) {
      alert("아직 구글 로그인이 연결되지 않았습니다. 관리자가 Firebase 설정을 넣어야 합니다.");
      return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await firebase.auth().signInWithPopup(provider);
  }

  async function signOutGoogle() {
    if (firebaseReady()) await firebase.auth().signOut();
  }

  function loadLocalRecords() {
    try {
      const list = JSON.parse(localStorage.getItem(RECORDS_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function persistRecords(list) {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(list));
  }

  function recordsForUi() {
    return currentUser ? cloudRecords : loadLocalRecords();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function formatSavedAt(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function currentScoreSnapshot() {
    const reports = SECTIONS.map((sec) => ({
      id: sec.id,
      name: sec.name,
      ...evaluateSection(sec.id, (state.answerKeys && state.answerKeys[sec.id]) || ""),
    }));
    return {
      totalCorrect: reports.reduce((n, r) => n + r.correct, 0),
      totalMarked: reports.reduce((n, r) => n + r.marked, 0),
      totalKeyed: reports.reduce((n, r) => n + Math.min(r.keyed, SECTION_SIZE), 0),
      bySubject: reports.map((r) => ({
        id: r.id,
        name: r.name,
        correct: r.correct,
        marked: r.marked,
      })),
    };
  }

  function showRecordMsg(text, ok) {
    if (!els.recordSaveMsg) return;
    els.recordSaveMsg.hidden = !text;
    els.recordSaveMsg.textContent = text || "";
    els.recordSaveMsg.className = `record-save-msg ${ok ? "is-ok" : "is-error"}`;
  }

  async function saveCurrentRecord() {
    collectKeysFromForm();
    const name = (els.recordName && els.recordName.value.trim()) || "";
    if (!name) {
      showRecordMsg("저장명을 입력하세요.", false);
      els.recordName && els.recordName.focus();
      return;
    }
    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      savedAt: new Date().toISOString(),
      answers: JSON.parse(JSON.stringify(state.answers || emptyAnswers())),
      answerKeys: { ...defaultState().answerKeys, ...(state.answerKeys || {}) },
      note: state.note || "",
      score: currentScoreSnapshot(),
    };
    try {
      const list = loadLocalRecords();
      list.unshift(record);
      persistRecords(list);
      if (currentUser) {
        await recordsRef().doc(record.id).set(record);
        cloudRecords = [record, ...cloudRecords.filter((r) => r.id !== record.id)];
        showRecordMsg(`「${name}」을 계정에 저장했습니다. 다른 기기에서도 볼 수 있습니다.`, true);
      } else if (firebaseReady()) {
        showRecordMsg(`「${name}」을 이 브라우저에 저장했습니다. 구글 로그인하면 계정에도 남습니다.`, true);
      } else {
        showRecordMsg(`「${name}」을 이 브라우저에 저장했습니다.`, true);
      }
      if (els.recordName) els.recordName.value = "";
    } catch (err) {
      console.warn(err);
      showRecordMsg("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.", false);
    }
  }

  function renderRecords() {
    if (!els.recordsList) return;
    const list = recordsForUi();
    if (!list.length) {
      els.recordsList.innerHTML = '<p class="records-empty">아직 저장한 회차가 없습니다.</p>';
      return;
    }
    els.recordsList.innerHTML = list
      .map((rec) => {
        const score = rec.score || {};
        const total = score.totalCorrect ?? "-";
        const keyed = score.totalKeyed || 100;
        const marked = score.totalMarked ?? "-";
        return `
          <div class="record-item" data-id="${rec.id}">
            <button type="button" class="record-open" data-id="${rec.id}">
              <strong>${escapeHtml(rec.name)}</strong>
              <span>${formatSavedAt(rec.savedAt)} · 총점 ${total} / ${keyed} · 푼 문제 ${marked}</span>
            </button>
            <button type="button" class="record-del" data-id="${rec.id}">삭제</button>
          </div>`;
      })
      .join("");
  }

  async function openRecords() {
    renderAuth();
    if (currentUser) {
      try {
        cloudRecords = await fetchCloudRecords();
      } catch (err) {
        console.warn(err);
      }
    }
    renderRecords();
    openModal(els.recordsModal);
  }

  function applyRecord(id) {
    const rec = recordsForUi().find((r) => r.id === id);
    if (!rec) return;
    state.answers = normalizeAnswers(rec.answers);
    state.answerKeys = { ...defaultState().answerKeys, ...(rec.answerKeys || {}) };
    state.note = rec.note || "";
    if (els.notepad) els.notepad.value = state.note;
    persist();
    renderOMR();
    closeModal(els.recordsModal);
    if (els.recordName) els.recordName.value = rec.name;
    openGradeModal();
    const complete = SECTIONS.every((s) => parseAnswerKey(state.answerKeys[s.id] || "").length === SECTION_SIZE);
    if (complete) gradeAll();
    showRecordMsg(`「${rec.name}」을(를) 불러왔습니다.`, true);
  }

  async function deleteRecord(id) {
    const rec = recordsForUi().find((r) => r.id === id);
    if (!rec || !confirm(`「${rec.name}」을(를) 지울까요?`)) return;
    persistRecords(loadLocalRecords().filter((r) => r.id !== id));
    if (currentUser) {
      try {
        await recordsRef().doc(id).delete();
        cloudRecords = cloudRecords.filter((r) => r.id !== id);
      } catch (err) {
        console.warn(err);
      }
    }
    renderRecords();
  }

  function gradeAll() {
    collectKeysFromForm();
    persist();
    els.gradeKeys.querySelectorAll("textarea[data-section]").forEach(paintKeyHint);
    const hasAnyKey = SECTIONS.some((s) => parseAnswerKey(state.answerKeys[s.id] || "").length);
    if (!hasAnyKey) {
      els.gradeSummary.hidden = false;
      els.gradeSummary.innerHTML = "정답을 한 과목이라도 입력해 주세요.";
      els.gradeDetail.hidden = true;
      return;
    }
    const bad = SECTIONS.filter((s) => {
      const n = parseAnswerKey(state.answerKeys[s.id] || "").length;
      return n > 0 && n !== SECTION_SIZE;
    });
    if (bad.length) {
      els.gradeSummary.hidden = false;
      els.gradeSummary.innerHTML =
        '<p class="key-hint is-error">20개가 아닌 과목이 있습니다. 각 과목 정답을 20글자로 맞춰 주세요.</p>';
      els.gradeDetail.hidden = true;
      return;
    }
    const reports = SECTIONS.map((sec) => ({
      ...sec,
      ...evaluateSection(sec.id, state.answerKeys[sec.id] || ""),
    }));
    const totalCorrect = reports.reduce((n, r) => n + r.correct, 0);
    const totalMarked = reports.reduce((n, r) => n + r.marked, 0);
    const totalKeyed = reports.reduce((n, r) => n + Math.min(r.keyed, SECTION_SIZE), 0);
    const subjectBtns = reports
      .map(
        (r) => `
        <button type="button" class="grade-sub-btn" data-section="${r.id}">
          <strong>${r.name}</strong>
          <span>맞음 ${r.correct} / 20</span>
          <span>푼 문제 ${r.marked}</span>
        </button>`
      )
      .join("");
    els.gradeSummary.hidden = false;
    els.gradeSummary.innerHTML = `
      <div class="grade-totals">
        <div><em>총점</em><strong>${totalCorrect}</strong><span>/ ${totalKeyed || 100}</span></div>
        <div><em>푼 문제</em><strong>${totalMarked}</strong><span>/ 100</span></div>
      </div>
      <p class="grade-hint">과목을 누르면 맞는 문제와 틀린 문제를 한눈에 볼 수 있습니다.</p>
      <div class="grade-sub-grid">${subjectBtns}</div>`;
    els.gradeDetail.hidden = true;
  }

  function openGradeModal(ended = false) {
    if (els.gradeIntro && !ended) {
      els.gradeIntro.textContent =
        "각 과목 정답 20개를 붙여 넣으세요. 예: 12345214...";
    }
    renderGradeKeys();
    if (els.gradeSummary) els.gradeSummary.hidden = true;
    if (els.gradeDetail) els.gradeDetail.hidden = true;
    showRecordMsg("", true);
    openModal(els.gradeModal);
  }

  function openModal(el) {
    el.hidden = false;
  }

  function closeModal(el) {
    el.hidden = true;
  }

  function bind() {
    els.timerToggle.addEventListener("click", () => {
      if (state.remainingMs <= 0 && state.examIndex >= SECTIONS.length - 1) armExam(true);
      state.running = !state.running;
      state.lastTick = state.running ? Date.now() : null;
      if (state.running) {
        ensureAudio();
        beep("start");
        startClock();
      } else stopClock();
      renderTimer();
      persist();
    });

    $("#timer-reset").addEventListener("click", () => armExam(true));
    $("#preview-end").addEventListener("click", () => {
      ensureAudio();
      beep("finish");
      if (els.gradeIntro) {
        els.gradeIntro.textContent =
          "5과목이 모두 끝났습니다. 각 과목 정답 20개를 붙여 넣고 전체 채점을 누르세요.";
      }
      openGradeModal(true);
    });

    $("#finish-close").addEventListener("click", () => closeModal(els.finishModal));
    $("#finish-ok").addEventListener("click", () => closeModal(els.finishModal));
    $("#finish-grade").addEventListener("click", () => {
      closeModal(els.finishModal);
      openGradeModal();
    });

    els.omrToggle.addEventListener("click", () => {
      state.omrOpen = !state.omrOpen;
      renderOMR();
      persist();
    });

    els.omrSections.addEventListener("click", (e) => {
      const btn = e.target.closest(".omr-sec");
      if (!btn) return;
      state.section = btn.dataset.section;
      renderOMR();
      persist();
    });

    els.omrList.addEventListener("click", (e) => {
      const btn = e.target.closest(".omr-choice");
      if (!btn) return;
      const q = btn.closest(".omr-row").dataset.q;
      const answers = sectionAnswers();
      const choice = Number(btn.dataset.choice);
      if (Number(answers[q]) === choice) delete answers[q];
      else answers[q] = choice;
      btn.closest(".omr-choices").querySelectorAll(".omr-choice").forEach((c) => {
        c.classList.toggle("is-on", Number(c.dataset.choice) === Number(answers[q]));
      });
      updateFilled();
      scheduleSave();
    });

    $("#omr-reset").addEventListener("click", () => {
      if (!confirm(`${currentSection().name} 답을 모두 지울까요? 다른 과목 답은 그대로 둡니다.`)) return;
      state.answers[state.section] = {};
      renderOMR();
      persist();
    });

    $("#grade-btn").addEventListener("click", () => openGradeModal());
    $("#grade-close").addEventListener("click", () => closeModal(els.gradeModal));
    $("#grade-cancel").addEventListener("click", () => closeModal(els.gradeModal));
    $("#grade-run").addEventListener("click", gradeAll);
    $("#record-save").addEventListener("click", saveCurrentRecord);
    els.recordName.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveCurrentRecord();
      }
    });
    $("#records-btn").addEventListener("click", openRecords);
    $("#login-btn").addEventListener("click", () => {
      signInGoogle().catch((err) => {
        console.warn(err);
        alert(err && err.message ? err.message : "로그인에 실패했습니다.");
      });
    });
    $("#logout-btn").addEventListener("click", () => {
      signOutGoogle().catch((err) => console.warn(err));
    });
    $("#records-close").addEventListener("click", () => closeModal(els.recordsModal));
    $("#records-done").addEventListener("click", () => closeModal(els.recordsModal));
    els.recordsList.addEventListener("click", (e) => {
      const del = e.target.closest(".record-del");
      if (del) {
        deleteRecord(del.dataset.id);
        return;
      }
      const open = e.target.closest(".record-open");
      if (open) applyRecord(open.dataset.id);
    });
    els.gradeKeys.addEventListener("input", (e) => {
      const area = e.target.closest("textarea[data-section]");
      if (!area) return;
      if (!state.answerKeys) state.answerKeys = defaultState().answerKeys;
      state.answerKeys[area.dataset.section] = area.value;
      paintKeyHint(area);
      scheduleSave();
    });
    els.gradeSummary.addEventListener("click", (e) => {
      const btn = e.target.closest(".grade-sub-btn");
      if (btn) showSectionDetail(btn.dataset.section);
    });

    $$(".mode-btn").forEach((btn) => btn.addEventListener("click", () => setMode(btn.dataset.mode)));

    els.notepad.addEventListener("input", () => {
      state.note = els.notepad.value;
      scheduleSave();
    });

    $$(".swatch").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.paintColor = btn.dataset.color;
        state.eraser = false;
        applyPaintStyle();
        persist();
      });
    });

    els.eraserBtn.addEventListener("click", () => {
      state.eraser = !state.eraser;
      applyPaintStyle();
      persist();
    });

    els.strokeWidth.addEventListener("input", () => {
      state.paintWidth = Number(els.strokeWidth.value);
      applyPaintStyle();
    });
    els.strokeWidth.addEventListener("change", persist);

    $("#undo-btn").addEventListener("click", () => {
      const prev = undoStack.pop();
      if (!prev) return;
      const img = new Image();
      img.onload = () => {
        const rect = els.paintWrap.getBoundingClientRect();
        paintCtx.fillStyle = "#fff";
        paintCtx.fillRect(0, 0, rect.width, rect.height);
        paintCtx.drawImage(img, 0, 0, rect.width, rect.height);
        state.paint = els.paint.toDataURL("image/png");
        scheduleSave();
      };
      img.src = prev;
    });

    $("#clear-surface").addEventListener("click", () => {
      if (els.paintWrap.hidden) {
        if (!confirm("메모장을 비울까요?")) return;
        els.notepad.value = "";
        state.note = "";
      } else {
        if (!confirm("그림판을 비울까요?")) return;
        pushUndo();
        const rect = els.paintWrap.getBoundingClientRect();
        paintCtx.fillStyle = "#fff";
        paintCtx.fillRect(0, 0, rect.width, rect.height);
        state.paint = els.paint.toDataURL("image/png");
      }
      persist();
    });

    els.paint.addEventListener("pointerdown", startDraw);
    window.addEventListener("pointermove", moveDraw);
    window.addEventListener("pointerup", endDraw);
    window.addEventListener("pointercancel", endDraw);

    $("#calc-keys").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-key]");
      if (btn) inputCalc(btn.dataset.key);
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!els.helpModal.hidden) {
          closeModal(els.helpModal);
          return;
        }
        if (!els.gradeModal.hidden) {
          closeModal(els.gradeModal);
          return;
        }
        if (els.finishModal && !els.finishModal.hidden) {
          closeModal(els.finishModal);
          return;
        }
        if (els.recordsModal && !els.recordsModal.hidden) {
          closeModal(els.recordsModal);
          return;
        }
      }
      if (
        !els.helpModal.hidden ||
        !els.gradeModal.hidden ||
        (els.finishModal && !els.finishModal.hidden) ||
        (els.recordsModal && !els.recordsModal.hidden)
      )
        return;
      if (typingInField()) return;
      const map = {
        Enter: "=",
        "=": "=",
        Backspace: "C",
        Escape: "AC",
        "+": "+",
        "-": "-",
        "*": "×",
        "/": "÷",
        "%": "%",
        "(": "(",
        ")": ")",
        ".": ".",
      };
      if (map[e.key]) {
        e.preventDefault();
        inputCalc(map[e.key]);
      } else if (/^[0-9]$/.test(e.key)) {
        inputCalc(e.key);
      }
    });

    $("#help-btn").addEventListener("click", () => openModal(els.helpModal));
    $("#help-close").addEventListener("click", () => closeModal(els.helpModal));
    $("#help-later").addEventListener("click", () => closeModal(els.helpModal));
    $("#help-never").addEventListener("click", () => {
      state.hideHelp = true;
      persist();
      closeModal(els.helpModal);
    });

    window.addEventListener("resize", () => {
      if (els.paintWrap.hidden || !paintCtx) return;
      state.paint = els.paint.toDataURL("image/png");
      setupPaint();
    });
    window.addEventListener("beforeunload", persist);
  }

  function init() {
    bind();
    els.notepad.value = state.note;
    renderOMR();
    renderTimer();
    renderCalc();
    applyPaintStyle();
    setMode("note");
    initFirebase();
    if (!state.hideHelp) openModal(els.helpModal);
  }

  init();
})();

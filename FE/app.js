(() => {
  const STORAGE_KEY = "skct-practice-v1";
  const RECORDS_KEY = "skct-practice-records-v1";
  const LAST_UID_KEY = "skct-practice-last-uid";
  const SECTION_SIZE = 20;
  const SECTIONS = [
    { id: "lang", name: "언어이해", short: "언어" },
    { id: "data", name: "자료해석", short: "자료" },
    { id: "math", name: "창의수리", short: "창의" },
    { id: "verbal", name: "언어추리", short: "추리" },
    { id: "seq", name: "수열추리", short: "수열" },
  ];

  const emptyAnswers = () =>
    Object.fromEntries(SECTIONS.map((s) => [s.id, {}]));

  const emptyCountMap = () =>
    Object.fromEntries(SECTIONS.map((s) => [s.id, {}]));

  const emptyMinutes = () =>
    Object.fromEntries(SECTIONS.map((s) => [s.id, 15]));

  const emptySpent = () =>
    Object.fromEntries(SECTIONS.map((s) => [s.id, 0]));

  const defaultState = () => ({
    answers: emptyAnswers(),
    timings: emptyCountMap(),
    skips: emptyCountMap(),
    sectionMinutes: emptyMinutes(),
    spentMs: emptySpent(),
    section: "lang",
    qIndex: 1,
    qStartedAt: null,
    reviewMode: false,
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
    alarmOn: true,
    alarmEveryMin: 15,
    alarmTickMs: 0,
    sound: true,
    hideHelp: false,
    calcExpr: "",
    calcValue: "0",
    calcOverwrite: true,
    answerKeys: Object.fromEntries(SECTIONS.map((s) => [s.id, ""])),
    recordId: null,
  });

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  let state = defaultState();
  let deskOwnerId = undefined;
  let recordSaveBusy = false;
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
    answerProgress: $("#answer-progress"),
    timerReady: $("#timer-ready"),
    alarmOn: $("#alarm-on"),
    settingsBtn: $("#settings-btn"),
    settingsModal: $("#settings-modal"),
    timerPause: $("#timer-pause"),
    skipSectionBtn: $("#skip-section"),
    excelBox: $("#excel-box"),
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
    resumeRecordName: $("#resume-record-name"),
    resumeRecordMsg: $("#resume-record-msg"),
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
  let lastGrade = null;

  function deskStorageKey(ownerId) {
    return ownerId ? `${STORAGE_KEY}:u:${ownerId}` : `${STORAGE_KEY}:guest`;
  }

  function recordsStorageKey(ownerId) {
    return ownerId ? `${RECORDS_KEY}:u:${ownerId}` : `${RECORDS_KEY}:guest`;
  }

  function parseDesk(parsed) {
    const raw = { ...defaultState(), ...parsed };
    raw.answers = normalizeAnswers(raw.answers);
    if (!SECTIONS.some((s) => s.id === raw.section)) raw.section = "lang";
    raw.answerKeys = defaultState().answerKeys;
    raw.timings = { ...emptyCountMap(), ...(raw.timings || {}) };
    raw.skips = { ...emptyCountMap(), ...(raw.skips || {}) };
    raw.sectionMinutes = { ...emptyMinutes(), ...(raw.sectionMinutes || {}) };
    raw.spentMs = { ...emptySpent(), ...(raw.spentMs || {}) };
    SECTIONS.forEach((s) => {
      raw.timings[s.id] = { ...(raw.timings[s.id] || {}) };
      raw.skips[s.id] = { ...(raw.skips[s.id] || {}) };
      raw.sectionMinutes[s.id] = Math.max(1, Number(raw.sectionMinutes[s.id]) || 15);
      raw.spentMs[s.id] = Math.max(0, Number(raw.spentMs[s.id]) || 0);
    });
    raw.alarmOn = raw.alarmOn !== false;
    raw.alarmEveryMin = Math.max(1, Number(raw.alarmEveryMin) || 15);
    raw.alarmTickMs = Number(raw.alarmTickMs) || 0;
    raw.qIndex = Math.min(Math.max(Number(raw.qIndex) || 1, 1), SECTION_SIZE + 1);
    raw.qStartedAt = null;
    raw.reviewMode = Boolean(raw.reviewMode);
    raw.examMode = true;
    raw.timerMinutes = 15;
    raw.recordId = parsed.recordId || null;
    raw.examIndex = Number.isInteger(raw.examIndex)
      ? Math.min(Math.max(raw.examIndex, 0), SECTIONS.length - 1)
      : 0;
    if (parsed.examMode !== true || Number(parsed.remainingMs) > 3 * 60 * 60 * 1000) {
      raw.examIndex = 0;
      raw.section = SECTIONS[0].id;
      raw.remainingMs = Math.max(1, Number(raw.sectionMinutes[SECTIONS[0].id]) || 15) * 60 * 1000;
      raw.running = false;
      raw.lastTick = null;
    }
    return raw;
  }

  function loadDesk(ownerId) {
    try {
      const parsed = JSON.parse(localStorage.getItem(deskStorageKey(ownerId)) || "{}");
      return parseDesk(parsed);
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
    if (deskOwnerId === undefined) return;
    const snapshot = {
      ...state,
      running: false,
      lastTick: null,
      remainingMs: state.running
        ? Math.max(0, state.remainingMs - (Date.now() - (state.lastTick || Date.now())))
        : state.remainingMs,
      answerKeys: defaultState().answerKeys,
      paint: els.paint.width ? els.paint.toDataURL("image/png") : state.paint,
    };
    try {
      localStorage.setItem(deskStorageKey(deskOwnerId), JSON.stringify(snapshot));
    } catch {
      try {
        snapshot.paint = "";
        localStorage.setItem(deskStorageKey(deskOwnerId), JSON.stringify(snapshot));
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

  function formatClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function addTimeToCurrent() {
    if (!state.qStartedAt || state.reviewMode) return;
    const q = Number(state.qIndex);
    if (q < 1 || q > SECTION_SIZE) {
      state.qStartedAt = null;
      return;
    }
    const sec = state.section;
    if (!state.timings[sec]) state.timings[sec] = {};
    state.timings[sec][q] = Number(state.timings[sec][q] || 0) + Math.max(0, Date.now() - state.qStartedAt);
    state.qStartedAt = null;
  }

  function startQuestionClock() {
    if (state.reviewMode || !state.running) return;
    if (state.qIndex >= 1 && state.qIndex <= SECTION_SIZE) state.qStartedAt = Date.now();
  }

  function sectionLimitMs(id = state.section) {
    return Math.max(1, Number(state.sectionMinutes?.[id]) || 15) * 60 * 1000;
  }

  function totalLimitMs() {
    return SECTIONS.reduce((n, s) => n + sectionLimitMs(s.id), 0);
  }

  function bankCurrentSpent() {
    if (!state.spentMs) state.spentMs = emptySpent();
    state.spentMs[state.section] = Math.max(0, sectionLimitMs() - state.remainingMs);
  }

  function examElapsedMs() {
    let n = 0;
    SECTIONS.forEach((s, i) => {
      if (i < state.examIndex) n += Number((state.spentMs && state.spentMs[s.id]) || 0);
      else if (i === state.examIndex) n += Math.max(0, sectionLimitMs(s.id) - state.remainingMs);
    });
    return n;
  }

  function renderTimer() {
    const idx = Math.min(state.examIndex, SECTIONS.length - 1);
    const name = SECTIONS[idx].name;
    els.timerNow.textContent = formatClock(state.remainingMs);
    els.timerTotal.textContent = `/ ${Math.round(sectionLimitMs() / 60000)}분`;
    if (els.examSubject) els.examSubject.textContent = name;
    if (els.examStep) els.examStep.textContent = `${idx + 1} / 5`;
    if (els.examOverall) {
      els.examOverall.textContent = `전체 ${formatTime(examElapsedMs())} / ${formatTime(totalLimitMs())}`;
    }
    if (els.alarmOn) els.alarmOn.checked = state.alarmOn !== false;
    if (els.timerToggle) {
      els.timerToggle.hidden = startedExam();
      els.timerToggle.textContent = "연습 시작";
    }
    if (els.timerPause) {
      els.timerPause.hidden = !startedExam();
      els.timerPause.textContent = state.running ? "일시정지" : "계속";
    }
    if (els.timerReady) els.timerReady.hidden = state.running || startedExam();
    els.timerFace.classList.toggle("is-warn", state.remainingMs <= 60_000 && state.remainingMs > 0);
    els.timerFace.classList.toggle("is-over", state.remainingMs <= 0);
  }

  function startedExam() {
    return state.running || state.examIndex > 0 || Number(state.qIndex) > 1 || examElapsedMs() > 0;
  }

  function armExam(fromStart = true) {
    state.examMode = true;
    state.timerMinutes = Math.round(sectionLimitMs(state.section) / 60000);
    if (fromStart) {
      state.examIndex = 0;
      state.section = SECTIONS[0].id;
      state.spentMs = emptySpent();
      state.alarmTickMs = 0;
    } else {
      const idx = SECTIONS.findIndex((s) => s.id === state.section);
      state.examIndex = idx >= 0 ? idx : 0;
      state.section = SECTIONS[state.examIndex].id;
    }
    state.remainingMs = sectionLimitMs(state.section);
    state.running = false;
    state.lastTick = null;
    if (fromStart) {
      state.answers = emptyAnswers();
      state.timings = emptyCountMap();
      state.skips = emptyCountMap();
      state.answerKeys = defaultState().answerKeys;
      state.qIndex = 1;
      state.reviewMode = false;
      lastGrade = null;
      state.recordId = null;
      resetGradeForm();
    }
    state.qStartedAt = null;
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
    }, 1000);
  }

  function onSectionTimeUp() {
    const next = state.examIndex + 1;
    if (next >= SECTIONS.length) {
      if (state.alarmOn) beep("finish");
      addTimeToCurrent();
      skipRestOfSection();
      bankCurrentSpent();
      state.running = false;
      state.remainingMs = 0;
      state.lastTick = null;
      stopClock();
      renderTimer();
      persist();
      document.title = "종료 · SKCT 연습창";
      renderOMR();
      if (els.gradeIntro) {
        els.gradeIntro.textContent =
          "5과목이 모두 끝났습니다. 각 과목 정답 20개를 붙여 넣고 전체 채점을 누르세요.";
      }
      openGradeModal(true);
      return;
    }
    if (state.sound && state.alarmOn) beep("section");
    addTimeToCurrent();
    skipRestOfSection();
    bankCurrentSpent();
    const endedMin = Math.round(sectionLimitMs(state.section) / 60000);
    state.examIndex = next;
    state.section = SECTIONS[next].id;
    state.qIndex = 1;
    state.remainingMs = sectionLimitMs(SECTIONS[next].id);
    state.lastTick = Date.now();
    startQuestionClock();
    renderOMR();
    renderTimer();
    persist();
    const name = SECTIONS[next].name;
    document.title = `${name} · SKCT 연습창`;
    showToast(`${endedMin}분 종료. ${name}으로 넘어갑니다.`);
  }

  function tick() {
    if (!state.running) return;
    const now = Date.now();
    const dt = now - (state.lastTick || now);
    state.remainingMs = Math.max(0, state.remainingMs - dt);
    if (state.alarmOn) {
      state.alarmTickMs = (state.alarmTickMs || 0) + dt;
      const every = Math.max(1, Number(state.alarmEveryMin) || 15) * 60 * 1000;
      if (state.alarmTickMs >= every) {
        beep("section");
        state.alarmTickMs %= every;
      }
    }
    state.lastTick = now;
    renderTimer();
    if (state.remainingMs <= 0) {
      if (state.examMode) {
        onSectionTimeUp();
      } else {
        state.running = false;
        stopClock();
        persist();
        if (state.alarmOn) beep("section");
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
  let beepGen = 0;

  function muteAlarms() {
    beepGen += 1;
    if (audioCtx && audioCtx.state !== "closed") {
      audioCtx.suspend().catch(() => {});
    }
  }

  function allowAlarms() {
    beepGen += 1;
  }

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
    const gen = beepGen;
    const ctx = ensureAudio();
    if (!ctx) return;
    const play = () => {
      if (gen !== beepGen) return;
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

  function skipRestOfSection() {
    const sec = state.section;
    if (!state.skips[sec]) state.skips[sec] = {};
    const start = Math.min(Math.max(Number(state.qIndex) || 1, 1), SECTION_SIZE + 1);
    for (let q = start; q <= SECTION_SIZE; q += 1) {
      if (!(state.answers[sec] && state.answers[sec][q])) state.skips[sec][q] = true;
    }
    state.qIndex = SECTION_SIZE + 1;
    state.qStartedAt = null;
  }

  function renderSectionButtons() {
    const frag = document.createDocumentFragment();
    SECTIONS.forEach((sec, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "omr-sec";
      btn.dataset.section = sec.id;
      if (sec.id === state.section) btn.classList.add("is-active");
      if (!state.reviewMode && idx < state.examIndex) btn.classList.add("is-done");
      if (!state.reviewMode && idx > state.examIndex) btn.classList.add("is-locked");
      const filled = Object.values(state.answers[sec.id] || {}).filter(Boolean).length;
      btn.title = sec.name;
      btn.innerHTML = `<span>${sec.short || sec.name}</span><em>${filled}/20</em>`;
      frag.appendChild(btn);
    });
    els.omrSections.replaceChildren(frag);
  }

  function renderOMR() {
    if (els.omrToggle) {
      els.workspace.classList.toggle("omr-hidden", !state.omrOpen);
      els.omrToggle.textContent = state.omrOpen ? "OMR숨김" : "OMR";
    }
    renderSectionButtons();
    const answers = sectionAnswers();
    const qNow = Number(state.qIndex) || 1;
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= SECTION_SIZE; i += 1) {
      const row = document.createElement("div");
      row.className = "omr-row";
      row.dataset.q = String(i);
      const isActive = !state.reviewMode && i === qNow && qNow <= SECTION_SIZE;
      const isPast = state.reviewMode || i < qNow;
      const isFuture = !state.reviewMode && i > qNow;
      if (isActive) row.classList.add("is-active");
      if (!state.reviewMode && i < qNow) row.classList.add("is-done");
      if (isFuture) row.classList.add("is-locked");
      const num = document.createElement("div");
      num.className = "omr-num";
      num.textContent = String(i);
      const main = document.createElement("div");
      main.className = "omr-row-main";
      const choices = document.createElement("div");
      choices.className = "omr-choices";
      for (let c = 1; c <= 5; c += 1) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "omr-choice";
        btn.textContent = String(c);
        btn.dataset.choice = String(c);
        if (Number(answers[i]) === c) btn.classList.add("is-on");
        if (!isActive && !state.reviewMode) btn.disabled = true;
        choices.appendChild(btn);
      }
      main.appendChild(choices);
      if (isActive) {
        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "omr-next";
        nextBtn.dataset.act = "next";
        nextBtn.textContent = "다음";
        const skipBtn = document.createElement("button");
        skipBtn.type = "button";
        skipBtn.className = "omr-skip";
        skipBtn.dataset.act = "skip";
        skipBtn.textContent = "스킵";
        main.append(nextBtn, skipBtn);
      }
      if (!isActive && state.skips[state.section] && state.skips[state.section][i]) {
        row.classList.add("is-skipped");
      }
      row.append(num, main);
      frag.appendChild(row);
    }
    els.omrList.replaceChildren(frag);
    if (els.answerProgress) {
      const cap = Math.min(qNow, SECTION_SIZE);
      els.answerProgress.textContent = `${currentSection().name} ${Math.min(qNow, SECTION_SIZE)}/${SECTION_SIZE}`;
      if (qNow > SECTION_SIZE) els.answerProgress.textContent = `${currentSection().name} 완료`;
    }
    const active = els.omrList.querySelector(".omr-row.is-active");
    if (active) active.scrollIntoView({ block: "nearest", behavior: "smooth" });
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

  function isNumberToken(t) {
    return typeof t === "string" && /^-?\d*\.?\d+$/.test(t);
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
    const out = [];
    for (const t of tokens) {
      if (out.length) {
        const prev = out[out.length - 1];
        const prevValue = isNumberToken(prev) || prev === ")" || prev === "%";
        const nextValue = isNumberToken(t) || t === "(" || t === "u+" || t === "u-";
        if (prevValue && nextValue) out.push("×");
      }
      out.push(t);
    }
    return out;
  }

  function toRPN(tokens) {
    const out = [];
    const ops = [];
    const prec = { "u+": 5, "u-": 5, "%": 4, "×": 3, "÷": 3, "*": 3, "/": 3, "+": 2, "-": 2 };
    const right = new Set(["u+", "u-", "%"]);
    for (const t of tokens) {
      if (isNumberToken(t)) {
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
      if (isNumberToken(t)) {
        st.push(Number(t));
        continue;
      }
      if (t === "u-") {
        if (!st.length) throw new Error("수식 오류");
        st.push(-st.pop());
        continue;
      }
      if (t === "u+") {
        if (!st.length) throw new Error("수식 오류");
        st.push(+st.pop());
        continue;
      }
      if (t === "%") {
        if (!st.length) throw new Error("수식 오류");
        st.push(st.pop() / 100);
        continue;
      }
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) throw new Error("수식 오류");
      if (t === "+") st.push(a + b);
      else if (t === "-") st.push(a - b);
      else if (t === "×" || t === "*") st.push(a * b);
      else if (t === "÷" || t === "/") {
        if (b === 0) throw new Error("0으로 나눌 수 없음");
        st.push(a / b);
      } else {
        throw new Error("수식 오류");
      }
    }
    if (st.length !== 1) throw new Error("수식 오류");
    return st[0];
  }

  function currentCalcExpression() {
    const expr = state.calcExpr || "";
    const value = String(state.calcValue ?? "");
    const broken = value === "Error" || value.includes("오류") || value.includes("없음");
    if (broken) return expr || "0";
    if (!state.calcOverwrite) return expr + value;
    if (!expr) return value || "0";
    if (/[+\-×÷*/]$/.test(expr)) return expr + value;
    return expr;
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
        const expr = currentCalcExpression();
        const result = evalRPN(toRPN(tokenize(expr)));
        state.calcExpr = "";
        state.calcValue = formatNumber(result);
        state.calcOverwrite = true;
      } catch (err) {
        state.calcValue = err.message;
        state.calcOverwrite = true;
      }
    } else if (ops.has(key)) {
      const broken =
        state.calcValue === "Error" ||
        String(state.calcValue).includes("오류") ||
        String(state.calcValue).includes("없음");
      if (!state.calcOverwrite || broken) {
        state.calcExpr += (broken ? "" : state.calcValue) + key;
      } else if (state.calcExpr && ops.has(state.calcExpr.slice(-1))) {
        state.calcExpr = state.calcExpr.slice(0, -1) + key;
      } else if (state.calcExpr.endsWith(")")) {
        state.calcExpr += key;
      } else {
        state.calcExpr += (state.calcExpr ? "" : state.calcValue) + key;
      }
      state.calcOverwrite = true;
    } else if (key === "(") {
      if (!state.calcOverwrite) state.calcExpr += state.calcValue;
      state.calcExpr += "(";
      state.calcOverwrite = true;
    } else if (key === ")") {
      if (!state.calcOverwrite) {
        state.calcExpr += `${state.calcValue})`;
      } else {
        state.calcExpr += ")";
      }
      state.calcOverwrite = true;
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
    let skipCount = 0;
    for (let q = 1; q <= SECTION_SIZE; q += 1) {
      const mine = Number(answers[q] || 0);
      const skipped = Boolean(state.skips[id] && state.skips[id][q]);
      if (skipped) skipCount += 1;
      if (mine) marked += 1;
      const ans = key[q - 1];
      let status = "nokey";
      if (ans >= 1 && ans <= 5) {
        if (!mine) {
          status = skipped ? "skip" : "blank";
          blank += 1;
        } else if (mine === ans) {
          status = "correct";
          correct += 1;
        } else {
          status = "wrong";
          wrongMarked += 1;
        }
      }
      const ms = Number((state.timings[id] && state.timings[id][q]) || 0);
      items.push({ q, mine, ans: ans >= 1 && ans <= 5 ? ans : 0, status, skipped, ms });
    }
    return { correct, wrongMarked, blank, marked, keyed: key.length, skipCount, items };
  }

  function collectKeysFromForm() {
    if (!state.answerKeys) state.answerKeys = defaultState().answerKeys;
    $$("#grade-keys textarea[data-section]").forEach((area) => {
      state.answerKeys[area.dataset.section] = area.value;
    });
  }

  function resetGradeForm() {
    renderGradeKeys();
    if (els.gradeIntro) {
      els.gradeIntro.textContent = "각 과목 정답 20개를 붙여 넣으세요. 예: 12345214...";
    }
    if (els.gradeSummary) {
      els.gradeSummary.hidden = true;
      els.gradeSummary.innerHTML = "";
    }
    if (els.gradeDetail) {
      els.gradeDetail.hidden = true;
      els.gradeDetail.innerHTML = "";
    }
    if (els.excelBox) els.excelBox.hidden = true;
    showRecordMsg("", true);
    if (els.recordName) els.recordName.value = roundTitle();
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
      if (item.status === "wrong" || item.status === "blank" || item.status === "skip") row.classList.add("is-wrong");
    });
  }

  function showSectionDetail(id) {
    collectKeysFromForm();
    const sec = SECTIONS.find((s) => s.id === id);
    const result = evaluateSection(id, state.answerKeys[id] || "");
    state.section = id;
    renderOMR();
    applyOmrHighlight(result);
    els.gradeDetail.hidden = false;
    els.gradeDetail.innerHTML = `
      <div class="grade-detail-head">
        <strong>${sec.name}</strong>
        맞음 ${result.correct} · 틀림 ${result.wrongMarked} · 미표기 ${result.blank}
      </div>
      ${questionGridHtml({ id: sec.id, name: sec.name, items: result.items })}`;
    els.gradeDetail.scrollIntoView({ block: "nearest" });
  }

  function adoptLegacyDesk(uid) {
    const legacy = localStorage.getItem(STORAGE_KEY);
    if (!legacy) return;
    const scoped = deskStorageKey(uid);
    const last = localStorage.getItem(LAST_UID_KEY);
    if (!localStorage.getItem(scoped) && (!last || last === uid)) {
      localStorage.setItem(scoped, legacy);
    }
    localStorage.removeItem(STORAGE_KEY);
  }

  function applyDeskToUi() {
    stopClock();
    undoStack = [];
    lastGrade = null;
    state.running = false;
    state.lastTick = null;
    state.qStartedAt = null;
    if (els.notepad) els.notepad.value = state.note || "";
    renderOMR();
    renderTimer();
    renderCalc();
    applyPaintStyle();
    setupPaint();
    resetGradeForm();
    if (els.gradeModal && !els.gradeModal.hidden) closeModal(els.gradeModal);
    renderRecords();
    document.title = "SKCT 연습창";
  }

  function settleDesk(user) {
    const nextId = user ? user.uid : null;
    if (deskOwnerId !== undefined && deskOwnerId === nextId) {
      currentUser = user;
      renderAuth();
      return false;
    }
    if (deskOwnerId !== undefined) persist();
    currentUser = user;
    if (user) {
      adoptLegacyDesk(user.uid);
      localStorage.setItem(LAST_UID_KEY, user.uid);
    }
    deskOwnerId = nextId;
    state = loadDesk(deskOwnerId);
    applyDeskToUi();
    renderAuth();
    return true;
  }

  function firebaseReady() {
    const cfg = window.FIREBASE_CONFIG || {};
    return Boolean(window.firebase && cfg.apiKey && cfg.projectId);
  }

  function initFirebase() {
    if (!firebaseReady()) {
      settleDesk(null);
      return;
    }
    if (firebase.apps.length) {
      renderAuth();
      return;
    }
    firebase.initializeApp(window.FIREBASE_CONFIG);
    firebase.auth().onAuthStateChanged(async (user) => {
      const switched = settleDesk(user);
      if (user) {
        try {
          cloudRecords = await fetchCloudRecords();
          await maybeMigrateLocalRecords();
          cloudRecords = dedupeRecords(cloudRecords);
        } catch (err) {
          console.warn(err);
        }
      } else {
        cloudRecords = [];
      }
      if (switched || user) renderRecords();
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
          "로그아웃하면 계정에서 풀던 답은 화면에서 지워집니다. 구글 로그인하면 그 계정에 저장한 회차만 보입니다.";
      } else {
        els.recordsLead.textContent = `${currentUser.displayName || "계정"}에 저장된 회차입니다. 이어 풀기 회차는 이름을 누르면 이어서 풉니다.`;
      }
    }
  }

  function recordsRef() {
    return firebase.firestore().collection("users").doc(currentUser.uid).collection("records");
  }

  async function fetchCloudRecords() {
    if (!currentUser) return [];
    const snap = await recordsRef().orderBy("savedAt", "desc").get();
    cloudRecords = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return { ...data, id: data.id || doc.id };
    });
    const kept = dedupeRecords(cloudRecords);
    const keepIds = new Set(kept.map((r) => r.id));
    const extras = cloudRecords.filter((r) => r && r.id && !keepIds.has(r.id));
    if (extras.length) {
      await Promise.all(extras.map((r) => recordsRef().doc(String(r.id)).delete().catch(() => {})));
    }
    cloudRecords = kept;
    persistRecords(dedupeRecords([...kept, ...loadLocalRecords()]));
    return cloudRecords;
  }

  async function maybeMigrateLocalRecords() {
    if (!currentUser) return;
    const flag = `skct-migrated-${currentUser.uid}`;
    if (localStorage.getItem(flag)) return;
    let legacy = [];
    try {
      const list = JSON.parse(localStorage.getItem(RECORDS_KEY) || "[]");
      legacy = Array.isArray(list) ? list : [];
    } catch {
      legacy = [];
    }
    if (!legacy.length) {
      localStorage.setItem(flag, "1");
      return;
    }
    if (!confirm("이 브라우저에 있는 회차 기록을 구글 계정에도 올릴까요?")) {
      localStorage.setItem(flag, "1");
      return;
    }
    for (const rec of dedupeRecords(legacy)) {
      await recordsRef().doc(String(rec.id)).set(firestoreSafe(rec));
    }
    persistRecords(dedupeRecords([...legacy, ...loadLocalRecords()]));
    localStorage.setItem(flag, "1");
    localStorage.removeItem(RECORDS_KEY);
    cloudRecords = await fetchCloudRecords();
  }

  function isExtensionPage() {
    try {
      return Boolean(chrome?.runtime?.getURL) && location.protocol === "chrome-extension:";
    } catch {
      return false;
    }
  }

  async function signInGoogleExtension() {
    const clientId = (window.FIREBASE_CONFIG || {}).googleClientId;
    if (!clientId || !chrome.identity) {
      alert("확장 로그인을 위해 Firebase 콘솔의 웹 클라이언트 ID가 필요합니다.");
      return;
    }
    const redirectURL = chrome.identity.getRedirectURL();
    const authURL =
      "https://accounts.google.com/o/oauth2/v2/auth" +
      `?client_id=${encodeURIComponent(clientId)}` +
      "&response_type=token" +
      `&redirect_uri=${encodeURIComponent(redirectURL)}` +
      `&scope=${encodeURIComponent("openid email profile")}` +
      "&prompt=select_account";
    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authURL, interactive: true }, (url) => {
        if (chrome.runtime.lastError || !url) {
          reject(new Error(chrome.runtime.lastError?.message || "로그인을 취소했습니다."));
          return;
        }
        resolve(url);
      });
    });
    const parsed = new URL(responseUrl);
    const params = new URLSearchParams(parsed.hash.replace(/^#/, "") || parsed.search.replace(/^\?/, ""));
    const accessToken = params.get("access_token");
    if (!accessToken) throw new Error("구글 토큰을 받지 못했습니다.");
    const cred = firebase.auth.GoogleAuthProvider.credential(null, accessToken);
    await firebase.auth().signInWithCredential(cred);
  }

  async function signInGoogle() {
    if (!firebaseReady()) {
      alert("아직 구글 로그인이 연결되지 않았습니다. 관리자가 Firebase 설정을 넣어야 합니다.");
      return;
    }
    if (isExtensionPage()) {
      await signInGoogleExtension();
      return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await firebase.auth().signInWithPopup(provider);
  }

  async function signOutGoogle() {
    if (deskOwnerId !== undefined) persist();
    if (firebaseReady()) await firebase.auth().signOut();
  }

  function readRecordList(key) {
    try {
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function loadLocalRecords() {
    if (deskOwnerId === undefined) return [];
    return readRecordList(recordsStorageKey(deskOwnerId));
  }

  function persistRecords(list) {
    if (deskOwnerId === undefined) return;
    localStorage.setItem(recordsStorageKey(deskOwnerId), JSON.stringify(list));
  }

  function firestoreSafe(value) {
    return JSON.parse(
      JSON.stringify(value, (_, v) => {
        if (typeof v === "number" && !Number.isFinite(v)) return 0;
        return v === undefined ? null : v;
      })
    );
  }

  function recordNameKey(name) {
    return String(name || "").trim();
  }

  function dedupeRecords(list) {
    const byName = new Map();
    [...(list || [])]
      .filter((r) => r && r.id)
      .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))
      .forEach((r) => {
        const key = recordNameKey(r.name) || String(r.id);
        if (!byName.has(key)) byName.set(key, r);
      });
    return [...byName.values()].sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
  }

  function recordsForUi() {
    if (currentUser) return dedupeRecords([...cloudRecords, ...loadLocalRecords()]);
    return dedupeRecords(loadLocalRecords());
  }

  function findRecordToUpdate(name) {
    const list = recordsForUi();
    if (state.recordId) {
      const byId = list.find((r) => r.id === state.recordId);
      if (byId) return byId;
    }
    const key = recordNameKey(name);
    return list.find((r) => recordNameKey(r.name) === key) || null;
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
        skipCount: r.skipCount,
      })),
    };
  }

  function markedCountFor(answers) {
    return SECTIONS.reduce(
      (sum, sec) => sum + Object.values((answers && answers[sec.id]) || {}).filter(Boolean).length,
      0
    );
  }

  function examProgressSnapshot() {
    const remaining = state.running
      ? Math.max(0, state.remainingMs - (Date.now() - (state.lastTick || Date.now())))
      : state.remainingMs;
    return {
      section: state.section,
      qIndex: Number(state.qIndex) || 1,
      examIndex: Number(state.examIndex) || 0,
      remainingMs: Number.isFinite(remaining) ? remaining : sectionLimitMs(state.section),
      spentMs: { ...emptySpent(), ...(state.spentMs || {}) },
      reviewMode: Boolean(state.reviewMode),
    };
  }

  function recordStatus(rec) {
    if (rec && rec.status) return rec.status;
    if (rec && rec.progress && rec.progress.reviewMode === false) return "in-progress";
    return "graded";
  }

  function showSaveMsg(el, text, ok) {
    if (!el) {
      showRecordMsg(text, ok);
      return;
    }
    el.hidden = !text;
    el.textContent = text || "";
    el.className = `record-save-msg ${ok ? "is-ok" : "is-error"}`;
  }

  function showRecordMsg(text, ok) {
    if (!els.recordSaveMsg) return;
    els.recordSaveMsg.hidden = !text;
    els.recordSaveMsg.textContent = text || "";
    els.recordSaveMsg.className = `record-save-msg ${ok ? "is-ok" : "is-error"}`;
  }

  async function saveCurrentRecord(source = "grade") {
    if (recordSaveBusy) return;
    recordSaveBusy = true;
    try {
      if (state.running) addTimeToCurrent();
      collectKeysFromForm();
      const nameInput = source === "records" ? els.resumeRecordName : els.recordName;
      const msgEl = source === "records" ? els.resumeRecordMsg : els.recordSaveMsg;
      const name = (nameInput && nameInput.value.trim()) || "";
      if (!name) {
        showSaveMsg(msgEl, "저장명을 입력하세요.", false);
        nameInput && nameInput.focus();
        return;
      }
      const progress = examProgressSnapshot();
      const existing = findRecordToUpdate(name);
      const record = firestoreSafe({
        id: existing ? existing.id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        savedAt: new Date().toISOString(),
        answers: state.answers || emptyAnswers(),
        answerKeys: { ...defaultState().answerKeys, ...(state.answerKeys || {}) },
        note: state.note || "",
        timings: state.timings || emptyCountMap(),
        skips: state.skips || emptyCountMap(),
        score: currentScoreSnapshot(),
        progress,
        status: progress.reviewMode ? "graded" : "in-progress",
      });
      state.recordId = record.id;
      try {
        const key = recordNameKey(name);
        const list = dedupeRecords([
          record,
          ...loadLocalRecords().filter((r) => r && r.id !== record.id && recordNameKey(r.name) !== key),
        ]);
        persistRecords(list);
      } catch (err) {
        console.warn(err);
        showSaveMsg(msgEl, "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", false);
        return;
      }
      if (currentUser) {
        try {
          const key = recordNameKey(name);
          const extras = cloudRecords.filter((r) => r && r.id !== record.id && recordNameKey(r.name) === key);
          await recordsRef().doc(String(record.id)).set(record);
          await Promise.all(
            extras.map((r) => recordsRef().doc(String(r.id)).delete().catch(() => {}))
          );
          cloudRecords = dedupeRecords([
            record,
            ...cloudRecords.filter((r) => r && r.id !== record.id && recordNameKey(r.name) !== key),
          ]);
        } catch (err) {
          console.warn(err);
        }
      }
      showSaveMsg(msgEl, `「${name}」을 저장했습니다.`, true);
      persist();
      renderRecords();
    } finally {
      recordSaveBusy = false;
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
        const marked = rec.score?.totalMarked ?? markedCountFor(rec.answers);
        const status = recordStatus(rec);
        const tag =
          status === "in-progress"
            ? '<span class="record-tag is-resume">이어 풀기</span>'
            : '<span class="record-tag is-graded">채점</span>';
        const detail =
          status === "in-progress"
            ? `${formatSavedAt(rec.savedAt)} · 표기 ${marked} / 100`
            : `${formatSavedAt(rec.savedAt)} · 총점 ${total} / ${keyed} · 푼 문제 ${marked}`;
        return `
          <div class="record-item" data-id="${rec.id}">
            <button type="button" class="record-open" data-id="${rec.id}">
              <strong>${tag}${escapeHtml(rec.name)}</strong>
              <span>${detail}</span>
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
    if (els.resumeRecordName && !els.resumeRecordName.value.trim()) {
      els.resumeRecordName.value = roundTitle();
    }
    showSaveMsg(els.resumeRecordMsg, "", true);
    openModal(els.recordsModal);
  }

  function applyRecord(id) {
    const rec = recordsForUi().find((r) => r.id === id);
    if (!rec) return;
    if (startedExam() && !confirm("지금 화면의 답을 덮고 이 회차를 불러올까요?")) return;
    state.recordId = rec.id;
    state.answers = normalizeAnswers(rec.answers);
    state.answerKeys = { ...defaultState().answerKeys, ...(rec.answerKeys || {}) };
    state.note = rec.note || "";
    state.timings = { ...emptyCountMap(), ...(rec.timings || {}) };
    state.skips = { ...emptyCountMap(), ...(rec.skips || {}) };
    if (els.notepad) els.notepad.value = state.note;
    const progress = rec.progress;
    const status = recordStatus(rec);
    if (status === "in-progress") {
      if (progress) {
        state.section = progress.section || SECTIONS[0].id;
        const idx = SECTIONS.findIndex((s) => s.id === state.section);
        state.examIndex = Number.isInteger(progress.examIndex)
          ? progress.examIndex
          : idx >= 0
            ? idx
            : 0;
        state.qIndex = Math.min(Math.max(Number(progress.qIndex) || 1, 1), SECTION_SIZE + 1);
        state.remainingMs = Math.max(0, Number(progress.remainingMs) || sectionLimitMs(state.section));
        state.spentMs = { ...emptySpent(), ...(progress.spentMs || {}) };
      }
      state.reviewMode = false;
      state.running = false;
      state.lastTick = null;
      state.qStartedAt = null;
      stopClock();
      persist();
      renderOMR();
      renderTimer();
      closeModal(els.recordsModal);
      showToast(`「${rec.name}」을 불러왔습니다. 연습 시작을 누르면 이어서 풉니다.`);
      return;
    }
    state.reviewMode = true;
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

  function avgSecFor(id) {
    const vals = Object.values(state.timings[id] || {})
      .map(Number)
      .filter((n) => n > 0);
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length / 1000;
  }

  function roundTitle() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 연습`;
  }

  function csvCell(v) {
    return `"${String(v ?? "").replace(/"/g, '""')}"`;
  }

  function buildRoundCsv(name) {
    const reports = lastGrade || SECTIONS.map((sec) => ({
      ...sec,
      ...evaluateSection(sec.id, (state.answerKeys && state.answerKeys[sec.id]) || ""),
    }));
    const lines = [
      ["회차", "영역", "정답률(%)", "평균소요(초)", "스킵", "맞음", "틀림", "미표기"].map(csvCell).join(","),
    ];
    reports.forEach((r) => {
      const keyed = Math.min(r.keyed, SECTION_SIZE) || SECTION_SIZE;
      const rate = keyed ? ((r.correct / keyed) * 100).toFixed(1) : "0.0";
      lines.push(
        [name, r.name, rate, avgSecFor(r.id).toFixed(1), r.skipCount || 0, r.correct, r.wrongMarked, r.blank]
          .map(csvCell)
          .join(",")
      );
    });
    lines.push("");
    lines.push(["회차", "영역", "문항", "내답", "정답", "결과", "소요초", "스킵"].map(csvCell).join(","));
    reports.forEach((r) => {
      (r.items || []).forEach((it) => {
        const label =
          it.status === "correct"
            ? "맞음"
            : it.status === "wrong"
              ? "틀림"
              : it.status === "skip"
                ? "스킵"
                : it.status === "blank"
                  ? "미표기"
                  : "";
        lines.push(
          [
            name,
            r.name,
            it.q,
            it.mine || "",
            it.ans || "",
            label,
            (Number(it.ms || 0) / 1000).toFixed(1),
            it.skipped ? "Y" : "",
          ]
            .map(csvCell)
            .join(",")
        );
      });
    });
    return lines.join("\r\n");
  }

  function downloadCsv(filename, text) {
    const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function saveNewExcel() {
    const name = (els.recordName && els.recordName.value.trim()) || roundTitle();
    downloadCsv(`${name.replace(/[\\/:*?"<>|]/g, "_")}.csv`, buildRoundCsv(name));
    showRecordMsg("엑셀(CSV) 파일을 저장했습니다.", true);
  }

  async function appendExcel() {
    const name = (els.recordName && els.recordName.value.trim()) || roundTitle();
    const chunk = buildRoundCsv(name);
    if (!window.showOpenFilePicker) {
      downloadCsv(`${name.replace(/[\\/:*?"<>|]/g, "_")}.csv`, chunk);
      showRecordMsg("이 브라우저는 기존 파일 추가를 지원하지 않아 새 파일로 받았습니다.", true);
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "CSV", accept: { "text/csv": [".csv"], "text/plain": [".txt"] } }],
      });
      const file = await handle.getFile();
      const old = (await file.text()).replace(/^\uFEFF/, "").trimEnd();
      const next = `${old}\r\n\r\n${chunk}`;
      const writable = await handle.createWritable();
      await writable.write("\uFEFF" + next);
      await writable.close();
      showRecordMsg("기존 엑셀(CSV)에 이 회차를 추가했습니다.", true);
    } catch (err) {
      if (err && err.name === "AbortError") return;
      console.warn(err);
      showRecordMsg("기존 파일에 추가하지 못했습니다. 새 엑셀로 저장해 보세요.", false);
    }
  }

  function ensureExamRunning() {
    if (state.reviewMode) return;
    if (!state.running) {
      state.running = true;
      state.lastTick = Date.now();
      ensureAudio();
      startClock();
      startQuestionClock();
      renderTimer();
    }
  }

  function goToQuestion(skip) {
    if (state.reviewMode) return;
    ensureExamRunning();
    const q = Number(state.qIndex);
    if (q < 1 || q > SECTION_SIZE) return;
    addTimeToCurrent();
    const sec = state.section;
    if (!state.skips[sec]) state.skips[sec] = {};
    const answers = sectionAnswers();
    if (skip || !answers[q]) {
      delete answers[q];
      state.skips[sec][q] = true;
    } else {
      delete state.skips[sec][q];
    }
    state.qIndex = q + 1;
    startQuestionClock();
    renderOMR();
    persist();
  }

  function skipWholeSection() {
    if (state.reviewMode) return;
    if (!confirm("이 과목의 남은 문항을 스킵하고 다음 영역으로 갈까요?")) return;
    addTimeToCurrent();
    skipRestOfSection();
    bankCurrentSpent();
    const next = state.examIndex + 1;
    if (next >= SECTIONS.length) {
      state.running = false;
      stopClock();
      renderOMR();
      renderTimer();
      persist();
      openGradeModal(true);
      return;
    }
    state.examIndex = next;
    state.section = SECTIONS[next].id;
    state.qIndex = 1;
    state.remainingMs = sectionLimitMs(SECTIONS[next].id);
    state.lastTick = Date.now();
    startQuestionClock();
    renderOMR();
    renderTimer();
    persist();
    showToast(`${SECTIONS[next].name}으로 건너뜁니다.`);
  }

  function questionGridHtml(report) {
    const items = report.items || [];
    const cell = (it) => {
      const cls =
        it.status === "correct"
          ? "ok"
          : it.status === "wrong"
            ? "bad"
            : it.status === "skip"
              ? "skip"
              : "mute";
      return `<td>
        <button type="button" class="q-cell ${cls} grade-sub-btn" data-section="${report.id}" title="${report.name} ${it.q}번">
          <strong>${it.q}</strong>
          <span>${it.mine || "-"} / ${it.ans || "-"}</span>
          <em>${(Number(it.ms || 0) / 1000).toFixed(1)}s</em>
        </button>
      </td>`;
    };
    const row = (from) => `<tr>${items.slice(from, from + 10).map(cell).join("")}</tr>`;
    return `<section class="q-grid-block">
      <h3>${escapeHtml(report.name)}</h3>
      <table class="q-grid">${row(0)}${row(10)}</table>
    </section>`;
  }

  function resetExam() {
    if (!confirm("시간과 표기한 답을 모두 지우고 처음부터 할까요?")) return;
    if (els.gradeModal && !els.gradeModal.hidden) closeModal(els.gradeModal);
    armExam(true);
  }

  function retryPractice() {
    resetExam();
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
    lastGrade = reports;
    state.reviewMode = true;
    addTimeToCurrent();
    const totalCorrect = reports.reduce((n, r) => n + r.correct, 0);
    const totalMarked = reports.reduce((n, r) => n + r.marked, 0);
    const totalKeyed = reports.reduce((n, r) => n + Math.min(r.keyed, SECTION_SIZE), 0);
    const rows = reports.map((r) => {
      const keyed = Math.min(r.keyed, SECTION_SIZE) || 0;
      const rate = keyed ? ((r.correct / keyed) * 100).toFixed(1) : "0.0";
      return { ...r, rate: Number(rate), avg: avgSecFor(r.id), skipN: r.skipCount || 0 };
    });
    const weakest = rows
      .filter((r) => (state.answerKeys[r.id] || "").length)
      .sort((a, b) => a.rate - b.rate || b.skipN - a.skipN)[0];
    const table = `
      <table class="result-table">
        <thead><tr><th>영역</th><th>정답률</th><th>평균소요</th><th>스킵</th><th>맞음</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr class="${weakest && weakest.id === r.id ? "is-weak" : ""}" data-section="${r.id}">
                <td><button type="button" class="grade-sub-btn" data-section="${r.id}">${r.name}</button></td>
                <td>${r.rate.toFixed(1)}%</td>
                <td>${r.avg.toFixed(1)}s</td>
                <td>${r.skipN}</td>
                <td>${r.correct} / 20</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
    const grids = rows.map(questionGridHtml).join("");
    els.gradeSummary.hidden = false;
    els.gradeSummary.innerHTML = `
      <p class="result-weak">${weakest ? `가장 약한 영역: ${weakest.name}` : "채점 결과"}</p>
      <div class="grade-totals">
        <div><em>총점</em><strong>${totalCorrect}</strong><span>/ ${totalKeyed || 100}</span></div>
        <div><em>푼 문제</em><strong>${totalMarked}</strong><span>/ 100</span></div>
      </div>
      ${table}
      <p class="q-legend"><span class="ok">맞음</span> <span class="bad">틀림</span> <span class="skip">스킵</span> <span class="mute">미표기</span> · 칸은 내 답 / 정답 · 소요시간</p>
      ${grids}`;
    if (els.excelBox) els.excelBox.hidden = false;
    els.gradeDetail.hidden = true;
    renderOMR();
  }

  function openGradeModal(ended = false) {
    if (els.gradeIntro && !ended) {
      els.gradeIntro.textContent =
        "각 과목 정답 20개를 붙여 넣으세요. 예: 12345214...";
    }
    renderGradeKeys();
    if (els.gradeSummary) els.gradeSummary.hidden = true;
    if (els.gradeDetail) els.gradeDetail.hidden = true;
    if (els.excelBox) els.excelBox.hidden = true;
    showRecordMsg("", true);
    if (els.recordName && !els.recordName.value.trim()) els.recordName.value = roundTitle();
    openModal(els.gradeModal);
  }

  function openModal(el) {
    el.hidden = false;
  }

  function closeModal(el) {
    el.hidden = true;
  }

  function fillSettingsForm() {
    const box = $("#settings-times");
    if (box) {
      box.innerHTML = SECTIONS.map(
        (s) =>
          `<label>${s.name} (분)<input type="number" min="1" max="60" data-section="${s.id}" value="${
            state.sectionMinutes[s.id] || 15
          }" /></label>`
      ).join("");
    }
    if ($("#settings-alarm-on")) $("#settings-alarm-on").checked = state.alarmOn !== false;
    if ($("#settings-alarm-min")) $("#settings-alarm-min").value = String(state.alarmEveryMin || 15);
  }

  function saveSettings() {
    $$("#settings-times input[data-section]").forEach((inp) => {
      state.sectionMinutes[inp.dataset.section] = Math.max(1, Number(inp.value) || 15);
    });
    state.alarmOn = Boolean($("#settings-alarm-on") && $("#settings-alarm-on").checked);
    state.alarmEveryMin = Math.max(1, Number($("#settings-alarm-min") && $("#settings-alarm-min").value) || 15);
    if (!startedExam()) state.remainingMs = sectionLimitMs();
    renderTimer();
    persist();
    if (els.settingsModal) closeModal(els.settingsModal);
  }

  function bind() {
    els.timerToggle.addEventListener("click", () => {
      if (state.reviewMode) {
        if (!confirm("채점 화면을 닫고 이어서 연습할까요? 이미 넘어간 문항은 그대로입니다.")) return;
        state.reviewMode = false;
      }
      if (state.remainingMs <= 0 && state.examIndex >= SECTIONS.length - 1) armExam(true);
      allowAlarms();
      state.running = true;
      state.lastTick = Date.now();
      ensureAudio();
      beep("start");
      startClock();
      startQuestionClock();
      renderTimer();
      renderOMR();
      persist();
    });

    if (els.timerPause) {
      els.timerPause.addEventListener("click", () => {
        if (!startedExam() && !state.running) return;
        if (state.running) {
          addTimeToCurrent();
          state.running = false;
          state.lastTick = null;
          stopClock();
        } else {
          state.running = true;
          state.lastTick = Date.now();
          startClock();
          startQuestionClock();
        }
        renderTimer();
        persist();
      });
    }

    if (els.skipSectionBtn) els.skipSectionBtn.addEventListener("click", skipWholeSection);
    if ($("#timer-reset")) $("#timer-reset").addEventListener("click", resetExam);
    $("#preview-end").addEventListener("click", () => {
      muteAlarms();
      stopClock();
      addTimeToCurrent();
      state.running = false;
      state.lastTick = null;
      renderTimer();
      persist();
      if (els.gradeIntro) {
        els.gradeIntro.textContent =
          "채점하려면 각 과목 정답 20개를 붙여 넣고 전체 채점을 누르세요.";
      }
      openGradeModal(true);
    });

    $("#finish-close").addEventListener("click", () => closeModal(els.finishModal));
    $("#finish-ok").addEventListener("click", () => closeModal(els.finishModal));
    $("#finish-grade").addEventListener("click", () => {
      closeModal(els.finishModal);
      openGradeModal();
    });

    if (els.omrToggle) {
      els.omrToggle.addEventListener("click", () => {
        state.omrOpen = !state.omrOpen;
        renderOMR();
        persist();
      });
    }

    els.omrSections.addEventListener("click", (e) => {
      const btn = e.target.closest(".omr-sec");
      if (!btn) return;
      const idx = SECTIONS.findIndex((s) => s.id === btn.dataset.section);
      if (!state.reviewMode && idx !== state.examIndex) return;
      state.section = btn.dataset.section;
      if (state.reviewMode) state.examIndex = idx;
      renderOMR();
      persist();
    });

    els.omrList.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]");
      if (act) {
        goToQuestion(act.dataset.act === "skip");
        return;
      }
      const btn = e.target.closest(".omr-choice");
      if (!btn || btn.disabled) return;
      const row = btn.closest(".omr-row");
      if (!row || (!state.reviewMode && !row.classList.contains("is-active"))) return;
      const q = row.dataset.q;
      const answers = sectionAnswers();
      const choice = Number(btn.dataset.choice);
      if (Number(answers[q]) === choice) delete answers[q];
      else answers[q] = choice;
      row.querySelectorAll(".omr-choice").forEach((c) => {
        c.classList.toggle("is-on", Number(c.dataset.choice) === Number(answers[q]));
      });
      updateFilled();
      scheduleSave();
    });
    $("#grade-close").addEventListener("click", () => closeModal(els.gradeModal));
    $("#grade-cancel").addEventListener("click", () => closeModal(els.gradeModal));
    $("#grade-run").addEventListener("click", gradeAll);
    $("#record-save").addEventListener("click", () => saveCurrentRecord("grade"));
    if ($("#resume-record-save")) {
      $("#resume-record-save").addEventListener("click", () => saveCurrentRecord("records"));
    }
    if ($("#excel-new")) $("#excel-new").addEventListener("click", () => saveNewExcel().catch((err) => console.warn(err)));
    if ($("#excel-append")) $("#excel-append").addEventListener("click", () => appendExcel().catch((err) => console.warn(err)));
    if ($("#retry-practice")) $("#retry-practice").addEventListener("click", retryPractice);
    els.recordName.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveCurrentRecord("grade");
      }
    });
    if (els.resumeRecordName) {
      els.resumeRecordName.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          saveCurrentRecord("records");
        }
      });
    }
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
        if (els.settingsModal && !els.settingsModal.hidden) {
          closeModal(els.settingsModal);
          return;
        }
      }
      if (
        !els.helpModal.hidden ||
        !els.gradeModal.hidden ||
        (els.finishModal && !els.finishModal.hidden) ||
        (els.recordsModal && !els.recordsModal.hidden) ||
        (els.settingsModal && !els.settingsModal.hidden)
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

    if (els.alarmOn) {
      els.alarmOn.addEventListener("change", () => {
        state.alarmOn = els.alarmOn.checked;
        persist();
      });
    }
    if (els.settingsBtn) {
      els.settingsBtn.addEventListener("click", () => {
        fillSettingsForm();
        openModal(els.settingsModal);
      });
    }
    if ($("#settings-close")) $("#settings-close").addEventListener("click", () => closeModal(els.settingsModal));
    if ($("#settings-cancel")) $("#settings-cancel").addEventListener("click", () => closeModal(els.settingsModal));
    if ($("#settings-save")) $("#settings-save").addEventListener("click", saveSettings);

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

  function fillStaticCopy() {
    if (els.timerReady) {
      els.timerReady.textContent = "시작 후 문항마다 시간을 잽니다. 다음·스킵하면 뒤로 가지 못합니다.";
    }
    const helpBody = $("#help-body");
    if (helpBody) {
      helpBody.innerHTML = `<ol>
        <li><strong>진행</strong> 지금 문항만 고릅니다. 다음·스킵을 누르면 다음으로 갑니다.</li>
        <li><strong>타이머</strong> 과목당 15분, 총 75분. 시간이 끝나면 남은 문항은 스킵하고 다음 과목으로 갑니다.</li>
        <li><strong>채점</strong> 정답 20개를 붙여 넣고 채점하면 과목별 정답률, 평균 소요, 스킵, 틀린 문항이 나옵니다. 엑셀(CSV)로 저장하거나 같은 파일에 회차를 이어 붙입니다.</li>
        <li><strong>기록</strong> 채점 전이어도 지금 답안을 저장할 수 있습니다. 기록에서 회차를 누르면 이어서 풉니다.</li>
        <li><strong>계산기 / 메모</strong> 오른쪽에서 계산하고 메모·그림을 남깁니다. 구글 로그인하면 회차가 계정에 남습니다.</li>
      </ol>`;
    }
    if (els.finishMessage) {
      els.finishMessage.textContent =
        "인지역량 5과목이 모두 끝났습니다. 과목당 15분씩, 총 75분이 지났습니다.";
    }
    if (els.gradeIntro) {
      els.gradeIntro.textContent = "각 과목 정답 20개를 붙여 넣으세요. 예: 12345214...";
    }
    if (els.recordsLead && !els.recordsLead.textContent.trim()) {
      els.recordsLead.textContent =
        "채점 전이어도 지금 답안을 저장할 수 있습니다. 이어 풀기 회차는 이름을 누르면 이어서 풉니다.";
    }
    const hint = $("#resume-save-hint");
    if (hint) {
      hint.textContent = "채점 전이어도 됩니다. 표기한 답을 저장한 뒤, 나중에 이어서 풀 수 있습니다.";
    }
    const excelHint = $("#excel-hint");
    if (excelHint) {
      excelHint.textContent =
        "처음이면 새 엑셀로 저장하고, 다음부터는 같은 파일을 골라 회차를 이어 붙이세요. 엑셀에서 열리는 CSV입니다.";
    }
  }

  function init() {
    try {
      fillStaticCopy();
    } catch (err) {
      console.warn(err);
    }
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

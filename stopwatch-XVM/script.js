'use strict';

(function () {

  // ── DOM ──────────────────────────────────────────────────────────────────
  const timeDisplay  = document.getElementById('time-display');
  const millisDisp   = document.getElementById('millis-display');
  const displayWrap  = document.getElementById('display-wrap');
  const btnStartStop = document.getElementById('btn-startstop');
  const btnLap       = document.getElementById('btn-lap');
  const btnClear     = document.getElementById('btn-clear');
  const btnStopwatch = document.getElementById('btn-stopwatch');
  const btnCountdown = document.getElementById('btn-countdown');
  const cdInputs     = document.getElementById('cd-inputs');
  const inpH         = document.getElementById('inp-h');
  const inpM         = document.getElementById('inp-m');
  const inpS         = document.getElementById('inp-s');
  const lapList      = document.getElementById('lap-list');
  const lapsSection  = document.getElementById('laps-section');
  const srStatus     = document.getElementById('sr-status');

  // ── State ─────────────────────────────────────────────────────────────────
  const state = {
    mode:      'stopwatch',   // 'stopwatch' | 'countdown'
    running:   false,
    startTs:   0,             // performance.now() at last resume
    elapsed:   0,             // accumulated ms
    cdTarget:  0,             // countdown target ms
    lapBasis:  0,             // elapsed at last lap mark
    laps:      [],
    rafId:     null,
    finished:  false,
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function pad2(n)  { return String(Math.floor(n)).padStart(2, '0'); }
  function pad3(n)  { return String(Math.floor(n)).padStart(3, '0'); }

  function splitMs(ms) {
    const total = Math.floor(ms);
    const millis = total % 1000;
    const secs   = Math.floor(total / 1000) % 60;
    const mins   = Math.floor(total / 60000) % 60;
    const hrs    = Math.floor(total / 3600000);
    return { hrs, mins, secs, millis };
  }

  function formatMain(ms) {
    const { hrs, mins, secs } = splitMs(ms);
    return `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)}`;
  }

  function clampInt(val, min, max) {
    const n = parseInt(val, 10);
    return isNaN(n) ? min : Math.min(max, Math.max(min, n));
  }

  function announce(msg) {
    // Toggle so repeated identical messages re-trigger screen readers
    srStatus.textContent = '';
    requestAnimationFrame(() => { srStatus.textContent = msg; });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render(ms) {
    const { millis } = splitMs(ms);
    timeDisplay.textContent = formatMain(ms);
    millisDisp.textContent  = pad3(millis);
  }

  function renderCountdownTarget() {
    const h = clampInt(inpH.value, 0, 99);
    const m = clampInt(inpM.value, 0, 59);
    const s = clampInt(inpS.value, 0, 59);
    render((h * 3600 + m * 60 + s) * 1000);
  }

  // ── RAF loop ───────────────────────────────────────────────────────────────
  function tick() {
    if (!state.running) return;

    const now     = performance.now();
    const elapsed = state.elapsed + (now - state.startTs);

    if (state.mode === 'stopwatch') {
      render(elapsed);
    } else {
      const remaining = Math.max(0, state.cdTarget - elapsed);
      render(remaining);
      if (remaining === 0) {
        state.elapsed  = state.cdTarget;   // freeze at 00:00:00
        state.running  = false;
        state.finished = true;
        cancelAnimationFrame(state.rafId);
        displayWrap.classList.add('finished');
        setStartBtnState('start');
        announce('Countdown finished!');
        return;
      }
    }

    state.rafId = requestAnimationFrame(tick);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function start() {
    if (state.finished) return;

    if (state.mode === 'countdown' && state.elapsed === 0) {
      const h = clampInt(inpH.value, 0, 99);
      const m = clampInt(inpM.value, 0, 59);
      const s = clampInt(inpS.value, 0, 59);
      const total = (h * 3600 + m * 60 + s) * 1000;
      if (total === 0) {
        announce('Please set a time greater than zero.');
        return;
      }
      state.cdTarget = total;
    }

    state.running = true;
    state.startTs = performance.now();
    setStartBtnState('pause');
    btnLap.disabled = (state.mode === 'countdown');
    state.rafId = requestAnimationFrame(tick);
    announce('Timer started');
  }

  function pause() {
    if (!state.running) return;
    state.running  = false;
    state.elapsed += performance.now() - state.startTs;
    cancelAnimationFrame(state.rafId);
    setStartBtnState('start');
    announce('Timer paused');
  }

  function clear() {
    state.running  = false;
    state.elapsed  = 0;
    state.cdTarget = 0;
    state.lapBasis = 0;
    state.laps     = [];
    state.finished = false;
    cancelAnimationFrame(state.rafId);
    displayWrap.classList.remove('finished');
    setStartBtnState('start');
    btnLap.disabled = true;

    // Empty lap list safely (no innerHTML)
    while (lapList.firstChild) lapList.removeChild(lapList.firstChild);

    if (state.mode === 'countdown') {
      renderCountdownTarget();
    } else {
      render(0);
    }
    announce('Timer cleared');
  }

  function lap() {
    if (!state.running || state.mode === 'countdown') return;
    const now     = performance.now();
    const total   = state.elapsed + (now - state.startTs);
    const lapTime = total - state.lapBasis;
    state.lapBasis = total;
    const n = state.laps.push(lapTime);

    // Build lap row without innerHTML (XSS-safe)
    const li      = document.createElement('li');
    const numSpan = document.createElement('span');
    const lapSpan = document.createElement('span');
    const totSpan = document.createElement('span');
    lapSpan.classList.add('col-right');
    totSpan.classList.add('col-right');

    numSpan.textContent = `Lap ${n}`;
    lapSpan.textContent = `${formatMain(lapTime)}.${pad3(splitMs(lapTime).millis)}`;
    totSpan.textContent = formatMain(total);

    li.append(numSpan, lapSpan, totSpan);
    lapList.prepend(li);           // newest first
    announce(`Lap ${n}: ${lapSpan.textContent}`);
  }

  // ── Button state helper ────────────────────────────────────────────────────
  function setStartBtnState(which) {
    if (which === 'pause') {
      btnStartStop.textContent = 'Pause';
      btnStartStop.setAttribute('aria-label', 'Pause timer');
      btnStartStop.className = 'btn btn-pause';
    } else {
      btnStartStop.textContent = 'Start';
      btnStartStop.setAttribute('aria-label', 'Start timer');
      btnStartStop.className = 'btn btn-start';
    }
  }

  // ── Mode switching ─────────────────────────────────────────────────────────
  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    clear();

    if (mode === 'stopwatch') {
      btnStopwatch.classList.add('active');
      btnStopwatch.setAttribute('aria-selected', 'true');
      btnCountdown.classList.remove('active');
      btnCountdown.setAttribute('aria-selected', 'false');
      cdInputs.classList.remove('visible');
      lapsSection.style.display = '';
      btnLap.style.display = '';
    } else {
      btnCountdown.classList.add('active');
      btnCountdown.setAttribute('aria-selected', 'true');
      btnStopwatch.classList.remove('active');
      btnStopwatch.setAttribute('aria-selected', 'false');
      cdInputs.classList.add('visible');
      lapsSection.style.display = 'none';
      btnLap.style.display = 'none';
      renderCountdownTarget();
    }
  }

  // ── Event listeners ────────────────────────────────────────────────────────
  btnStartStop.addEventListener('click', () => state.running ? pause() : start());
  btnLap      .addEventListener('click', lap);
  btnClear    .addEventListener('click', clear);
  btnStopwatch.addEventListener('click', () => setMode('stopwatch'));
  btnCountdown.addEventListener('click', () => setMode('countdown'));

  // Sanitise number inputs
  [inpH, inpM, inpS].forEach(input => {
    input.addEventListener('change', function () {
      this.value = clampInt(this.value, +this.min, +this.max);
      if (!state.running && state.elapsed === 0) renderCountdownTarget();
    });
  });

  // Keyboard shortcuts (Space / L / R) — ignored when typing in inputs
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        state.running ? pause() : start();
        break;
      case 'l': case 'L':
        lap();
        break;
      case 'r': case 'R':
        clear();
        break;
    }
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  render(0);
  setMode('stopwatch');

  const LIMITS = { 'inp-h': [0, 99], 'inp-m': [0, 59], 'inp-s': [0, 59] };

  function commitInput(inp) {
    const [min, max] = LIMITS[inp.id];
    const v = clampInt(inp.value, min, max);
    inp.value = String(v).padStart(2, '0');
    if (!state.running && state.elapsed === 0) renderCountdownTarget();
  }

  function stepInput(inp, dir) {
    const [min, max] = LIMITS[inp.id];
    let v = clampInt(inp.value, min, max) + dir;
    if (v > max) v = min;
    if (v < min) v = max;
    inp.value = String(v).padStart(2, '0');
    if (!state.running && state.elapsed === 0) renderCountdownTarget();
  }

  [inpH, inpM, inpS].forEach(inp => {
    inp.addEventListener('focus',  function () { this.select(); });
    inp.addEventListener('blur',   () => commitInput(inp));
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp')   { e.preventDefault(); stepInput(inp, +1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); stepInput(inp, -1); }
    });
  });

  // Step buttons with hold-to-repeat
  document.querySelectorAll('.step-btn').forEach(btn => {
    const dir = btn.classList.contains('step-up') ? +1 : -1;
    const target = () => document.getElementById(btn.dataset.target);
    let timer;
    function doStep() { stepInput(target(), dir); }
    btn.addEventListener('click', doStep);
    btn.addEventListener('pointerdown', () => { timer = setInterval(doStep, 130); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
      btn.addEventListener(ev, () => clearInterval(timer))
    );
  });

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = parseInt(btn.dataset.min, 10);
      inpH.value = '00';
      inpM.value = String(m).padStart(2, '0');
      inpS.value = '00';
      renderCountdownTarget();
    });
  });

})();
// --- Tabs ---

const tabBtnMouse = document.getElementById('tabBtnMouse');
const tabBtnPomodoro = document.getElementById('tabBtnPomodoro');
const panelMouse = document.getElementById('panelMouse');
const panelPomodoro = document.getElementById('panelPomodoro');
const mouseDot = document.getElementById('mouseDot');
const pomodoroDot = document.getElementById('pomodoroDot');

function showTab(tab) {
    const isMouse = tab === 'mouse';
    panelMouse.hidden = !isMouse;
    panelPomodoro.hidden = isMouse;
    tabBtnMouse.classList.toggle('active', isMouse);
    tabBtnPomodoro.classList.toggle('active', !isMouse);
}

tabBtnMouse.addEventListener('click', () => showTab('mouse'));
tabBtnPomodoro.addEventListener('click', () => showTab('pomodoro'));

// --- Mouse Mover ---
// Runs entirely in the main process, so it keeps moving the mouse
// regardless of which tab is showing — the UI here just reflects state.

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusBadge = document.getElementById('statusBadge');
const coords = document.getElementById('coords');

startBtn.addEventListener('click', () => {
    window.mouseAPI.start();
});

stopBtn.addEventListener('click', () => {
    window.mouseAPI.stop();
});

// ESC or Backspace in UI window too (local fallback)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape'
        // || e.key === 'Backspace'
    ) {
        window.mouseAPI.stop();
    }
});

// Listen for status updates from main process
window.mouseAPI.onStatus((status) => {
    const running = status === 'running';
    mouseDot.classList.toggle('on', running);

    if (running) {
        statusBadge.textContent = '● RUNNING';
        statusBadge.className = 'status-badge running';
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } else {
        statusBadge.textContent = '● STOPPED';
        statusBadge.className = 'status-badge stopped';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        coords.textContent = '—';
    }
});

// Show last moved coordinates
window.mouseAPI.onMouseMoved((pos) => {
    coords.textContent = `Last move → x: ${pos.x}, y: ${pos.y}`;
});

// --- Pomodoro ---
// Also runs entirely in the main process (independent timer from the
// mouse mover), so it keeps counting down whichever tab is active.

const workMinInput = document.getElementById('workMinInput');
const breakMinInput = document.getElementById('breakMinInput');
const pomodoroBadge = document.getElementById('pomodoroBadge');
const pomodoroTimer = document.getElementById('pomodoroTimer');
const pomodoroStartBtn = document.getElementById('pomodoroStartBtn');
const pomodoroPauseBtn = document.getElementById('pomodoroPauseBtn');
const pomodoroStopBtn = document.getElementById('pomodoroStopBtn');
const dailyTotalLabel = document.getElementById('dailyTotalLabel');
const dailyProgressFill = document.getElementById('dailyProgressFill');

function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function formatDuration(totalSeconds) {
    const totalMinutes = Math.floor(totalSeconds / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
}

function updateDailyTotal(dailyTotalSeconds, dailyGoalSeconds) {
    const goalMet = dailyTotalSeconds >= dailyGoalSeconds;
    const pct = Math.min(100, (dailyTotalSeconds / dailyGoalSeconds) * 100);

    dailyTotalLabel.textContent = `Today: ${formatDuration(dailyTotalSeconds)} / ${formatDuration(dailyGoalSeconds)}`;
    dailyTotalLabel.classList.toggle('goal-met', goalMet);
    dailyProgressFill.style.width = `${pct}%`;
    dailyProgressFill.classList.toggle('goal-met', goalMet);
}

pomodoroStartBtn.addEventListener('click', () => {
    const workMin = parseInt(workMinInput.value, 10) || 45;
    const breakMin = parseInt(breakMinInput.value, 10) || 5;
    window.pomodoroAPI.start(workMin, breakMin);
});

pomodoroPauseBtn.addEventListener('click', () => {
    if (pomodoroPauseBtn.dataset.paused === 'true') {
        window.pomodoroAPI.resume();
    } else {
        window.pomodoroAPI.pause();
    }
});

pomodoroStopBtn.addEventListener('click', () => {
    window.pomodoroAPI.stop();
});

window.pomodoroAPI.onUpdate(({ phase, remaining, workMin, breakMin, paused, dailyTotalSeconds, dailyGoalSeconds }) => {
    pomodoroDot.classList.toggle('on', !!phase && !paused);
    pomodoroDot.classList.toggle('paused', !!phase && !!paused);
    updateDailyTotal(dailyTotalSeconds, dailyGoalSeconds);

    if (!phase) {
        pomodoroBadge.textContent = '● IDLE';
        pomodoroBadge.className = 'status-badge stopped';
        pomodoroTimer.textContent = '--:--';
        pomodoroStartBtn.disabled = false;
        pomodoroPauseBtn.disabled = true;
        pomodoroPauseBtn.textContent = '⏸ Pause';
        pomodoroPauseBtn.dataset.paused = 'false';
        pomodoroStopBtn.disabled = true;
        workMinInput.disabled = false;
        breakMinInput.disabled = false;
        return;
    }

    if (paused) {
        pomodoroBadge.textContent = '● PAUSED';
        pomodoroBadge.className = 'status-badge paused';
        pomodoroPauseBtn.textContent = '▶ Resume';
        pomodoroPauseBtn.dataset.paused = 'true';
    } else {
        pomodoroBadge.textContent = phase === 'work' ? '● WORK' : '● BREAK';
        pomodoroBadge.className = `status-badge ${phase === 'work' ? 'running' : 'break'}`;
        pomodoroPauseBtn.textContent = '⏸ Pause';
        pomodoroPauseBtn.dataset.paused = 'false';
    }

    pomodoroTimer.textContent = formatTime(remaining);
    pomodoroStartBtn.disabled = true;
    pomodoroPauseBtn.disabled = false;
    pomodoroStopBtn.disabled = false;
    workMinInput.disabled = true;
    breakMinInput.disabled = true;
    workMinInput.value = workMin;
    breakMinInput.value = breakMin;
});

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
    if (status === 'running') {
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
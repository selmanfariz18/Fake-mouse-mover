const { app, BrowserWindow, ipcMain, globalShortcut, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const os = require('os');

let mainWindow;
let moveInterval = null;
let lastX = 960;
let lastY = 540;

let SCREEN_WIDTH = 1920;
let SCREEN_HEIGHT = 1080;
const MIN_MOVE = 100;
const MAX_MOVE = 300;

let pomodoroInterval = null;
let pomodoroPhase = null; // 'work' | 'break' | null (idle)
let pomodoroRemaining = 0; // seconds left in current phase
let pomodoroWorkMin = 45;
let pomodoroBreakMin = 5;
let pomodoroPaused = false;

const DAILY_GOAL_SECONDS = 8 * 60 * 60; // 8-hour work day
let dailyTotalsFile = null; // resolved once app is ready
let dailyTotalDate = null;
let dailyTotalSeconds = 0;

// Detect screen size per platform
function detectScreenSize() {
    try {
        if (os.platform() === 'win32') {
            const out = execSync(
                'Get-CimInstance -ClassName Win32_VideoController | Select-Object -First 1 -ExpandProperty CurrentHorizontalResolution; Get-CimInstance -ClassName Win32_VideoController | Select-Object -First 1 -ExpandProperty CurrentVerticalResolution',
                { shell: 'powershell.exe' }
            ).toString().trim();
            const lines = out.split('\n').map(l => parseInt(l.trim())).filter(n => !isNaN(n));
            if (lines.length >= 2) {
                SCREEN_WIDTH = lines[0];
                SCREEN_HEIGHT = lines[1];
            }
        } else {
            const out = execSync('xdotool getdisplaygeometry').toString().trim();
            const parts = out.split(' ');
            SCREEN_WIDTH = parseInt(parts[0]) || 1920;
            SCREEN_HEIGHT = parseInt(parts[1]) || 1080;
        }
        console.log(`🖥️ Screen detected: ${SCREEN_WIDTH}x${SCREEN_HEIGHT}`);
    } catch (e) {
        console.log(`🖥️ Using default screen size: ${SCREEN_WIDTH}x${SCREEN_HEIGHT}`);
    }
}

// Get current mouse position
function getCurrentMousePos() {
    try {
        if (os.platform() === 'win32') {
            const out = execSync(
                'Add-Type -AssemblyName System.Windows.Forms; $p = [System.Windows.Forms.Cursor]::Position; Write-Output ($p.X); Write-Output ($p.Y)',
                { shell: 'powershell.exe' }
            ).toString().trim();
            const lines = out.split('\n').map(l => parseInt(l.trim())).filter(n => !isNaN(n));
            if (lines.length >= 2) {
                lastX = lines[0];
                lastY = lines[1];
                return { x: lines[0], y: lines[1] };
            }
        } else {
            const output = execSync('xdotool getmouselocation').toString();
            const xMatch = output.match(/x:(\d+)/);
            const yMatch = output.match(/y:(\d+)/);
            if (xMatch && yMatch) {
                lastX = parseInt(xMatch[1]);
                lastY = parseInt(yMatch[1]);
                return { x: lastX, y: lastY };
            }
        }
    } catch (e) {
        console.error('❌ getMousePos failed:', e.message);
    }
    return { x: lastX, y: lastY };
}

// Move mouse
function moveMouse() {
    try {
        const current = getCurrentMousePos();
        const origin = { x: current.x, y: current.y };

        const distance = MIN_MOVE + Math.floor(Math.random() * (MAX_MOVE - MIN_MOVE));
        const angle = Math.random() * 2 * Math.PI;

        let newX = Math.round(current.x + distance * Math.cos(angle));
        let newY = Math.round(current.y + distance * Math.sin(angle));

        newX = Math.max(50, Math.min(SCREEN_WIDTH - 50, newX));
        newY = Math.max(50, Math.min(SCREEN_HEIGHT - 50, newY));

        console.log(`🖱️ ${current.x},${current.y} → ${newX},${newY} (${distance}px)`);

        // Move to new position
        if (os.platform() === 'win32') {
            execSync(
                `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${newX}, ${newY})`,
                { shell: 'powershell.exe' }
            );
        } else if (os.platform() === 'darwin') {
            execSync(`cliclick m:${newX},${newY}`);
        } else {
            execSync(`xdotool mousemove --sync ${newX} ${newY}`);
        }

        // Return to origin after 1 second
        setTimeout(() => {
            try {
                if (os.platform() === 'win32') {
                    execSync(
                        `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${origin.x}, ${origin.y})`,
                        { shell: 'powershell.exe' }
                    );
                } else if (os.platform() === 'darwin') {
                    execSync(`cliclick m:${origin.x},${origin.y}`);
                } else {
                    execSync(`xdotool mousemove --sync ${origin.x} ${origin.y}`);
                }
                console.log(`↩️ Returned to ${origin.x},${origin.y}`);
            } catch (e) {
                console.error('↩️ Return failed:', e.message);
            }
        }, 1000);

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('mouse-moved', { x: newX, y: newY });
        }

    } catch (err) {
        console.error('❌ Move failed:', err.message);
    }
}

function startMoving() {
    console.log('▶ startMoving called');
    if (moveInterval) return;
    moveMouse();
    moveInterval = setInterval(moveMouse, 10000);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('status-update', 'running');
    }
}

function stopMoving() {
    if (moveInterval) {
        clearInterval(moveInterval);
        moveInterval = null;
    }
    // Check window exists and is not destroyed before sending
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('status-update', 'stopped');
    }
}

// --- Pomodoro timer ---

function notify(title, body) {
    if (Notification.isSupported()) {
        new Notification({ title, body }).show();
    }
}

function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadDailyTotal() {
    dailyTotalDate = getTodayString();
    dailyTotalSeconds = 0;
    try {
        const data = JSON.parse(fs.readFileSync(dailyTotalsFile, 'utf-8'));
        if (data.date === dailyTotalDate) {
            dailyTotalSeconds = data.totalSeconds || 0;
        }
    } catch (e) {
        // No file yet, or unreadable — start the day at 0.
    }
}

function saveDailyTotal() {
    try {
        fs.writeFileSync(dailyTotalsFile, JSON.stringify({ date: dailyTotalDate, totalSeconds: dailyTotalSeconds }));
    } catch (e) {
        console.error('❌ Failed to save pomodoro daily total:', e.message);
    }
}

// Rolls the counter over to 0 if the calendar day has changed since it was loaded.
function ensureCurrentDay() {
    const today = getTodayString();
    if (today !== dailyTotalDate) {
        dailyTotalDate = today;
        dailyTotalSeconds = 0;
        saveDailyTotal();
    }
}

function sendPomodoroUpdate() {
    ensureCurrentDay();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pomodoro-update', {
            phase: pomodoroPhase,
            remaining: pomodoroRemaining,
            workMin: pomodoroWorkMin,
            breakMin: pomodoroBreakMin,
            paused: pomodoroPaused,
            dailyTotalSeconds,
            dailyGoalSeconds: DAILY_GOAL_SECONDS,
        });
    }
}

function pomodoroTick() {
    ensureCurrentDay();
    pomodoroRemaining--;
    dailyTotalSeconds++;
    if (dailyTotalSeconds % 10 === 0) saveDailyTotal();

    if (pomodoroRemaining <= 0) {
        if (pomodoroPhase === 'work') {
            notify('Pomodoro — Work session done', `Time for a ${pomodoroBreakMin} minute break.`);
            pomodoroPhase = 'break';
            pomodoroRemaining = pomodoroBreakMin * 60;
        } else {
            notify('Pomodoro — Break over', `Back to work for ${pomodoroWorkMin} minutes.`);
            pomodoroPhase = 'work';
            pomodoroRemaining = pomodoroWorkMin * 60;
        }
    }

    sendPomodoroUpdate();
}

function startPomodoro(workMin, breakMin) {
    if (pomodoroInterval || pomodoroPhase) return;

    pomodoroWorkMin = Math.max(1, Math.floor(workMin) || 45);
    pomodoroBreakMin = Math.max(1, Math.floor(breakMin) || 5);
    pomodoroPhase = 'work';
    pomodoroRemaining = pomodoroWorkMin * 60;
    pomodoroPaused = false;

    sendPomodoroUpdate();
    pomodoroInterval = setInterval(pomodoroTick, 1000);
}

function pausePomodoro() {
    if (!pomodoroInterval) return;
    clearInterval(pomodoroInterval);
    pomodoroInterval = null;
    pomodoroPaused = true;
    saveDailyTotal();
    sendPomodoroUpdate();
}

function resumePomodoro() {
    if (pomodoroInterval || !pomodoroPhase || !pomodoroPaused) return;
    pomodoroPaused = false;
    pomodoroInterval = setInterval(pomodoroTick, 1000);
    sendPomodoroUpdate();
}

function stopPomodoro() {
    if (pomodoroInterval) {
        clearInterval(pomodoroInterval);
        pomodoroInterval = null;
    }
    pomodoroPhase = null;
    pomodoroRemaining = 0;
    pomodoroPaused = false;
    saveDailyTotal();
    sendPomodoroUpdate();
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 440,
        height: 520,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    mainWindow.loadFile('renderer/index.html');

    mainWindow.webContents.on('did-finish-load', () => {
        sendPomodoroUpdate();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        stopMoving();
        stopPomodoro();
    });
}

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

if (os.platform() === 'win32') {
    app.setAppUserModelId('com.mousemover.app');
}

app.whenReady().then(() => {
    dailyTotalsFile = path.join(app.getPath('userData'), 'pomodoro-daily-total.json');
    loadDailyTotal();
    detectScreenSize();
    createWindow();
    globalShortcut.register('Escape', () => stopMoving());
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    stopMoving();
    stopPomodoro();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('start-moving', () => startMoving());
ipcMain.on('stop-moving', () => stopMoving());

ipcMain.on('pomodoro-start', (event, { workMin, breakMin } = {}) => startPomodoro(workMin, breakMin));
ipcMain.on('pomodoro-pause', () => pausePomodoro());
ipcMain.on('pomodoro-resume', () => resumePomodoro());
ipcMain.on('pomodoro-stop', () => stopPomodoro());
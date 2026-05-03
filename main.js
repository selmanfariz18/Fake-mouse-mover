const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { execSync } = require('child_process');

let mainWindow;
let moveInterval = null;
let lastX = 960;  // start from screen center
let lastY = 540;

const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;
const MIN_MOVE = 200;   // minimum pixels (~5cm on 1080p screen)
const MAX_MOVE = 500;   // maximum pixels (~13cm on 1080p screen)

// Get current mouse position via xdotool
function getCurrentMousePos() {
    try {
        const output = execSync('xdotool getmouselocation').toString();
        const xMatch = output.match(/x:(\d+)/);
        const yMatch = output.match(/y:(\d+)/);
        if (xMatch && yMatch) {
            return { x: parseInt(xMatch[1]), y: parseInt(yMatch[1]) };
        }
    } catch (e) { }
    return { x: lastX, y: lastY };
}

// Move mouse a visible distance from current position
function moveMouse() {
    try {
        const current = getCurrentMousePos();

        // Random direction with guaranteed large distance (200-500px)
        const distance = MIN_MOVE + Math.floor(Math.random() * (MAX_MOVE - MIN_MOVE));
        const angle = Math.random() * 2 * Math.PI;

        let newX = Math.round(current.x + distance * Math.cos(angle));
        let newY = Math.round(current.y + distance * Math.sin(angle));

        // Clamp to screen bounds with 50px padding
        newX = Math.max(50, Math.min(SCREEN_WIDTH - 50, newX));
        newY = Math.max(50, Math.min(SCREEN_HEIGHT - 50, newY));

        console.log(`🖱️ ${current.x},${current.y} → ${newX},${newY} (${distance}px away)`);

        // Move smoothly using xdotool
        execSync(`xdotool mousemove --sync ${newX} ${newY}`);

        lastX = newX;
        lastY = newY;

        if (mainWindow) {
            mainWindow.webContents.send('mouse-moved', { x: newX, y: newY });
        }
    } catch (err) {
        console.error('❌ xdotool move failed:', err.message);
    }
}

function startMoving() {
    console.log('▶ startMoving called');
    if (moveInterval) return;
    moveMouse(); // immediate first move
    moveInterval = setInterval(moveMouse, 10000);
    mainWindow.webContents.send('status-update', 'running');
}

function stopMoving() {
    if (moveInterval) {
        clearInterval(moveInterval);
        moveInterval = null;
    }
    if (mainWindow) {
        mainWindow.webContents.send('status-update', 'stopped');
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 420,
        height: 520,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    mainWindow.loadFile('renderer/index.html');
    // mainWindow.webContents.openDevTools(); // remove this after testing
}

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

app.whenReady().then(() => {
    createWindow();
    globalShortcut.register('Escape', () => stopMoving());
    // globalShortcut.register('Backspace', () => stopMoving());
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    stopMoving();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('start-moving', () => startMoving());
ipcMain.on('stop-moving', () => stopMoving());
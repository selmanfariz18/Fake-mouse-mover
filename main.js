const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

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
        if (os.platform() === 'win32') {
            const out = execSync(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; $p = [System.Windows.Forms.Cursor]::Position; Write-Output \"$($p.X) $($p.Y)\""`).toString().trim();
            const [x, y] = out.split(' ').map(Number);
            return { x, y };
        } else {
            const output = execSync('xdotool getmouselocation').toString();
            const xMatch = output.match(/x:(\d+)/);
            const yMatch = output.match(/y:(\d+)/);
            if (xMatch && yMatch) {
                return { x: parseInt(xMatch[1]), y: parseInt(yMatch[1]) };
            }
        }
    } catch (e) { }
    return { x: lastX, y: lastY };
}

// Move mouse a visible distance from current position
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

        console.log(`🖱️ Nudge → ${newX},${newY}`);

        // Platform specific move
        if (os.platform() === 'win32') {
            // Windows — use PowerShell
            execSync(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${newX}, ${newY})"`);
        } else if (os.platform() === 'darwin') {
            // macOS — use cliclick (needs: brew install cliclick)
            execSync(`cliclick m:${newX},${newY}`);
        } else {
            // Linux — xdotool
            execSync(`xdotool mousemove --sync ${newX} ${newY}`);
        }

        // Return to origin after 1 second
        setTimeout(() => {
            if (os.platform() === 'win32') {
                execSync(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${origin.x}, ${origin.y})"`);
            } else if (os.platform() === 'darwin') {
                execSync(`cliclick m:${origin.x},${origin.y}`);
            } else {
                execSync(`xdotool mousemove --sync ${origin.x} ${origin.y}`);
            }
            console.log(`↩️ Returned to ${origin.x},${origin.y}`);
        }, 1000);

        if (mainWindow) {
            mainWindow.webContents.send('mouse-moved', { x: newX, y: newY });
        }
    } catch (err) {
        console.error('❌ Move failed:', err.message);
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
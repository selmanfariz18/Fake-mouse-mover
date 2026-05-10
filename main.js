const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
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

    mainWindow.on('closed', () => {
        mainWindow = null;
        stopMoving();
    });
}

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

app.whenReady().then(() => {
    detectScreenSize();
    createWindow();
    globalShortcut.register('Escape', () => stopMoving());
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
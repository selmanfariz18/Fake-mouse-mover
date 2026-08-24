const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mouseAPI', {
    start: () => ipcRenderer.send('start-moving'),
    stop: () => ipcRenderer.send('stop-moving'),
    onStatus: (callback) => ipcRenderer.on('status-update', (_, status) => callback(status)),
    onMouseMoved: (callback) => ipcRenderer.on('mouse-moved', (_, pos) => callback(pos)),
});

contextBridge.exposeInMainWorld('pomodoroAPI', {
    start: (workMin, breakMin) => ipcRenderer.send('pomodoro-start', { workMin, breakMin }),
    pause: () => ipcRenderer.send('pomodoro-pause'),
    resume: () => ipcRenderer.send('pomodoro-resume'),
    stop: () => ipcRenderer.send('pomodoro-stop'),
    onUpdate: (callback) => ipcRenderer.on('pomodoro-update', (_, data) => callback(data)),
});

console.log('✅ preload.js loaded'); // confirm it runs
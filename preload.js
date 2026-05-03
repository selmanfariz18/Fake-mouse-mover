const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mouseAPI', {
    start: () => ipcRenderer.send('start-moving'),
    stop: () => ipcRenderer.send('stop-moving'),
    onStatus: (callback) => ipcRenderer.on('status-update', (_, status) => callback(status)),
    onMouseMoved: (callback) => ipcRenderer.on('mouse-moved', (_, pos) => callback(pos)),
});

console.log('✅ preload.js loaded'); // confirm it runs
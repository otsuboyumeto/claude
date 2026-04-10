// Preload: レンダラーに安全な API を露出
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // タスク
  loadTasks: () => ipcRenderer.invoke('tasks:load'),
  saveTasks: (tasks) => ipcRenderer.invoke('tasks:save', tasks),

  // 設定
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  onConfigUpdated: (handler) => {
    ipcRenderer.on('config:updated', (_e, cfg) => handler(cfg));
  },

  // ウィンドウ操作
  closeWindow: () => ipcRenderer.invoke('window:close'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggle-always-on-top'),

  // 設定画面
  openSettings: () => ipcRenderer.invoke('settings:open'),

  // 外部リンク
  openExternal: (url) => ipcRenderer.invoke('external:open', url),

  // 自然言語 → タスク
  parseTasks: (text) => ipcRenderer.invoke('ai:parse-tasks', text),
});

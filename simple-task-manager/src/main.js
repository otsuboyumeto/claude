// Electron main process
// - フローティング(常に最前面)のフレームレスウィンドウを立ち上げる
// - タスク/設定のJSONファイル読み書きをハンドリング
// - 自然言語 → タスク分解のリクエストを Claude API に投げる

const { app, BrowserWindow, ipcMain, shell, screen, Menu, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 二重起動防止
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

const DATA_DIR = path.join(os.homedir(), '.simple-tasks');
const TASKS_PATH = path.join(DATA_DIR, 'tasks.json');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const WINDOW_STATE_PATH = path.join(DATA_DIR, 'window.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to read ${filePath}:`, err);
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

const DEFAULT_CONFIG = {
  fontFamily: "'Klee One', 'Caveat', 'Yuji Mai', cursive",
  fontSize: 22,
  opacity: 0.96,
  apiKey: '',
  model: 'claude-haiku-4-5-20251001',
};

function loadConfig() {
  const cfg = readJson(CONFIG_PATH, {});
  return { ...DEFAULT_CONFIG, ...cfg };
}

function saveConfig(cfg) {
  writeJson(CONFIG_PATH, cfg);
}

function loadTasks() {
  return readJson(TASKS_PATH, []);
}

function saveTasks(tasks) {
  writeJson(TASKS_PATH, tasks);
}

function loadWindowState() {
  return readJson(WINDOW_STATE_PATH, null);
}

function saveWindowState(state) {
  writeJson(WINDOW_STATE_PATH, state);
}

let mainWindow = null;
let settingsWindow = null;

function createMainWindow() {
  const saved = loadWindowState();
  const display = screen.getPrimaryDisplay().workAreaSize;

  const bounds = saved || {
    width: 380,
    height: 560,
    x: display.width - 420,
    y: 80,
  };

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 260,
    minHeight: 300,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: true,
    hasShadow: true,
    skipTaskbar: false,
    title: 'やること',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
  });

  // すべてのワークスペースで見える + 全画面アプリ上でも最前面
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // [デバッグビルド] DevTools を自動で開く。原因判明後に外す。
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  // レンダラーのコンソールログをメインプロセスの stdout に転送 (デバッグ用)
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const levels = ['verbose', 'info', 'warning', 'error'];
    console.log(`[renderer:${levels[level] || level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.error(`[preload-error] ${preloadPath}:`, error);
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[render-process-gone]', details);
  });

  mainWindow.on('close', () => {
    if (mainWindow) {
      saveWindowState(mainWindow.getBounds());
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 440,
    height: 520,
    parent: mainWindow,
    modal: false,
    resizable: false,
    alwaysOnTop: true,
    title: '設定',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ---- IPC ----

ipcMain.handle('tasks:load', () => loadTasks());
ipcMain.handle('tasks:save', (_e, tasks) => {
  saveTasks(tasks);
  return true;
});

ipcMain.handle('config:load', () => loadConfig());
ipcMain.handle('config:save', (_e, cfg) => {
  const merged = { ...loadConfig(), ...cfg };
  saveConfig(merged);
  // メインウィンドウに変更を通知
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('config:updated', merged);
  }
  return merged;
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:toggle-always-on-top', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(next, 'floating');
  return next;
});

ipcMain.handle('settings:open', () => {
  createSettingsWindow();
});

ipcMain.handle('external:open', (_e, url) => {
  shell.openExternal(url);
});

// 自然言語 → タスクリスト分解 (Claude API)
ipcMain.handle('ai:parse-tasks', async (_e, inputText) => {
  const cfg = loadConfig();
  const apiKey = cfg.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      error:
        'APIキーが未設定です。設定画面から ANTHROPIC_API_KEY を入れてください。',
    };
  }

  try {
    // 遅延ロード (起動速度のため)
    const sdk = require('@anthropic-ai/sdk');
    const Anthropic = sdk.default || sdk.Anthropic || sdk;
    const client = new Anthropic({ apiKey });

    const system = `あなたはユーザーが話し言葉で伝えるメモを、短いTo-Do項目のリストに分解するアシスタントです。
ルール:
- 出力は必ず JSON のみ。前置きや説明文は一切書かない。
- JSON スキーマ: {"tasks": [{"title": string, "tag": string | null}]}
- "title" は一件のタスクとして行動しやすい短い日本語にする (名詞句でも命令形でもOK)。
- 原文にカテゴリや用途の手がかり (買い物、仕事、家事 など) があれば "tag" に日本語で入れる。なければ null。
- 一つの入力に複数タスクが含まれる場合は全部分解する。
- 原文が1件だけなら配列は1件で返す。
- 余計なタスクを増やさない。ユーザーが言っていないことは足さない。`;

    const response = await client.messages.create({
      model: cfg.model || 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: inputText }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    // ```json ... ``` が混ざっていたら剥がす
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      // JSON 抽出のフォールバック
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw err;
    }

    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    return {
      ok: true,
      tasks: tasks
        .filter((t) => t && typeof t.title === 'string' && t.title.trim())
        .map((t) => ({
          title: t.title.trim(),
          tag: t.tag && typeof t.tag === 'string' ? t.tag.trim() : null,
        })),
    };
  } catch (err) {
    console.error('Claude API error:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

// ---- app lifecycle ----

// 二重起動しようとした時に既存ウィンドウをフォーカス
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  ensureDataDir();

  // macOS デフォルトメニューを設定 (Cmd+Opt+I で DevTools を開けるように)
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

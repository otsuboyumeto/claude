// Renderer: メインウィンドウのUIロジック
// - タスク一覧の描画/追加/完了/削除/並び替え
// - 自然言語入力を Claude に投げて分解
//
// 注意: `const api = window.api` と書くと contextBridge が window に
// non-configurable として公開している 'api' と衝突して SyntaxError になるため、
// ローカル参照は `ipc` という別名にしている。

console.log('[renderer] script start, window.api =', typeof window.api);

// 失敗時に画面上に視認できる形で出す用
function showFatalBanner(msg) {
  let el = document.getElementById('fatal-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatal-banner';
    el.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:9999;background:#c0392b;color:#fff;padding:6px 10px;font:12px -apple-system,sans-serif;white-space:pre-wrap;word-break:break-all;';
    document.body && document.body.prepend(el);
  }
  el.textContent = msg;
}

window.addEventListener('error', (e) => {
  console.error('[renderer] error:', e.error || e.message);
  showFatalBanner('JS Error: ' + (e.error?.stack || e.error?.message || e.message));
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[renderer] unhandledrejection:', e.reason);
  showFatalBanner(
    'Promise Rejection: ' + (e.reason?.stack || e.reason?.message || String(e.reason))
  );
});

const ipc = window.api;
if (!ipc) {
  showFatalBanner(
    'preload が読み込まれていません。window.api が undefined です。DevToolsのConsoleタブも確認してください。'
  );
}

const state = {
  tasks: [],
  config: null,
};

// ---- DOM ----
const $input = document.getElementById('task-input');
const $addBtn = document.getElementById('add-btn');
const $list = document.getElementById('task-list');
const $empty = document.getElementById('empty');
const $count = document.getElementById('count');
const $clearDone = document.getElementById('clear-done');
const $status = document.getElementById('status');
const $pinBtn = document.getElementById('pin-btn');
const $settingsBtn = document.getElementById('settings-btn');
const $minimizeBtn = document.getElementById('minimize-btn');
const $closeBtn = document.getElementById('close-btn');

// ---- 初期化 ----
async function init() {
  if (!ipc) {
    console.error('[renderer] init aborted: window.api undefined');
    return;
  }
  try {
    state.config = await ipc.loadConfig();
    applyConfig(state.config);

    state.tasks = await ipc.loadTasks();
    render();

    ipc.onConfigUpdated((cfg) => {
      state.config = cfg;
      applyConfig(cfg);
    });
    console.log('[renderer] init OK, tasks =', state.tasks.length);
  } catch (err) {
    console.error('[renderer] init failed:', err);
    showFatalBanner('init failed: ' + (err?.stack || err?.message || String(err)));
  }
}

function applyConfig(cfg) {
  const root = document.documentElement;
  if (cfg.fontFamily) root.style.setProperty('--font-family', cfg.fontFamily);
  if (cfg.fontSize) root.style.setProperty('--font-size', cfg.fontSize + 'px');
  if (cfg.opacity != null) {
    document.querySelector('.app').style.background =
      `rgba(255, 252, 240, ${cfg.opacity})`;
  }
}

// ---- 描画 ----
function render() {
  $list.innerHTML = '';
  if (state.tasks.length === 0) {
    $empty.style.display = 'block';
  } else {
    $empty.style.display = 'none';
    state.tasks.forEach((task, idx) => {
      $list.appendChild(renderTask(task, idx));
    });
  }
  const remaining = state.tasks.filter((t) => !t.done).length;
  const total = state.tasks.length;
  $count.textContent = total === 0 ? '' : `残り ${remaining} / ${total}`;
}

function renderTask(task, idx) {
  const li = document.createElement('li');
  li.className = 'task-item' + (task.done ? ' done' : '');
  li.draggable = true;
  li.dataset.id = task.id;

  // チェック
  const check = document.createElement('button');
  check.className = 'task-check';
  check.setAttribute('aria-label', task.done ? '未完了に戻す' : '完了にする');
  check.addEventListener('click', () => toggleDone(task.id));

  // 本文
  const body = document.createElement('div');
  body.className = 'task-body';

  const title = document.createElement('div');
  title.className = 'task-title';
  title.textContent = task.title;
  body.appendChild(title);

  if (task.tag) {
    const tag = document.createElement('span');
    tag.className = 'task-tag';
    tag.textContent = '#' + task.tag;
    body.appendChild(tag);
  }

  // 削除
  const del = document.createElement('button');
  del.className = 'task-delete';
  del.textContent = '×';
  del.title = '削除';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    removeTask(task.id);
  });

  li.append(check, body, del);

  // ドラッグ&ドロップ
  li.addEventListener('dragstart', (e) => {
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  });
  li.addEventListener('dragend', () => li.classList.remove('dragging'));
  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    li.classList.add('drag-over');
  });
  li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
  li.addEventListener('drop', (e) => {
    e.preventDefault();
    li.classList.remove('drag-over');
    const fromId = e.dataTransfer.getData('text/plain');
    const toId = task.id;
    if (fromId && fromId !== toId) reorder(fromId, toId);
  });

  return li;
}

// ---- 操作 ----
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function addTasks(items) {
  const now = Date.now();
  const newOnes = items.map((it, i) => ({
    id: newId(),
    title: it.title,
    tag: it.tag || null,
    done: false,
    createdAt: now + i,
  }));
  state.tasks.push(...newOnes);
  await persist();
  render();
}

async function toggleDone(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  await persist();
  render();
}

async function removeTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  await persist();
  render();
}

async function clearDone() {
  state.tasks = state.tasks.filter((t) => !t.done);
  await persist();
  render();
}

async function reorder(fromId, toId) {
  const fromIdx = state.tasks.findIndex((t) => t.id === fromId);
  const toIdx = state.tasks.findIndex((t) => t.id === toId);
  if (fromIdx === -1 || toIdx === -1) return;
  const [moved] = state.tasks.splice(fromIdx, 1);
  state.tasks.splice(toIdx, 0, moved);
  await persist();
  render();
}

async function persist() {
  await ipc.saveTasks(state.tasks);
}

// ---- 入力 ----
function setStatus(msg, isError = false) {
  $status.textContent = msg || '';
  $status.classList.toggle('error', !!isError);
}

async function handleAdd() {
  const text = $input.value.trim();
  if (!text) return;

  $addBtn.disabled = true;
  setStatus('Claude が分解しています…');

  try {
    const result = await ipc.parseTasks(text);
    if (!result.ok) {
      setStatus(result.error || '分解に失敗しました', true);
      // キー未設定などのフォールバック: 改行で素朴に分割
      if ((result.error || '').includes('APIキー')) {
        const fallback = text
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => ({ title: s, tag: null }));
        if (fallback.length) {
          await addTasks(fallback);
          $input.value = '';
          setStatus('APIキー未設定のため改行区切りで追加しました', true);
        }
      }
      return;
    }
    if (result.tasks.length === 0) {
      setStatus('タスクが取れませんでした', true);
      return;
    }
    await addTasks(result.tasks);
    $input.value = '';
    setStatus(`${result.tasks.length} 件追加しました`);
    setTimeout(() => setStatus(''), 2000);
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    $addBtn.disabled = false;
  }
}

// ---- イベント ----
// ラップしてクリックが届いているか必ず console に出すヘルパ
function safeClick(name, fn) {
  return async (e) => {
    console.log('[renderer] click:', name);
    try {
      await fn(e);
    } catch (err) {
      console.error(`[renderer] ${name} failed:`, err);
      setStatus(`${name} エラー: ${err.message || err}`, true);
    }
  };
}

$addBtn.addEventListener('click', safeClick('add', handleAdd));
$input.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    handleAdd();
  }
});
$clearDone.addEventListener('click', safeClick('clearDone', clearDone));
$settingsBtn.addEventListener(
  'click',
  safeClick('settings', () => ipc.openSettings())
);
$minimizeBtn.addEventListener(
  'click',
  safeClick('minimize', () => ipc.minimizeWindow())
);
$closeBtn.addEventListener(
  'click',
  safeClick('close', () => ipc.closeWindow())
);
$pinBtn.addEventListener(
  'click',
  safeClick('pin', async () => {
    const pinned = await ipc.toggleAlwaysOnTop();
    $pinBtn.classList.toggle('pinned', pinned);
    $pinBtn.title = pinned ? '常に最前面: ON' : '常に最前面: OFF';
  })
);

// 起動時は最前面がONなのでアイコンを点灯
$pinBtn.classList.add('pinned');

init();

// 設定ウィンドウのロジック
const api = window.api;

const $fontFamily = document.getElementById('font-family');
const $fontSize = document.getElementById('font-size');
const $opacity = document.getElementById('opacity');
const $apiKey = document.getElementById('api-key');
const $model = document.getElementById('model');
const $preview = document.getElementById('preview');
const $saveBtn = document.getElementById('save');
const $cancelBtn = document.getElementById('cancel');
const $saved = document.getElementById('saved');
const $consoleLink = document.getElementById('console-link');

async function init() {
  const cfg = await api.loadConfig();

  // 既存の値に一致する option があれば選択、なければ追加
  if (![...$fontFamily.options].some((o) => o.value === cfg.fontFamily)) {
    const opt = document.createElement('option');
    opt.value = cfg.fontFamily;
    opt.textContent = 'カスタム';
    $fontFamily.appendChild(opt);
  }
  $fontFamily.value = cfg.fontFamily;
  $fontSize.value = cfg.fontSize;
  $opacity.value = cfg.opacity;
  $apiKey.value = cfg.apiKey || '';
  $model.value = cfg.model || 'claude-haiku-4-5-20251001';

  updatePreview();
}

function updatePreview() {
  $preview.style.fontFamily = $fontFamily.value;
  $preview.style.fontSize = $fontSize.value + 'px';
}

$fontFamily.addEventListener('change', updatePreview);
$fontSize.addEventListener('input', updatePreview);

$saveBtn.addEventListener('click', async () => {
  const cfg = {
    fontFamily: $fontFamily.value,
    fontSize: Number($fontSize.value) || 22,
    opacity: Number($opacity.value) || 0.96,
    apiKey: $apiKey.value.trim(),
    model: $model.value,
  };
  await api.saveConfig(cfg);
  $saved.classList.add('show');
  setTimeout(() => $saved.classList.remove('show'), 1500);
});

$cancelBtn.addEventListener('click', () => window.close());

$consoleLink.addEventListener('click', (e) => {
  e.preventDefault();
  api.openExternal('https://console.anthropic.com/settings/keys');
});

init();

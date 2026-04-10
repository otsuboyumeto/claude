#!/bin/bash
# やること (Simple Task Manager) - ワンショットセットアップ
#
# 使い方:
#   bash install.sh
#
# このスクリプトは以下を自動でやります:
#   1. Homebrew が無ければインストール
#   2. Node.js が無ければインストール
#   3. npm install で依存パッケージを入れる
#   4. electron-builder で macOS 用 .app をビルド
#   5. /Applications に配置して Spotlight から起動可能にする

set -e

cd "$(dirname "$0")"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_step() {
  printf "\n${BLUE}▶ %s${NC}\n" "$1"
}
print_ok() {
  printf "${GREEN}✓${NC} %s\n" "$1"
}
print_warn() {
  printf "${YELLOW}⚠${NC} %s\n" "$1"
}
print_err() {
  printf "${RED}✗${NC} %s\n" "$1"
}

echo ""
echo "============================================"
echo "  やること - セットアップ"
echo "============================================"

# ---------- 1. Homebrew ----------
print_step "Homebrew を確認"
if command -v brew >/dev/null 2>&1; then
  print_ok "Homebrew: $(brew --version | head -n 1)"
else
  print_warn "Homebrew が見つかりません。これからインストールします。"
  print_warn "インストール中にパスワード入力を求められることがあります。"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  # brew を現在のシェルで使えるように PATH を通す (Apple Silicon / Intel 両対応)
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi

  if ! command -v brew >/dev/null 2>&1; then
    print_err "Homebrew のインストールに失敗しました"
    exit 1
  fi
  print_ok "Homebrew をインストールしました"
fi

# ---------- 2. Node.js ----------
print_step "Node.js を確認"
if command -v node >/dev/null 2>&1; then
  print_ok "Node.js: $(node --version)"
else
  print_warn "Node.js が見つかりません。Homebrew でインストールします..."
  brew install node
  print_ok "Node.js: $(node --version)"
fi

# ---------- 3. npm install ----------
print_step "依存パッケージをインストール (少し時間がかかります)"
npm install

# ---------- 4. ビルド ----------
print_step "macOS 用 .app をビルド"
npm run build

# ---------- 5. /Applications に配置 ----------
print_step "ビルド結果を探す"
BUILT_APP=$(find dist -maxdepth 3 -type d -name "*.app" 2>/dev/null | head -n 1)

if [ -z "$BUILT_APP" ] || [ ! -d "$BUILT_APP" ]; then
  print_err "ビルドされた .app が見つかりません (dist/ の中身を確認してください)"
  exit 1
fi
print_ok "見つかりました: $BUILT_APP"

APP_NAME=$(basename "$BUILT_APP")
DEST="/Applications/$APP_NAME"

print_step "/Applications に配置"
rm -rf "$DEST"
cp -R "$BUILT_APP" "/Applications/"

# Gatekeeper の quarantine 属性を外しておく (未署名アプリ対応)
xattr -cr "$DEST" 2>/dev/null || true

print_ok "配置完了: $DEST"

# Spotlightが2つ拾わないよう、ビルド中間物は消す
print_step "ビルド中間物 (dist/) を掃除"
rm -rf dist
print_ok "dist/ を削除しました"

echo ""
echo "============================================"
printf "  ${GREEN}🎉 セットアップ完了${NC}\n"
echo "============================================"
echo ""
echo "起動方法:"
echo "  1. Spotlight を開く (⌘ + Space)"
echo "  2. 「やること」と入力して Enter"
echo ""
echo "もし初回起動時に「開発元が未確認のため開けません」と出た場合:"
echo "  Finder で /Applications/$APP_NAME を右クリック → 開く → 開く"
echo "  (一度許可すれば、以後は Spotlight から普通に起動できます)"
echo ""
echo "API キーの設定は、起動後に右上の ⚙ (歯車) アイコンから行ってください。"
echo ""

# Simple Task Manager

MacBook 用の、**常に最前面に浮いている手書き風 To-Do** です。
話し言葉でパッと入力すると、Claude API が複数タスクに分解してくれます。
「今やりたいこと」を視界から逃さないための、超シンプルな備忘録ツールです。

## 特徴

- **フローティング**: 常に最前面。全画面アプリの上でも見えます。
- **大きい手書き風フォント**: Klee One / Caveat / Yuji Mai などから選べます。設定でサイズも変更可能。
- **自然言語入力**: 「牛乳と卵買って、あと提案書も書く」→ 3件に自動分解。カテゴリ (`買い物` など) も推測。
- **1階層フラット**: 階層なしのシンプルな To-Do。チェック・削除・ドラッグで並び替え・タグ表示。
- **ローカル保存**: タスクも設定も `~/.simple-tasks/` に JSON で保存。アカウント不要。

## クイックスタート (Spotlightから起動できるようにする)

**初回だけ**、ターミナルで以下を1回実行してください:

```bash
cd simple-task-manager
bash install.sh
```

このスクリプトが以下を全部やります:

1. Homebrew が無ければインストール
2. Node.js が無ければインストール
3. `npm install` で依存パッケージを取得
4. electron-builder で macOS 用 `.app` をビルド
5. `/Applications/やること.app` に配置

完了したら **Spotlight (⌘+Space) で「やること」と入力** すれば起動できます。
以後はSpotlightから一発起動で、ターミナルは不要です。

> 初回起動時に「開発元が未確認のため開けません」と出た場合は、
> Finder で `/Applications/やること.app` を右クリック → 開く → 開く、で許可してください。
> 一度許可すれば、次からは Spotlight から普通に起動できます。

### API キーの設定

起動後、右上の ⚙ (歯車) アイコンから設定画面を開いて Anthropic API キーを入力してください。
キーは [console.anthropic.com](https://console.anthropic.com/settings/keys) から取得できます。
環境変数 `ANTHROPIC_API_KEY` でも動きます。

### 開発モードで動かしたい場合

```bash
cd simple-task-manager
npm install
npm start
```

## 使い方

1. 上の入力欄に話し言葉で書く (例: `牛乳買って、あと銀行行って、夜は提案書の続き`)
2. `⌘+Enter` または [追加] ボタン
3. Claude が短いタスクに分解してリストに追加します
4. タップで完了 (取り消し線)、× で削除、ドラッグで並び替え

### キーボードショートカット

| 操作 | キー |
| --- | --- |
| タスク追加 | `⌘ + Enter` |

### ウィンドウ操作

- タイトルバーをドラッグで移動
- 右下ハンドルでリサイズ
- 📌 で常に最前面の ON/OFF
- － で最小化、× で閉じる

## 保存場所

- タスク: `~/.simple-tasks/tasks.json`
- 設定: `~/.simple-tasks/config.json`
- ウィンドウ位置: `~/.simple-tasks/window.json`

## カスタマイズ

設定画面で以下を変更できます:

- **フォント**: Klee One / Zen Kurenaido / Yuji Mai / Caveat / Kalam / Shadows Into Light / Hiragino 丸ゴ / システムフォント
- **フォントサイズ**: 12〜48px
- **背景の不透明度**: 0.5〜1.0
- **使用するモデル**: Haiku 4.5 (推奨) / Sonnet 4.6 / Opus 4.6

## トラブルシューティング

- **APIキー未設定** のエラーが出る → 設定画面でキーを入れてください。
  キー未設定でもフォールバックで改行区切りのテキストはそのまま追加されます。
- **常に最前面にならない** → 📌 ボタンで切り替え。macOS の Spaces / Mission Control 上でも見えます。
- **フォントが手書き風にならない** → 起動時にオンラインで Google Fonts を読み込みます。オフラインだとシステムフォントにフォールバックします。

## ライセンス

MIT

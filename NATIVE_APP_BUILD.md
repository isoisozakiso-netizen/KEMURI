# KEMURI ネイティブアプリ ビルド手順

## 事前準備

| ツール | 用途 |
|--------|------|
| Node.js 18+ | Capacitor CLI 実行 |
| Android Studio | Android ビルド |
| Xcode (Mac必須) | iOS ビルド |

---

## ★ まず最初にやること

**`index.html` の API URL を Cloudflare Pages の公開URLに書き換える**

```js
// index.html の先頭スクリプト内
return 'https://kemuri-himeji.pages.dev';  // ← 自分のCloudflare Pagesドメインに差し替え
```

Cloudflare Pages へのデプロイ手順は [CLOUDFLARE_DEPLOY.md](CLOUDFLARE_DEPLOY.md) を参照。

---

## セットアップ

```bash
# 依存パッケージをインストール
npm install

# Android プラットフォームを追加（初回のみ）
npm run add:android

# iOS プラットフォームを追加（初回のみ・Mac必須）
npm run add:ios
```

---

## ビルド & 実機確認

### Android
```bash
npm run sync          # Webファイルを同期
npm run open:android  # Android Studio を開く
```
Android Studio で Run ▶ を押してビルド・インストール。

### iOS
```bash
npm run sync      # Webファイルを同期
npm run open:ios  # Xcode を開く
```
Xcode で署名設定後、Run ▶ でビルド・インストール。

---

## 変更があるたびに

```bash
npm run sync
```
これだけで Webファイルがネイティブプロジェクトに反映される。

---

## アプリアイコン・スプラッシュ画像を設定する場合

```bash
npm install @capacitor/assets --save-dev
```

`assets/` フォルダに以下を用意して実行：
- `icon.png` — 1024×1024px
- `splash.png` — 2732×2732px

```bash
npx capacitor-assets generate
```

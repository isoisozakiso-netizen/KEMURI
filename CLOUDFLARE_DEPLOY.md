# Cloudflare Pages へのデプロイ手順

このフォルダは **Cloudflare Pages 専用** に抽出された構成です。
静的フロント (`index.html`) + Pages Functions (`functions/api/*`) + KV ストレージで動きます。

## 構成

| パス                  | 役割                          |
|-----------------------|-------------------------------|
| `index.html`          | 静的フロントエンド             |
| `functions/api/index.js`  | `/api`（ホットペッパー proxy） |
| `functions/api/votes.js`  | `/api/votes`（投票API）        |
| `functions/api/shops.js`  | `/api/shops`（手動店舗API）    |
| `_routes.json`        | Pages のルーティング設定       |
| `wrangler.toml`       | KV バインディング設定          |

データ保存先は **Cloudflare KV**（`KEMURI_KV` バインディング）。

---

## 1. Cloudflare アカウントと wrangler 準備

```bash
npm i -D wrangler        # devDependencies に入れる場合
npx wrangler login       # ブラウザでログイン
```

## 2. KV 名前空間を作成

```bash
npm run cf:kv:create
```

実行すると以下のような出力が表示されるので、`id` を控える：

```
🌀 Creating namespace with title "kemuri-himeji-KEMURI_KV"
✨ Success!
Add the following to your configuration file:
[[kv_namespaces]]
binding = "KEMURI_KV"
id = "abcdef0123456789..."   ← これをコピー
```

`wrangler.toml` の `PLACEHOLDER_REPLACE_WITH_REAL_KV_ID` を実 ID に書き換える。

## 3. ローカル動作確認

```bash
npm run cf:dev
# → http://localhost:8788 で起動
```

ホットペッパー / 投票 / 店舗追加が動くか確認。

## 4. デプロイ

### 方法A: CLI から直接デプロイ
```bash
npm run cf:deploy
```

### 方法B: GitHub と連携（推奨）
1. Cloudflare Dashboard → Pages → "Create application" → "Connect to Git"
2. リポジトリを選択
3. ビルド設定：
   - Build command: （空欄でOK）
   - Build output directory: `/`（または `.`）
4. デプロイ後、Settings → Functions → KV namespace bindings で
   `KEMURI_KV` を作成したKV名前空間に紐付ける
5. （任意）Settings → Environment Variables で `HOTPEPPER_KEY` を設定

## 5. ネイティブアプリの URL 更新

`index.html` の冒頭：
```js
const KEMURI_API_BASE = (function(){
  ...
  return 'https://darling-meerkat-578ca9.netlify.app';  // ← ここ
  ...
})();
```
を Cloudflare の公開 URL（例: `https://kemuri-himeji.pages.dev`）に書き換える。

その後：
```bash
npm run sync
```
で Capacitor 側に反映。

---

## トラブルシュート

- **投票が保存されない** → KV バインディング名が `KEMURI_KV` か確認。Dashboard か `wrangler.toml` のどちらかで設定されている必要あり。
- **`/api` が 404** → `_routes.json` がプロジェクトルートにあるか確認。
- **CORS エラー** → ネイティブアプリで絶対URLを使う場合のみ問題。各 Function 側で `Access-Control-Allow-Origin: *` を返しているので通常は不要。

---


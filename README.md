# KEMURI — Cloudflare Workers 版

新しい Cloudflare 統合 UI（Workers Builds）で動かすための構成です。

## フォルダ構成

```
kemuri_worker/
├── README.md          ← このファイル
├── wrangler.toml      ← Cloudflare の設定
├── src/
│   └── index.js       ← Worker のコード本体（API ルーティング）
└── public/
    └── index.html     ← アプリのフロントエンド
```

## デプロイ手順

1. このフォルダの **中身全部** を GitHub に上げる
2. Cloudflare で「Create application」→ 「Continue with GitHub」
3. リポジトリを選択 → そのまま Deploy
4. 自動で `https://kemuri.〇〇〇.workers.dev` という URL が発行される
5. KV（データ保存箱）を「Bindings」で `KEMURI_KV` として紐付け
6. 再デプロイ → 完成

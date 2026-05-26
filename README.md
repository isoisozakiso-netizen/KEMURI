# KEMURI - 姫路グルメ 喫煙席検索

Cloudflare Pages にデプロイするための最小構成です。

## このフォルダの中身

```
index.html                ← アプリ本体
functions/api/index.js    ← ホットペッパー API のプロキシ
functions/api/votes.js    ← 投票API
functions/api/shops.js    ← 手動追加店舗API
_routes.json              ← Cloudflare Pages のルーティング設定
```

これだけです。他に何も必要ありません。

## デプロイ手順

詳しくは Claude に「次どうすればいい？」と聞いてください。
ざっくり：

1. このフォルダの **中身** を GitHub のリポジトリにアップロード
2. Cloudflare Pages で GitHub と連携
3. ビルド設定はすべて **空欄 / None**
4. Cloudflare ダッシュボードで KV 名前空間 `KEMURI_KV` を作成
5. Pages の Settings → Bindings で `KEMURI_KV` を紐付け
6. 再デプロイ

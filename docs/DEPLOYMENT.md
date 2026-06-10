# Deployment

Pukari runs on **Cloudflare Workers** with a **KV** namespace for storage.

## Prerequisites

- A Cloudflare account
- A KV namespace bound as `KEMURI_KV`
- A Hotpepper Gourmet API key

## Option A — Git-connected (recommended)

The `main` branch is connected to **Cloudflare Workers Builds**. Every push to
`main` triggers an automatic build and deploy.

1. Push to `main`.
2. Cloudflare builds and deploys automatically (1–2 min).

## Option B — Manual (Wrangler CLI)

```bash
npm install
npx wrangler login
npm run deploy
```

## Configuration

`wrangler.toml` declares the bindings:

```toml
[assets]
directory = "./public"
binding = "ASSETS"

[[kv_namespaces]]
binding = "KEMURI_KV"
id = "<your-kv-namespace-id>"
```

Set secrets/variables in the Cloudflare dashboard or via Wrangler:

```bash
wrangler secret put HOTPEPPER_KEY
wrangler secret put SHARE_SECRET
```

See [`.env.example`](../.env.example) for the full list.

> TODO: add screenshots of the dashboard binding setup.

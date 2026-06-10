# Architecture

## Overview

Pukari is a single **Cloudflare Worker** that does two jobs:

1. Serves the static front end from `public/` (via the `ASSETS` binding).
2. Exposes a small JSON API under `/api/*` and a share page under `/s/{shopId}`.

There is no framework, no bundler, and no build step.

## Components

| Path | Responsibility |
| --- | --- |
| `public/index.html` | Entire front end (HTML + CSS + vanilla JS in one file) |
| `public/*.png`, `manifest.json` | Icons, logos, PWA manifest |
| `src/index.js` | Worker: routing, Hotpepper proxy, votes, shops, comments, photos, share tokens |
| `wrangler.toml` | Worker config + bindings |

## Data Storage

All persistent data lives in **Cloudflare KV** (binding `KEMURI_KV`):

- `votes` — smoking-style votes per shop
- `custom-shops` — manually added shops
- `comments:{shopId}` — comments
- `photos:{shopId}` + `photo:{id}` / `photothumb:{id}` — user photos

## External APIs

- **Hotpepper Gourmet API** — restaurant search (proxied through `/api/search`).
- **OpenStreetMap Nominatim** — geocoding manually added shops.

## Request Flow (high level)

```
Browser ──► Worker
             ├─ /api/search   ──► Hotpepper API
             ├─ /api/votes    ──► KV
             ├─ /api/shops    ──► KV (+ Nominatim geocoding)
             ├─ /api/comments ──► KV
             ├─ /api/photos   ──► KV
             ├─ /s/{shopId}    ──► OGP-injected HTML
             └─ *              ──► ASSETS (static files)
```

> TODO: expand each section with diagrams and edge cases.

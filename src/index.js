/**
 * ぷかり — Cloudflare Worker (静的ファイル + API を1ファイルで処理)
 *
 *   /api/search → ホットペッパー API のプロキシ
 *   /api/votes  → 投票 (GET/POST)
 *   /api/shops  → 手動追加店舗 (GET/POST)
 *   それ以外    → public/ 以下の静的ファイル (index.html など)
 *
 * バインディング:
 *   env.ASSETS    → 静的ファイル配信 (wrangler.toml で設定済)
 *   env.KEMURI_KV → KV ストレージ (Cloudflare の画面で紐付け)
 *   env.HOTPEPPER_KEY → 環境変数 (任意。未設定時は FALLBACK_KEY)
 */

const FALLBACK_KEY  = "e20bb74cbcf73dc2";
const HOTPEPPER_BASE = "https://webservice.recruit.co.jp/hotpepper/gourmet/v1/";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

// ──────────────────── /api/search ────────────────────
// Hotpepper API は 1リクエスト最大 100 件。3ページ並列取得で 1バッチ300件まで対応。
// クライアントが start を指定すれば、そこから 3ページ取得（「もっと見る」用）
async function handleSearch(request, env) {
  const url = new URL(request.url);
  const baseQs = new URLSearchParams(url.search);
  // クライアントから来た start を取り出して baseQs からは消す（基準点として使う）
  const reqStart = Math.max(1, parseInt(baseQs.get("start") || "1", 10) || 1);
  baseQs.delete("start");

  baseQs.set("key", (env && env.HOTPEPPER_KEY) || FALLBACK_KEY);
  baseQs.set("format", "json");
  baseQs.delete("large_area");
  baseQs.delete("service_area");
  baseQs.delete("middle_area");
  const userKw = (baseQs.get("keyword") || "").replace(/姫路/g, "").trim();
  baseQs.set("keyword", userKw ? `姫路 ${userKw}` : "姫路");
  baseQs.delete("smoking");
  baseQs.set("count", "100"); // 各ページは強制的に 100 件

  // reqStart, +100, +200 を並列取得（合計 300 件まで）
  const pageStarts = [reqStart, reqStart + 100, reqStart + 200];
  try {
    const responses = await Promise.all(
      pageStarts.map((start) => {
        const qs = new URLSearchParams(baseQs);
        qs.set("start", String(start));
        return fetch(`${HOTPEPPER_BASE}?${qs.toString()}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
      })
    );

    // 全ページのショップを結合（重複は id で除去）
    const seen = new Set();
    const allShops = [];
    let apiVersion, totalAvailable = 0, firstError;
    for (const data of responses) {
      if (!data) continue;
      if (data.results?.error) { firstError = data.results.error; continue; }
      apiVersion = apiVersion || data.results?.api_version;
      totalAvailable = data.results?.results_available || totalAvailable;
      const shops = data.results?.shop || [];
      for (const s of shops) {
        if (s && s.id && !seen.has(s.id)) {
          seen.add(s.id);
          allShops.push(s);
        }
      }
    }

    // 全ページ失敗した場合のみエラー応答
    if (allShops.length === 0 && firstError) {
      return new Response(JSON.stringify({ results: { error: firstError } }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const combined = {
      results: {
        api_version: apiVersion,
        results_available: totalAvailable,
        results_returned: String(allShops.length),
        results_start: 1,
        shop: allShops,
      },
    };
    return new Response(JSON.stringify(combined), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

// ──────────────────── /api/votes ────────────────────
async function readVotes(KV) {
  if (!KV) return globalThis._kv || {};
  try {
    const v = await KV.get("votes", "json");
    return (v && typeof v === "object") ? v : {};
  } catch (_) { return {}; }
}
async function writeVotes(KV, data) {
  if (!KV) { globalThis._kv = data; return; }
  await KV.put("votes", JSON.stringify(data));
}

async function handleVotes(request, env) {
  const KV = env && env.KEMURI_KV;
  if (request.method === "OPTIONS") return new Response("", { status: 204, headers: CORS });

  if (request.method === "GET") {
    // userId クエリがあれば、その人が過去に投票した内容も返す（キャッシュ復元用）
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const all = await readVotes(KV);
    const pub = {};
    for (const id in all) {
      const v = all[id] || {};
      const entry = {
        name:  v.name  || "",
        heat:  v.heat  || 0,
        paper: v.paper || 0,
        room:  v.room  || 0,
        nope:  v.nope  || 0,
      };
      if (userId && v.voters && v.voters[userId]) {
        entry.myVote = v.voters[userId];
      }
      pub[id] = entry;
    }
    return json(pub);
  }

  if (request.method === "POST") {
    try {
      const { shopId, shopName, type, userId } = await request.json();
      if (!shopId || !["heat","paper","room","nope"].includes(type)) {
        return json({ error: "invalid params" }, 400);
      }
      const all = await readVotes(KV);
      if (!all[shopId]) all[shopId] = { name: "", heat: 0, paper: 0, room: 0, nope: 0, voters: {} };
      if (!all[shopId].voters) all[shopId].voters = {};
      all[shopId].name = shopName || all[shopId].name;
      if (userId) {
        const prev = all[shopId].voters[userId];
        if (prev && all[shopId][prev] > 0) all[shopId][prev]--;
        all[shopId][type] = (all[shopId][type] || 0) + 1;
        all[shopId].voters[userId] = type;
      } else {
        all[shopId][type] = (all[shopId][type] || 0) + 1;
      }
      await writeVotes(KV, all);
      const { voters, ...pub } = all[shopId];
      return json(pub);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}

// ──────────────────── /api/shops ────────────────────
async function readShops(KV) {
  if (!KV) return globalThis._shops || [];
  try {
    const v = await KV.get("custom-shops", "json");
    return Array.isArray(v) ? v : [];
  } catch (_) { return []; }
}
async function writeShops(KV, data) {
  if (!KV) { globalThis._shops = data; return; }
  await KV.put("custom-shops", JSON.stringify(data));
}

// Nominatim ジオコーディング: 多段フォールバックで成功率を上げる
async function geocodeAddress(address) {
  if (!address) return null;
  // 試行クエリの順に: 1) 「姫路 + 元住所 + 日本」 2) 元住所そのまま 3) 番地除去版 4) 「姫路市」前置
  const variants = [];
  const raw = address.trim();
  const withCity = raw.includes("姫路") ? raw : `姫路 ${raw}`;
  variants.push(`${withCity} 日本`);
  variants.push(raw);
  // 番地末尾（数字-数字-数字 など）を削った版
  const noBanchi = raw.replace(/[0-9０-９][0-9０-９\-ー丁目番地号\s]*$/, "").trim();
  if (noBanchi && noBanchi !== raw) variants.push(`${noBanchi.includes("姫路") ? "" : "姫路 "}${noBanchi}`);
  // 「姫路市」を明示
  if (!raw.includes("姫路市")) variants.push(`姫路市 ${raw}`);

  for (const q of variants) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: { "User-Agent": "ippuku-app/1.0 (contact via site)" } });
      if (!r.ok) continue;
      const arr = await r.json();
      if (Array.isArray(arr) && arr[0]) {
        const lat = parseFloat(arr[0].lat);
        const lng = parseFloat(arr[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      }
    } catch (_) { /* continue to next variant */ }
  }
  return null;
}

async function handleShops(request, env, ctx) {
  const KV = env && env.KEMURI_KV;
  if (request.method === "OPTIONS") return new Response("", { status: 204, headers: CORS });

  if (request.method === "GET") {
    let all = await readShops(KV);
    // バックフィル: ジオコーディングを待たず、レスポンスはすぐ返す（非同期実行）
    const targets = all.filter(s => (s.lat == null || s.lng == null) && s.address).slice(0, 3);
    if (targets.length > 0 && ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil((async () => {
        try {
          let updated = false;
          const latest = await readShops(KV); // 最新を読み直す（POST と競合しないように）
          for (const t of targets) {
            const idx = latest.findIndex(s => s.id === t.id);
            if (idx < 0) continue;
            if (latest[idx].lat != null && latest[idx].lng != null) continue;
            const coords = await geocodeAddress(latest[idx].address);
            if (coords) {
              latest[idx].lat = coords.lat;
              latest[idx].lng = coords.lng;
              updated = true;
            }
          }
          if (updated) await writeShops(KV, latest);
        } catch (_) {}
      })());
    }
    return json(all);
  }

  if (request.method === "POST") {
    try {
      const shop = await request.json();
      if (!shop || !shop.name || !shop.id) return json({ error: "invalid" }, 400);
      // photo は data:image/jpeg;base64,... 形式の文字列のみ許可
      let photo = "";
      if (typeof shop.photo === "string" && shop.photo.startsWith("data:image/")) {
        photo = shop.photo.slice(0, 1024 * 200); // 安全のため約 200KB に上限
      }
      const safe = {
        id:        String(shop.id).slice(0, 40),
        name:      String(shop.name || "").slice(0, 50),
        address:   String(shop.address || "").slice(0, 80),
        genre:     String(shop.genre || "").slice(0, 20),
        hours:     String(shop.hours || "").slice(0, 40),
        closed:    String(shop.closed || "").slice(0, 40),
        memo:      String(shop.memo || "").slice(0, 200),
        budget:    String(shop.budget || "").slice(0, 20),
        url:       String(shop.url || "").slice(0, 200),
        photo,
        custom:    true,
        createdAt: shop.createdAt || new Date().toISOString(),
        lat:       null,
        lng:       null,
      };
      // 住所からジオコーディング（多段フォールバック）
      if (safe.address) {
        const coords = await geocodeAddress(safe.address);
        if (coords) { safe.lat = coords.lat; safe.lng = coords.lng; }
      }
      let all = await readShops(KV);
      const existing = all.find(s => s.id === safe.id);
      // 編集時に createdAt を保持
      if (existing && existing.createdAt) safe.createdAt = existing.createdAt;
      all = all.filter(s => s.id !== safe.id);
      all.unshift(safe);
      if (all.length > 200) all = all.slice(0, 200);
      await writeShops(KV, all);
      return json(safe);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // 削除: DELETE { id } または DELETE ?id=...
  if (request.method === "DELETE") {
    try {
      let id = "";
      try { const b = await request.json(); id = b && b.id; } catch (_) {}
      if (!id) { const u = new URL(request.url); id = u.searchParams.get("id"); }
      if (!id) return json({ error: "id required" }, 400);
      let all = await readShops(KV);
      const before = all.length;
      all = all.filter(s => s.id !== id);
      await writeShops(KV, all);
      return json({ ok: true, removed: before - all.length });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}

// ──────────────────── シェア（トークン・OGP）────────────────────
const FALLBACK_SHARE_SECRET = "ippuku-share-secret-2026";

function _b64url(bytes){
  let s="";for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function shareToken(shopId, secret, dateStr){
  const data = `${shopId}:${dateStr}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return _b64url(new Uint8Array(sig)).slice(0, 16);
}
function _dateStr(offsetDays){
  const d = new Date(Date.now() + offsetDays*86400000);
  return d.toISOString().split("T")[0];
}
async function verifyShareToken(shopId, token, secret){
  if(!token) return false;
  // 当日・前日のトークンを許容（日付またぎ対策 ≒ 24時間）
  for(const off of [0, -1]){
    const t = await shareToken(shopId, secret, _dateStr(off));
    if(t === token) return true;
  }
  return false;
}

// votes KV の name か、custom shops から店名・ジャンルを引く
async function lookupShopMeta(KV, shopId){
  let name="", genre="";
  try{
    const votes = await readVotes(KV);
    if(votes[shopId] && votes[shopId].name) name = votes[shopId].name;
  }catch(_){}
  try{
    const shops = await readShops(KV);
    const cs = shops.find(s=>s.id===shopId);
    if(cs){ name = name || cs.name || ""; genre = cs.genre || ""; }
  }catch(_){}
  return { name, genre };
}

// /api/share-token?shopId=...
async function handleShareToken(request, env){
  const url = new URL(request.url);
  const shopId = url.searchParams.get("shopId");
  if(!shopId) return json({ error:"shopId required" }, 400);
  const secret = (env && env.SHARE_SECRET) || FALLBACK_SHARE_SECRET;
  const token = await shareToken(shopId, secret, _dateStr(0));
  const shareUrl = `${url.origin}/s/${encodeURIComponent(shopId)}?t=${token}`;
  return json({ token, url: shareUrl });
}

// /api/shop?id=...  単一店舗取得（共有閲覧用）。手動店→KV、ホットペッパー→API
async function handleSingleShop(request, env){
  const KV = env && env.KEMURI_KV;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if(!id) return json({ error:"id required" }, 400);
  // 手動追加店
  if(id.startsWith("custom_")){
    const shops = await readShops(KV);
    const cs = shops.find(s=>s.id===id);
    return cs ? json(cs) : json({ error:"not found" }, 404);
  }
  // ホットペッパー店（id で直接取得）
  try{
    const qs = new URLSearchParams();
    qs.set("key", (env && env.HOTPEPPER_KEY) || FALLBACK_KEY);
    qs.set("format", "json");
    qs.set("id", id);
    const r = await fetch(`${HOTPEPPER_BASE}?${qs.toString()}`);
    const d = await r.json();
    const shop = d.results?.shop?.[0];
    return shop ? json(shop) : json({ error:"not found" }, 404);
  }catch(e){
    return json({ error: e.message }, 502);
  }
}

function escHtml(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

// /s/:shopId  共有ページ。index.html に OGP と window.__SHARE__ を注入して返す
async function handleSharePage(request, env, shopId){
  const url = new URL(request.url);
  const token = url.searchParams.get("t") || "";
  const secret = (env && env.SHARE_SECRET) || FALLBACK_SHARE_SECRET;
  const KV = env && env.KEMURI_KV;
  const valid = await verifyShareToken(shopId, token, secret);
  const meta = await lookupShopMeta(KV, shopId);

  const title = (meta.name ? `${meta.name} - ぷかり` : "ぷかり — 姫路グルメ 喫煙席検索");
  const desc = meta.name
    ? `姫路で煙草が吸える${meta.genre?`「${meta.genre}」`:""}「${meta.name}」。ぷかりで喫煙環境をチェック。`
    : "姫路の喫煙席があるお店を検索 — ぷかり";
  const ogImage = `${url.origin}/ogp.png`;
  const pageUrl = `${url.origin}/s/${encodeURIComponent(shopId)}`;

  // index.html を取得（ASSETS のルートを GET。/ → index.html を配信）
  let html = "";
  try{
    let res = await env.ASSETS.fetch(new Request(`${url.origin}/`));
    html = await res.text();
    if(!html){
      res = await env.ASSETS.fetch(new Request(`${url.origin}/index.html`));
      html = await res.text();
    }
  }catch(_){}
  if(!html){
    // 取得失敗時はトップへ誘導
    html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>location.href='/';</script></body></html>`;
  }

  // OGP メタタグ
  const ogTags = `
<meta property="og:type" content="website">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:image" content="${ogImage}">
<meta property="og:url" content="${pageUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
<meta name="twitter:description" content="${escHtml(desc)}">
<meta name="twitter:image" content="${ogImage}">
<script>window.__SHARE__=${JSON.stringify({ shopId, valid })};</script>
`;
  // <title> を差し替え、</head> 直前に OGP を注入
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escHtml(title)}</title>`);
  html = html.replace("</head>", ogTags + "</head>");

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// ──────────────────── コメント (KV) ────────────────────
// キー: comments:{shopId} → [{id,nickname,body,createdAt,clientId,reports:[clientId],hidden}]
const COMMENT_HIDE_THRESHOLD = 2; // 通報がこの数で自動非表示

async function kvGetJson(KV, key, fallback) {
  if (!KV) return (globalThis["_" + key] ?? fallback);
  try { const v = await KV.get(key, "json"); return (v ?? fallback); } catch (_) { return fallback; }
}
async function kvPutJson(KV, key, val) {
  if (!KV) { globalThis["_" + key] = val; return; }
  await KV.put(key, JSON.stringify(val));
}

async function handleComments(request, env) {
  const KV = env && env.KEMURI_KV;
  if (request.method === "OPTIONS") return new Response("", { status: 204, headers: CORS });
  const url = new URL(request.url);

  if (request.method === "GET") {
    const shopId = url.searchParams.get("shopId");
    if (!shopId) return json({ error: "shopId required" }, 400);
    const all = await kvGetJson(KV, "comments:" + shopId, []);
    // 非表示を除外し、新しい順で返す（reports/clientId は隠す）
    const pub = all.filter(c => !c.hidden)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(c => ({ id: c.id, nickname: c.nickname || "匿名", body: c.body, createdAt: c.createdAt }));
    return json(pub);
  }

  if (request.method === "POST") {
    try {
      const b = await request.json();
      const action = url.searchParams.get("action") || b.action;
      const shopId = String(b.shopId || "");
      if (!shopId) return json({ error: "shopId required" }, 400);
      const key = "comments:" + shopId;
      let all = await kvGetJson(KV, key, []);

      // 通報
      if (action === "report") {
        const id = String(b.id || "");
        const cid = String(b.clientId || "");
        const c = all.find(x => x.id === id);
        if (!c) return json({ error: "not found" }, 404);
        c.reports = c.reports || [];
        if (cid && !c.reports.includes(cid)) c.reports.push(cid);
        if (c.reports.length >= COMMENT_HIDE_THRESHOLD) c.hidden = true;
        await kvPutJson(KV, key, all);
        return json({ ok: true, hidden: !!c.hidden });
      }

      // 投稿
      const body = String(b.body || "").trim().slice(0, 300);
      if (!body) return json({ error: "body required" }, 400);
      const nickname = String(b.nickname || "").trim().slice(0, 20);
      const clientId = String(b.clientId || "").slice(0, 60);
      // 連投制限: 同一clientIdの直近投稿から10秒以内は拒否
      const now = Date.now();
      const last = all.filter(c => c.clientId === clientId).sort((a, b2) => b2.createdAt - a.createdAt)[0];
      if (last && now - last.createdAt < 10000) return json({ error: "投稿間隔が短すぎます" }, 429);
      // 同一clientId+同一本文の重複拒否
      if (all.some(c => c.clientId === clientId && c.body === body)) return json({ error: "重複投稿です" }, 409);

      const item = { id: "c" + now.toString(36) + Math.random().toString(36).slice(2, 6), nickname, body, createdAt: now, clientId, reports: [], hidden: false };
      all.unshift(item);
      if (all.length > 500) all = all.slice(0, 500);
      await kvPutJson(KV, key, all);
      return json({ id: item.id, nickname: item.nickname || "匿名", body: item.body, createdAt: item.createdAt });
    } catch (e) { return json({ error: e.message }, 500); }
  }
  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}

// ──────────────────── 写真 (KV) ────────────────────
// メタ: photos:{shopId} → [{id,category,caption,uploadedAt,clientId,reports:[],hidden}]
// 画像: photo:{id} (フル data URL) / photothumb:{id} (サムネ data URL)
const PHOTO_HIDE_THRESHOLD = 3;

async function handlePhotos(request, env) {
  const KV = env && env.KEMURI_KV;
  if (request.method === "OPTIONS") return new Response("", { status: 204, headers: CORS });
  const url = new URL(request.url);

  if (request.method === "GET") {
    const shopId = url.searchParams.get("shopId");
    if (!shopId) return json({ error: "shopId required" }, 400);
    const all = await kvGetJson(KV, "photos:" + shopId, []);
    const pub = all.filter(p => !p.hidden)
      .sort((a, b) => b.uploadedAt - a.uploadedAt)
      .map(p => ({ id: p.id, category: p.category || "other", caption: p.caption || "", uploadedAt: p.uploadedAt }));
    return json(pub);
  }

  if (request.method === "POST") {
    try {
      const b = await request.json();
      const action = url.searchParams.get("action") || b.action;
      const shopId = String(b.shopId || "");
      if (!shopId) return json({ error: "shopId required" }, 400);
      const key = "photos:" + shopId;
      let all = await kvGetJson(KV, key, []);

      // 通報
      if (action === "report") {
        const id = String(b.id || "");
        const cid = String(b.clientId || "");
        const p = all.find(x => x.id === id);
        if (!p) return json({ error: "not found" }, 404);
        p.reports = p.reports || [];
        if (cid && !p.reports.includes(cid)) p.reports.push(cid);
        if (p.reports.length >= PHOTO_HIDE_THRESHOLD) p.hidden = true;
        await kvPutJson(KV, key, all);
        return json({ ok: true, hidden: !!p.hidden });
      }

      // アップロード（items: [{full,thumb,category,caption}]）
      const clientId = String(b.clientId || "").slice(0, 60);
      const items = Array.isArray(b.items) ? b.items.slice(0, 5) : [];
      if (!items.length) return json({ error: "items required" }, 400);

      // レート制限: 同一clientId 1時間20枚まで
      const now = Date.now();
      const recent = all.filter(p => p.clientId === clientId && now - p.uploadedAt < 3600000).length;
      if (recent + items.length > 20) return json({ error: "アップロード上限（1時間20枚）に達しました" }, 429);

      const validCat = ["food", "smoking_seat", "exterior", "menu", "other"];
      const added = [];
      let skipped = 0;
      const MAX_DATAURL = 1024 * 1024 * 4; // 約4MB(dataURL)まで許可
      for (const it of items) {
        const full = String(it.full || "");
        const thumb = String(it.thumb || full);
        if (!full.startsWith("data:image/")) { skipped++; continue; }
        if (full.length > MAX_DATAURL) { skipped++; continue; } // 大きすぎる画像のみ除外
        const id = "p" + now.toString(36) + Math.random().toString(36).slice(2, 8);
        await KV.put("photo:" + id, full);
        await KV.put("photothumb:" + id, thumb);
        const meta = {
          id,
          category: validCat.includes(it.category) ? it.category : "other",
          caption: String(it.caption || "").slice(0, 50),
          uploadedAt: now, clientId, reports: [], hidden: false
        };
        all.unshift(meta);
        added.push({ id: meta.id, category: meta.category, caption: meta.caption, uploadedAt: meta.uploadedAt });
      }
      if (all.length > 300) all = all.slice(0, 300);
      await kvPutJson(KV, key, all);
      if (added.length === 0 && skipped > 0) return json({ error: "画像が大きすぎて保存できませんでした", added: [] }, 413);
      return json({ added, skipped });
    } catch (e) { return json({ error: e.message }, 500); }
  }
  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}

// 画像配信: /api/photo?id=xxx[&thumb=1]
async function servePhoto(request, env) {
  const KV = env && env.KEMURI_KV;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || !KV) return new Response("Not Found", { status: 404 });
  const key = (url.searchParams.get("thumb") ? "photothumb:" : "photo:") + id;
  const dataUrl = await KV.get(key);
  if (!dataUrl) return new Response("Not Found", { status: 404 });
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return new Response("Not Found", { status: 404 });
  const bin = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  return new Response(bin, {
    status: 200,
    headers: { ...CORS, "Content-Type": m[1], "Cache-Control": "public, max-age=86400" },
  });
}

// ──────────────────── ルーティング ────────────────────
export default {
  async fetch(request, env, ctx) {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/search")       return handleSearch(request, env);
    if (path === "/api/votes")        return handleVotes(request, env);
    if (path === "/api/shops")        return handleShops(request, env, ctx);
    if (path === "/api/share-token")  return handleShareToken(request, env);
    if (path === "/api/shop")         return handleSingleShop(request, env);
    if (path === "/api/comments")     return handleComments(request, env);
    if (path === "/api/photos")       return handlePhotos(request, env);
    if (path === "/api/photo")        return servePhoto(request, env);

    // 共有ページ /s/{shopId}
    const sm = path.match(/^\/s\/([^/]+)\/?$/);
    if (sm) return handleSharePage(request, env, decodeURIComponent(sm[1]));

    // それ以外は静的ファイル (index.html など)
    if (env && env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not Found", { status: 404 });
  }
};

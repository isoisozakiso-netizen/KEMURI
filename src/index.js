/**
 * KEMURI — Cloudflare Worker (静的ファイル + API を1ファイルで処理)
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
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

// ──────────────────── /api/search ────────────────────
async function handleSearch(request, env) {
  const url = new URL(request.url);
  const qs = new URLSearchParams(url.search);
  qs.set("key", (env && env.HOTPEPPER_KEY) || FALLBACK_KEY);
  qs.set("format", "json");
  qs.delete("large_area");
  qs.delete("service_area");
  qs.delete("middle_area");
  const userKw = (qs.get("keyword") || "").replace(/姫路/g, "").trim();
  qs.set("keyword", userKw ? `姫路 ${userKw}` : "姫路");
  qs.delete("smoking");
  try {
    const r = await fetch(`${HOTPEPPER_BASE}?${qs.toString()}`);
    const body = await r.text();
    return new Response(body, {
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

async function handleShops(request, env) {
  const KV = env && env.KEMURI_KV;
  if (request.method === "OPTIONS") return new Response("", { status: 204, headers: CORS });
  if (request.method === "GET") return json(await readShops(KV));
  if (request.method === "POST") {
    try {
      const shop = await request.json();
      if (!shop || !shop.name || !shop.id) return json({ error: "invalid" }, 400);
      const safe = {
        id:        String(shop.id).slice(0, 40),
        name:      String(shop.name || "").slice(0, 50),
        address:   String(shop.address || "").slice(0, 80),
        genre:     String(shop.genre || "").slice(0, 20),
        hours:     String(shop.hours || "").slice(0, 40),
        budget:    String(shop.budget || "").slice(0, 20),
        url:       String(shop.url || "").slice(0, 200),
        custom:    true,
        createdAt: shop.createdAt || new Date().toISOString(),
      };
      let all = await readShops(KV);
      all = all.filter(s => s.id !== safe.id);
      all.unshift(safe);
      if (all.length > 200) all = all.slice(0, 200);
      await writeShops(KV, all);
      return json(safe);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }
  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}

// ──────────────────── ルーティング ────────────────────
export default {
  async fetch(request, env, ctx) {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/search") return handleSearch(request, env);
    if (path === "/api/votes")  return handleVotes(request, env);
    if (path === "/api/shops")  return handleShops(request, env);

    // それ以外は静的ファイル (index.html など)
    if (env && env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not Found", { status: 404 });
  }
};

/**
 * KEMURI 手動追加店舗API — /api/shops  (Cloudflare Pages Functions)
 * GET  → 追加店舗一覧
 * POST → { id, name, address, genre, hours, budget, url, custom, createdAt }
 */

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const KEY = "custom-shops";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function readAll(KV) {
  if (KV) {
    try {
      const v = await KV.get(KEY, "json");
      if (Array.isArray(v)) return v;
    } catch (_) {}
    return [];
  }
  return globalThis._shops || [];
}

async function writeAll(KV, data) {
  if (KV) await KV.put(KEY, JSON.stringify(data));
  else globalThis._shops = data;
}

export async function onRequest(context) {
  const { request, env } = context;
  const KV = env && env.KEMURI_KV;
  const method = request.method;

  if (method === "OPTIONS") return new Response("", { status: 204, headers: CORS });

  if (method === "GET") {
    return json(await readAll(KV));
  }

  if (method === "POST") {
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

      let all = await readAll(KV);
      all = all.filter(s => s.id !== safe.id);
      all.unshift(safe);
      if (all.length > 200) all = all.slice(0, 200);

      await writeAll(KV, all);
      return json(safe);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}

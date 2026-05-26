/**
 * KEMURI 投票API — /api/votes  (Cloudflare Pages Functions)
 * GET  → 全投票データ返却（voters は除外）
 * POST → { shopId, shopName, type:"heat"|"paper"|"room"|"nope", userId }
 *
 * KV バインディング名: KEMURI_KV  (wrangler.toml で設定)
 *   - 未バインディング時は globalThis._kv に退避（同一インスタンス内のみ保持）
 */

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const KEY = "votes";

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
      if (v && typeof v === "object") return v;
    } catch (_) {}
    return {};
  }
  return globalThis._kv || {};
}

async function writeAll(KV, data) {
  if (KV) await KV.put(KEY, JSON.stringify(data));
  else globalThis._kv = data;
}

export async function onRequest(context) {
  const { request, env } = context;
  const KV = env && env.KEMURI_KV;
  const method = request.method;

  if (method === "OPTIONS") return new Response("", { status: 204, headers: CORS });

  if (method === "GET") {
    const all = await readAll(KV);
    const pub = {};
    for (const id in all) {
      const v = all[id] || {};
      pub[id] = {
        name: v.name || "",
        heat: v.heat || 0,
        paper: v.paper || 0,
        room: v.room || 0,
        nope: v.nope || 0,
      };
    }
    return json(pub);
  }

  if (method === "POST") {
    try {
      const { shopId, shopName, type, userId } = await request.json();
      if (!shopId || !["heat", "paper", "room", "nope"].includes(type)) {
        return json({ error: "invalid params" }, 400);
      }

      const all = await readAll(KV);
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

      await writeAll(KV, all);

      const { voters, ...pub } = all[shopId];
      return json(pub);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}

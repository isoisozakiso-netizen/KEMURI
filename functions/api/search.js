/**
 * KEMURI ホットペッパープロキシ — /api/search  (Cloudflare Pages Functions)
 * クライアント: fetch('/api/search?keyword=...&genre=...') で利用
 *
 * 環境変数 HOTPEPPER_KEY を Cloudflare Pages の Environment Variables で
 * 設定するとそちらを優先。未設定時はフォールバック値を使用。
 */

const FALLBACK_KEY = "e20bb74cbcf73dc2";
const API_BASE     = "https://webservice.recruit.co.jp/hotpepper/gourmet/v1/";

const CORS = {
  "Access-Control-Allow-Origin": "*",
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const qs = new URLSearchParams(url.search);

  qs.set("key", (env && env.HOTPEPPER_KEY) || FALLBACK_KEY);
  qs.set("format", "json");

  // エリア固定: 姫路のみ
  qs.delete("large_area");
  qs.delete("service_area");
  qs.delete("middle_area");

  const userKw = (qs.get("keyword") || "").replace(/姫路/g, "").trim();
  qs.set("keyword", userKw ? `姫路 ${userKw}` : "姫路");

  qs.delete("smoking");

  const fetchUrl = `${API_BASE}?${qs.toString()}`;

  try {
    const r = await fetch(fetchUrl);
    const body = await r.text();
    return new Response(body, {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
    });
  }
}

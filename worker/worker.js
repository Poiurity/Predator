// Cloudflare Worker proxy for Gemini Developer API.
// Hides GEMINI_API_KEY from the browser. Preserves query params so the
// SDK's alt=sse and similar flags survive (spec §3.4).

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
    if (req.method !== "POST")    return new Response("OK", { headers: cors() });

    const url = new URL(req.url);
    const upstream =
      `https://generativelanguage.googleapis.com${url.pathname}` +
      `?key=${env.GEMINI_API_KEY}` +
      (url.search ? "&" + url.search.slice(1) : "");

    const r = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: req.body,
    });

    return new Response(r.body, {
      headers: {
        ...cors(),
        "Content-Type": r.headers.get("Content-Type") ?? "application/json",
      },
    });
  },
};

const cors = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});

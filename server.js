// Cloud Run single-container server: serves the Vite build and proxies
// Gemini Developer API. Same-origin so the browser never touches an
// upstream URL or sees the key. GEMINI_API_KEY is set on the Cloud Run
// service env vars (not in this repo). Spec §3.4 adapted for Cloud Run.

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.PORT ?? 8080);
const KEY = process.env.GEMINI_API_KEY ?? "";

if (!KEY) {
  console.warn("[server] GEMINI_API_KEY not set — proxy will 500 on /v1beta/*");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico":  "image/x-icon",
  ".woff2": "font/woff2",
  ".map":  "application/json",
};

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`
      );

      if (req.method === "OPTIONS") return cors(res, 204);

      if (req.method === "POST" && url.pathname.startsWith("/v1beta/")) {
        return await proxyGemini(req, res, url);
      }

      if (req.method === "GET" || req.method === "HEAD") {
        return await serveStatic(res, url.pathname);
      }

      res.writeHead(405);
      res.end("method not allowed");
    } catch (e) {
      console.error("[server] error", e);
      if (!res.headersSent) res.writeHead(500);
      res.end("internal error");
    }
  })
  .listen(PORT, () => console.log(`[server] living-stage on :${PORT}`));

async function proxyGemini(req, res, url) {
  if (!KEY) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("GEMINI_API_KEY not configured");
    return;
  }

  const target = new URL(
    `https://generativelanguage.googleapis.com${url.pathname}`
  );
  // Preserve SDK-attached query params (alt=sse etc) and append the key.
  url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
  target.searchParams.set("key", KEY);

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);

  const upstream = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": req.headers["content-type"] ?? "application/json",
    },
    body,
  });

  res.writeHead(upstream.status, {
    "Content-Type":
      upstream.headers.get("Content-Type") ?? "application/json",
    "Access-Control-Allow-Origin": "*",
  });

  if (upstream.body) {
    Readable.fromWeb(upstream.body).pipe(res);
  } else {
    res.end();
  }
}

async function serveStatic(res, pathname) {
  const target = pathname === "/" ? "/index.html" : pathname;
  let abs = normalize(join(DIST, target));

  // Path traversal guard.
  if (!abs.startsWith(DIST)) {
    res.writeHead(403);
    res.end();
    return;
  }

  try {
    const s = await stat(abs);
    if (s.isDirectory()) abs = join(abs, "index.html");
  } catch {
    abs = join(DIST, "index.html"); // SPA fallback
  }

  try {
    const data = await readFile(abs);
    const mime = MIME[extname(abs)] ?? "application/octet-stream";
    const isHtml = mime.startsWith("text/html");
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": isHtml ? "no-cache" : "public, max-age=3600",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}

function cors(res, status) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end();
}

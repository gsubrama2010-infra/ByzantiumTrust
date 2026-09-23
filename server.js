// Static server for the Byzantium Trust site (exposed publicly via the Cloudflare tunnel).
// Serves only index.html and files under assets/ — nothing else in this folder.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8088);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".ico": "image/x-icon"
};
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN"
};

function resolve(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split("?")[0]); } catch { return null; }
  if (p === "/" || p === "/index.html") return path.join(ROOT, "index.html");
  if (!p.startsWith("/assets/")) return null;
  const full = path.resolve(ROOT, "." + p);
  const assets = path.join(ROOT, "assets") + path.sep;
  return full.startsWith(assets) && TYPES[path.extname(full).toLowerCase()] ? full : null;
}

http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, SECURITY_HEADERS); return res.end(); }
  const file = resolve(req.url);
  if (!file) { res.writeHead(404, SECURITY_HEADERS); return res.end("Not found"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, SECURITY_HEADERS); return res.end("Not found"); }
    const isHtml = file.endsWith(".html");
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": TYPES[path.extname(file).toLowerCase()],
      "Cache-Control": isHtml ? "no-cache" : "public, max-age=86400"
    });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}).listen(PORT, "127.0.0.1", () => console.log(`Byzantium Trust site on http://127.0.0.1:${PORT}`));

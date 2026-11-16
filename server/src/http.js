"use strict";
/** Utilitários HTTP mínimos (roteador, JSON, estáticos, autenticação, limite de taxa). */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("./config");

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".heic": "image/heic", ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".csv": "text/csv; charset=utf-8", ".woff2": "font/woff2",
};

class ErroHttp extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

function cabecalhosSeguranca(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(self), camera=(self)");
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; " +
    "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; " +
    // ViaCEP (busca por CEP no formulário) e o mapa do Google Maps mostrado com o endereço
    "connect-src 'self' https://viacep.com.br; frame-src https://maps.google.com https://www.google.com; " +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (config.urlPublica.startsWith("https://")) res.setHeader("Strict-Transport-Security", "max-age=31536000");
}

function json(res, status, corpo) {
  const txt = JSON.stringify(corpo);
  res.writeHead(status, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" });
  res.end(txt);
}

function enviarArquivo(res, arquivo, { download = null, cache = "no-store" } = {}) {
  if (!arquivo || !fs.existsSync(arquivo)) throw new ErroHttp(404, "Arquivo não encontrado.");
  const st = fs.statSync(arquivo);
  const h = { "Content-Type": MIME[path.extname(arquivo).toLowerCase()] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": cache };
  if (download) h["Content-Disposition"] = `attachment; filename="${download}"`;
  res.writeHead(200, h);
  fs.createReadStream(arquivo).pipe(res);
}

/** Serve um diretório estático com proteção contra path traversal. */
function servirEstatico(raiz, req, res, prefixo = "") {
  let rel = decodeURIComponent(new URL(req.url, "http://x").pathname.slice(prefixo.length));
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  const alvo = path.resolve(raiz, "." + path.posix.normalize("/" + rel));
  if (!alvo.startsWith(path.resolve(raiz) + path.sep)) return false;
  if (!fs.existsSync(alvo) || !fs.statSync(alvo).isFile()) return false;
  const ext = path.extname(alvo);
  enviarArquivo(res, alvo, { cache: ext === ".html" ? "no-cache" : "public, max-age=3600" });
  return true;
}

/** Lê o corpo com limite de tamanho. */
function lerCorpo(req, limiteBytes) {
  return new Promise((ok, falha) => {
    const partes = []; let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > limiteBytes) { falha(new ErroHttp(413, "Arquivo muito grande.")); req.destroy(); return; }
      partes.push(c);
    });
    req.on("end", () => ok(Buffer.concat(partes)));
    req.on("error", falha);
  });
}

/** multipart/form-data → FormData nativo (undici), sem dependências. */
async function lerFormulario(req, limiteBytes) {
  const tipo = req.headers["content-type"] || "";
  if (!/^multipart\/form-data|^application\/x-www-form-urlencoded/i.test(tipo)) throw new ErroHttp(415, "Formato de envio inválido.");
  const corpo = await lerCorpo(req, limiteBytes);
  try { return await new Request("http://local/", { method: "POST", headers: { "content-type": tipo }, body: corpo }).formData(); }
  catch { throw new ErroHttp(400, "Não foi possível ler o formulário enviado."); }
}

async function lerJson(req, limiteBytes = 256 * 1024) {
  const corpo = await lerCorpo(req, limiteBytes);
  try { return JSON.parse(corpo.toString("utf8") || "{}"); } catch { throw new ErroHttp(400, "JSON inválido."); }
}

function ipCliente(req) {
  if (config.confiarProxy && req.headers["x-forwarded-for"]) return req.headers["x-forwarded-for"].split(",")[0].trim();
  return req.socket.remoteAddress || "";
}
const hashIp = (ip) => crypto.createHmac("sha256", config.seguranca.segredoIp).update(ip).digest("hex").slice(0, 32);

/** Limite de envios por IP (memória). */
const janelas = new Map();
function limitarTaxa(chave, maximo, janelaMs) {
  const agora = Date.now();
  const lista = (janelas.get(chave) || []).filter((t) => agora - t < janelaMs);
  if (lista.length >= maximo) throw new ErroHttp(429, "Muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo.");
  lista.push(agora); janelas.set(chave, lista);
  if (janelas.size > 10000) for (const [k, v] of janelas) if (!v.some((t) => agora - t < janelaMs)) janelas.delete(k);
}

/** Autenticação HTTP Basic do painel do gabinete. Retorna o usuário ou null. */
function autenticar(req, res) {
  const { usuario, senha } = config.painel;
  if (!senha) { json(res, 503, { erro: "Defina PAINEL_SENHA no arquivo .env para liberar o painel." }); return null; }
  const [tipo, cred] = (req.headers.authorization || "").split(" ");
  if (tipo === "Basic" && cred) {
    const [u, ...s] = Buffer.from(cred, "base64").toString("utf8").split(":");
    const igual = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
    if (igual(u, usuario) & igual(s.join(":"), senha)) return u;
  }
  res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Painel do Gabinete", charset="UTF-8"', "Content-Type": "text/plain; charset=utf-8" });
  res.end("Acesso restrito ao gabinete.");
  return null;
}

/** Roteador simples: rota("GET", "/api/x/:id", handler). */
function criarRoteador() {
  const rotas = [];
  const adicionar = (metodo, padrao, fn) => {
    const nomes = [];
    const re = new RegExp("^" + padrao.replace(/:(\w+)/g, (_, n) => (nomes.push(n), "([^/]+)")) + "/?$");
    rotas.push({ metodo, re, nomes, fn });
  };
  const resolver = (metodo, caminho) => {
    for (const r of rotas) {
      if (r.metodo !== metodo) continue;
      const m = caminho.match(r.re);
      if (m) return { fn: r.fn, params: Object.fromEntries(r.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  };
  return { get: (p, f) => adicionar("GET", p, f), post: (p, f) => adicionar("POST", p, f),
           patch: (p, f) => adicionar("PATCH", p, f), resolver };
}

module.exports = { ErroHttp, MIME, cabecalhosSeguranca, json, enviarArquivo, servirEstatico, lerFormulario, lerJson,
                   ipCliente, hashIp, limitarTaxa, autenticar, criarRoteador };

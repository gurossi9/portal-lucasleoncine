"use strict";
/**
 * Portal de Demandas — servidor HTTP (Node.js >= 22.5, sem dependências externas).
 *
 * Público:  GET  /                      formulário (pasta public/)
 *           POST /api/demandas          recebe a demanda → protocolo
 *           GET  /api/protocolo/:p      consulta pública (exige 4 últimos dígitos do WhatsApp)
 * Gabinete: GET  /painel/               painel (login HTTP Basic)
 *           /api/painel/*               estatísticas, lista, status, documentos, CSV
 */
const http = require("node:http");
const path = require("node:path");
const config = require("./config");
const { db } = require("./db");
const H = require("./http");
const D = require("./demandas");
const E = require("./estatisticas");
const fila = require("./fila");
const { CATEGORIAS, STATUS } = require("./catalogo");
const { whatsappAtivo } = require("./notificacoes/whatsapp");
const { textoPadrao, textoFinal } = require("./documentos/indicacao");
const ia = require("./documentos/redacao-ia");

const r = H.criarRoteador();

/* ------------------------------ Público ------------------------------ */
r.post("/api/demandas", async (req, res) => {
  const ip = H.ipCliente(req);
  H.limitarTaxa("envio:" + ip, config.seguranca.limiteEnviosPorIp, config.seguranca.janelaLimiteMin * 60000);
  const fd = await H.lerFormulario(req, (config.seguranca.fotoMaxMB + 1) * 1024 * 1024);
  if (fd.get("website")) return H.json(res, 201, { protocolo: "LL-0000-000000", notificacao_whatsapp: false }); // honeypot: finge sucesso
  const { protocolo, duplicada } = await D.criarDemanda(fd, H.hashIp(ip));
  setImmediate(() => fila.processar().catch(console.error));
  H.json(res, duplicada ? 200 : 201, { protocolo, duplicada, notificacao_whatsapp: whatsappAtivo() });
});

r.get("/api/protocolo/:protocolo", async (req, res, p) => {
  H.limitarTaxa("consulta:" + H.ipCliente(req), 30, 10 * 60000);
  const finais = new URL(req.url, "http://x").searchParams.get("final") || "";
  const d = D.buscarPorProtocolo(p.protocolo);
  if (!d || !/^\d{4}$/.test(finais) || !d.whatsapp.endsWith(finais)) throw new H.ErroHttp(404, "Protocolo não encontrado. Confira o número e os 4 últimos dígitos do WhatsApp.");
  const pub = D.paraApi(d);
  H.json(res, 200, { protocolo: pub.protocolo, criado_em: pub.criado_em, categoria: pub.categoria_nome, bairro: pub.bairro,
    status: pub.status_nome, numero_indicacao: pub.numero_indicacao,
    // só mudanças de situação (sem notas internas), sem repetições seguidas
    historico: E.historico(d.id).filter((h, i, arr) => i === 0 || h.status !== arr[i - 1].status)
      .map((h) => ({ data: h.criado_em, status: h.status_nome })) });
});

r.get("/api/saude", (req, res) => {
  const t = db.prepare("SELECT status, COUNT(*) n FROM tarefas GROUP BY status").all();
  H.json(res, 200, { ok: true, versao: "1.1.0", tarefas: Object.fromEntries(t.map((x) => [x.status, x.n])) });
});

/* ------------------------------ Painel (protegido) ------------------------------ */
r.get("/api/painel/catalogo", (req, res) =>
  H.json(res, 200, { categorias: CATEGORIAS, status: STATUS, ia: ia.ativa(),
    bairros: db.prepare("SELECT DISTINCT bairro FROM demandas ORDER BY bairro").all().map((x) => x.bairro) }));

r.get("/api/painel/resumo", (req, res) => H.json(res, 200, E.resumo(Object.fromEntries(new URL(req.url, "http://x").searchParams))));

r.get("/api/painel/demandas", (req, res) => {
  const out = E.listar(Object.fromEntries(new URL(req.url, "http://x").searchParams));
  H.json(res, 200, { ...out, linhas: out.linhas.map((d) => D.paraApi(d, true)) });
});

r.get("/api/painel/relatorio.csv", (req, res) => {
  const hoje = new Date().toISOString().slice(0, 10);
  res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="demandas-${hoje}.csv"`, "Cache-Control": "no-store" });
  res.end(E.csv(Object.fromEntries(new URL(req.url, "http://x").searchParams)));
});

r.get("/api/painel/demandas/:id", (req, res, p) => {
  const d = D.buscarPorId(p.id); if (!d) throw new H.ErroHttp(404, "Demanda não encontrada.");
  H.json(res, 200, { ...D.paraApi(d, true), texto_padrao: textoPadrao(d), indicacao: textoFinal(d),
    historico: E.historico(d.id), tarefas: E.tarefas(d.id) });
});

r.patch("/api/painel/demandas/:id", async (req, res, p, usuario) => {
  const corpo = await H.lerJson(req);
  const d = D.mudarStatus(p.id, corpo, usuario);
  setImmediate(() => fila.processar().catch(console.error));
  H.json(res, 200, D.paraApi(d, true));
});

/** Salva ajustes no texto da Indicação (ementa e corpo) e regenera o documento. Corpo vazio = volta ao texto automático. */
r.post("/api/painel/demandas/:id/indicacao", async (req, res, p) => {
  const d = D.buscarPorId(p.id); if (!d) throw new H.ErroHttp(404, "Demanda não encontrada.");
  const c = await H.lerJson(req);
  const ajustes = {};
  for (const k of ["ementa", "corpo"]) if (typeof c[k] === "string" && c[k].trim()) ajustes[k] = D.limpar(c[k], 4000);
  if (ajustes.ementa && !/^Indica\s/.test(ajustes.ementa)) throw new H.ErroHttp(422, "A ementa deve começar com \"Indica\".");
  db.prepare("UPDATE demandas SET texto_indicacao = ? WHERE id = ?").run(Object.keys(ajustes).length ? JSON.stringify(ajustes) : null, d.id);
  db.prepare("INSERT INTO tarefas (demanda_id, tipo) VALUES (?, 'documento')").run(d.id);
  await fila.processar();
  H.json(res, 200, D.paraApi(D.buscarPorId(d.id), true));
});

/** Descarta ajustes e a redação anterior e pede uma nova redação à IA. */
r.post("/api/painel/demandas/:id/indicacao/ia", async (req, res, p) => {
  const d = D.buscarPorId(p.id); if (!d) throw new H.ErroHttp(404, "Demanda não encontrada.");
  if (!ia.ativa()) throw new H.ErroHttp(409, "A redação por IA está desligada (IA_PROVEDOR no .env).");
  db.prepare("UPDATE demandas SET indicacao_ia = NULL, texto_indicacao = NULL WHERE id = ?").run(d.id);
  db.prepare("INSERT INTO tarefas (demanda_id, tipo) VALUES (?, 'documento')").run(d.id);
  await fila.processar();
  H.json(res, 200, D.paraApi(D.buscarPorId(d.id), true));
});

r.post("/api/painel/demandas/:id/reenviar", async (req, res, p) => {
  const n = fila.reenviar(Number(p.id));
  await fila.processar();
  H.json(res, 200, { reagendadas: n });
});

const arquivoDaDemanda = (campo) => (req, res, p) => {
  const d = D.buscarPorId(p.id); if (!d || !d[campo]) throw new H.ErroHttp(404, "Arquivo ainda não disponível.");
  const abs = path.join(config.pastas.dados, d[campo]);
  H.enviarArquivo(res, abs, { download: campo === "foto_arquivo" ? null : path.basename(abs) });
};
r.get("/api/painel/demandas/:id/foto", arquivoDaDemanda("foto_arquivo"));
r.get("/api/painel/demandas/:id/indicacao.docx", arquivoDaDemanda("documento_docx"));
r.get("/api/painel/demandas/:id/indicacao.pdf", arquivoDaDemanda("documento_pdf"));

/* ------------------------------ Servidor ------------------------------ */
const servidor = http.createServer(async (req, res) => {
  H.cabecalhosSeguranca(res);
  const caminho = new URL(req.url, "http://x").pathname;
  try {
    const restrito = caminho.startsWith("/api/painel") || caminho === "/painel" || caminho.startsWith("/painel/");
    let usuario = null;
    if (restrito && !(usuario = H.autenticar(req, res))) return;

    const rota = r.resolver(req.method, caminho);
    if (rota) return await rota.fn(req, res, rota.params, usuario);

    if (req.method === "GET" || req.method === "HEAD") {
      if (caminho === "/painel") { res.writeHead(301, { Location: "/painel/" }); return res.end(); }
      if (caminho.startsWith("/painel/") && H.servirEstatico(config.pastas.painel, req, res, "/painel")) return;
      if (!restrito && !caminho.startsWith("/api/") && H.servirEstatico(config.pastas.publico, req, res)) return;
    }
    throw new H.ErroHttp(404, "Não encontrado.");
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(`[erro] ${req.method} ${caminho}`, err);
    if (!res.headersSent) H.json(res, status, { erro: status >= 500 ? "Erro interno. Tente novamente em instantes." : err.message, campos: err.campos });
    else res.end();
  }
});

if (require.main === module) {
  servidor.listen(config.porta, () => {
    console.log(`Portal de Demandas no ar em ${config.urlPublica} (porta ${config.porta})`);
    console.log(`WhatsApp: ${config.whatsapp.provedor} · E-mail: ${config.email.provedor} · Webhook gabinete: ${config.gabinete.webhookUrl ? "ativo" : "desligado"}`);
    console.log(`Indicação: redação ${ia.ativa() ? `por IA (${config.ia.modelo})` : "padrão"} · mapa ${config.mapa.ativo ? "ligado" : "desligado"}`);
    if (!config.painel.senha) console.warn("ATENÇÃO: defina PAINEL_SENHA no .env para liberar o painel.");
  });
  fila.iniciar();
  fila.processar().catch(console.error);
  const encerrar = () => servidor.close(() => { db.close(); process.exit(0); });
  process.on("SIGTERM", encerrar); process.on("SIGINT", encerrar);
}

module.exports = { servidor };

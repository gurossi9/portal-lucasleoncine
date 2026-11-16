"use strict";
/**
 * Fila de automações com reenvio automático. Nada se perde se o WhatsApp,
 * o e-mail ou o sistema do gabinete estiverem fora do ar: a tarefa é tentada
 * de novo em 1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 24 h (8 tentativas).
 */
const fs = require("node:fs");
const path = require("node:path");
const config = require("./config");
const { db } = require("./db");
const { buscarPorId } = require("./demandas");
const { gerarIndicacao } = require("./documentos/indicacao");
const { enviarAoGabinete } = require("./integracoes/gabinete");
const { enviarWhatsapp } = require("./notificacoes/whatsapp");
const { enviarEmail } = require("./notificacoes/email");
const msgs = require("./notificacoes/mensagens");
const { CATEGORIAS } = require("./catalogo");

const ESPERAS_MIN = [1, 5, 30, 120, 360, 720, 1440];
const MAX_TENTATIVAS = ESPERAS_MIN.length + 1;

const EXECUTORES = {
  async documento(d) { return gerarIndicacao(d); },

  async gabinete(d, p) { return enviarAoGabinete(d, p.evento || "demanda_criada"); },

  async whatsapp(d, p) {
    const m = p.modelo === "status" ? msgs.status(d, p.status) : msgs.confirmacao(d);
    return enviarWhatsapp(d.whatsapp, m, p.modelo);
  },

  async email(d, p) {
    if (!d.email) return { ignorado: "sem e-mail" };
    const m = p.modelo === "status" ? msgs.status(d, p.status) : msgs.confirmacao(d);
    return enviarEmail({ para: d.email, assunto: m.assunto, texto: m.texto.replace(/\*/g, ""), html: msgs.htmlEmail(m.texto) });
  },

  /** Aviso interno ao gabinete com a Indicação anexada (aguarda o documento ficar pronto). */
  async email_gabinete(d) {
    if (config.documento.gerarPdf && !d.documento_pdf) throw new Error("aguardando documento");
    const anexos = [];
    for (const rel of [d.documento_docx, d.documento_pdf].filter(Boolean))
      anexos.push({ nome: path.basename(rel), conteudo: fs.readFileSync(path.join(config.pastas.dados, rel)) });
    const texto = `Nova demanda *${d.protocolo}*\n\n*Categoria:* ${CATEGORIAS[d.categoria]?.nome}\n*Bairro:* ${d.bairro}${d.bairro_fora_lista ? " (fora da lista — revisar)" : ""}\n*Local:* ${d.logradouro}\n*Munícipe:* ${d.nome} — ${d.whatsapp}\n\n${d.descricao}\n\nAbrir no painel: ${config.urlPublica}/painel/#${d.protocolo}`;
    return enviarEmail({ para: config.email.copiaGabinete, assunto: `[Portal] Nova demanda ${d.protocolo} — ${CATEGORIAS[d.categoria]?.nome} — ${d.bairro}`,
                         texto: texto.replace(/\*/g, ""), html: msgs.htmlEmail(texto), anexos });
  },
};

let rodando = false;

async function processar() {
  if (rodando) return; rodando = true;
  try {
    const pendentes = db.prepare(`SELECT * FROM tarefas WHERE status = 'pendente' AND proxima_em <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
                                  ORDER BY CASE tipo WHEN 'whatsapp' THEN 0 WHEN 'documento' THEN 1 ELSE 2 END, id LIMIT 20`).all();
    for (const t of pendentes) {
      const d = buscarPorId(t.demanda_id);
      if (!d) { db.prepare("UPDATE tarefas SET status='erro', ultimo_erro='demanda removida' WHERE id=?").run(t.id); continue; }
      try {
        const r = await EXECUTORES[t.tipo](d, t.payload ? JSON.parse(t.payload) : {});
        db.prepare("UPDATE tarefas SET status='ok', tentativas=tentativas+1, ultimo_erro=?, concluido_em=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
          .run(r?.ignorado ? `ignorado: ${r.ignorado}` : null, t.id);
      } catch (err) {
        const tent = t.tentativas + 1;
        const fim = tent >= MAX_TENTATIVAS;
        const espera = ESPERAS_MIN[Math.min(tent - 1, ESPERAS_MIN.length - 1)];
        db.prepare(`UPDATE tarefas SET tentativas=?, status=?, ultimo_erro=?, proxima_em=strftime('%Y-%m-%dT%H:%M:%fZ','now', ?) WHERE id=?`)
          .run(tent, fim ? "erro" : "pendente", String(err.message).slice(0, 500), `+${espera} minutes`, t.id);
        if (err.message !== "aguardando documento") console.error(`[fila] ${t.tipo} ${d.protocolo} tentativa ${tent}: ${err.message}`);
      }
    }
  } finally { rodando = false; }
}

/** Reagenda tarefas com erro (botão "tentar de novo" do painel). */
function reenviar(demandaId) {
  return db.prepare(`UPDATE tarefas SET status='pendente', tentativas=0, proxima_em=strftime('%Y-%m-%dT%H:%M:%fZ','now')
                     WHERE demanda_id = ? AND status = 'erro'`).run(demandaId).changes;
}

function iniciar(intervaloMs = 15000) {
  const timer = setInterval(() => processar().catch((e) => console.error("[fila]", e)), intervaloMs);
  timer.unref();
  return timer;
}

module.exports = { processar, iniciar, reenviar };

"use strict";
/**
 * Integração com o sistema de gestão do gabinete via Webhook.
 *
 * Envia um POST JSON para GABINETE_WEBHOOK_URL a cada evento:
 *   - demanda_criada     (nova demanda do portal)
 *   - status_atualizado  (mudança de status no painel)
 *
 * Autenticidade: HMAC-SHA256 do corpo bruto com GABINETE_WEBHOOK_SEGREDO, enviado
 *   - no cabeçalho  X-Assinatura: sha256=<hex>
 *   - e na URL      ?assinatura=<hex>  (para receptores que não leem cabeçalhos, como Google Apps Script)
 * O receptor deve recalcular o HMAC e comparar. Idempotência: use "protocolo" + "evento" + "versao".
 *
 * Receptor pronto para Google Planilhas: scripts/apps-script-gabinete.gs
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("../config");
const { CATEGORIAS, STATUS } = require("../catalogo");
const { db } = require("../db");

function montarPayload(d, evento) {
  const dados = {
    protocolo: d.protocolo,
    criado_em: d.criado_em,
    atualizado_em: d.atualizado_em,
    status: d.status,
    status_nome: STATUS[d.status]?.nome || d.status,
    numero_indicacao: d.numero_indicacao,
    municipe: { nome: d.nome, whatsapp: d.whatsapp, email: d.email },
    local: { bairro: d.bairro, bairro_fora_lista: !!d.bairro_fora_lista, logradouro: d.logradouro,
             latitude: d.latitude, longitude: d.longitude,
             mapa: d.latitude ? `https://www.google.com/maps?q=${d.latitude},${d.longitude}` : null },
    categoria: d.categoria,
    categoria_nome: CATEGORIAS[d.categoria]?.nome || d.categoria,
    descricao: d.descricao,
    links: {
      painel: `${config.urlPublica}/painel/#${d.protocolo}`,
      foto: d.foto_arquivo ? `${config.urlPublica}/api/painel/demandas/${d.id}/foto` : null,
      indicacao_docx: `${config.urlPublica}/api/painel/demandas/${d.id}/indicacao.docx`,
      indicacao_pdf: config.documento.gerarPdf ? `${config.urlPublica}/api/painel/demandas/${d.id}/indicacao.pdf` : null,
    },
  };
  if (config.gabinete.enviarFotoBase64 && d.foto_arquivo) {
    const abs = path.join(config.pastas.dados, d.foto_arquivo);
    if (fs.existsSync(abs) && fs.statSync(abs).size < 8 * 1024 * 1024)
      dados.foto_base64 = { nome: path.basename(abs), conteudo: fs.readFileSync(abs).toString("base64") };
  }
  return { evento, versao: 1, enviado_em: new Date().toISOString(), origem: "portal-demandas", dados };
}

const assinar = (corpo) => crypto.createHmac("sha256", config.gabinete.segredo || "").update(corpo).digest("hex");

async function enviarAoGabinete(d, evento = "demanda_criada") {
  if (!config.gabinete.webhookUrl) return { ignorado: "GABINETE_WEBHOOK_URL não configurada" };
  const corpo = JSON.stringify(montarPayload(d, evento));
  const assinatura = assinar(corpo);
  const url = new URL(config.gabinete.webhookUrl);
  url.searchParams.set("assinatura", assinatura);

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Assinatura": `sha256=${assinatura}`,
               "X-Evento": evento, "X-Protocolo": d.protocolo, "User-Agent": "PortalDemandas/1.0" },
    body: corpo,
    redirect: "follow",
    signal: AbortSignal.timeout(config.gabinete.timeoutMs),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`Gabinete respondeu HTTP ${r.status}: ${texto.slice(0, 200)}`);
  let resp = {}; try { resp = JSON.parse(texto); } catch { /* receptor pode responder texto */ }
  if (resp.ok === false) throw new Error(`Gabinete recusou: ${resp.erro || texto.slice(0, 200)}`);
  const idExterno = resp.id_externo || resp.id || null;
  if (idExterno) db.prepare("UPDATE demandas SET id_externo = ? WHERE id = ?").run(String(idExterno), d.id);
  return { ok: true, id_externo: idExterno };
}

module.exports = { enviarAoGabinete, montarPayload, assinar };

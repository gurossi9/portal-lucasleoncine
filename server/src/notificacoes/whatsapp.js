"use strict";
/**
 * Envio de WhatsApp com três provedores intercambiáveis (WHATSAPP_PROVEDOR):
 *
 *  meta      — API oficial WhatsApp Cloud (Meta). Mensagem iniciada pela empresa EXIGE template
 *              aprovado. Modelos sugeridos em docs/templates-whatsapp-meta.md.
 *  zapi      — Z-API (serviço brasileiro, conecta um número via QR Code).
 *  evolution — Evolution API (open source, auto-hospedada, conecta via QR Code).
 *  desligado — não envia; apenas registra no log (útil em testes).
 */
const config = require("../config");

async function chamar(url, opcoes) {
  const r = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(20000) });
  const texto = await r.text();
  if (!r.ok) throw new Error(`WhatsApp HTTP ${r.status}: ${texto.slice(0, 300)}`);
  try { return JSON.parse(texto); } catch { return { resposta: texto }; }
}

async function viaMeta(numero, msg, modelo) {
  const m = config.whatsapp.meta;
  if (!m.token || !m.phoneNumberId) throw new Error("META_WA_TOKEN/META_WA_PHONE_NUMBER_ID não configurados.");
  const nomeTemplate = modelo === "status" ? m.templateStatus : m.templateConfirmacao;
  const corpo = {
    messaging_product: "whatsapp", to: numero, type: "template",
    template: { name: nomeTemplate, language: { code: m.idioma },
      components: [{ type: "body", parameters: msg.parametrosMeta.map((t) => ({ type: "text", text: String(t).slice(0, 1000) })) }] },
  };
  const r = await chamar(`https://graph.facebook.com/${m.versao}/${m.phoneNumberId}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${m.token}`, "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  return { id: r.messages?.[0]?.id };
}

async function viaZapi(numero, msg) {
  const z = config.whatsapp.zapi;
  if (!z.instancia || !z.token) throw new Error("ZAPI_INSTANCIA/ZAPI_TOKEN não configurados.");
  const headers = { "Content-Type": "application/json" };
  if (z.clientToken) headers["Client-Token"] = z.clientToken;
  const r = await chamar(`https://api.z-api.io/instances/${z.instancia}/token/${z.token}/send-text`, {
    method: "POST", headers, body: JSON.stringify({ phone: numero, message: msg.texto }),
  });
  return { id: r.messageId || r.zaapId };
}

async function viaEvolution(numero, msg) {
  const ev = config.whatsapp.evolution;
  if (!ev.url || !ev.instancia || !ev.apiKey) throw new Error("EVOLUTION_URL/EVOLUTION_INSTANCIA/EVOLUTION_API_KEY não configurados.");
  const r = await chamar(`${ev.url}/message/sendText/${encodeURIComponent(ev.instancia)}`, {
    method: "POST", headers: { apikey: ev.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ number: numero, text: msg.texto }),
  });
  return { id: r.key?.id };
}

/** Envia a mensagem. `modelo` = "confirmacao" | "status" (usado pelo provedor Meta). */
async function enviarWhatsapp(numero, msg, modelo = "confirmacao") {
  switch (config.whatsapp.provedor) {
    case "meta": return viaMeta(numero, msg, modelo);
    case "zapi": return viaZapi(numero, msg);
    case "evolution": return viaEvolution(numero, msg);
    default:
      console.log(`[whatsapp:desligado] para ${numero.slice(0, 6)}*****:\n${msg.texto}\n`);
      return { ignorado: "WHATSAPP_PROVEDOR=desligado" };
  }
}

const whatsappAtivo = () => ["meta", "zapi", "evolution"].includes(config.whatsapp.provedor);

module.exports = { enviarWhatsapp, whatsappAtivo };

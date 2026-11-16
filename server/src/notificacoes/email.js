"use strict";
/**
 * Envio de e-mail (EMAIL_PROVEDOR):
 *  brevo   — API HTTP da Brevo (plano gratuito com 300 e-mails/dia).
 *  resend  — API HTTP da Resend.
 *  smtp    — qualquer servidor SMTP (ex.: e-mail institucional). Requer "npm install nodemailer".
 *  desligado — apenas registra no log.
 */
const config = require("../config");

async function http(url, headers, corpo) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(20000) });
  const t = await r.text();
  if (!r.ok) throw new Error(`E-mail HTTP ${r.status}: ${t.slice(0, 300)}`);
  try { return JSON.parse(t); } catch { return {}; }
}

async function enviarEmail({ para, assunto, html, texto, anexos = [] }) {
  const c = config.email;
  switch (c.provedor) {
    case "brevo": {
      const r = await http("https://api.brevo.com/v3/smtp/email", { "api-key": c.apiKey }, {
        sender: { email: c.remetente, name: c.remetenteNome }, to: [{ email: para }], subject: assunto, htmlContent: html, textContent: texto,
        ...(anexos.length ? { attachment: anexos.map((a) => ({ name: a.nome, content: a.conteudo.toString("base64") })) } : {}),
      });
      return { id: r.messageId };
    }
    case "resend": {
      const r = await http("https://api.resend.com/emails", { Authorization: `Bearer ${c.apiKey}` }, {
        from: `${c.remetenteNome} <${c.remetente}>`, to: [para], subject: assunto, html, text: texto,
        ...(anexos.length ? { attachments: anexos.map((a) => ({ filename: a.nome, content: a.conteudo.toString("base64") })) } : {}),
      });
      return { id: r.id };
    }
    case "smtp": {
      let nodemailer;
      try { nodemailer = require("nodemailer"); } catch { throw new Error('Para SMTP instale o pacote: npm install nodemailer'); }
      const t = nodemailer.createTransport({ host: c.smtp.host, port: c.smtp.porta, secure: c.smtp.porta === 465, auth: { user: c.smtp.usuario, pass: c.smtp.senha } });
      const r = await t.sendMail({ from: `"${c.remetenteNome}" <${c.remetente}>`, to: para, subject: assunto, html, text: texto,
        attachments: anexos.map((a) => ({ filename: a.nome, content: a.conteudo })) });
      return { id: r.messageId };
    }
    default:
      console.log(`[email:desligado] para ${para} — ${assunto}`);
      return { ignorado: "EMAIL_PROVEDOR=desligado" };
  }
}

module.exports = { enviarEmail };

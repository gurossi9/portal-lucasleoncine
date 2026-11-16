"use strict";
/** Textos das mensagens ao munícipe. Edite aqui o tom e o conteúdo. */
const config = require("../config");
const { CATEGORIAS, STATUS } = require("../catalogo");

const primeiroNome = (n) => String(n || "").split(" ")[0];
const assinatura = () => `Gabinete do ${config.vereador.cargo} ${config.vereador.nome}`;

function confirmacao(d) {
  const cat = CATEGORIAS[d.categoria]?.nome || d.categoria;
  return {
    texto:
`Olá, ${primeiroNome(d.nome)}! 👋
Aqui é do ${assinatura()}.

Recebemos sua demanda de *${cat}* no bairro *${d.bairro}*.

📄 Protocolo: *${d.protocolo}*

Nossa equipe vai analisar e transformar seu pedido em uma Indicação oficial na Câmara. Você receberá as atualizações por aqui.

Guarde este número para acompanhar: ${config.urlPublica}/acompanhar.html?p=${d.protocolo}`,
    // variáveis do template aprovado na Meta (ordem importa): {{1}} nome, {{2}} categoria, {{3}} bairro, {{4}} protocolo
    parametrosMeta: [primeiroNome(d.nome), cat, d.bairro, d.protocolo],
    assunto: `Recebemos sua demanda — protocolo ${d.protocolo}`,
  };
}

function status(d, codigoStatus) {
  const s = STATUS[codigoStatus] || { nome: codigoStatus, aviso: "" };
  const extra = codigoStatus === "protocolada" && d.numero_indicacao ? `\n📌 Indicação nº *${d.numero_indicacao}*` : "";
  return {
    texto:
`Olá, ${primeiroNome(d.nome)}! Atualização da sua demanda 📄 *${d.protocolo}*

Situação: *${s.nome}*${extra}
${s.aviso}

${assinatura()}`,
    // {{1}} nome, {{2}} protocolo, {{3}} situação, {{4}} aviso
    parametrosMeta: [primeiroNome(d.nome), d.protocolo, s.nome, (s.aviso || "") + (extra ? ` Indicação nº ${d.numero_indicacao}.` : "")],
    assunto: `Atualização da sua demanda ${d.protocolo}: ${s.nome}`,
  };
}

/** Versão HTML simples (e-mail) a partir do texto do WhatsApp. */
function htmlEmail(texto) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const corpo = esc(texto).replace(/\*(.+?)\*/g, "<strong>$1</strong>").replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="margin:0;background:#F3F6FB;font-family:Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0B1F3A;color:#fff;padding:20px 24px;font-size:18px;font-weight:bold">${esc(assinatura())}</td></tr>
<tr><td style="padding:24px;color:#0F172A;font-size:15px;line-height:1.6">${corpo}</td></tr>
<tr><td style="padding:14px 24px;background:#F8FAFD;color:#64748B;font-size:12px">Você recebeu este e-mail porque registrou uma demanda no Portal do gabinete. Seus dados são tratados conforme a LGPD.</td></tr>
</table></td></tr></table></body></html>`;
}

module.exports = { confirmacao, status, htmlEmail, primeiroNome };

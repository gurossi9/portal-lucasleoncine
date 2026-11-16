"use strict";
/**
 * Redação da Indicação por IA (opcional; IA_PROVEDOR=anthropic no .env).
 *
 * Usa o prompt do gabinete em templates/prompt-indicacao.md, com os dados da demanda
 * nos campos {{...}} e a foto do local anexada. Do retorno, aproveita:
 *   BLOCO 1 → assunto, setor/secretaria e leitura da foto (triagem no painel);
 *   BLOCO 2 → ementa ("Indica …") e parágrafo "Moradores entraram em contato …".
 * Cabeçalho, saudação, fecho, data e assinatura vêm sempre do modelo .docx, iguais
 * em todas as Indicações.
 *
 * Privacidade: nome, WhatsApp e e-mail do munícipe NÃO são enviados. Se o texto
 * devolvido trouxer algum desses dados, ou fugir do padrão, é descartado e o
 * documento sai com o texto padrão (nada trava a geração).
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const config = require("../config");
const { CATEGORIAS } = require("../catalogo");

const exec = promisify(execFile);

function ativa() {
  return config.ia.provedor === "anthropic" && !!config.ia.chave;
}

function dataBR(iso) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Número/cruzamento/referência que o munícipe escreveu depois do nome da rua. */
function referencia(logradouro) {
  const m = String(logradouro || "").match(/,\s*(.+)$/);
  return m ? m[1].trim() : "não informado";
}

function montarPrompt(d, temFoto) {
  const modelo = fs.readFileSync(config.ia.prompt, "utf8");
  const valores = {
    protocolo_id: d.protocolo,
    data_envio: dataBR(d.criado_em),
    categoria: CATEGORIAS[d.categoria]?.nome || d.categoria,
    endereco: d.logradouro,
    numero_referencia: referencia(d.logradouro),
    bairro: d.bairro_fora_lista ? `${d.bairro} (digitado pelo munícipe, fora da lista oficial)` : d.bairro,
    descricao_problema: d.descricao,
    imagens_anexadas: temFoto ? "1 foto do local, anexada a esta mensagem" : "nenhuma imagem enviada",
  };
  return modelo.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (t, k) => (k in valores ? valores[k] : t));
}

/** Foto reduzida para 1568 px em JPEG (limite de tamanho da API e menos custo). */
async function fotoBase64(d) {
  if (!d.foto_arquivo) return null;
  const origem = path.join(config.pastas.dados, d.foto_arquivo);
  if (!fs.existsSync(origem)) return null;
  const destino = path.join(os.tmpdir(), `ia-${d.protocolo}-${process.pid}.jpg`);
  const py = "import sys\nfrom PIL import Image, ImageOps\nim=ImageOps.exif_transpose(Image.open(sys.argv[1])).convert('RGB')\nim.thumbnail((1568,1568))\nim.save(sys.argv[2],'JPEG',quality=85)";
  try {
    await exec(config.documento.python, ["-c", py, origem, destino], { timeout: 30000 });
    return fs.readFileSync(destino).toString("base64");
  } catch { return null; } // HEIC sem suporte etc.: segue só com o texto
  finally { fs.rmSync(destino, { force: true }); }
}

const limparLinha = (s) => String(s || "").replace(/\*\*/g, "").replace(/^[-•\s]+/, "").trim();

function campo(bloco, rotulo) {
  const linha = bloco.split("\n").find((l) => new RegExp(rotulo, "i").test(l));
  if (!linha) return null;
  const sem = limparLinha(linha);
  const i = sem.indexOf(":");
  return i >= 0 ? sem.slice(i + 1).trim() || null : null;
}

/** Extrai e confere o retorno. Lança erro se fugir do padrão do gabinete. */
function interpretar(texto, d) {
  const i1 = texto.search(/BLOCO 1/i), i2 = texto.search(/BLOCO 2/i);
  if (i2 < 0) throw new Error("resposta sem o BLOCO 2");
  const bloco1 = i1 >= 0 ? texto.slice(i1, i2) : "";
  const bloco2 = texto.slice(i2).split("\n").slice(1).join("\n");
  const linhas = bloco2.split("\n").map(limparLinha).filter(Boolean);
  const ementa = linhas.find((l) => /^Indica\s/.test(l));
  const corpo = linhas.find((l) => /^Moradores entraram em contato/i.test(l));
  if (!ementa) throw new Error("ementa não começa com \"Indica\"");
  if (!corpo || !/Indicam-se, portanto, provid[eê]ncias/i.test(corpo)) throw new Error("parágrafo \"Moradores entraram em contato…\" fora do padrão");
  if (ementa.length > 600 || corpo.length > 2000) throw new Error("texto longo demais");

  // trava de privacidade: nada de nome, telefone ou e-mail do munícipe
  const tudo = `${ementa}\n${corpo}`;
  const nomes = String(d.nome || "").split(/\s+/).filter((p) => p.length >= 4);
  const tel = String(d.whatsapp || "").slice(-8);
  if ((tel && tudo.replace(/\D/g, "").includes(tel)) || (d.email && tudo.includes(d.email))
      || nomes.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(tudo) && !d.logradouro.includes(n) && !d.bairro.includes(n)))
    throw new Error("texto citou dados pessoais do munícipe");

  return {
    ementa: ementa.replace(/\s+/g, " "),
    corpo: corpo.replace(/\s+/g, " "),
    assunto: campo(bloco1, "Assunto"),
    secretaria: campo(bloco1, "Setor|Secretaria"),
    leitura_imagens: campo(bloco1, "Leitura das Imagens"),
  };
}

/** Pede a redação. Nunca lança: devolve { ok:false, erro } para o documento seguir com o texto padrão. */
async function redigir(d) {
  const em = new Date().toISOString();
  try {
    const foto = await fotoBase64(d);
    const conteudo = [];
    if (foto) conteudo.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: foto } });
    conteudo.push({ type: "text", text: montarPrompt(d, !!foto) });
    const r = await fetch(config.ia.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": config.ia.chave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: config.ia.modelo, max_tokens: 1500, messages: [{ role: "user", content: conteudo }] }),
      signal: AbortSignal.timeout(config.ia.timeoutMs),
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`API ${r.status}: ${corpo?.error?.message || ""}`.slice(0, 300));
    const texto = (corpo.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    return { ok: true, ...interpretar(texto, d), modelo: corpo.model || config.ia.modelo, com_foto: !!foto, em };
  } catch (e) {
    return { ok: false, erro: String(e.message || e).slice(0, 300), em };
  }
}

module.exports = { ativa, redigir, interpretar, montarPrompt };

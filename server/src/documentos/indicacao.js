"use strict";
/**
 * Documento oficial de Indicação no padrão do gabinete (DOCX via python-docx + PDF via LibreOffice).
 *
 * Texto padrão (igual às Indicações protocoladas pelo gabinete em 2026):
 *   Autor: LUCAS LEONCINE
 *   Indica <serviço> na Rua X, próximo ao número N, no bairro B.
 *   Senhor Presidente, / Senhores Vereadores,
 *   Moradores entraram em contato com este gabinete para relatar sobre a necessidade de <mesmo objeto>.
 *   Indicam-se, portanto, providências: seja a execução do serviço, notificação ou outra medida cabível.
 *   [mapa + foto]
 *   Assim, sendo procedente o pedido, … É a Indicação.
 *   Plenário Dr. Antônio A. Lobo, em DD de mês de AAAA.   (data do envio da demanda)
 *
 * De onde vem o texto, em ordem de prioridade:
 *   1. ajustes feitos à mão no painel (coluna texto_indicacao: ementa, corpo);
 *   2. redação por IA, se IA_PROVEDOR estiver ligado (coluna indicacao_ia; ver redacao-ia.js);
 *   3. texto montado aqui a partir da categoria, do relato e do endereço.
 * Nunca entram nome, telefone ou e-mail do munícipe.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const config = require("../config");
const { CATEGORIAS, classificarServico } = require("../catalogo");
const { db } = require("../db");
const ia = require("./redacao-ia");

const exec = promisify(execFile);
const TZ = "America/Sao_Paulo";
const AVISO_LOCAL = "[COMPLETAR LOCALIZAÇÃO EXATA]";
const COMPLEMENTO = "Indicam-se, portanto, providências: seja a execução do serviço, notificação ou outra medida cabível.";

/** "05 de janeiro de 2026" (dia com dois dígitos, como nos documentos do gabinete). */
function dataExtenso(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: TZ })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day} de ${p.month} de ${p.year}`;
}

function aammdd(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en", { year: "2-digit", month: "2-digit", day: "2-digit", timeZone: TZ })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}`;
}

/* ------------------------------ Endereço ------------------------------ */
const TIPOS = [
  [/^(rua|r\.?)$/i, "Rua"], [/^(avenida|av\.?)$/i, "Avenida"], [/^(alameda|al\.?)$/i, "Alameda"],
  [/^(travessa|trav\.?|tv\.?)$/i, "Travessa"], [/^(estrada|estr\.?)$/i, "Estrada"], [/^(rodovia|rod\.?)$/i, "Rodovia"],
  [/^(pra[çc]a|p[çc]a\.?)$/i, "Praça"], [/^viela$/i, "Viela"], [/^largo$/i, "Largo"],
];
const MASCULINOS = new Set(["Largo"]);
const VIA = /(?:^|[\s,(])(rua|r\.|avenida|av\.|av|alameda|al\.|travessa|trav\.|tv\.|estrada|estr\.|rodovia|rod\.|pra[çc]a|p[çc]a\.?|viela|largo)\s+(.+?)(?=\s*(?:[,;()]|\.\s|\s-\s|$)|\s+(?:n[º°o]\.?\s*\d|n[uú]mero|pr[oó]ximo|perto|em frente|ao lado|esquina|altura|entre|com\s+(?:a|o)\s|e\s+(?:a\s+|o\s+)?(?:rua|r\.|av|avenida|alameda|travessa|estrada|pra[çc]a)\b))/gi;
const MINUSCULAS = new Set(["de", "da", "das", "do", "dos", "e"]);

function tituloSeMinusculo(nome) {
  if (nome !== nome.toLowerCase()) return nome; // o munícipe já escreveu com maiúsculas
  return nome.split(" ").map((p) => (MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");
}

function acharVias(texto) {
  const vias = [];
  for (const m of texto.matchAll(VIA)) {
    const tipo = (TIPOS.find(([re]) => re.test(m[1])) || [, "Rua"])[1];
    const nome = tituloSeMinusculo(m[2].trim().replace(/[.\s]+$/, ""));
    if (nome.length < 2) continue;
    vias.push({ tipo, nome, completo: `${tipo} ${nome}`, fim: m.index + m[0].length, masc: MASCULINOS.has(tipo) });
  }
  return vias;
}

function acharNumero(texto, depoisDe = 0) {
  const resto = texto.slice(depoisDe);
  const m = resto.match(/^\s*,?\s*(?:n[º°o]\.?\s*|n[uú]mero\s*)?(\d{1,2}(?:\.\d{3})|\d{1,5})\b/i)
    || texto.match(/(?:n[º°o]\.?|n[uú]mero)\s*(\d{1,2}(?:\.\d{3})|\d{1,5})\b/i);
  return m ? m[1].replace(".", "") : null;
}

/**
 * Converte o que o munícipe digitou no trecho de localização da Indicação.
 * Ex.: "Rua Pernambuco, 540" → "na Rua Pernambuco, próximo ao número 540"
 *      "esquina da Rua Paraná com a Rua Rio Grande" → "em cruzamento da Rua Paraná com a Rua Rio Grande"
 *      "entre a Rua Paulo Setúbal e Rua Alberto de Oliveira" → "entre a Rua Paulo Setúbal e a Rua Alberto de Oliveira"
 * Sem número nem cruzamento, acrescenta [COMPLETAR LOCALIZAÇÃO EXATA] para a assessoria conferir.
 */
function localizacao(logradouro) {
  const texto = String(logradouro || "").replace(/\s+/g, " ").trim();
  const vias = acharVias(texto);
  const na = (v) => `${v.masc ? "no" : "na"} ${v.completo}`;
  const a = (v) => `${v.masc ? "o" : "a"} ${v.completo}`;
  const da = (v) => `${v.masc ? "do" : "da"} ${v.completo}`;
  if (vias.length >= 2 && vias[0].completo !== vias[1].completo) {
    if (/\bentre\b/i.test(texto)) return { texto: `entre ${a(vias[0])} e ${a(vias[1])}`, completo: true };
    return { texto: `em cruzamento ${da(vias[0])} com ${a(vias[1])}`, completo: true };
  }
  if (vias.length) {
    const n = acharNumero(texto, vias[0].fim);
    if (n) return { texto: `${na(vias[0])}, próximo ao número ${n}`, completo: true };
    return { texto: `${na(vias[0])} ${AVISO_LOCAL}`, completo: false };
  }
  return { texto: `no local informado: “${texto.replace(/[.\s]+$/, "")}” ${AVISO_LOCAL}`, completo: false };
}

function noBairro(bairro) {
  const b = String(bairro || "").trim();
  if (!b) return `no bairro ${AVISO_LOCAL}`;
  if (/^(bairro|centro)\b/i.test(b)) return `no ${b}`;
  return `no bairro ${b}`;
}

/* ------------------------------ Texto ------------------------------ */
function juntarLocal(servico, local) {
  return `${servico}${local.startsWith("entre ") ? ", " : " "}${local}`;
}

/** Texto montado a partir da categoria, do relato e do endereço (sem IA). */
function textoPadrao(d) {
  const { servico, secretaria } = classificarServico(d.categoria, d.descricao);
  const local = localizacao(d.logradouro);
  const objeto = `${juntarLocal(servico, local.texto)}, ${noBairro(d.bairro)}`;
  const ementa = `Indica ${objeto}.`;
  const corpo = `Moradores entraram em contato com este gabinete para relatar sobre a necessidade de ${objeto}. ${COMPLEMENTO}`;
  return { ementa, corpo, secretaria, leitura_imagens: null, origem: "padrao", localizacao_completa: local.completo };
}

/** Texto final: ajustes do painel > redação por IA > texto padrão. */
function textoFinal(d) {
  const base = textoPadrao(d);
  let t = { ...base };
  const doIa = d.indicacao_ia ? JSON.parse(d.indicacao_ia) : null;
  if (doIa?.ok) t = { ...t, ementa: doIa.ementa, corpo: doIa.corpo, secretaria: doIa.secretaria || t.secretaria,
                      leitura_imagens: doIa.leitura_imagens || null, origem: "ia", modelo_ia: doIa.modelo };
  const ajustes = d.texto_indicacao ? JSON.parse(d.texto_indicacao) : {};
  if (ajustes.ementa) t.ementa = ajustes.ementa;
  if (ajustes.corpo) t.corpo = ajustes.corpo;
  if (ajustes.ementa || ajustes.corpo) t.origem = "manual";
  t.assunto = assunto(t.ementa);
  t.nome_arquivo = nomeArquivo(t.assunto, new Date(d.criado_em));
  t.ia_erro = doIa && !doIa.ok ? doIa.erro : null;
  return t;
}

/** "Indica reparo asfáltico na Rua Pernambuco, próximo ao número 540, no bairro Chácara Machadinho" */
function assunto(ementa) {
  return String(ementa || "").replace(/\s*\[[^\]]*\]\s*/g, " ").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
}

/** 260105_Indica_reparo_asfaltico_na_Rua_Pernambuco_proximo_ao_numero_540_no_bairro_Chacara_Machadinho.docx */
function nomeArquivo(assuntoTxt, data) {
  const base = assuntoTxt.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const curto = base.length > 180 ? base.slice(0, 180).replace(/_[^_]*$/, "") : base;
  return `${aammdd(data)}_${curto || "Indicacao"}`;
}

/** Dados enviados ao preenchimento do modelo .docx. */
function dadosDocumento(d, t = textoFinal(d)) {
  const ano = d.numero_indicacao?.match(/(\d{4})$/)?.[1] || new Intl.DateTimeFormat("en", { year: "numeric", timeZone: TZ }).format(new Date(d.criado_em));
  const numero = d.numero_indicacao ? d.numero_indicacao.replace(/\/\d{4}$/, "") : "______";
  const v = config.vereador;
  return {
    autor: v.nome.toUpperCase(), ementa: t.ementa, corpo: t.corpo, assunto: t.assunto, secretaria: t.secretaria,
    data_extenso: dataExtenso(new Date(d.criado_em)), numero, ano,
    bairro: d.bairro, logradouro: d.logradouro, categoria: CATEGORIAS[d.categoria]?.nome || d.categoria,
    cidade: v.cidade, uf: v.uf, vereador: v.nome, vereador_maiusculo: v.nome.toUpperCase(),
    cargo: v.cargo, cargo_maiusculo: v.cargo.toUpperCase(), camara: v.camara, camara_maiusculo: v.camara.toUpperCase(),
    protocolo: d.protocolo,
  };
}

/* ------------------------------ Imagens ------------------------------ */
/** Gera (uma vez) o mapa de localização. Falha sem internet não impede o documento. */
async function garantirMapa(d, pasta) {
  if (!config.mapa.ativo) return null;
  const arq = path.join(pasta, `mapa_${d.protocolo}.png`);
  if (fs.existsSync(arq)) return arq;
  const args = [path.join(config.pastas.scripts, "mapa_local.py"), arq];
  if (d.latitude != null && d.longitude != null) args.push("--lat", String(d.latitude), "--lon", String(d.longitude));
  else args.push("--endereco", `${d.logradouro}, ${d.bairro}`);
  try {
    await exec(config.documento.python, args, { timeout: 60000, env: { ...process.env, MAPA_TILES_URL: config.mapa.tiles,
      MAPA_GEOCODER_URL: config.mapa.geocoder, MAPA_CONTATO: config.mapa.contato } });
    return fs.existsSync(arq) ? arq : null;
  } catch (e) {
    console.warn(`[indicação] ${d.protocolo}: mapa não gerado (${(e.stdout || e.message || "").toString().trim().slice(0, 200)})`);
    return null;
  }
}

let filaPdf = Promise.resolve(); // LibreOffice não gosta de conversões simultâneas

async function converterPdf(docx) {
  const perfil = path.join(os.tmpdir(), "lo-portal-demandas");
  const tarefa = filaPdf.then(() => exec(config.documento.soffice, [
    `-env:UserInstallation=file://${perfil}`, "--headless", "--norestore", "--convert-to", "pdf", "--outdir", path.dirname(docx), docx,
  ], { timeout: 120000 }));
  filaPdf = tarefa.catch(() => {});
  await tarefa;
  const pdf = docx.replace(/\.docx$/, ".pdf");
  if (!fs.existsSync(pdf)) throw new Error("LibreOffice não gerou o PDF.");
  return pdf;
}

/** Gera (ou regenera) DOCX e PDF da Indicação e grava os caminhos na demanda. */
async function gerarIndicacao(d) {
  if (!fs.existsSync(config.documento.modelo)) throw new Error(`Modelo não encontrado: ${config.documento.modelo}. Rode "npm run modelo".`);

  // redação por IA: tenta uma vez por demanda (o resultado, ou o erro, fica guardado)
  if (ia.ativa() && !d.indicacao_ia) {
    const r = await ia.redigir(d, textoPadrao(d));
    db.prepare("UPDATE demandas SET indicacao_ia = ? WHERE id = ?").run(JSON.stringify(r), d.id);
    d = { ...d, indicacao_ia: JSON.stringify(r) };
    if (!r.ok) console.warn(`[indicação] ${d.protocolo}: IA indisponível, usando texto padrão (${r.erro})`);
  }

  const t = textoFinal(d);
  // uma pasta por protocolo: duas demandas no mesmo local e dia geram o mesmo nome de arquivo
  const pastaRel = path.join("documentos", d.protocolo.split("-")[1], d.protocolo);
  const pasta = path.join(config.pastas.dados, pastaRel);
  fs.mkdirSync(pasta, { recursive: true });
  const nome = `${t.nome_arquivo}.docx`;
  const docx = path.join(pasta, nome);

  const imagens = [];
  const mapa = await garantirMapa(d, pasta);
  if (mapa) imagens.push({ caminho: mapa });
  if (d.foto_arquivo) imagens.push({ caminho: path.join(config.pastas.dados, d.foto_arquivo) });

  const json = path.join(os.tmpdir(), `ind-${d.protocolo}-${process.pid}.json`);
  fs.writeFileSync(json, JSON.stringify({ ...dadosDocumento(d, t), imagens }));
  try {
    const { stdout } = await exec(config.documento.python, [path.join(config.pastas.scripts, "preencher_indicacao.py"), config.documento.modelo, docx, json], { timeout: 90000 });
    const info = JSON.parse(stdout.trim().split("\n").pop());
    if (info.sem_valor?.length) console.warn(`[indicação] marcadores sem valor no modelo: ${info.sem_valor.join(", ")}`);
  } finally { fs.rmSync(json, { force: true }); }

  let pdfRel = null;
  if (config.documento.gerarPdf) pdfRel = path.relative(config.pastas.dados, await converterPdf(docx));

  // se a ementa mudou, o nome do arquivo também muda: apaga a versão anterior
  for (const antigo of [d.documento_docx, d.documento_pdf]) {
    if (antigo && ![path.join(pastaRel, nome), pdfRel].includes(antigo)) fs.rmSync(path.join(config.pastas.dados, antigo), { force: true });
  }
  db.prepare("UPDATE demandas SET documento_docx = ?, documento_pdf = ? WHERE id = ?").run(path.join(pastaRel, nome), pdfRel, d.id);
  return { docx: path.join(pastaRel, nome), pdf: pdfRel, origem: t.origem };
}

module.exports = { gerarIndicacao, textoPadrao, textoFinal, dadosDocumento, dataExtenso, localizacao, nomeArquivo, assunto };

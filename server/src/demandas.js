"use strict";
/** Regras de negócio: validação, protocolo, gravação e consultas de demandas. */
const fs = require("node:fs");
const path = require("node:path");
const config = require("./config");
const { db, transacao } = require("./db");
const { CATEGORIAS, STATUS } = require("./catalogo");
const { ErroHttp } = require("./http");

const DDDS = new Set("11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split(" "));

const limpar = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);

/** Normaliza WhatsApp para 55 + DDD + 9 dígitos. Retorna null se inválido. */
function normalizarWhatsapp(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 11) d = "55" + d;
  if (!/^55\d{11}$/.test(d)) return null;
  if (!DDDS.has(d.slice(2, 4)) || d[4] !== "9" || /^(\d)\1+$/.test(d.slice(5))) return null;
  return d;
}

/** Identifica o tipo real da imagem pelos primeiros bytes. */
function tipoImagem(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ".jpg";
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return ".webp";
  if (buf.slice(4, 8).toString() === "ftyp" && /hei|mif|avif/.test(buf.slice(8, 12).toString())) return ".heic";
  return null;
}

/** Valida os campos do formulário (espelha as regras do front-end). */
function validar(fd) {
  const erros = {};
  const d = {
    nome: limpar(fd.get("nome"), 120).replace(/\s+/g, " "),
    whatsapp: normalizarWhatsapp(fd.get("whatsapp")),
    email: limpar(fd.get("email"), 120).toLowerCase(),
    bairro: limpar(fd.get("bairro"), 80).replace(/\s+/g, " "),
    bairro_fora_lista: fd.get("bairro_fora_lista") === "1" ? 1 : 0,
    logradouro: limpar(fd.get("logradouro"), 200),
    categoria: limpar(fd.get("categoria"), 40),
    descricao: limpar(fd.get("descricao"), 1500),
    latitude: parseFloat(fd.get("latitude")),
    longitude: parseFloat(fd.get("longitude")),
  };
  if (d.nome.split(" ").length < 2 || d.nome.length < 5 || /\d/.test(d.nome)) erros.nome = "Informe nome e sobrenome.";
  if (!d.whatsapp) erros.whatsapp = "WhatsApp inválido.";
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) erros.email = "E-mail inválido.";
  if (d.bairro.length < 3) erros.bairro = "Informe o bairro.";
  if (d.logradouro.length < 5) erros.logradouro = "Informe a rua ou referência.";
  if (!CATEGORIAS[d.categoria]) erros.categoria = "Categoria inválida.";
  if (d.descricao.length < 20) erros.descricao = "Descreva o problema com pelo menos 20 caracteres.";
  if (fd.get("consentimento_lgpd") !== "1") erros.lgpd = "É necessário o consentimento LGPD.";
  // coordenadas só se estiverem perto de Americana/região (evita lixo)
  const coordOk = Number.isFinite(d.latitude) && Number.isFinite(d.longitude) && Math.abs(d.latitude + 22.74) < 1 && Math.abs(d.longitude + 47.33) < 1;
  if (!coordOk) { d.latitude = null; d.longitude = null; }
  if (!d.email) d.email = null;
  if (Object.keys(erros).length) {
    const e = new ErroHttp(422, Object.values(erros)[0]); e.campos = erros; throw e;
  }
  return d;
}

/** Lê e valida a foto ANTES de gerar protocolo (foto inválida não consome número). */
async function lerFoto(arquivo) {
  if (!arquivo || typeof arquivo === "string" || !arquivo.size) return null;
  if (arquivo.size > config.seguranca.fotoMaxMB * 1024 * 1024) throw new ErroHttp(413, `A foto deve ter até ${config.seguranca.fotoMaxMB} MB.`);
  const buf = Buffer.from(await arquivo.arrayBuffer());
  const ext = tipoImagem(buf);
  if (!ext) throw new ErroHttp(415, "A foto precisa ser JPG, PNG, WEBP ou HEIC.");
  return { buf, ext };
}

function salvarFoto(foto, protocolo) {
  if (!foto) return null;
  const { buf, ext } = foto;
  const rel = path.join("uploads", protocolo.split("-")[1], protocolo + ext);
  const abs = path.join(config.pastas.dados, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf, { mode: 0o640 });
  return rel;
}

/** Gera o próximo protocolo do ano: LL-2026-000001 (atômico). */
function proximoProtocolo() {
  const ano = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date()));
  const { ultimo } = db.prepare(
    "INSERT INTO protocolo_seq(ano, ultimo) VALUES (?, 1) ON CONFLICT(ano) DO UPDATE SET ultimo = ultimo + 1 RETURNING ultimo"
  ).get(ano);
  return `${config.vereador.prefixoProtocolo}-${ano}-${String(ultimo).padStart(6, "0")}`;
}

/** Cria a demanda, grava a foto e enfileira as automações. */
async function criarDemanda(fd, ipHash) {
  const d = validar(fd);
  // anti-duplicidade: mesmo WhatsApp + categoria + logradouro em 10 minutos
  const dup = db.prepare(`SELECT protocolo FROM demandas WHERE whatsapp = ? AND categoria = ? AND logradouro = ?
                          AND criado_em > strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 minutes')`).get(d.whatsapp, d.categoria, d.logradouro);
  if (dup) return { protocolo: dup.protocolo, duplicada: true };

  const arquivoFoto = await lerFoto(fd.get("foto"));
  let protocolo, foto = null;
  const id = transacao(() => {
    protocolo = proximoProtocolo();
    foto = salvarFoto(arquivoFoto, protocolo);
    const r = db.prepare(`INSERT INTO demandas (protocolo, nome, whatsapp, email, bairro, bairro_fora_lista, logradouro, categoria,
                           descricao, latitude, longitude, foto_arquivo, consentimento_em, ip_hash)
                          VALUES (?,?,?,?,?,?,?,?,?,?,?,?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?)`)
      .run(protocolo, d.nome, d.whatsapp, d.email, d.bairro, d.bairro_fora_lista, d.logradouro, d.categoria,
           d.descricao, d.latitude, d.longitude, foto, ipHash);
    const id = Number(r.lastInsertRowid);
    db.prepare("INSERT INTO historico (demanda_id, status, nota, usuario) VALUES (?, 'recebida', 'Registrada pelo portal', 'portal')").run(id);
    const fila = db.prepare("INSERT INTO tarefas (demanda_id, tipo, payload) VALUES (?, ?, ?)");
    fila.run(id, "documento", null);
    fila.run(id, "gabinete", JSON.stringify({ evento: "demanda_criada" }));
    fila.run(id, "whatsapp", JSON.stringify({ modelo: "confirmacao" }));
    if (d.email) fila.run(id, "email", JSON.stringify({ modelo: "confirmacao" }));
    if (config.email.copiaGabinete) fila.run(id, "email_gabinete", null);
    return id;
  });
  return { id, protocolo, duplicada: false };
}

function buscarPorId(id) { return db.prepare("SELECT * FROM demandas WHERE id = ?").get(Number(id)); }
function buscarPorProtocolo(p) { return db.prepare("SELECT * FROM demandas WHERE protocolo = ?").get(String(p).toUpperCase()); }

/** Muda status, registra histórico e enfileira avisos. */
function mudarStatus(id, { status, nota, numero_indicacao }, usuario) {
  if (!STATUS[status]) throw new ErroHttp(422, "Status inválido.");
  const atual = buscarPorId(id);
  if (!atual) throw new ErroHttp(404, "Demanda não encontrada.");
  transacao(() => {
    db.prepare(`UPDATE demandas SET status = ?, numero_indicacao = COALESCE(?, numero_indicacao),
                atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
      .run(status, numero_indicacao ? limpar(numero_indicacao, 30) : null, atual.id);
    const notaLimpa = limpar(nota, 500) || null;
    const numeroNovo = numero_indicacao && limpar(numero_indicacao, 30) !== atual.numero_indicacao;
    if (status !== atual.status || notaLimpa || numeroNovo)
      db.prepare("INSERT INTO historico (demanda_id, status, nota, usuario) VALUES (?,?,?,?)")
        .run(atual.id, status, notaLimpa || (numeroNovo && status === atual.status ? `Nº da Indicação: ${limpar(numero_indicacao, 30)}` : null), usuario);
    if (status !== atual.status) {
      db.prepare("INSERT INTO tarefas (demanda_id, tipo, payload) VALUES (?, 'gabinete', ?)").run(atual.id, JSON.stringify({ evento: "status_atualizado" }));
      if (config.whatsapp.notificarMudancaStatus && STATUS[status].aviso) {
        const p = JSON.stringify({ modelo: "status", status });
        db.prepare("INSERT INTO tarefas (demanda_id, tipo, payload) VALUES (?, 'whatsapp', ?)").run(atual.id, p);
        if (atual.email) db.prepare("INSERT INTO tarefas (demanda_id, tipo, payload) VALUES (?, 'email', ?)").run(atual.id, p);
      }
      if (numero_indicacao || status === "protocolada")
        db.prepare("INSERT INTO tarefas (demanda_id, tipo, payload) VALUES (?, 'documento', NULL)").run(atual.id);
    }
  });
  return buscarPorId(id);
}

/** Converte linha do banco em objeto público (sem dados internos). */
function paraApi(d, completo = false) {
  const base = {
    id: d.id, protocolo: d.protocolo, criado_em: d.criado_em, atualizado_em: d.atualizado_em,
    bairro: d.bairro, bairro_fora_lista: !!d.bairro_fora_lista, logradouro: d.logradouro,
    categoria: d.categoria, categoria_nome: CATEGORIAS[d.categoria]?.nome || d.categoria,
    status: d.status, status_nome: STATUS[d.status]?.nome || d.status, numero_indicacao: d.numero_indicacao,
    tem_foto: !!d.foto_arquivo, tem_docx: !!d.documento_docx, tem_pdf: !!d.documento_pdf,
  };
  if (!completo) return base;
  return { ...base, nome: d.nome, whatsapp: d.whatsapp, email: d.email, descricao: d.descricao, latitude: d.latitude,
           longitude: d.longitude, id_externo: d.id_externo, texto_indicacao: d.texto_indicacao ? JSON.parse(d.texto_indicacao) : null };
}

module.exports = { criarDemanda, validar, normalizarWhatsapp, tipoImagem, buscarPorId, buscarPorProtocolo, mudarStatus, paraApi, limpar };

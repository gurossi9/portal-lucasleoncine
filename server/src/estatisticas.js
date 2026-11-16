"use strict";
/** Consultas de agrupamento que alimentam o painel e os relatórios. */
const { db } = require("./db");
const { CATEGORIAS, STATUS } = require("./catalogo");

/** Monta WHERE a partir dos filtros da URL (sempre com parâmetros, nunca concatenando valores). */
function filtros(q) {
  const where = [], args = [];
  // datas chegam como AAAA-MM-DD no fuso de Brasília
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.de || ""))  { where.push("criado_em >= ?"); args.push(new Date(q.de + "T00:00:00-03:00").toISOString()); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.ate || "")) { where.push("criado_em <  ?"); args.push(new Date(new Date(q.ate + "T00:00:00-03:00").getTime() + 864e5).toISOString()); }
  for (const campo of ["bairro", "categoria", "status"]) {
    const v = (q[campo] || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (v.length) { where.push(`${campo} IN (${v.map(() => "?").join(",")})`); args.push(...v); }
  }
  if (q.busca) {
    const t = `%${String(q.busca).slice(0, 80)}%`;
    where.push("(protocolo LIKE ? OR nome LIKE ? OR logradouro LIKE ? OR descricao LIKE ? OR numero_indicacao LIKE ?)");
    args.push(t, t, t, t, t);
  }
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", args };
}

const ABERTOS = "('recebida','em_analise','protocolada','em_execucao')";

function resumo(q) {
  const f = filtros(q);
  const kpi = db.prepare(`SELECT COUNT(*) AS total,
      SUM(status IN ${ABERTOS}) AS em_aberto,
      SUM(status = 'atendida') AS atendidas,
      SUM(status = 'protocolada' OR numero_indicacao IS NOT NULL) AS indicacoes,
      COUNT(DISTINCT bairro) AS bairros,
      SUM(criado_em >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')) AS ultimos_7_dias
    FROM demandas ${f.sql}`).get(...f.args);

  const porBairro = db.prepare(`SELECT bairro, COUNT(*) AS total, SUM(status = 'atendida') AS atendidas,
      SUM(status IN ${ABERTOS}) AS em_aberto, MAX(bairro_fora_lista) AS fora_lista
    FROM demandas ${f.sql} GROUP BY bairro ORDER BY total DESC, bairro`).all(...f.args);

  const porCategoria = db.prepare(`SELECT categoria, COUNT(*) AS total, SUM(status = 'atendida') AS atendidas
    FROM demandas ${f.sql} GROUP BY categoria ORDER BY total DESC`).all(...f.args)
    .map((r) => ({ ...r, nome: CATEGORIAS[r.categoria]?.nome || r.categoria }));

  const porStatus = db.prepare(`SELECT status, COUNT(*) AS total FROM demandas ${f.sql} GROUP BY status`).all(...f.args)
    .map((r) => ({ ...r, nome: STATUS[r.status]?.nome || r.status }));

  // série mensal no fuso de Brasília (-3h)
  const porMes = db.prepare(`SELECT strftime('%Y-%m', criado_em, '-3 hours') AS mes, COUNT(*) AS total
    FROM demandas ${f.sql} GROUP BY mes ORDER BY mes DESC LIMIT 12`).all(...f.args).reverse();

  // matriz bairro × categoria (top 15 bairros)
  const matriz = db.prepare(`SELECT bairro, categoria, COUNT(*) AS total FROM demandas ${f.sql}
    GROUP BY bairro, categoria`).all(...f.args);

  const tempoAtendimento = db.prepare(`SELECT ROUND(AVG(julianday(h.criado_em) - julianday(d.criado_em)), 1) AS dias
    FROM demandas d JOIN historico h ON h.demanda_id = d.id AND h.status = 'atendida' ${f.sql.replace(/\b(criado_em|bairro|categoria|status|protocolo|nome|logradouro|descricao|numero_indicacao)\b/g, "d.$1")}`).get(...f.args);

  return { kpi: { ...kpi, tempo_medio_atendimento_dias: tempoAtendimento?.dias ?? null }, por_bairro: porBairro,
           por_categoria: porCategoria, por_status: porStatus, por_mes: porMes, matriz };
}

function listar(q) {
  const f = filtros(q);
  const limite = Math.min(Math.max(parseInt(q.limite) || 50, 1), 500);
  const pagina = Math.max(parseInt(q.pagina) || 1, 1);
  const ordem = { recentes: "criado_em DESC", antigas: "criado_em ASC", bairro: "bairro, criado_em DESC" }[q.ordem] || "criado_em DESC";
  const total = db.prepare(`SELECT COUNT(*) AS n FROM demandas ${f.sql}`).get(...f.args).n;
  const linhas = db.prepare(`SELECT * FROM demandas ${f.sql} ORDER BY ${ordem} LIMIT ? OFFSET ?`).all(...f.args, limite, (pagina - 1) * limite);
  return { total, pagina, limite, linhas };
}

/** Relatório CSV (separador ; e BOM para abrir direto no Excel em português). */
function csv(q) {
  const f = filtros(q);
  const linhas = db.prepare(`SELECT * FROM demandas ${f.sql} ORDER BY criado_em DESC`).all(...f.args);
  const col = ["Protocolo", "Data", "Status", "Nº Indicação", "Bairro", "Endereço/Referência", "Categoria", "Descrição", "Nome", "WhatsApp", "E-mail", "Latitude", "Longitude"];
  const esc = (v) => { const s = v == null ? "" : String(v); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const dataBR = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const corpo = linhas.map((d) => [d.protocolo, dataBR(d.criado_em), STATUS[d.status]?.nome || d.status, d.numero_indicacao, d.bairro, d.logradouro,
    CATEGORIAS[d.categoria]?.nome || d.categoria, d.descricao, d.nome, d.whatsapp, d.email, d.latitude, d.longitude].map(esc).join(";"));
  return "﻿" + [col.join(";"), ...corpo].join("\r\n");
}

function historico(demandaId) {
  return db.prepare("SELECT criado_em, status, nota, usuario FROM historico WHERE demanda_id = ? ORDER BY id").all(demandaId)
    .map((h) => ({ ...h, status_nome: STATUS[h.status]?.nome || h.status }));
}

function tarefas(demandaId) {
  return db.prepare("SELECT tipo, status, tentativas, ultimo_erro, concluido_em FROM tarefas WHERE demanda_id = ? ORDER BY id").all(demandaId);
}

module.exports = { resumo, listar, csv, historico, tarefas, filtros };

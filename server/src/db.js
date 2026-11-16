"use strict";
/**
 * Banco de dados SQLite embutido no Node (node:sqlite, Node >= 22.5).
 * O SQL é padrão e migra para PostgreSQL trocando apenas os tipos de data
 * (ver scripts/schema-postgres.sql).
 */
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const config = require("./config");

const db = new DatabaseSync(process.env.ARQUIVO_BANCO || path.join(config.pastas.dados, "demandas.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

db.exec(`
CREATE TABLE IF NOT EXISTS demandas (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  protocolo          TEXT NOT NULL UNIQUE,
  criado_em          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  nome               TEXT NOT NULL,
  whatsapp           TEXT NOT NULL,
  email              TEXT,
  bairro             TEXT NOT NULL,
  bairro_fora_lista  INTEGER NOT NULL DEFAULT 0,
  logradouro         TEXT NOT NULL,
  categoria          TEXT NOT NULL,
  descricao          TEXT NOT NULL,
  latitude           REAL,
  longitude          REAL,
  foto_arquivo       TEXT,
  status             TEXT NOT NULL DEFAULT 'recebida',
  numero_indicacao   TEXT,
  texto_indicacao    TEXT,          -- JSON com ajustes manuais do painel (ementa, corpo)
  indicacao_ia       TEXT,          -- JSON com a redação por IA (ou o erro), quando ligada
  documento_docx     TEXT,
  documento_pdf      TEXT,
  id_externo         TEXT,          -- id no sistema do gabinete
  consentimento_em   TEXT NOT NULL,
  ip_hash            TEXT
);
CREATE INDEX IF NOT EXISTS ix_dem_bairro    ON demandas(bairro);
CREATE INDEX IF NOT EXISTS ix_dem_categoria ON demandas(categoria);
CREATE INDEX IF NOT EXISTS ix_dem_status    ON demandas(status);
CREATE INDEX IF NOT EXISTS ix_dem_criado    ON demandas(criado_em);

CREATE TABLE IF NOT EXISTS historico (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  demanda_id  INTEGER NOT NULL REFERENCES demandas(id) ON DELETE CASCADE,
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  status      TEXT NOT NULL,
  nota        TEXT,
  usuario     TEXT
);
CREATE INDEX IF NOT EXISTS ix_hist_dem ON historico(demanda_id);

CREATE TABLE IF NOT EXISTS protocolo_seq (
  ano     INTEGER PRIMARY KEY,
  ultimo  INTEGER NOT NULL
);

-- Fila de tarefas assíncronas com reenvio automático
CREATE TABLE IF NOT EXISTS tarefas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  demanda_id   INTEGER NOT NULL REFERENCES demandas(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL,          -- documento | gabinete | whatsapp | email | email_gabinete
  payload      TEXT,                   -- JSON opcional (ex.: status anunciado)
  status       TEXT NOT NULL DEFAULT 'pendente',  -- pendente | ok | erro
  tentativas   INTEGER NOT NULL DEFAULT 0,
  proxima_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ultimo_erro  TEXT,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  concluido_em TEXT
);
CREATE INDEX IF NOT EXISTS ix_tar_fila ON tarefas(status, proxima_em);
`);

/* Migrações para bancos criados antes de cada coluna existir. */
const colunas = new Set(db.prepare("PRAGMA table_info(demandas)").all().map((c) => c.name));
if (!colunas.has("indicacao_ia")) db.exec("ALTER TABLE demandas ADD COLUMN indicacao_ia TEXT");

/** Executa fn dentro de uma transação (rollback em caso de erro). */
function transacao(fn) {
  db.exec("BEGIN IMMEDIATE");
  try { const r = fn(); db.exec("COMMIT"); return r; }
  catch (err) { db.exec("ROLLBACK"); throw err; }
}

module.exports = { db, transacao };

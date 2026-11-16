-- Esquema equivalente para PostgreSQL (caso a Câmara prefira um banco central).
-- As consultas de src/estatisticas.js usam SQL padrão; troque strftime/julianday
-- por date_trunc/extract ao migrar.

CREATE TABLE demandas (
  id                 BIGSERIAL PRIMARY KEY,
  protocolo          TEXT NOT NULL UNIQUE,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  nome               TEXT NOT NULL,
  whatsapp           TEXT NOT NULL,
  email              TEXT,
  bairro             TEXT NOT NULL,
  bairro_fora_lista  BOOLEAN NOT NULL DEFAULT false,
  logradouro         TEXT NOT NULL,
  categoria          TEXT NOT NULL,
  descricao          TEXT NOT NULL,
  latitude           DOUBLE PRECISION,
  longitude          DOUBLE PRECISION,
  foto_arquivo       TEXT,
  status             TEXT NOT NULL DEFAULT 'recebida',
  numero_indicacao   TEXT,
  texto_indicacao    JSONB,
  documento_docx     TEXT,
  documento_pdf      TEXT,
  id_externo         TEXT,
  consentimento_em   TIMESTAMPTZ NOT NULL,
  ip_hash            TEXT
);
CREATE INDEX ix_dem_bairro    ON demandas(bairro);
CREATE INDEX ix_dem_categoria ON demandas(categoria);
CREATE INDEX ix_dem_status    ON demandas(status);
CREATE INDEX ix_dem_criado    ON demandas(criado_em);

CREATE TABLE historico (
  id          BIGSERIAL PRIMARY KEY,
  demanda_id  BIGINT NOT NULL REFERENCES demandas(id) ON DELETE CASCADE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      TEXT NOT NULL,
  nota        TEXT,
  usuario     TEXT
);

CREATE TABLE protocolo_seq (ano INT PRIMARY KEY, ultimo INT NOT NULL);

CREATE TABLE tarefas (
  id           BIGSERIAL PRIMARY KEY,
  demanda_id   BIGINT NOT NULL REFERENCES demandas(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL,
  payload      JSONB,
  status       TEXT NOT NULL DEFAULT 'pendente',
  tentativas   INT NOT NULL DEFAULT 0,
  proxima_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_erro  TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em TIMESTAMPTZ
);
CREATE INDEX ix_tar_fila ON tarefas(status, proxima_em);

-- Consultas do painel (equivalentes PostgreSQL)
-- Por bairro:
--   SELECT bairro, COUNT(*) total, COUNT(*) FILTER (WHERE status='atendida') atendidas
--   FROM demandas GROUP BY bairro ORDER BY total DESC;
-- Por mês (fuso de Brasília):
--   SELECT to_char(criado_em AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') mes, COUNT(*) FROM demandas GROUP BY 1 ORDER BY 1;

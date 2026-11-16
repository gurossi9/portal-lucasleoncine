"use strict";
const path = require("node:path");
const fs = require("node:fs");

const RAIZ = path.resolve(__dirname, "..");
const envPath = process.env.ARQUIVO_ENV || path.join(RAIZ, ".env");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const e = (k, padrao = "") => (process.env[k] ?? padrao).toString().trim();
const bool = (k, padrao = "0") => ["1", "true", "sim", "yes"].includes(e(k, padrao).toLowerCase());
const num = (k, padrao) => Number(e(k, String(padrao)));

const config = {
  raiz: RAIZ,
  // PORT é a variável usada por serviços de hospedagem (Render, Railway…); tem prioridade sobre PORTA.
  porta: Number(process.env.PORT) || num("PORTA", 3000),
  urlPublica: e("URL_PUBLICA", process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, ""),
  confiarProxy: bool("CONFIAR_PROXY"),
  ambiente: e("NODE_ENV", "development"),

  pastas: {
    publico: path.join(RAIZ, "..", "public"),
    painel: path.join(RAIZ, "..", "painel"),
    dados: path.resolve(RAIZ, e("PASTA_DADOS", "dados")),
    templates: path.join(RAIZ, "templates"),
    scripts: path.join(RAIZ, "scripts"),
  },

  vereador: {
    nome: e("VEREADOR_NOME", "Lucas Leoncine"),
    cargo: e("VEREADOR_CARGO", "Vereador"),
    camara: e("CAMARA_NOME", "Câmara Municipal de Americana"),
    cidade: e("CIDADE", "Americana"),
    uf: e("UF", "SP"),
    prefixoProtocolo: e("PREFIXO_PROTOCOLO", "LL"),
    whatsappGabinete: e("WHATSAPP_GABINETE", "5519999845200"),
  },

  painel: {
    usuario: e("PAINEL_USUARIO", "gabinete"),
    senha: e("PAINEL_SENHA", ""),
  },

  seguranca: {
    segredoIp: e("SEGREDO_IP", "troque-este-segredo"),
    limiteEnviosPorIp: num("LIMITE_ENVIOS_POR_IP", 8),
    janelaLimiteMin: num("JANELA_LIMITE_MIN", 15),
    fotoMaxMB: num("FOTO_MAX_MB", 10),
  },

  gabinete: {
    webhookUrl: e("GABINETE_WEBHOOK_URL"),
    segredo: e("GABINETE_WEBHOOK_SEGREDO"),
    enviarFotoBase64: bool("GABINETE_ENVIAR_FOTO_BASE64"),
    timeoutMs: num("GABINETE_TIMEOUT_MS", 15000),
  },

  documento: {
    modelo: path.resolve(RAIZ, e("INDICACAO_MODELO", "templates/indicacao.docx")),
    gerarPdf: bool("INDICACAO_GERAR_PDF", "1"),
    python: e("PYTHON_BIN", "python3"),
    soffice: e("SOFFICE_BIN", "soffice"),
  },

  /** Mapa de localização na Indicação (OpenStreetMap). Desligue com MAPA_INDICACAO=0. */
  mapa: {
    ativo: bool("MAPA_INDICACAO", "1"),
    tiles: e("MAPA_TILES_URL", "https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
    geocoder: e("MAPA_GEOCODER_URL", "https://nominatim.openstreetmap.org/search"),
    contato: e("MAPA_CONTATO", e("EMAIL_REMETENTE", "gabinete")),
  },

  /** Redação da Indicação por IA (opcional). Sem chave, usa o texto padrão. */
  ia: {
    provedor: e("IA_PROVEDOR", "desligado").toLowerCase(), // anthropic | desligado
    chave: e("ANTHROPIC_API_KEY"),
    modelo: e("IA_MODELO", "claude-sonnet-5-5"),
    url: e("IA_URL", "https://api.anthropic.com/v1/messages"),
    timeoutMs: num("IA_TIMEOUT_MS", 60000),
    prompt: path.resolve(RAIZ, e("IA_PROMPT", "templates/prompt-indicacao.md")),
  },

  whatsapp: {
    provedor: e("WHATSAPP_PROVEDOR", "desligado").toLowerCase(), // meta | zapi | evolution | desligado
    meta: {
      token: e("META_WA_TOKEN"),
      phoneNumberId: e("META_WA_PHONE_NUMBER_ID"),
      versao: e("META_WA_VERSAO", "v21.0"),
      idioma: e("META_WA_IDIOMA", "pt_BR"),
      templateConfirmacao: e("META_WA_TEMPLATE_CONFIRMACAO", "confirmacao_demanda"),
      templateStatus: e("META_WA_TEMPLATE_STATUS", "atualizacao_demanda"),
    },
    zapi: { instancia: e("ZAPI_INSTANCIA"), token: e("ZAPI_TOKEN"), clientToken: e("ZAPI_CLIENT_TOKEN") },
    evolution: { url: e("EVOLUTION_URL").replace(/\/$/, ""), instancia: e("EVOLUTION_INSTANCIA"), apiKey: e("EVOLUTION_API_KEY") },
    notificarMudancaStatus: bool("NOTIFICAR_MUDANCA_STATUS", "1"),
  },

  email: {
    provedor: e("EMAIL_PROVEDOR", "desligado").toLowerCase(), // brevo | resend | smtp | desligado
    remetente: e("EMAIL_REMETENTE", "gabinete@exemplo.com.br"),
    remetenteNome: e("EMAIL_REMETENTE_NOME", "Gabinete Vereador Lucas Leoncine"),
    apiKey: e("EMAIL_API_KEY"),
    smtp: { host: e("SMTP_HOST"), porta: num("SMTP_PORTA", 587), usuario: e("SMTP_USUARIO"), senha: e("SMTP_SENHA") },
    copiaGabinete: e("EMAIL_COPIA_GABINETE"), // recebe aviso de cada nova demanda
  },
};

fs.mkdirSync(config.pastas.dados, { recursive: true });
module.exports = config;

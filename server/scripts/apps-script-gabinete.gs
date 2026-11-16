/**
 * RECEPTOR DO PORTAL DE DEMANDAS → GOOGLE PLANILHAS
 * Use quando o "sistema do gabinete" for uma planilha Google.
 *
 * Como instalar (10 minutos):
 *  1. Crie uma planilha Google (ex.: "Demandas do Portal").
 *  2. Menu Extensões → Apps Script. Apague o conteúdo e cole este arquivo inteiro.
 *  3. Em "Configurações do projeto" (engrenagem) → Propriedades do script → adicione:
 *        SEGREDO = (o mesmo valor de GABINETE_WEBHOOK_SEGREDO do .env do portal)
 *  4. Clique em Implantar → Nova implantação → tipo "App da Web"
 *        Executar como: Eu  ·  Quem pode acessar: Qualquer pessoa
 *  5. Copie a URL gerada (termina em /exec) e coloque em GABINETE_WEBHOOK_URL no .env do portal.
 *
 * Segurança: toda requisição é conferida pela assinatura HMAC-SHA256; sem o SEGREDO
 * correto, nada é gravado. A aba "Demandas" é criada automaticamente.
 */

const ABA = "Demandas";
const COLUNAS = [
  "Protocolo", "Recebida em", "Situação", "Nº Indicação", "Bairro", "Bairro fora da lista", "Endereço / referência",
  "Categoria", "Descrição", "Munícipe", "WhatsApp", "E-mail", "Mapa", "Foto", "Indicação (Word)", "Indicação (PDF)",
  "Abrir no painel", "Atualizado em",
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const segredo = PropertiesService.getScriptProperties().getProperty("SEGREDO");
    if (!segredo) return resposta({ ok: false, erro: "Propriedade SEGREDO não configurada" });

    const corpo = e.postData && e.postData.contents;
    const recebida = (e.parameter && e.parameter.assinatura) || "";
    const esperada = hmacHex(corpo, segredo);
    if (!corpo || recebida !== esperada) return resposta({ ok: false, erro: "Assinatura inválida" });

    const msg = JSON.parse(corpo);
    const d = msg.dados;
    const aba = obterAba();
    const linha = localizar(aba, d.protocolo);

    const valores = [
      d.protocolo, new Date(d.criado_em), d.status_nome, d.numero_indicacao || "", d.local.bairro,
      d.local.bairro_fora_lista ? "SIM — revisar" : "", d.local.logradouro, d.categoria_nome, d.descricao,
      d.municipe.nome, "'" + d.municipe.whatsapp, d.municipe.email || "", d.local.mapa || "",
      d.links.foto || "", d.links.indicacao_docx || "", d.links.indicacao_pdf || "", d.links.painel, new Date(),
    ];

    let numeroLinha;
    if (linha) {               // já existe: atualiza (idempotente para reenvios e mudanças de status)
      aba.getRange(linha, 1, 1, valores.length).setValues([valores]);
      numeroLinha = linha;
    } else {
      aba.appendRow(valores);
      numeroLinha = aba.getLastRow();
    }
    return resposta({ ok: true, id_externo: "linha-" + numeroLinha });
  } catch (err) {
    return resposta({ ok: false, erro: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function hmacHex(texto, segredo) {
  const bytes = Utilities.computeHmacSha256Signature(texto, segredo, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}

function obterAba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(ABA);
  if (!aba) {
    aba = ss.insertSheet(ABA);
    aba.getRange(1, 1, 1, COLUNAS.length).setValues([COLUNAS]).setFontWeight("bold").setBackground("#0B1F3A").setFontColor("#FFFFFF");
    aba.setFrozenRows(1);
    aba.getRange("B:B").setNumberFormat("dd/MM/yyyy HH:mm");
    aba.getRange("R:R").setNumberFormat("dd/MM/yyyy HH:mm");
  }
  return aba;
}

function localizar(aba, protocolo) {
  const ultima = aba.getLastRow();
  if (ultima < 2) return null;
  const achado = aba.getRange(2, 1, ultima - 1, 1).createTextFinder(protocolo).matchEntireCell(true).findNext();
  return achado ? achado.getRow() : null;
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

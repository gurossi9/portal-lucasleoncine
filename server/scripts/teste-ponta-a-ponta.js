"use strict";
/**
 * Teste de ponta a ponta: sobe o portal com banco temporário, um "sistema do gabinete"
 * falso (confere a assinatura HMAC) e um "WhatsApp" falso (Evolution API), e percorre
 * todo o fluxo: envio → protocolo → documento → webhook → WhatsApp → painel → status.
 *
 * Uso: npm run teste      (precisa de python3 + python-docx; LibreOffice opcional)
 */
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");

const SEGREDO = "segredo-de-teste";
const PORTA = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${PORTA}`;
const auth = "Basic " + Buffer.from("gabinete:senha-teste").toString("base64");
const temPdf = (() => { try { execFileSync("soffice", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } })();

const recebidos = { webhook: [], whatsapp: [] };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function servidorFalso(fn) {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => fn(req, res, b));
    }).listen(0, "127.0.0.1", () => ok(s));
  });
}

async function esperarAte(cond, ms = 30000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (await cond()) return true; await espera(300); }
  throw new Error("Tempo esgotado esperando condição");
}

function form(campos, foto) {
  const fd = new FormData();
  Object.entries(campos).forEach(([k, v]) => fd.append(k, v));
  if (foto) fd.append("foto", new Blob([foto], { type: "image/jpeg" }), "foto.jpg");
  return fd;
}

const demandaBase = {
  nome: "Maria Aparecida Silva", whatsapp: "19998887766", email: "maria@exemplo.com", bairro: "Praia Azul", bairro_fora_lista: "0",
  logradouro: "Rua das Paineiras, 250", categoria: "iluminacao", descricao: "Poste apagado há duas semanas, rua escura à noite.",
  latitude: "-22.7392", longitude: "-47.3311", consentimento_lgpd: "1",
};

(async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "portal-teste-"));
  const gabinete = await servidorFalso((req, res, corpo) => {
    const url = new URL(req.url, "http://x");
    const esperado = crypto.createHmac("sha256", SEGREDO).update(corpo).digest("hex");
    const okHeader = req.headers["x-assinatura"] === "sha256=" + esperado;
    const okQuery = url.searchParams.get("assinatura") === esperado;
    recebidos.webhook.push({ ok: okHeader && okQuery, corpo: JSON.parse(corpo) });
    res.writeHead(okHeader && okQuery ? 200 : 401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: okHeader && okQuery, id_externo: "EXT-" + recebidos.webhook.length }));
  });
  const whatsapp = await servidorFalso((req, res, corpo) => {
    recebidos.whatsapp.push({ url: req.url, apikey: req.headers.apikey, corpo: JSON.parse(corpo) });
    res.writeHead(201, { "Content-Type": "application/json" }); res.end(JSON.stringify({ key: { id: "MSG" + recebidos.whatsapp.length } }));
  });

  const env = {
    ...process.env, ARQUIVO_ENV: "/nao-existe", PORTA: String(PORTA), URL_PUBLICA: base, PASTA_DADOS: pasta,
    PAINEL_SENHA: "senha-teste", LIMITE_ENVIOS_POR_IP: "50",
    GABINETE_WEBHOOK_URL: `http://127.0.0.1:${gabinete.address().port}/receber`, GABINETE_WEBHOOK_SEGREDO: SEGREDO,
    WHATSAPP_PROVEDOR: "evolution", EVOLUTION_URL: `http://127.0.0.1:${whatsapp.address().port}`, EVOLUTION_INSTANCIA: "gabinete", EVOLUTION_API_KEY: "chave",
    INDICACAO_GERAR_PDF: temPdf ? "1" : "0",
  };
  const portal = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(__dirname, "..", "src", "index.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; portal.stdout.on("data", (c) => (log += c)); portal.stderr.on("data", (c) => (log += c));

  const ok = (m) => console.log("  ✓ " + m);
  try {
    await esperarAte(async () => (await fetch(base + "/api/saude").catch(() => ({}))).ok === true, 10000);
    console.log(`Portal de teste em ${base} (PDF: ${temPdf ? "sim" : "não"})`);

    // 1. Páginas públicas
    assert.equal((await fetch(base + "/")).status, 200); ok("formulário publicado em /");
    assert.equal((await fetch(base + "/acompanhar.html")).status, 200); ok("página de acompanhamento publicada");
    const h = (await fetch(base + "/")).headers;
    assert.match(h.get("content-security-policy"), /default-src 'self'/); ok("cabeçalhos de segurança presentes");

    // 2. Validação
    let r = await fetch(base + "/api/demandas", { method: "POST", body: form({ ...demandaBase, whatsapp: "1234" }) });
    assert.equal(r.status, 422); assert.ok((await r.json()).campos.whatsapp); ok("WhatsApp inválido é recusado (422)");
    r = await fetch(base + "/api/demandas", { method: "POST", body: form({ ...demandaBase, consentimento_lgpd: "0" }) });
    assert.equal(r.status, 422); ok("envio sem consentimento LGPD é recusado");
    r = await fetch(base + "/api/demandas", { method: "POST", body: form({ ...demandaBase }, Buffer.from("isto não é imagem")) });
    assert.equal(r.status, 415); ok("arquivo que não é imagem é recusado (415)");

    // 3. Envio válido com foto
    const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
    r = await fetch(base + "/api/demandas", { method: "POST", body: form(demandaBase, jpeg) });
    assert.equal(r.status, 201);
    const d1 = await r.json();
    assert.match(d1.protocolo, /^LL-\d{4}-000001$/); assert.equal(d1.notificacao_whatsapp, true); ok(`protocolo gerado: ${d1.protocolo}`);

    r = await fetch(base + "/api/demandas", { method: "POST", body: form(demandaBase, jpeg) });
    assert.equal((await r.json()).duplicada, true); ok("reenvio idêntico em 10 min não duplica (mesmo protocolo)");

    // mais demandas para o painel
    const extras = [
      { bairro: "Praia Azul", categoria: "tapa_buracos", logradouro: "Av. Brasil, 1000", whatsapp: "19991112222" },
      { bairro: "São Vito", categoria: "tapa_buracos", logradouro: "Rua Dom Pedro II, 50", whatsapp: "19993334444" },
      { bairro: "Vila Bertolli (digitado)", bairro_fora_lista: "1", categoria: "limpeza", logradouro: "Rua X, perto da escola", whatsapp: "19995556666", email: "" },
    ];
    for (const e of extras) { r = await fetch(base + "/api/demandas", { method: "POST", body: form({ ...demandaBase, ...e }) }); assert.equal(r.status, 201); }
    ok("mais 3 demandas registradas (2 bairros + 1 fora da lista)");

    // honeypot
    r = await fetch(base + "/api/demandas", { method: "POST", body: form({ ...demandaBase, website: "spam" }) });
    assert.equal(r.status, 201);
    ok("robô (honeypot) recebe resposta falsa e nada é gravado");

    // 4. Automações
    await esperarAte(async () => recebidos.webhook.length >= 4 && recebidos.whatsapp.length >= 4);
    assert.ok(recebidos.webhook.every((w) => w.ok)); ok("sistema do gabinete recebeu 4 demandas com assinatura HMAC válida");
    const w1 = recebidos.webhook.find((w) => w.corpo.dados.protocolo === d1.protocolo).corpo;
    assert.equal(w1.evento, "demanda_criada"); assert.equal(w1.dados.municipe.whatsapp, "5519998887766"); ok("payload do webhook completo (munícipe, local, links)");
    const z1 = recebidos.whatsapp.find((m) => m.corpo.text.includes(d1.protocolo));
    assert.equal(z1.corpo.number, "5519998887766"); assert.equal(z1.apikey, "chave"); assert.match(z1.corpo.text, /Iluminação/);
    ok("WhatsApp de confirmação enviado com o protocolo");

    // 5. Painel: autenticação, documento, estatísticas
    assert.equal((await fetch(base + "/painel/")).status, 401); ok("painel exige login (401 sem senha)");
    assert.equal((await fetch(base + "/api/painel/resumo", { headers: { Authorization: "Basic " + Buffer.from("gabinete:errada").toString("base64") } })).status, 401); ok("senha errada é recusada");
    assert.equal((await fetch(base + "/painel/", { headers: { Authorization: auth } })).status, 200); ok("painel abre com a senha correta");

    const lista = await (await fetch(base + "/api/painel/demandas?busca=" + d1.protocolo, { headers: { Authorization: auth } })).json();
    const id1 = lista.linhas[0].id;
    await esperarAte(async () => { const d = await (await fetch(`${base}/api/painel/demandas/${id1}`, { headers: { Authorization: auth } })).json(); return d.tem_docx && (!temPdf || d.tem_pdf); }, 90000);
    r = await fetch(`${base}/api/painel/demandas/${id1}/indicacao.docx`, { headers: { Authorization: auth } });
    const docx = Buffer.from(await r.arrayBuffer());
    assert.equal(docx.slice(0, 2).toString(), "PK"); ok(`Indicação .docx gerada (${(docx.length / 1024).toFixed(0)} KB)`);
    if (temPdf) {
      r = await fetch(`${base}/api/painel/demandas/${id1}/indicacao.pdf`, { headers: { Authorization: auth } });
      assert.equal(Buffer.from(await r.arrayBuffer()).slice(0, 4).toString(), "%PDF"); ok("Indicação .pdf gerada");
    }
    assert.equal((await fetch(`${base}/api/painel/demandas/${id1}/foto`, { headers: { Authorization: auth } })).status, 200); ok("foto disponível no painel");
    assert.equal((await fetch(`${base}/api/painel/demandas/${id1}/foto`)).status, 401); ok("foto NÃO é pública (exige login)");

    const res = await (await fetch(base + "/api/painel/resumo", { headers: { Authorization: auth } })).json();
    assert.equal(res.kpi.total, 4);
    assert.deepEqual(res.por_bairro.map((b) => [b.bairro, b.total]).slice(0, 1), [["Praia Azul", 2]]);
    assert.equal(res.por_categoria.find((c) => c.categoria === "tapa_buracos").total, 2);
    ok("estatísticas: 4 demandas, Praia Azul lidera com 2, tapa-buracos = 2");
    const filtrado = await (await fetch(base + "/api/painel/resumo?categoria=tapa_buracos", { headers: { Authorization: auth } })).json();
    assert.equal(filtrado.kpi.total, 2); assert.equal(filtrado.por_bairro.length, 2); ok("filtro por categoria funciona");

    const csvBytes = Buffer.from(await (await fetch(base + "/api/painel/relatorio.csv", { headers: { Authorization: auth } })).arrayBuffer());
    assert.deepEqual([...csvBytes.slice(0, 3)], [0xef, 0xbb, 0xbf]); // BOM: Excel abre acentos corretamente
    const csv = csvBytes.toString("utf8").slice(1);
    assert.ok(csv.startsWith("Protocolo;")); assert.equal(csv.trim().split("\r\n").length, 5); ok("relatório CSV (Excel) com cabeçalho + 4 linhas");

    // 6. Mudança de status → aviso + webhook + documento numerado
    const antesZap = recebidos.whatsapp.length, antesHook = recebidos.webhook.length;
    r = await fetch(`${base}/api/painel/demandas/${id1}`, { method: "PATCH", headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "protocolada", numero_indicacao: "1234/2026", nota: "Lida em plenário" }) });
    assert.equal(r.status, 200);
    await esperarAte(async () => recebidos.whatsapp.length > antesZap && recebidos.webhook.length > antesHook);
    assert.match(recebidos.whatsapp.at(-1).corpo.text, /Indicação protocolada[\s\S]*1234\/2026/); ok("munícipe avisado no WhatsApp: 'Indicação protocolada nº 1234/2026'");
    assert.equal(recebidos.webhook.at(-1).corpo.evento, "status_atualizado"); ok("sistema do gabinete recebeu a mudança de status");

    // 7. Consulta pública
    r = await fetch(`${base}/api/protocolo/${d1.protocolo}?final=0000`);
    assert.equal(r.status, 404); ok("consulta com dígitos errados não revela nada");
    const pub = await (await fetch(`${base}/api/protocolo/${d1.protocolo}?final=7766`)).json();
    assert.equal(pub.status, "Indicação protocolada"); assert.equal(pub.historico.length, 2); assert.equal(pub.nome, undefined);
    ok("consulta pública mostra situação e histórico, sem dados pessoais");

    console.log("\nTODOS OS TESTES PASSARAM ✅");
    process.exitCode = 0;
  } catch (err) {
    console.error("\nFALHOU ❌", err); console.error("\n--- log do portal ---\n" + log);
    process.exitCode = 1;
  } finally {
    portal.kill(); gabinete.close(); whatsapp.close();
    fs.rmSync(pasta, { recursive: true, force: true });
  }
})();

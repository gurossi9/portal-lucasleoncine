/* Painel do gabinete — sem dependências. Todo conteúdo vindo do cidadão é escapado. */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = new Intl.NumberFormat("pt-BR");
  const dataBR = (iso, hora = false) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", ...(hora ? { hour: "2-digit", minute: "2-digit" } : {}) });
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  let CAT = {}, STATUS = {}, IA = false;
  const estado = { pagina: 1, limite: 25 };
  const campos = ["de", "ate", "categoria", "bairro", "status", "busca"];

  async function api(url, opcoes = {}) {
    const r = await fetch(url, { ...opcoes, headers: { "Content-Type": "application/json", ...(opcoes.headers || {}) } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || `Erro ${r.status}`);
    return d;
  }
  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }

  function filtrosAtuais() {
    const p = new URLSearchParams();
    campos.forEach((c) => { const v = $("#f-" + c).value.trim(); if (v) p.set(c, v); });
    return p;
  }

  /* ----------------------------- Carregamento ----------------------------- */
  async function iniciar() {
    const cat = await api("/api/painel/catalogo");
    CAT = cat.categorias; STATUS = cat.status; IA = !!cat.ia;
    Object.entries(CAT).forEach(([id, c]) => $("#f-categoria").add(new Option(c.nome, id)));
    Object.entries(STATUS).forEach(([id, s]) => $("#f-status").add(new Option(s.nome, id)));
    cat.bairros.forEach((b) => $("#f-bairro").add(new Option(b, b)));

    campos.forEach((c) => $("#f-" + c).addEventListener(c === "busca" ? "input" : "change", debounce(() => { estado.pagina = 1; atualizar(); }, c === "busca" ? 350 : 0)));
    document.querySelectorAll("[data-periodo]").forEach((b) => b.addEventListener("click", () => periodo(b)));
    $("#btn-limpar").addEventListener("click", () => { campos.forEach((c) => ($("#f-" + c).value = "")); marcarPeriodo(null); estado.pagina = 1; atualizar(); });
    $("#btn-csv").addEventListener("click", (e) => { e.preventDefault(); location.href = "/api/painel/relatorio.csv?" + filtrosAtuais(); });
    $("#btn-imprimir").addEventListener("click", () => window.print());
    $("#pg-ant").addEventListener("click", () => { estado.pagina--; carregarLista(); });
    $("#pg-prox").addEventListener("click", () => { estado.pagina++; carregarLista(); });
    $("#btn-fechar").addEventListener("click", fecharGaveta);
    $("#veu").addEventListener("click", fecharGaveta);
    document.addEventListener("keydown", (e) => e.key === "Escape" && fecharGaveta());

    // #LL-2026-000001 na URL abre a demanda direto (links do WhatsApp/e-mail do gabinete)
    const hash = decodeURIComponent(location.hash.slice(1));
    if (/^[A-Z]{1,4}-\d{4}-\d{6}$/.test(hash)) { $("#f-busca").value = hash; }
    await atualizar();
    if (hash) { const l = await api("/api/painel/demandas?busca=" + encodeURIComponent(hash)); if (l.linhas[0]) abrir(l.linhas[0].id); }
    setInterval(atualizar, 120000); // atualiza sozinho a cada 2 min
  }

  function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

  function periodo(btn) {
    const v = btn.dataset.periodo, hoje = new Date();
    const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    $("#f-ate").value = v ? iso(hoje) : "";
    if (v === "ano") $("#f-de").value = hoje.getFullYear() + "-01-01";
    else if (v) $("#f-de").value = iso(new Date(hoje.getTime() - (Number(v) - 1) * 864e5));
    else $("#f-de").value = "";
    marcarPeriodo(btn); estado.pagina = 1; atualizar();
  }
  function marcarPeriodo(btn) { document.querySelectorAll("[data-periodo]").forEach((b) => b.classList.toggle("ativo", b === btn)); }

  async function atualizar() {
    try { await Promise.all([carregarResumo(), carregarLista()]); }
    catch (e) { toast(e.message); }
  }

  /* ----------------------------- Resumo e gráficos ----------------------------- */
  async function carregarResumo() {
    const r = await api("/api/painel/resumo?" + filtrosAtuais());
    const k = r.kpi;
    const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "—");
    $("#kpis").innerHTML = [
      ["Demandas", k.total, `${fmt.format(k.ultimos_7_dias || 0)} nos últimos 7 dias`],
      ["Em aberto", k.em_aberto, pct(k.em_aberto, k.total) + " do total"],
      ["Indicações", k.indicacoes, "protocoladas na Câmara"],
      ["Atendidas", k.atendidas, pct(k.atendidas, k.total) + " de resolutividade"],
      ["Bairros", k.bairros, "com demandas"],
      ["Tempo médio", k.tempo_medio_atendimento_dias != null ? k.tempo_medio_atendimento_dias + " d" : "—", "até o atendimento"],
    ].map(([t, v, s]) => `<div class="kpi"><small>${t}</small><strong>${typeof v === "number" ? fmt.format(v || 0) : esc(v)}</strong><span>${esc(s)}</span></div>`).join("");

    // por bairro (barras empilhadas)
    const maxB = Math.max(1, ...r.por_bairro.map((b) => b.total));
    $("#g-bairros").innerHTML = r.por_bairro.length ? r.por_bairro.map((b) => {
      const outras = b.total - b.em_aberto - b.atendidas;
      const w = (n) => (n / maxB) * 100 + "%";
      return `<button type="button" class="barra" data-filtro="bairro" data-valor="${esc(b.bairro)}" title="${esc(b.bairro)}: ${b.total} (${b.em_aberto} em aberto, ${b.atendidas} atendidas)">
        <span class="barra__nome">${esc(b.bairro)}${b.fora_lista ? '<span class="barra__alerta" title="Bairro digitado pelo cidadão — revisar">●</span>' : ""}</span>
        <span class="barra__trilho"><span style="width:${w(b.em_aberto)};background:var(--aberto)"></span><span style="width:${w(b.atendidas)};background:var(--atendida)"></span><span style="width:${w(outras)};background:var(--outras)"></span></span>
        <span class="barra__valor">${fmt.format(b.total)}</span></button>`;
    }).join("") : '<p class="vazio">Nenhuma demanda no período.</p>';

    const maxC = Math.max(1, ...r.por_categoria.map((c) => c.total));
    $("#g-categorias").innerHTML = r.por_categoria.length ? r.por_categoria.map((c) =>
      `<button type="button" class="barra" data-filtro="categoria" data-valor="${esc(c.categoria)}">
        <span class="barra__nome">${esc(c.nome)}</span>
        <span class="barra__trilho"><span style="width:${(c.total / maxC) * 100}%;background:var(--ciano)"></span></span>
        <span class="barra__valor">${fmt.format(c.total)}</span></button>`).join("") : '<p class="vazio">—</p>';

    const maxM = Math.max(1, ...r.por_mes.map((m) => m.total));
    $("#g-meses").innerHTML = r.por_mes.length ? r.por_mes.map((m) => {
      const [a, mm] = m.mes.split("-");
      return `<div class="coluna" title="${MESES[mm - 1]}/${a}: ${m.total}"><div class="coluna__barra" style="height:${(m.total / maxM) * 100}%"><b>${m.total}</b></div><small>${MESES[mm - 1]}/${a.slice(2)}</small></div>`;
    }).join("") : '<p class="vazio">—</p>';

    // matriz bairro × categoria (tom do azul da marca)
    const bairros = r.por_bairro.slice(0, 20).map((b) => b.bairro);
    const cats = r.por_categoria.map((c) => c.categoria);
    const mapa = new Map(r.matriz.map((x) => [x.bairro + "|" + x.categoria, x.total]));
    const maxCel = Math.max(1, ...r.matriz.map((x) => x.total));
    $("#t-matriz").innerHTML = bairros.length ? `<thead><tr><th>Bairro</th>${cats.map((c) => `<th>${esc(CAT[c]?.nome || c)}</th>`).join("")}</tr></thead><tbody>` +
      bairros.map((b) => `<tr><td>${esc(b)}</td>${cats.map((c) => {
        const n = mapa.get(b + "|" + c) || 0;
        const a = n ? 0.12 + (n / maxCel) * 0.75 : 0;
        return `<td class="${n ? "c" : ""}" ${n ? `data-bairro="${esc(b)}" data-categoria="${esc(c)}"` : ""} style="background:rgb(15 83 152 / ${a});color:${a > .5 ? "#fff" : "inherit"}">${n || "·"}</td>`;
      }).join("")}</tr>`).join("") + "</tbody>" : "";

    document.querySelectorAll("[data-filtro]").forEach((b) => b.addEventListener("click", () => { $("#f-" + b.dataset.filtro).value = b.dataset.valor; garantirOpcao(b.dataset.filtro, b.dataset.valor); estado.pagina = 1; atualizar(); }));
    document.querySelectorAll("#t-matriz td.c").forEach((td) => td.addEventListener("click", () => {
      garantirOpcao("bairro", td.dataset.bairro); $("#f-bairro").value = td.dataset.bairro; $("#f-categoria").value = td.dataset.categoria; estado.pagina = 1; atualizar();
    }));
  }
  function garantirOpcao(campo, valor) {
    const s = $("#f-" + campo);
    if (![...s.options].some((o) => o.value === valor)) s.add(new Option(valor, valor));
  }

  /* ----------------------------- Lista ----------------------------- */
  async function carregarLista() {
    const p = filtrosAtuais(); p.set("pagina", estado.pagina); p.set("limite", estado.limite);
    const r = await api("/api/painel/demandas?" + p);
    $("#total-lista").textContent = `${fmt.format(r.total)} demanda(s)`;
    $("#t-lista").innerHTML = r.linhas.length ? r.linhas.map((d) => `<tr data-id="${d.id}">
      <td class="protocolo" data-label="Protocolo">${esc(d.protocolo)}</td><td data-label="Data">${dataBR(d.criado_em)}</td><td data-label="Bairro">${esc(d.bairro)}</td>
      <td class="local" data-label="Local" title="${esc(d.logradouro)}">${esc(d.logradouro)}</td><td data-label="Categoria">${esc(d.categoria_nome)}</td>
      <td data-label="Situação"><span class="selo selo--${esc(d.status)}">${esc(d.status_nome)}</span></td><td data-label="Indicação">${esc(d.numero_indicacao || "—")}</td></tr>`).join("")
      : '<tr><td colspan="7" class="vazio">Nenhuma demanda encontrada.</td></tr>';
    document.querySelectorAll("#t-lista tr[data-id]").forEach((tr) => tr.addEventListener("click", () => abrir(tr.dataset.id)));
    const paginas = Math.max(1, Math.ceil(r.total / estado.limite));
    $("#pg-info").textContent = `Página ${estado.pagina} de ${paginas}`;
    $("#pg-ant").disabled = estado.pagina <= 1; $("#pg-prox").disabled = estado.pagina >= paginas;
  }

  /* ----------------------------- Detalhe ----------------------------- */
  const ORIGEM = { padrao: "Texto automático do portal", ia: "Redigido por IA", manual: "Ajustado pelo gabinete" };
  /** Grifa os avisos [COMPLETAR …] para a assessoria enxergar. */
  const grifar = (t) => esc(t).replace(/\[[^\]]+\]/g, (m) => `<mark>${m}</mark>`);

  async function abrir(id) {
    const d = await api("/api/painel/demandas/" + id);
    history.replaceState(null, "", "#" + d.protocolo);
    $("#d-protocolo").textContent = d.protocolo;
    const t = d.indicacao;
    const zap = `https://wa.me/${d.whatsapp}?text=${encodeURIComponent(`Olá, ${d.nome.split(" ")[0]}! Aqui é do gabinete do Vereador Lucas Leoncine, sobre sua demanda ${d.protocolo}.`)}`;
    const falhas = d.tarefas.filter((x) => x.status === "erro").length;
    const nomeTarefa = { documento: "Documento de Indicação", gabinete: "Envio ao sistema do gabinete", whatsapp: "WhatsApp ao munícipe", email: "E-mail ao munícipe", email_gabinete: "E-mail interno" };

    $("#d-corpo").innerHTML = `
      ${d.bairro_fora_lista ? '<p class="aviso">Bairro digitado pelo cidadão (fora da lista). Confira antes de protocolar.</p>' : ""}
      <section class="bloco"><h3>Demanda</h3>
        <dl class="dados">
          <dt>Recebida em</dt><dd>${dataBR(d.criado_em, true)}</dd>
          <dt>Categoria</dt><dd>${esc(d.categoria_nome)}</dd>
          <dt>Bairro</dt><dd>${esc(d.bairro)}</dd>
          <dt>Local</dt><dd>${esc(d.logradouro)}${d.latitude ? ` · <a href="https://www.google.com/maps?q=${d.latitude},${d.longitude}" target="_blank" rel="noopener">ver no mapa</a>` : ""}</dd>
          <dt>Situação</dt><dd><span class="selo selo--${esc(d.status)}">${esc(d.status_nome)}</span>${d.numero_indicacao ? ` · Indicação nº ${esc(d.numero_indicacao)}` : ""}</dd>
        </dl></section>
      <p class="descricao">${esc(d.descricao)}</p>
      ${d.tem_foto ? `<a href="/api/painel/demandas/${d.id}/foto" target="_blank" rel="noopener"><img class="foto" src="/api/painel/demandas/${d.id}/foto" alt="Foto enviada pelo munícipe"></a>` : ""}
      <section class="bloco"><h3>Munícipe</h3>
        <dl class="dados"><dt>Nome</dt><dd>${esc(d.nome)}</dd><dt>WhatsApp</dt><dd>${esc(d.whatsapp.replace(/^55(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3"))}</dd>
        ${d.email ? `<dt>E-mail</dt><dd>${esc(d.email)}</dd>` : ""}</dl>
        <div class="linha-botoes" style="margin-top:10px"><a class="btn btn--verde" href="${zap}" target="_blank" rel="noopener">Conversar no WhatsApp</a></div></section>

      <section class="bloco"><h3>Atualizar situação</h3>
        <form class="form" id="form-status">
          <label>Situação<select name="status">${Object.entries(STATUS).map(([k, s]) => `<option value="${k}" ${k === d.status ? "selected" : ""}>${esc(s.nome)}</option>`).join("")}</select></label>
          <label>Nº da Indicação (ex.: 1234/2026)<input name="numero_indicacao" value="${esc(d.numero_indicacao || "")}" maxlength="30" placeholder="preencha ao protocolar"></label>
          <label>Observação interna<input name="nota" maxlength="500" placeholder="opcional"></label>
          <div class="linha-botoes"><button class="btn" type="submit">Salvar situação</button></div>
          <small class="dica">O munícipe recebe aviso automático no WhatsApp quando a situação muda.</small>
        </form></section>

      <section class="bloco"><h3>Indicação — triagem</h3>
        <dl class="dados">
          <dt>Assunto</dt><dd>${grifar(t.assunto)}</dd>
          <dt>Nome do arquivo</dt><dd><small>${esc(t.nome_arquivo)}</small></dd>
          <dt>Setor competente</dt><dd>${grifar(t.secretaria)} <small class="dica">(sugestão — conferir)</small></dd>
          ${t.leitura_imagens ? `<dt>Leitura da foto</dt><dd>${esc(t.leitura_imagens)}</dd>` : ""}
          <dt>Texto</dt><dd>${esc(ORIGEM[t.origem] || t.origem)}${t.modelo_ia ? ` <small class="dica">(${esc(t.modelo_ia)})</small>` : ""}</dd>
        </dl>
        ${t.ia_erro ? `<p class="aviso">A IA não conseguiu redigir esta Indicação (${esc(t.ia_erro)}). O documento saiu com o texto automático.</p>` : ""}
        ${t.localizacao_completa === false && t.origem !== "manual" ? '<p class="aviso">Endereço sem número ou cruzamento: complete a localização (trecho grifado) antes de imprimir.</p>' : ""}
      </section>

      <section class="bloco"><h3>Documento de Indicação</h3>
        <div class="linha-botoes" style="margin-bottom:10px">
          ${d.tem_docx ? `<a class="btn btn--sec" href="/api/painel/demandas/${d.id}/indicacao.docx">Baixar Word</a>` : '<span class="dica">Gerando documento…</span>'}
          ${d.tem_pdf ? `<a class="btn btn--sec" href="/api/painel/demandas/${d.id}/indicacao.pdf" target="_blank" rel="noopener">Abrir PDF</a>` : ""}
          ${IA ? '<button class="btn btn--sec" type="button" id="btn-ia">Redigir de novo com IA</button>' : ""}
        </div>
        <form class="form" id="form-texto">
          <label>Ementa (começa com "Indica …")<textarea name="ementa" rows="3">${esc(t.ementa)}</textarea></label>
          <label>Texto (cada linha vira um parágrafo; saudação, fecho, data e assinatura entram sozinhos)<textarea name="corpo" rows="7">${esc(t.corpo)}</textarea></label>
          <div class="linha-botoes"><button class="btn" type="submit">Salvar texto e gerar documento</button><button class="btn btn--sec" type="button" id="btn-padrao">Voltar ao texto automático</button></div>
        </form></section>

      <section class="bloco"><h3>Histórico</h3>
        <ul class="historico">${d.historico.map((h) => `<li><strong>${esc(h.status_nome)}</strong> <small>${dataBR(h.criado_em, true)} · ${esc(h.usuario || "")}</small>${h.nota ? `<br>${esc(h.nota)}` : ""}</li>`).join("")}</ul></section>

      <section class="bloco"><h3>Automações</h3>
        ${d.tarefas.map((x) => `<div class="tarefa"><span>${esc(nomeTarefa[x.tipo] || x.tipo)}</span><span class="${esc(x.status)}" title="${esc(x.ultimo_erro || "")}">${x.status === "ok" ? (x.ultimo_erro?.startsWith("ignorado") ? "desligado" : "enviado ✓") : x.status === "erro" ? "falhou" : "na fila"}${x.tentativas > 1 ? ` (${x.tentativas}×)` : ""}</span></div>`).join("")}
        ${falhas ? '<div class="linha-botoes" style="margin-top:10px"><button class="btn btn--sec" type="button" id="btn-reenviar">Tentar de novo</button></div>' : ""}
      </section>
      ${d.id_externo ? `<small class="dica">ID no sistema do gabinete: ${esc(d.id_externo)}</small>` : ""}`;

    $("#form-status").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (f.status === "protocolada" && !f.numero_indicacao.trim() && !confirm("Protocolar sem o número da Indicação?")) return;
      try { await api("/api/painel/demandas/" + d.id, { method: "PATCH", body: JSON.stringify(f) }); toast("Situação atualizada"); atualizar(); abrir(d.id); }
      catch (err) { toast(err.message); }
    });
    $("#form-texto").addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = e.target.querySelector("button[type=submit]"); b.disabled = true; b.textContent = "Gerando…";
      try { await api(`/api/painel/demandas/${d.id}/indicacao`, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); toast("Documento gerado"); abrir(d.id); }
      catch (err) { toast(err.message); b.disabled = false; b.textContent = "Salvar texto e gerar documento"; }
    });
    $("#btn-padrao").addEventListener("click", async () => {
      if (!confirm("Descartar ajustes e voltar ao texto automático?")) return;
      await api(`/api/painel/demandas/${d.id}/indicacao`, { method: "POST", body: "{}" }); toast("Texto automático restaurado"); abrir(d.id);
    });
    const bia = $("#btn-ia");
    if (bia) bia.addEventListener("click", async () => {
      if (!confirm("Pedir uma nova redação à IA? Os ajustes feitos à mão serão descartados.")) return;
      bia.disabled = true; bia.textContent = "Redigindo…";
      try { await api(`/api/painel/demandas/${d.id}/indicacao/ia`, { method: "POST", body: "{}" }); toast("Nova redação gerada"); abrir(d.id); }
      catch (err) { toast(err.message); bia.disabled = false; bia.textContent = "Redigir de novo com IA"; }
    });
    const re = $("#btn-reenviar");
    if (re) re.addEventListener("click", async () => { const r = await api(`/api/painel/demandas/${d.id}/reenviar`, { method: "POST", body: "{}" }); toast(`${r.reagendadas} tarefa(s) reenviada(s)`); abrir(d.id); });

    $("#veu").hidden = false; $("#gaveta").hidden = false; $("#btn-fechar").focus();
  }
  function fecharGaveta() { $("#veu").hidden = true; $("#gaveta").hidden = true; history.replaceState(null, "", location.pathname + location.search); }

  iniciar().catch((e) => toast(e.message));
})();

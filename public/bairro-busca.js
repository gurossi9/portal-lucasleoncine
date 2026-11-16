/* Busca de bairro por texto — sem dependências.
 *
 * Mantém a lista "Selecione o bairro" (o <select id="bairro">) do jeito que está e coloca acima
 * dela um campo "Buscar bairro..." com lupa e botão de limpar:
 *  - filtra enquanto se digita, sem diferenciar maiúsculas/minúsculas nem acentos;
 *  - mostra os resultados logo abaixo do campo (toque ou Enter escolhe);
 *  - a lista de baixo também passa a mostrar só os bairros encontrados, agrupados pela letra
 *    inicial; as letras sem resultado somem durante a busca;
 *  - sem resultado: "Nenhum bairro encontrado para o termo pesquisado." e a opção de usar o texto
 *    como "outro bairro";
 *  - ao limpar a busca, a lista volta completa e funciona normalmente.
 * Busca por CEP no mesmo campo ("Buscar por bairro ou CEP"): ao digitar números, o campo aplica a
 * máscara 00000-000 e, com 8 dígitos, consulta o ViaCEP (viacep.com.br). Aceita só Americana-SP.
 * Achando, escolhe o bairro na lista (ou usa "Outro" com o nome vindo do CEP), preenche a rua
 * se ela estiver vazia e mostra o endereço com o mapa.
 * O valor enviado continua sendo o do <select>, então validação, envio e painel não mudam.
 * Funciona no formulário (public/index.html) e na demonstração (classes .campo/.field).
 */
(function () {
  "use strict";
  var sel = document.getElementById("bairro");
  if (!sel || sel.dataset.busca) return;
  sel.dataset.busca = "1";
  var OUTRO = "__outro";
  var form = sel.form;
  var campo = sel.closest(".campo, .field") || sel.parentNode;
  var caixaSelect = sel.closest(".select, .sel") || sel;
  var campoOutro = document.getElementById("bairro_outro") || document.getElementById("outro");
  var campoRua = document.getElementById("logradouro") || document.getElementById("rua");
  var CEP_DEMO = !!window.__CEP_DEMO; // na demonstração publicada a página não pode acessar o ViaCEP

  // A lista de bairros é a que já está no <select> (montada por app.js a partir do config.js).
  var todos = Array.prototype.slice.call(sel.options)
    .map(function (o) { return o.value; })
    .filter(function (v) { return v && v !== OUTRO; });
  var rotuloOutro = (Array.prototype.find.call(sel.options, function (o) { return o.value === OUTRO; }) || {}).text || "Outro (não está na lista)";

  var norm = function (s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  };
  var itens = todos.map(function (nome) { return { nome: nome, n: norm(nome) }; });
  var letra = function (nome) { return norm(nome).charAt(0).toUpperCase() || "#"; };

  /* ---------------- Estilo (usa as cores do próprio site) ---------------- */
  var css = document.createElement("style");
  css.textContent = [
    ".bb { position: relative; margin-bottom: 8px; }",
    ".bb__lupa { position: absolute; left: 14px; top: 25px; translate: 0 -50%; width: 20px; height: 20px; fill: none; stroke: var(--ink-3, var(--tinta-3, #64748B)); stroke-width: 2; stroke-linecap: round; pointer-events: none; }",
    ".bb input.bb__campo { padding-left: 44px; padding-right: 46px; }",
    ".bb__limpar { position: absolute; right: 7px; top: 25px; translate: 0 -50%; width: 36px; height: 36px; border: 0; border-radius: 50%; background: none; color: var(--ink-3, var(--tinta-3, #64748B)); font-size: 24px; line-height: 1; cursor: pointer; }",
    ".bb__limpar:hover { background: var(--accent-soft, #EEF3FF); }",
    ".bb__lista { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 6px); max-height: 290px; overflow-y: auto; margin: 0; padding: 6px; list-style: none; background: var(--surface, #fff); border: 1.5px solid var(--line-strong, var(--borda-forte, #B6C3D6)); border-radius: 11px; box-shadow: var(--shadow, var(--sombra, 0 10px 30px rgb(15 23 42 / .12))); overscroll-behavior: contain; }",
    ".bb__grupo { padding: 8px 12px 2px; font-size: 11.5px; font-weight: 700; letter-spacing: .06em; color: var(--ink-3, var(--tinta-3, #64748B)); }",
    ".bb__item { padding: 10px 12px; border-radius: 8px; cursor: pointer; font-size: 15.5px; line-height: 1.3; color: var(--ink, var(--tinta, #0F172A)); }",
    ".bb__item[aria-selected='true'], .bb__item:hover { background: var(--accent-soft, #EEF3FF); }",
    ".bb__item mark { background: none; color: var(--accent, var(--azul, #1652F0)); font-weight: 700; }",
    ".bb__item--outro { color: var(--accent, var(--azul, #1652F0)); font-weight: 600; border-top: 1px dashed var(--line, var(--borda, #D8E0EC)); border-radius: 0 0 8px 8px; margin-top: 4px; }",
    ".bb__vazio { padding: 10px 12px 6px; color: var(--ink-2, var(--tinta-2, #475569)); font-size: 14.5px; }",
    ".bb__info { margin: 6px 2px 0; font-size: 13px; color: var(--ink-3, var(--tinta-3, #64748B)); }",
    ".bb__info:empty { display: none; }",
    ".cep-status { margin: 8px 0 0; padding: 10px 12px; border-radius: 10px; font-size: 14px; line-height: 1.4; }",
    ".cep-status.info { background: var(--accent-soft, #EEF3FF); color: var(--accent, var(--azul, #1652F0)); }",
    ".cep-status.error { background: var(--err-soft, #FDECEC); color: var(--err-ink, #B42318); }",
    ".cep-card { margin: 8px 0 4px; border: 1.5px solid var(--ok, #12A150); border-radius: 12px; overflow: hidden; background: var(--surface, #fff); }",
    ".cep-card__topo { padding: 10px 12px; background: var(--ok-soft, #E6F6EC); color: var(--ok-ink, #0B7A3B); font-weight: 700; font-size: 14px; }",
    ".cep-card dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 12px; margin: 0; padding: 10px 12px; font-size: 14.5px; }",
    ".cep-card dt { color: var(--ink-3, var(--tinta-3, #64748B)); }",
    ".cep-card dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; color: var(--ink, var(--tinta, #0F172A)); }",
    ".cep-card iframe { display: block; width: 100%; height: 190px; border: 0; }",
    ".cep-card__mapa { display: flex; align-items: center; min-height: 44px; padding: 0 12px 10px; font-weight: 600; font-size: 14px; }",
    ".cep-card__dica { margin: 0; padding: 0 12px 10px; font-size: 13.5px; color: var(--ink-2, var(--tinta-2, #475569)); }"
  ].join("\n");
  document.head.appendChild(css);

  /* ---------------- Campo de busca, acima da lista ---------------- */
  var wrap = document.createElement("div");
  wrap.className = "bb";
  wrap.innerHTML =
    '<svg class="bb__lupa" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
    '<input class="inp bb__campo" id="bairro_busca" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" ' +
    'aria-controls="bairro_lista" aria-label="Buscar por bairro ou CEP" autocomplete="off" autocapitalize="off" spellcheck="false" ' +
    'placeholder="Buscar por bairro ou CEP" maxlength="80">' +
    '<button type="button" class="bb__limpar" aria-label="Limpar busca" hidden>×</button>' +
    '<ul class="bb__lista" id="bairro_lista" role="listbox" aria-label="Bairros encontrados" hidden></ul>';
  caixaSelect.parentNode.insertBefore(wrap, caixaSelect);
  var info = document.createElement("p");
  info.className = "bb__info";
  info.setAttribute("aria-live", "polite");
  caixaSelect.parentNode.insertBefore(info, caixaSelect.nextSibling);
  var cepStatus = document.createElement("p");
  cepStatus.className = "cep-status"; cepStatus.hidden = true;
  cepStatus.setAttribute("role", "status");
  var cepCard = document.createElement("div");
  cepCard.className = "cep-card"; cepCard.hidden = true;
  cepCard.setAttribute("aria-live", "polite");
  wrap.parentNode.insertBefore(cepCard, wrap.nextSibling);
  wrap.parentNode.insertBefore(cepStatus, wrap.nextSibling);

  var input = wrap.querySelector("input");
  var lista = wrap.querySelector("ul");
  var btnLimpar = wrap.querySelector(".bb__limpar");
  var atuais = [], ativo = -1;

  function escHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // Destaca os trechos digitados no nome, comparando sem acento.
  function destacar(nome, termos) {
    var chars = Array.from(nome), plano = "", mapa = [];
    chars.forEach(function (c, i) {
      var b = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      for (var k = 0; k < b.length; k++) { plano += b[k]; mapa.push(i); }
    });
    var marca = new Array(chars.length).fill(false);
    termos.forEach(function (t) {
      var p = plano.indexOf(t);
      while (t && p >= 0) { for (var k = p; k < p + t.length; k++) marca[mapa[k]] = true; p = plano.indexOf(t, p + t.length); }
    });
    var out = "", aberto = false;
    chars.forEach(function (c, i) {
      if (marca[i] && !aberto) { out += "<mark>"; aberto = true; }
      if (!marca[i] && aberto) { out += "</mark>"; aberto = false; }
      out += escHtml(c);
    });
    return out + (aberto ? "</mark>" : "");
  }

  function buscar(q) {
    var termos = norm(q).split(" ").filter(Boolean);
    if (!termos.length) return { termos: termos, res: itens.slice() };
    var res = itens.filter(function (it) { return termos.every(function (t) { return it.n.indexOf(t) >= 0; }); })
      .map(function (it) {
        var ini = it.n.indexOf(termos[0]) === 0 ? 0 : it.n.split(" ").some(function (p) { return p.indexOf(termos[0]) === 0; }) ? 1 : 2;
        return { it: it, ini: ini };
      })
      .sort(function (a, b) { return a.ini - b.ini || a.it.nome.localeCompare(b.it.nome, "pt-BR"); })
      .map(function (x) { return x.it; });
    return { termos: termos, res: res };
  }

  /* A lista de baixo: agrupada pela letra inicial. Durante a busca mostra só os encontrados
     (as letras sem resultado somem); o bairro já escolhido nunca some. */
  function montarSelect(encontrados, buscando) {
    var valor = sel.value;
    var nomes = encontrados.map(function (it) { return it.nome; });
    if (valor && valor !== OUTRO && nomes.indexOf(valor) < 0) nomes.unshift(valor);
    nomes.sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
    sel.innerHTML = "";
    var n = encontrados.length;
    sel.add(new Option(buscando ? (n ? "Selecione (" + n + (n === 1 ? " encontrado)" : " encontrados)") : "Nenhum bairro encontrado") : "Selecione o bairro", ""));
    var grupo = null, letraAtual = "";
    nomes.forEach(function (nome) {
      var l = letra(nome);
      if (l !== letraAtual) { grupo = document.createElement("optgroup"); grupo.label = l; sel.appendChild(grupo); letraAtual = l; }
      grupo.appendChild(new Option(nome, nome));
    });
    sel.add(new Option(rotuloOutro, OUTRO));
    sel.value = valor;
  }

  function desenhar() {
    var r = buscar(input.value), txt = input.value.trim();
    atuais = r.res;
    var html = "", letraAtual = "";
    atuais.forEach(function (it, i) {
      var l = letra(it.nome);
      if (l !== letraAtual) { html += '<li class="bb__grupo" role="presentation">' + l + "</li>"; letraAtual = l; }
      html += '<li class="bb__item" role="option" id="bb-' + i + '" data-i="' + i + '" aria-selected="false">' + destacar(it.nome, r.termos) + "</li>";
    });
    if (!atuais.length) {
      html = '<li class="bb__vazio" role="presentation">Nenhum bairro encontrado para o termo pesquisado.</li>';
      if (txt.length >= 3) html += '<li class="bb__item bb__item--outro" role="option" id="bb-outro" data-i="outro" aria-selected="false">Usar “' + escHtml(txt) + "” como outro bairro</li>";
    }
    lista.innerHTML = html;
    ativo = -1;
    input.removeAttribute("aria-activedescendant");
    montarSelect(atuais, !!txt);
    info.textContent = txt ? (atuais.length ? atuais.length + (atuais.length === 1 ? " bairro encontrado." : " bairros encontrados.") + " Toque para escolher ou use a lista abaixo." : "") : "";
  }

  function abrir() { lista.hidden = false; input.setAttribute("aria-expanded", "true"); }
  function fechar() { lista.hidden = true; input.setAttribute("aria-expanded", "false"); ativo = -1; input.removeAttribute("aria-activedescendant"); }

  function marcar(i) {
    var opts = lista.querySelectorAll('[role="option"]');
    if (!opts.length) return;
    ativo = (i + opts.length) % opts.length;
    Array.prototype.forEach.call(opts, function (o, k) { o.setAttribute("aria-selected", String(k === ativo)); });
    input.setAttribute("aria-activedescendant", opts[ativo].id);
    opts[ativo].scrollIntoView({ block: "nearest" });
  }

  function avisar() {
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Escolher um resultado: grava no <select>, limpa a busca e devolve a lista completa.
  function escolher(i) {
    var txt = input.value.trim();
    var it = i === "outro" ? null : atuais[Number(i)]; // lê o resultado antes de limpar a busca
    if (i !== "outro" && !it) return;
    limparBusca();
    if (i === "outro") {
      sel.value = OUTRO;
      avisar();
      if (campoOutro) { campoOutro.value = txt; campoOutro.dispatchEvent(new Event("input", { bubbles: true })); }
    } else {
      sel.value = it.nome;
      avisar();
    }
  }

  function limparBusca() {
    limparCep();
    input.value = "";
    btnLimpar.hidden = true;
    fechar();
    atuais = itens.slice();
    montarSelect(itens, false);
    info.textContent = "";
  }

  /* ---------------- Busca por CEP (ViaCEP) ---------------- */
  var ehCep = function (v) { return /^\d[\d.\s-]*$/.test(v.trim()); };
  var ultimoCep = "", ruaAuto = "", consulta = null;

  function exibirStatus(msg, tipo) {
    cepStatus.textContent = msg;
    cepStatus.className = "cep-status " + tipo;
    cepStatus.hidden = false;
  }
  function limparCep() {
    if (consulta) consulta.abort();
    consulta = null; ultimoCep = "";
    cepStatus.hidden = true; cepCard.hidden = true; cepCard.innerHTML = "";
  }
  function mascaraCep(v) {
    var d = v.replace(/\D/g, "").slice(0, 8);
    return d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
  }

  async function buscarCep(cep) {
    if (cep === ultimoCep) return;
    ultimoCep = cep;
    cepCard.hidden = true;
    if (CEP_DEMO) {
      exibirStatus("Nesta demonstração a consulta de CEP fica desligada, porque a página não pode acessar outros sites. No portal publicado o bairro e a rua são preenchidos sozinhos a partir do CEP.", "info");
      return;
    }
    if (!/^13(4(6[5-9]|7\d))\d{3}$/.test(cep)) { // faixa de CEPs de Americana: 13465-000 a 13479-999
      exibirStatus("Este CEP não é de Americana-SP. Este buscador atende apenas endereços da cidade de Americana-SP.", "error");
      return;
    }
    exibirStatus("Buscando endereço...", "info");
    if (consulta) consulta.abort();
    var ctrl = consulta = new AbortController();
    var limite = setTimeout(function () { ctrl.abort(); }, 8000);
    try {
      var r = await fetch("https://viacep.com.br/ws/" + cep + "/json/", { signal: ctrl.signal });
      var data = await r.json();
      clearTimeout(limite);
      if (ctrl !== consulta) return; // o usuário já digitou outra coisa
      if (!r.ok || data.erro) { exibirStatus("CEP não encontrado. Confira os números ou busque pelo nome do bairro.", "error"); return; }
      // Trava de segurança: aceita apenas a cidade de Americana-SP
      if (norm(data.localidade || "") !== "americana" || data.uf !== "SP") {
        exibirStatus("Este buscador atende apenas endereços da cidade de Americana-SP.", "error");
        return;
      }
      aplicarEndereco(data);
    } catch (err) {
      clearTimeout(limite);
      if (ctrl !== consulta) return;
      exibirStatus(err.name === "AbortError" ? "A consulta do CEP demorou demais. Tente de novo ou busque pelo nome do bairro." : "Erro ao consultar o CEP. Verifique sua conexão ou busque pelo nome do bairro.", "error");
    }
  }

  // Bairro do CEP → bairro da lista (mesmo nome sem acento; depois, um contido no outro).
  function acharBairro(nome) {
    var n = norm(nome);
    if (!n) return null;
    return itens.find(function (it) { return it.n === n; }) ||
      itens.find(function (it) { return it.n.indexOf(n) === 0 || n.indexOf(it.n) === 0; }) || null;
  }

  function aplicarEndereco(data) {
    var rua = data.logradouro || "", bairro = data.bairro || "";
    var achado = acharBairro(bairro), dica = [];
    if (achado) {
      sel.value = achado.nome;
      avisar();
    } else if (bairro) {
      sel.value = OUTRO;
      avisar();
      if (campoOutro) { campoOutro.value = bairro; campoOutro.dispatchEvent(new Event("input", { bubbles: true })); }
      dica.push("O bairro deste CEP não está na lista e foi preenchido como “outro bairro”.");
    } else {
      dica.push("Este CEP não informa o bairro: escolha na lista abaixo.");
    }
    if (rua && campoRua && (!campoRua.value.trim() || campoRua.value === ruaAuto)) {
      campoRua.value = ruaAuto = rua + ", ";
      campoRua.dispatchEvent(new Event("input", { bubbles: true }));
      dica.push("Complete o número da casa no campo da rua.");
    }
    var q = encodeURIComponent((rua ? rua + ", " : "") + (bairro ? bairro + ", " : "") + "Americana - SP, Brasil");
    cepCard.innerHTML =
      '<div class="cep-card__topo">✓ Endereço encontrado · CEP ' + escHtml(mascaraCep(data.cep || ultimoCep)) + "</div>" +
      "<dl><dt>Rua</dt><dd>" + escHtml(rua || "Não informado (CEP geral)") + "</dd>" +
      "<dt>Bairro</dt><dd>" + escHtml(bairro || "Não informado") + "</dd>" +
      "<dt>Cidade</dt><dd>" + escHtml((data.localidade || "") + " - " + (data.uf || "")) + "</dd>" +
      "<dt>DDD</dt><dd>(" + escHtml(data.ddd || "19") + ")</dd></dl>" +
      (dica.length ? '<p class="cep-card__dica">' + escHtml(dica.join(" ")) + "</p>" : "") +
      '<iframe title="Mapa do endereço" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=' + q + '&t=&z=16&ie=UTF8&iwloc=&output=embed"></iframe>' +
      '<a class="cep-card__mapa" href="https://www.google.com/maps/search/?api=1&query=' + q + '" target="_blank" rel="noopener">Abrir no Google Maps</a>';
    cepStatus.hidden = true;
    cepCard.hidden = false;
  }

  input.addEventListener("input", function () {
    btnLimpar.hidden = !input.value;
    if (!input.value.trim()) { limparBusca(); return; }
    if (ehCep(input.value)) {             // modo CEP: máscara 00000-000 e consulta com 8 dígitos
      var m = mascaraCep(input.value);
      if (input.value !== m) input.value = m;
      fechar();
      montarSelect(itens, false);
      var d = m.replace(/\D/g, "");
      if (d.length === 8) buscarCep(d);
      else { ultimoCep = ""; cepCard.hidden = true; info.textContent = ""; exibirStatus("Digite os 8 números do CEP (faltam " + (8 - d.length) + ").", "info"); }
      return;
    }
    if (!cepStatus.hidden || !cepCard.hidden) limparCep();
    desenhar();
    abrir();
    if (atuais.length) marcar(0);
  });
  input.addEventListener("focus", function () { if (input.value.trim() && !ehCep(input.value)) { desenhar(); abrir(); } });
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (input.value.trim()) { abrir(); marcar(ativo + 1); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (input.value.trim()) { abrir(); marcar(ativo - 1); } }
    else if (e.key === "Enter") {
      e.preventDefault(); // Enter na busca nunca envia o formulário
      if (ehCep(input.value)) return;
      var o = !lista.hidden && lista.querySelectorAll('[role="option"]')[Math.max(ativo, 0)];
      if (o) escolher(o.dataset.i);
    } else if (e.key === "Escape") {
      if (!lista.hidden) { e.preventDefault(); fechar(); }
      else if (input.value) { e.preventDefault(); limparBusca(); }
    }
  });
  lista.addEventListener("mousedown", function (e) { e.preventDefault(); }); // mantém o foco no campo
  lista.addEventListener("click", function (e) { var li = e.target.closest("[data-i]"); if (li) escolher(li.dataset.i); });
  btnLimpar.addEventListener("click", function () { limparBusca(); input.focus(); });
  document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) fechar(); });
  // Escolher direto na lista de baixo também encerra a busca.
  sel.addEventListener("change", function () { if (input.value && !ehCep(input.value) && !lista.contains(document.activeElement)) { var v = sel.value; limparBusca(); sel.value = v; } });
  if (form) form.addEventListener("reset", function () { setTimeout(limparBusca, 0); });

  montarSelect(itens, false);
})();

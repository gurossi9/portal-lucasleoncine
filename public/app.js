/* Portal de Demandas — lógica do formulário (sem dependências) */
(function () {
  "use strict";
  const CFG = window.PORTAL_CONFIG;
  const $ = (s, el = document) => el.querySelector(s);
  const form = $("#formulario");
  let fotoProcessada = null;      // Blob JPEG comprimido
  let categoriaSelecionada = "";

  /* ---------------- Ícones das categorias (traço, 24x24) ---------------- */
  const ICONES = {
    luz:       '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z"/>',
    buraco:    '<path d="M3 17h18M5 17l2-6h10l2 6"/><ellipse cx="12" cy="14" rx="3" ry="1.2"/><path d="M8 7l1.5 1.5M16 7l-1.5 1.5M12 5v2"/>',
    saude:     '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
    limpeza:   '<path d="M6 7h12l-1 13H7L6 7ZM4 7h16M10 7V4h4v3M10 11v6M14 11v6"/>',
    arvore:    '<path d="M12 22v-7M12 15a5 5 0 0 0 4.6-7A5 5 0 0 0 7.4 8 5 5 0 0 0 12 15Z"/>',
    transito:  '<rect x="8" y="2" width="8" height="20" rx="3"/><circle cx="12" cy="7" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="17" r="1.5"/>',
    calcada:   '<circle cx="12" cy="4.5" r="1.8"/><path d="M12 7v6h4l2 6M12 10h4M9.5 11.5A5 5 0 1 0 15 19"/>',
    seguranca: '<path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
    educacao:  '<path d="M2 9l10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/>',
    outros:    '<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>'
  };

  /* ---------------- Montagem inicial a partir do config ---------------- */
  function montar() {
    const v = CFG.vereador;
    $("#cfg-nome").textContent = v.titulo || "Gabinete " + v.nome;
    $("#rod-nome").textContent = v.nome;
    $("#rod-cargo").textContent = v.cargo;
    $("#rod-insta").href = v.instagram;
    $("#btn-whats-gabinete").href = "https://wa.me/" + v.whatsappGabinete;

    // Foto do vereador (cai para as iniciais se o arquivo não existir)
    if (v.foto) {
      const img = new Image();
      img.alt = "";
      img.onload = () => { const a = $("#avatar"); a.innerHTML = ""; a.appendChild(img); };
      img.src = v.foto;
    }

    const sel = $("#bairro");
    [...CFG.bairros].sort((a, b) => a.localeCompare(b, "pt-BR")).forEach((b) => sel.add(new Option(b, b)));
    sel.add(new Option("Outro (não está na lista)", "__outro"));

    const wrap = $("#categorias");
    CFG.categorias.forEach((c, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", "false");
      b.tabIndex = i === 0 ? 0 : -1;
      b.dataset.valor = c.id;
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[c.icone] || ICONES.outros}</svg><span>${c.nome}</span>`;
      wrap.appendChild(b);
    });
  }

  /* ---------------- Máscara e validação do WhatsApp ---------------- */
  function soDigitos(v) { return (v || "").replace(/\D/g, ""); }
  function mascaraTelefone(v) {
    let d = soDigitos(v);
    if (d.startsWith("55") && d.length > 11) d = d.slice(2); // colou com +55
    d = d.slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  const DDDS = new Set("11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split(" "));
  function celularValido(v) {
    const d = soDigitos(v);
    return d.length === 11 && DDDS.has(d.slice(0, 2)) && d[2] === "9" && !/^(\d)\1+$/.test(d.slice(2));
  }

  /* ---------------- Regras de validação ---------------- */
  const regras = {
    nome: (v) => {
      v = v.trim().replace(/\s+/g, " ");
      if (!v) return "Informe seu nome completo.";
      if (v.split(" ").length < 2 || v.length < 5) return "Digite nome e sobrenome.";
      if (/\d/.test(v)) return "O nome não deve conter números.";
      return "";
    },
    whatsapp: (v) => !soDigitos(v) ? "Informe seu WhatsApp." : celularValido(v) ? "" : "Número inválido. Use DDD + celular, ex.: (19) 99999-9999.",
    email: (v) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? "" : "E-mail inválido.",
    bairro: (v) => v ? "" : "Selecione o bairro.",
    bairro_outro: (v) => $("#bairro").value !== "__outro" || v.trim().length >= 3 ? "" : "Informe o nome do bairro.",
    logradouro: (v) => v.trim().length >= 5 ? "" : "Informe a rua ou um ponto de referência.",
    categoria: () => categoriaSelecionada ? "" : "Escolha uma categoria.",
    descricao: (v) => v.trim().length >= 20 ? "" : `Conte um pouco mais (mínimo 20 caracteres, faltam ${20 - v.trim().length}).`,
    lgpd: () => $("#lgpd").checked ? "" : "É preciso autorizar o uso dos dados para enviarmos a demanda."
  };

  function campoDe(nome) {
    const el = nome === "categoria" ? $("#categorias") : form.elements[nome];
    return el ? el.closest(".campo, .consentimento") : null;
  }
  function validar(nome, mostrar = true) {
    const el = form.elements[nome];
    const msg = regras[nome](el && el.value !== undefined ? el.value : "");
    const box = campoDe(nome);
    if (mostrar && box) {
      box.classList.toggle("invalido", !!msg);
      box.classList.toggle("valido", !msg && nome !== "lgpd");
      const p = form.querySelector(`[data-erro-para="${nome}"]`);
      if (p) p.textContent = msg;
      if (el && el.setAttribute) el.setAttribute("aria-invalid", msg ? "true" : "false");
    }
    return !msg;
  }

  function atualizarProgresso() {
    const nomes = ["nome", "whatsapp", "bairro", "logradouro", "categoria", "descricao", "lgpd"];
    const ok = nomes.filter((n) => !regras[n](form.elements[n] ? form.elements[n].value : "")).length;
    $("#barra").style.width = Math.round((ok / nomes.length) * 100) + "%";
  }

  /* ---------------- Foto: validação + compressão no navegador ---------------- */
  async function processarFoto(file) {
    const erro = form.querySelector('[data-erro-para="foto"]');
    erro.textContent = "";
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(heic|heif)$/i.test(file.name)) {
      erro.textContent = "Envie um arquivo de imagem."; return limparFoto();
    }
    if (file.size > CFG.foto.maxMB * 1024 * 1024) {
      erro.textContent = `A foto passa de ${CFG.foto.maxMB} MB. Escolha outra.`; return limparFoto();
    }
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const escala = Math.min(1, CFG.foto.larguraMaxima / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * escala);
      c.height = Math.round(bmp.height * escala);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      fotoProcessada = await new Promise((r) => c.toBlob(r, "image/jpeg", CFG.foto.qualidadeJpeg));
    } catch (_) {
      fotoProcessada = file; // navegador não decodifica (ex.: HEIC) — envia original, servidor converte
    }
    $("#preview-img").src = URL.createObjectURL(fotoProcessada);
    $("#upload-vazio").hidden = true;
    $("#upload-preview").hidden = false;
  }
  function limparFoto() {
    fotoProcessada = null;
    $("#foto").value = "";
    $("#upload-vazio").hidden = false;
    $("#upload-preview").hidden = true;
  }

  /* ---------------- Geolocalização (opcional) ---------------- */
  function usarLocalizacao() {
    const st = $("#status-localizacao");
    if (!("geolocation" in navigator)) { st.textContent = "Seu navegador não permite localização."; return; }
    st.textContent = "Obtendo localização…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        $("#latitude").value = pos.coords.latitude.toFixed(6);
        $("#longitude").value = pos.coords.longitude.toFixed(6);
        st.textContent = "📍 Localização anexada (precisão de ~" + Math.round(pos.coords.accuracy) + " m). Informe também a rua ou referência.";
      },
      () => { st.textContent = "Não foi possível obter a localização. Digite o endereço."; },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  /* ---------------- Envio ---------------- */
  function protocoloLocal() {
    // Usado só no modo demonstração. O protocolo oficial é gerado pelo servidor.
    const ano = new Date().getFullYear();
    const n = String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
    return `LL-${ano}-${n}`;
  }

  async function enviar(e) {
    e.preventDefault();
    $("#erro-geral").textContent = "";
    if (form.elements.website.value) return; // bot

    const ordem = ["nome", "whatsapp", "email", "bairro", "bairro_outro", "logradouro", "categoria", "descricao", "lgpd"];
    const invalidos = ordem.filter((n) => !validar(n));
    if (invalidos.length) {
      const primeiro = invalidos[0] === "categoria" ? $("#categorias .chip") : form.elements[invalidos[0]];
      campoDe(invalidos[0]).scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => primeiro && primeiro.focus({ preventScroll: true }), 300);
      return;
    }

    const fd = new FormData();
    const nome = form.elements.nome.value.trim().replace(/\s+/g, " ");
    fd.append("nome", nome);
    fd.append("whatsapp", "55" + soDigitos(form.elements.whatsapp.value));
    fd.append("email", form.elements.email.value.trim());
    const bairro = form.elements.bairro.value === "__outro" ? form.elements.bairro_outro.value.trim() : form.elements.bairro.value;
    fd.append("bairro", bairro);
    fd.append("bairro_fora_lista", form.elements.bairro.value === "__outro" ? "1" : "0");
    fd.append("logradouro", form.elements.logradouro.value.trim());
    fd.append("categoria", categoriaSelecionada);
    fd.append("descricao", form.elements.descricao.value.trim());
    fd.append("latitude", form.elements.latitude.value);
    fd.append("longitude", form.elements.longitude.value);
    fd.append("consentimento_lgpd", "1");
    if (fotoProcessada) fd.append("foto", fotoProcessada, "foto.jpg");

    const btn = $("#btn-enviar");
    btn.disabled = true; btn.classList.add("carregando");
    btn.querySelector(".btn-enviar__txt").textContent = "Enviando…";

    let protocolo = null, demo = false, whatsEnviado = true;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      const r = await fetch(CFG.apiUrl, { method: "POST", body: fd, signal: ctrl.signal });
      clearTimeout(t);
      if ([404, 405, 501, 502, 503].includes(r.status) && CFG.modoDemonstracaoSeApiIndisponivel) throw new Error("API_INDISPONIVEL");
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.erro || "Não foi possível enviar agora. Tente novamente em instantes.");
      protocolo = data.protocolo;
      whatsEnviado = data.notificacao_whatsapp !== false;
    } catch (err) {
      const offline = err.name === "AbortError" || err.message === "API_INDISPONIVEL" || err instanceof TypeError;
      if (offline && CFG.modoDemonstracaoSeApiIndisponivel) {
        protocolo = protocoloLocal(); demo = true;
      } else {
        $("#erro-geral").textContent = offline
          ? "Sem conexão com o servidor. Verifique sua internet e tente de novo. Seus dados continuam preenchidos."
          : err.message;
        btn.disabled = false; btn.classList.remove("carregando");
        btn.querySelector(".btn-enviar__txt").textContent = "Enviar demanda";
        return;
      }
    }
    mostrarSucesso(nome.split(" ")[0], protocolo, demo, whatsEnviado);
  }

  function mostrarSucesso(primeiroNome, protocolo, demo, whatsEnviado) {
    form.hidden = true;
    $("#sucesso-nome").textContent = primeiroNome;
    $("#protocolo-numero").textContent = protocolo;
    $("#aviso-demo").hidden = !demo;
    $("#link-acompanhar").hidden = demo;
    $("#link-acompanhar").href = "acompanhar.html?p=" + encodeURIComponent(protocolo);
    $("#sucesso-whats").textContent = demo ? "" : whatsEnviado
      ? "Enviamos uma confirmação com este protocolo para o seu WhatsApp."
      : "Guarde este número. Você também pode informá-lo ao gabinete pelo WhatsApp.";
    const s = $("#sucesso");
    s.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    s.focus({ preventScroll: true });
    try { sessionStorage.setItem("ultimoProtocolo", protocolo); } catch (_) {}
  }

  function novaDemanda() {
    form.reset();
    categoriaSelecionada = "";
    document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", "false"));
    document.querySelectorAll(".valido,.invalido").forEach((el) => el.classList.remove("valido", "invalido"));
    limparFoto();
    $("#campo-bairro-outro").hidden = true;
    $("#status-localizacao").textContent = "";
    $("#contador").textContent = "0";
    const btn = $("#btn-enviar");
    btn.disabled = false; btn.classList.remove("carregando");
    btn.querySelector(".btn-enviar__txt").textContent = "Enviar demanda";
    $("#sucesso").hidden = true;
    form.hidden = false;
    atualizarProgresso();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------------- Eventos ---------------- */
  function ligar() {
    const tel = form.elements.whatsapp;
    tel.addEventListener("input", () => {
      tel.value = mascaraTelefone(tel.value);
      if (soDigitos(tel.value).length === 11) validar("whatsapp");
    });

    ["nome", "whatsapp", "email", "bairro_outro", "logradouro", "descricao"].forEach((n) =>
      form.elements[n].addEventListener("blur", () => form.elements[n].value && validar(n)));
    form.addEventListener("input", (e) => {
      const n = e.target.name;
      if (n && regras[n] && campoDe(n) && campoDe(n).classList.contains("invalido")) validar(n);
      atualizarProgresso();
    });

    form.elements.bairro.addEventListener("change", (e) => {
      const outro = e.target.value === "__outro";
      $("#campo-bairro-outro").hidden = !outro;
      validar("bairro");
      if (outro) form.elements.bairro_outro.focus();
    });

    const desc = form.elements.descricao;
    desc.addEventListener("input", () => { $("#contador").textContent = desc.value.length; });

    // Chips (radiogroup acessível com setas)
    const grupo = $("#categorias");
    const selecionar = (chip) => {
      grupo.querySelectorAll(".chip").forEach((c) => { c.setAttribute("aria-checked", "false"); c.tabIndex = -1; });
      chip.setAttribute("aria-checked", "true"); chip.tabIndex = 0;
      categoriaSelecionada = chip.dataset.valor;
      validar("categoria"); atualizarProgresso();
    };
    grupo.addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) selecionar(c); });
    grupo.addEventListener("keydown", (e) => {
      const chips = [...grupo.querySelectorAll(".chip")];
      const i = chips.indexOf(document.activeElement);
      if (i < 0) return;
      const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (passo) { e.preventDefault(); const n = chips[(i + passo + chips.length) % chips.length]; n.focus(); selecionar(n); }
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); selecionar(chips[i]); }
    });

    $("#foto").addEventListener("change", (e) => processarFoto(e.target.files[0]));
    $("#btn-remover-foto").addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); limparFoto(); });
    $("#btn-localizacao").addEventListener("click", usarLocalizacao);
    $("#lgpd").addEventListener("change", () => { validar("lgpd"); atualizarProgresso(); });

    $("#link-privacidade").addEventListener("click", (e) => { e.preventDefault(); $("#privacidade").hidden = false; $("#privacidade").scrollIntoView({ behavior: "smooth" }); });
    $("#btn-fechar-priv").addEventListener("click", () => { $("#privacidade").hidden = true; });

    $("#btn-copiar").addEventListener("click", async () => {
      const b = $("#btn-copiar");
      try { await navigator.clipboard.writeText($("#protocolo-numero").textContent); b.textContent = "Copiado ✓"; }
      catch (_) { b.textContent = "Selecione e copie"; }
      setTimeout(() => (b.textContent = "Copiar"), 2000);
    });
    $("#btn-nova").addEventListener("click", novaDemanda);

    form.addEventListener("submit", enviar);
  }

  montar();
  ligar();
  atualizarProgresso();
})();

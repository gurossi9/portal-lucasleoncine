(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const form = $("#consulta");
  const params = new URLSearchParams(location.search);
  if (params.get("p")) $("#protocolo").value = params.get("p").toUpperCase();
  (params.get("p") ? $("#final") : $("#protocolo")).focus();

  $("#final").addEventListener("input", (e) => (e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4)));

  const data = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const protocolo = $("#protocolo").value.trim().toUpperCase();
    const final = $("#final").value.trim();
    const erro = $("#erro"); erro.textContent = "";
    if (!/^[A-Z]{1,4}-\d{4}-\d{6}$/.test(protocolo)) { erro.textContent = "Confira o número do protocolo (ex.: LL-2026-000123)."; return; }
    if (!/^\d{4}$/.test(final)) { erro.textContent = "Informe os 4 últimos dígitos do WhatsApp."; return; }
    const btn = form.querySelector(".btn-enviar"); btn.disabled = true; btn.classList.add("carregando");
    try {
      const r = await fetch(`/api/protocolo/${encodeURIComponent(protocolo)}?final=${final}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || "Não foi possível consultar agora.");
      $("#r-protocolo").textContent = d.protocolo;
      $("#r-status").textContent = d.status;
      const dl = $("#r-dados"); dl.innerHTML = "";
      [["Categoria", d.categoria], ["Bairro", d.bairro], ["Registrada em", data(d.criado_em)], ["Indicação nº", d.numero_indicacao]]
        .filter(([, v]) => v).forEach(([k, v]) => { const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dd.textContent = v; dl.append(dt, dd); });
      const ol = $("#r-historico"); ol.innerHTML = "";
      d.historico.forEach((h) => { const li = document.createElement("li"); const b = document.createElement("strong"); b.textContent = h.status; const s = document.createElement("small"); s.textContent = data(h.data); li.append(b, s); ol.append(li); });
      $("#resultado").hidden = false;
      $("#resultado").scrollIntoView({ behavior: "smooth" });
    } catch (err) { erro.textContent = err.message; }
    finally { btn.disabled = false; btn.classList.remove("carregando"); }
  });
})();

#!/usr/bin/env python3
"""
Preenche um modelo .docx trocando marcadores {chave} pelos valores de um JSON,
preservando a formatação original (inclusive quando o Word quebra o marcador
em vários "runs"). Funciona no corpo, em tabelas, cabeçalhos e rodapés.

Marcadores especiais:
  {corpo} (ou qualquer marcador sozinho no parágrafo com valor de várias linhas)
          → cada linha vira um parágrafo com a mesma formatação.
  {imagens} → o parágrafo recebe as imagens da lista "imagens" do JSON, lado a lado
          (mapa + foto), na mesma altura. Sem imagens, entra o aviso
          "[INSERIR IMAGENS: mapa de localização e foto do local]".

Trechos entre colchetes em MAIÚSCULAS (ex.: "[COMPLETAR LOCALIZAÇÃO EXATA]") ficam
grifados em amarelo para a assessoria conferir antes de imprimir.

JSON (além dos textos):
  "imagens": [{"caminho": "/abs/mapa.png"}, {"caminho": "/abs/foto.jpg"}]
  "legenda_imagens": "Mapa: © colaboradores do OpenStreetMap"   (opcional)

Uso: python3 preencher_indicacao.py modelo.docx saida.docx dados.json
Saída (stdout): JSON {"ok": true, "nao_encontrados": [...], "sem_valor": [...], "imagens": n}
"""
import copy
import json
import os
import re
import sys
import tempfile

from docx import Document
from docx.enum.text import WD_COLOR_INDEX
from docx.shared import Cm, Pt
from docx.text.paragraph import Paragraph

MARCADOR = re.compile(r"\{([a-z_][a-z0-9_]*)\}")
AVISO = re.compile(r"\[[A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 :/,.\-–]*\]")
AVISO_SEM_IMAGEM = "[INSERIR IMAGENS: MAPA DE LOCALIZAÇÃO E FOTO DO LOCAL]"

ALTURA_CM = 7.0     # altura das imagens lado a lado (como nas Indicações de 2026)
LARGURA_UTIL_CM = 15.0  # 16 cm úteis menos folga para o espaço entre as imagens


def paragrafos(doc):
    """Todos os parágrafos do documento, incluindo tabelas aninhadas, cabeçalhos e rodapés."""
    def de_container(c):
        for p in c.paragraphs:
            yield p
        for t in getattr(c, "tables", []):
            for linha in t.rows:
                for cel in linha.cells:
                    yield from de_container(cel)

    yield from de_container(doc)
    for s in doc.sections:
        for parte in (s.header, s.footer, s.first_page_header, s.first_page_footer, s.even_page_header, s.even_page_footer):
            if parte is not None and not parte.is_linked_to_previous:
                yield from de_container(parte)


def substituir_no_paragrafo(p, dados, usados, sem_valor):
    runs = p.runs
    if not runs:
        return
    texto = "".join(r.text for r in runs)
    if "{" not in texto:
        return
    # processa da direita para a esquerda para não invalidar posições
    for m in reversed(list(MARCADOR.finditer(texto))):
        chave = m.group(1)
        if chave not in dados or isinstance(dados[chave], (list, dict)):
            sem_valor.add(chave)
            continue
        usados.add(chave)
        valor = "" if dados[chave] is None else str(dados[chave])
        ini, fim = m.span()
        pos = 0
        primeiro = True
        for r in runs:
            t = r.text
            r_ini, r_fim = pos, pos + len(t)
            pos = r_fim
            if r_fim <= ini or r_ini >= fim:
                continue
            a = max(ini, r_ini) - r_ini
            b = min(fim, r_fim) - r_ini
            if primeiro:
                r.text = t[:a] + valor + t[b:]   # \n vira quebra de linha no python-docx
                primeiro = False
            else:
                r.text = t[:a] + t[b:]
        texto = "".join(r.text for r in runs)


def expandir_paragrafos(doc, dados, usados):
    """Parágrafo que contém só um marcador cujo valor tem várias linhas vira
    vários parágrafos com a mesma formatação (recuo, alinhamento, fonte)."""
    for p in list(paragrafos(doc)):
        m = MARCADOR.fullmatch(p.text.strip())
        if not m or m.group(1) not in dados or isinstance(dados[m.group(1)], (list, dict)):
            continue
        linhas = [l.strip() for l in str(dados[m.group(1)] or "").split("\n") if l.strip()]
        if len(linhas) < 2:
            continue
        usados.add(m.group(1))
        atual = p._p
        modelos = []
        for _ in linhas[1:]:
            novo = copy.deepcopy(p._p)
            atual.addnext(novo)
            atual = novo
            modelos.append(novo)
        for elem, texto in zip([p._p] + modelos, linhas):
            par = Paragraph(elem, p._parent)
            runs = par.runs
            runs[0].text = texto
            for r in runs[1:]:
                r.text = ""


def preparar_imagem(caminho, pasta_tmp):
    """Corrige a rotação da foto do celular, reduz o tamanho e devolve (arquivo, altura/largura)."""
    from PIL import Image, ImageOps
    with Image.open(caminho) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "L"):
            fundo = Image.new("RGB", im.size, "white")
            fundo.paste(im, mask=im.getchannel("A") if "A" in im.getbands() else None)
            im = fundo
        im.thumbnail((1600, 1600))
        destino = os.path.join(pasta_tmp, f"img{len(os.listdir(pasta_tmp))}.jpg")
        im.save(destino, "JPEG", quality=85)
        return destino, im.height / im.width


def inserir_imagens(doc, dados, usados):
    lista = dados.get("imagens") or []
    alvo = next((p for p in paragrafos(doc) if p.text.strip() == "{imagens}"), None)
    if alvo is None:
        return 0
    usados.add("imagens")
    for r in alvo.runs[1:]:
        r.text = ""
    base = alvo.runs[0]
    base.text = ""
    preparadas = []
    with tempfile.TemporaryDirectory() as tmp:
        for item in lista:
            caminho = item.get("caminho") if isinstance(item, dict) else item
            try:
                preparadas.append(preparar_imagem(caminho, tmp))
            except Exception as e:  # HEIC sem suporte, arquivo corrompido etc.
                print(f"imagem ignorada ({caminho}): {e}", file=sys.stderr)
        if not preparadas:
            base.text = AVISO_SEM_IMAGEM
            return 0
        # todas na mesma altura; se não couberem na largura útil, diminui
        larguras = [ALTURA_CM / prop for _, prop in preparadas]
        espaco = 0.8 * (len(preparadas) - 1)
        fator = min(1.0, (LARGURA_UTIL_CM - espaco) / sum(larguras))
        for i, (arq, prop) in enumerate(preparadas):
            if i:
                alvo.add_run("   ")
            alvo.add_run().add_picture(arq, height=Cm(ALTURA_CM * fator))
        legenda = dados.get("legenda_imagens")
        if legenda:
            nova = copy.deepcopy(alvo._p)
            for d in nova.xpath(".//w:r"):
                nova.remove(d)
            alvo._p.addnext(nova)
            p = Paragraph(nova, alvo._parent)
            r = p.add_run(legenda)
            r.font.size = Pt(7)
            r.italic = True
        return len(preparadas)


def grifar_avisos(doc):
    """Grifa em amarelo trechos como [COMPLETAR LOCALIZAÇÃO EXATA]."""
    for p in paragrafos(doc):
        for r in list(p.runs):
            t = r.text
            if not AVISO.search(t):
                continue
            partes = []
            ultimo = 0
            for m in AVISO.finditer(t):
                partes.append((t[ultimo:m.start()], False))
                partes.append((m.group(0), True))
                ultimo = m.end()
            partes.append((t[ultimo:], False))
            atual = r._r
            r.text = partes[0][0]
            for texto, grifo in partes[1:]:
                if not texto:
                    continue
                novo = copy.deepcopy(r._r)
                atual.addnext(novo)
                atual = novo
                from docx.text.run import Run
                nr = Run(novo, p)
                nr.text = texto
                if grifo:
                    nr.font.highlight_color = WD_COLOR_INDEX.YELLOW
                    nr.bold = True


def main():
    modelo, saida, arq_dados = sys.argv[1:4]
    with open(arq_dados, encoding="utf-8") as f:
        dados = json.load(f)
    doc = Document(modelo)
    usados, sem_valor = set(), set()
    n_img = inserir_imagens(doc, dados, usados)
    expandir_paragrafos(doc, dados, usados)
    for p in paragrafos(doc):
        substituir_no_paragrafo(p, dados, usados, sem_valor)
    grifar_avisos(doc)
    doc.core_properties.title = dados.get("assunto") or f"Indicação - {dados.get('protocolo', '')}"
    doc.core_properties.subject = dados.get("ementa", "")
    doc.save(saida)
    print(json.dumps({"ok": True, "nao_encontrados": sorted(set(dados) - usados - {"legenda_imagens"}),
                      "sem_valor": sorted(sem_valor), "imagens": n_img}))


if __name__ == "__main__":
    main()

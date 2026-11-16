#!/usr/bin/env python3
"""
Gera o MODELO da Indicação (templates/indicacao.docx) no padrão oficial do
gabinete do Vereador Lucas Leoncine, copiado das Indicações protocoladas em 2026:

  • folha A4, margens 5 cm (topo) / 2,5 cm, Times New Roman 12, entrelinha 1,15;
  • cabeçalho: brasão da Câmara à esquerda + "Câmara Municipal de Americana /
    Estado de São Paulo" centralizados; brasão grande em marca-d'água no meio da folha;
  • rodapé: endereço da Câmara e site;
  • corpo: "Autor: LUCAS LEONCINE" e a ementa recuados 10 cm, "Senhor Presidente, /
    Senhores Vereadores,", texto, imagens (mapa + foto), fecho padrão,
    "Plenário Dr. Antônio A. Lobo, em …" e o espaço da assinatura.

Marcadores preenchidos por scripts/preencher_indicacao.py (podem ser usados em
qualquer .docx, se o gabinete quiser trocar o modelo):

  {autor} {ementa} {corpo} {imagens} {data_extenso} {cargo_maiusculo} {vereador}
  {vereador_maiusculo} {cargo} {camara} {bairro} {logradouro} {categoria}
  {protocolo} {numero} {ano} {secretaria} {assunto}

  {corpo}   cada linha vira um parágrafo com a mesma formatação;
  {imagens} parágrafo trocado pelo mapa e pela foto do local, lado a lado.

Uso:
  python3 gerar_modelo_indicacao.py templates/indicacao.docx \\
      [--brasao templates/brasao-camara.png] [--marca-dagua templates/marca-dagua-camara.png] \\
      [--assinatura assinatura.png]

Sem --brasao/--marca-dagua, procura os arquivos acima na pasta do modelo.
--assinatura é opcional: sem ela fica o espaço em branco para assinar à mão.
"""
import argparse
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import parse_xml
from docx.oxml.ns import qn
from docx.shared import Cm, Emu, Pt

FONTE = "Times New Roman"
FECHO = ("Assim, sendo procedente o pedido, solicito providências para que, atendidas as formalidades de praxe, "
         "seja oficiado ao Senhor Prefeito Municipal, para que junto ao setor competente da Prefeitura seja "
         "atendida a indicação. É a Indicação.")
ENDERECO = "Avenida Monsenhor Bruno Nardini, nº 1835 – Bairro Jardim Miriam – CEP 13.469-070 – Americana/SP"
SITE = "www.camara-americana.sp.gov.br"


def estilo_base(doc):
    st = doc.styles["Normal"]
    st.font.name = FONTE
    st.font.size = Pt(12)
    rpr = st.element.get_or_add_rPr()
    rf = rpr.find(qn("w:rFonts"))
    for k in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rf.set(qn(k), FONTE)
    lang = parse_xml('<w:lang xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:val="pt-BR" w:eastAsia="pt-BR"/>')
    rpr.append(lang)
    pf = st.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.line_spacing = 1.15
    for nome in ("Header", "Footer"):
        try:
            s = doc.styles[nome]
            s.font.name = FONTE
        except KeyError:
            pass


def par(container, texto="", *, negrito=False, alin=WD_ALIGN_PARAGRAPH.JUSTIFY, primeira=None, esquerda=None,
        tamanho=None, simples=False):
    p = container.add_paragraph()
    p.alignment = alin
    f = p.paragraph_format
    if primeira is not None:
        f.first_line_indent = Cm(primeira)
    if esquerda is not None:
        f.left_indent = Cm(esquerda)
    if simples:
        f.line_spacing_rule = WD_LINE_SPACING.SINGLE
    if texto:
        r = p.add_run(texto)
        r.bold = negrito
        if tamanho:
            r.font.size = Pt(tamanho)
    return p


def ancorar(run, caminho: Path, largura_cm, altura_cm, x_cm, y_cm, *, rel_h="page", rel_v="page", atras=True, id_=50):
    """Insere a imagem como objeto flutuante (atrás do texto) em posição fixa."""
    inline = run.add_picture(str(caminho), width=Cm(largura_cm), height=Cm(altura_cm))._inline
    rid = inline.graphic.graphicData.pic.blipFill.blip.embed
    cx, cy = Emu(Cm(largura_cm)), Emu(Cm(altura_cm))
    x, y = int(Cm(x_cm)), int(Cm(y_cm))
    xml = f"""
<wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="{id_}" behindDoc="{1 if atras else 0}"
  locked="1" layoutInCell="1" allowOverlap="1">
  <wp:simplePos x="0" y="0"/>
  <wp:positionH relativeFrom="{rel_h}"><wp:posOffset>{x}</wp:posOffset></wp:positionH>
  <wp:positionV relativeFrom="{rel_v}"><wp:posOffset>{y}</wp:posOffset></wp:positionV>
  <wp:extent cx="{cx}" cy="{cy}"/>
  <wp:effectExtent l="0" t="0" r="0" b="0"/>
  <wp:wrapNone/>
  <wp:docPr id="{id_}" name="Imagem {id_}"/>
  <wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
  <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
    <pic:pic><pic:nvPicPr><pic:cNvPr id="{id_}" name="{caminho.name}"/><pic:cNvPicPr/></pic:nvPicPr>
      <pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
      <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
    </pic:pic></a:graphicData></a:graphic>
</wp:anchor>"""
    drawing = inline.getparent()
    drawing.replace(inline, parse_xml(xml))


def proporcao(caminho: Path):
    from PIL import Image
    with Image.open(caminho) as im:
        return im.height / im.width


def montar(saida: Path, brasao: Path, marca: Path, assinatura: Path | None):
    doc = Document()
    estilo_base(doc)

    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.top_margin, sec.bottom_margin = Cm(5.0), Cm(2.5)
    sec.left_margin, sec.right_margin = Cm(2.5), Cm(2.5)
    sec.header_distance, sec.footer_distance = Cm(1.25), Cm(1.25)

    # ---------- Cabeçalho ----------
    cab = sec.header
    cab.is_linked_to_previous = False
    p = cab.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    p.paragraph_format.space_before = Pt(10)
    # brasão pequeno à esquerda (mesma posição do modelo oficial)
    alt_b = 2.6
    ancorar(p.add_run(), brasao, alt_b / proporcao(brasao), alt_b, 1.4, 0.75, atras=False, id_=51)
    # brasão grande em marca-d'água, centralizado na folha
    larg_m = 7.6
    alt_m = larg_m * proporcao(marca)
    ancorar(p.add_run(), marca, larg_m, alt_m, (21.0 - larg_m) / 2, 10.5, atras=True, id_=52)
    r = p.add_run("Câmara Municipal de Americana")
    r.bold = True
    r.font.size = Pt(14)
    p2 = cab.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p2.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    r = p2.add_run("Estado de São Paulo")
    r.bold = True
    r.font.size = Pt(12)

    # ---------- Rodapé ----------
    rod = sec.footer
    rp = rod.paragraphs[0]
    rp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    rp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    rp.add_run(ENDERECO).font.size = Pt(9)
    rp2 = rod.add_paragraph()
    rp2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    rp2.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    rp2.add_run(SITE).font.size = Pt(9)

    # ---------- Corpo ----------
    par(doc, "Autor: {autor}", negrito=True, esquerda=10)
    par(doc, "{ementa}", esquerda=10)
    par(doc)
    par(doc, "Senhor Presidente,", primeira=1)
    par(doc, "Senhores Vereadores,", primeira=1)
    par(doc)
    par(doc, "{corpo}", primeira=1)
    par(doc)
    par(doc, "{imagens}", alin=WD_ALIGN_PARAGRAPH.CENTER, simples=True)
    par(doc)
    par(doc, FECHO, primeira=1)
    par(doc)
    par(doc, "Plenário Dr. Antônio A. Lobo, em {data_extenso}.", alin=WD_ALIGN_PARAGRAPH.CENTER)

    if assinatura and assinatura.exists():
        p = par(doc, alin=WD_ALIGN_PARAGRAPH.CENTER, simples=True)
        p.paragraph_format.space_before = Pt(12)
        alt = 2.4
        p.add_run().add_picture(str(assinatura), height=Cm(alt))
    else:
        for _ in range(4):  # espaço para a assinatura à mão
            par(doc, alin=WD_ALIGN_PARAGRAPH.CENTER)
    par(doc, "{cargo_maiusculo}", negrito=True, alin=WD_ALIGN_PARAGRAPH.CENTER, simples=True)
    par(doc, "{vereador}", alin=WD_ALIGN_PARAGRAPH.CENTER, simples=True)

    cp = doc.core_properties
    cp.title = "Indicação"
    cp.author = "Gabinete do Vereador Lucas Leoncine"
    cp.language = "pt-BR"
    saida.parent.mkdir(parents=True, exist_ok=True)
    doc.save(saida)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("saida", nargs="?", default="templates/indicacao.docx")
    ap.add_argument("--brasao")
    ap.add_argument("--marca-dagua")
    ap.add_argument("--assinatura")
    a = ap.parse_args()
    saida = Path(a.saida)
    pasta = saida.parent
    brasao = Path(a.brasao) if a.brasao else pasta / "brasao-camara.png"
    marca = Path(a.marca_dagua) if a.marca_dagua else pasta / "marca-dagua-camara.png"
    for arq in (brasao, marca):
        if not arq.exists():
            raise SystemExit(f"Imagem não encontrada: {arq}. Copie brasao-camara.png e marca-dagua-camara.png para {pasta}.")
    montar(saida, brasao, marca, Path(a.assinatura) if a.assinatura else None)
    print(f"Modelo gerado em {saida}")

#!/usr/bin/env python3
"""
Monta a imagem do "mapa de localização" da Indicação: recorte do OpenStreetMap
centrado no local, com um marcador vermelho e a atribuição exigida pela licença.

Se a demanda não tiver coordenadas (o munícipe não usou "Usar minha localização"),
procura o endereço no Nominatim (geocodificador do OpenStreetMap), limitado a
Americana-SP. Sem internet ou sem resultado, termina com código 2 e a Indicação
sai só com a foto.

Uso:
  python3 mapa_local.py saida.png --lat -22.739 --lon -47.331
  python3 mapa_local.py saida.png --endereco "Rua Pernambuco, 540, Chácara Machadinho"

Variáveis de ambiente (opcionais):
  MAPA_TILES_URL      padrão https://tile.openstreetmap.org/{z}/{x}/{y}.png
  MAPA_GEOCODER_URL   padrão https://nominatim.openstreetmap.org/search
  MAPA_CONTATO        e-mail do gabinete (a política do OpenStreetMap pede um contato)
Saída (stdout): JSON {"ok": true, "lat": ..., "lon": ..., "origem": "gps"|"endereco"}
"""
import argparse
import io
import json
import math
import os
import sys
import urllib.parse
import urllib.request

from PIL import Image, ImageDraw, ImageFont

# Padrão (16/11/2026, pedido do gabinete): imagem de SATÉLITE do Esri World Imagery,
# com a camada de ruas e nomes de ruas do Esri por cima.
# Para voltar ao mapa de ruas: MAPA_TILES_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png,
# MAPA_ROTULOS_URL vazio e MAPA_CREDITO="© colaboradores do OpenStreetMap".
ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services"
TILES = os.environ.get("MAPA_TILES_URL") or f"{ESRI}/World_Imagery/MapServer/tile/{{z}}/{{y}}/{{x}}"
ROTULOS = os.environ.get("MAPA_ROTULOS_URL", f"{ESRI}/Reference/World_Transportation/MapServer/tile/{{z}}/{{y}}/{{x}}")
CREDITO = os.environ.get("MAPA_CREDITO") or "Imagem: Esri, Maxar, Earthstar Geographics"
GEOCODER = os.environ.get("MAPA_GEOCODER_URL") or "https://nominatim.openstreetmap.org/search"
CONTATO = os.environ.get("MAPA_CONTATO") or "gabinete"
UA = f"PortalDemandas-GabineteLucasLeoncine/1.0 ({CONTATO})"
# caixa de Americana-SP (com folga) para recusar resultados de outras cidades
LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = -22.86, -22.62, -47.45, -47.17
LARGURA, ALTURA = 900, 900
ZOOM = int(os.environ.get("MAPA_ZOOM") or 18)


def baixar(url, timeout=12):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "pt-BR"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def geocodificar(endereco):
    q = urllib.parse.urlencode({"q": f"{endereco}, Americana, SP, Brasil", "format": "jsonv2", "limit": 1,
                                "countrycodes": "br", "viewbox": f"{LON_MIN},{LAT_MAX},{LON_MAX},{LAT_MIN}", "bounded": 1})
    res = json.loads(baixar(f"{GEOCODER}?{q}"))
    if not res:
        return None
    lat, lon = float(res[0]["lat"]), float(res[0]["lon"])
    if not (LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX):
        return None
    return lat, lon


def para_pixel(lat, lon, z):
    n = 256 * 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def montar(lat, lon, saida):
    cx, cy = para_pixel(lat, lon, ZOOM)
    x0, y0 = cx - LARGURA / 2, cy - ALTURA / 2
    tx0, ty0 = int(x0 // 256), int(y0 // 256)
    tx1, ty1 = int((x0 + LARGURA) // 256), int((y0 + ALTURA) // 256)
    tela = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256), "#e5e3df")
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            pos = ((tx - tx0) * 256, (ty - ty0) * 256)
            tile = Image.open(io.BytesIO(baixar(TILES.format(z=ZOOM, x=tx, y=ty)))).convert("RGB")
            tela.paste(tile, pos)
            if ROTULOS:  # ruas e nomes por cima do satélite (PNG transparente); falha aqui não impede o mapa
                try:
                    rot = Image.open(io.BytesIO(baixar(ROTULOS.format(z=ZOOM, x=tx, y=ty)))).convert("RGBA")
                    tela.paste(rot, pos, rot)
                except Exception:
                    pass
    ox, oy = int(x0 - tx0 * 256), int(y0 - ty0 * 256)
    mapa = tela.crop((ox, oy, ox + LARGURA, oy + ALTURA))

    d = ImageDraw.Draw(mapa)
    px, py = LARGURA / 2, ALTURA / 2
    # marcador (gota vermelha com contorno branco)
    r = 26
    d.ellipse((px - 60, py - 60, px + 60, py + 60), outline=(220, 38, 38), width=5)
    d.polygon([(px - r * 0.75, py - r * 1.4), (px + r * 0.75, py - r * 1.4), (px, py)], fill=(220, 38, 38), outline="white")
    d.ellipse((px - r, py - r * 2.6, px + r, py - r * 0.6), fill=(220, 38, 38), outline="white", width=4)
    d.ellipse((px - 9, py - r * 1.6 - 9, px + 9, py - r * 1.6 + 9), fill="white")
    try:
        fonte = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    except OSError:
        fonte = ImageFont.load_default()
    txt = CREDITO
    w = d.textlength(txt, font=fonte)
    d.rectangle((LARGURA - w - 16, ALTURA - 30, LARGURA, ALTURA), fill=(255, 255, 255))
    d.text((LARGURA - w - 8, ALTURA - 27), txt, fill=(60, 60, 60), font=fonte)
    mapa.save(saida, "PNG", optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("saida")
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lon", type=float)
    ap.add_argument("--endereco")
    a = ap.parse_args()
    origem = "gps"
    lat, lon = a.lat, a.lon
    try:
        if lat is None or lon is None:
            origem = "endereco"
            achado = geocodificar(a.endereco or "")
            if not achado:
                print(json.dumps({"ok": False, "motivo": "endereço não localizado"}))
                sys.exit(2)
            lat, lon = achado
        montar(lat, lon, a.saida)
    except Exception as e:  # sem internet, servidor de mapas fora do ar etc.
        print(json.dumps({"ok": False, "motivo": str(e)[:200]}))
        sys.exit(2)
    print(json.dumps({"ok": True, "lat": lat, "lon": lon, "origem": origem}))


if __name__ == "__main__":
    main()

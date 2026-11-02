#!/usr/bin/env python3
"""Castelos da arena: art/source/castles/<id>_34.webp (fundo verde ou magenta, vista 3/4 do lado esquerdo)
-> web/img/castles/<id>.webp recortado + web/js/castles.js com âncora da sacada e região do parapeito.
O renderizador encaixa o ponto da sacada (bx, by) na posição do Barão da arena e escala por BALCONY."""
import os, json
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'source', 'castles')
OUT = os.path.join(ROOT, 'web', 'img', 'castles')
# medidas na imagem original (px): ponto do piso da sacada onde o Barão pisa; topo do parapeito na frente dele;
# largura útil da sacada (x0..x1 do parapeito) para escalar todos iguais
# (coordenadas na imagem recortada <id>_cut.png)
# foot: onde o Barão pisa; ground: base do castelo; rail: linha de cima do parapeito da frente (da esquerda para a direita)
# e railBottom: base do parapeito; gate: centro do portão (impactos)
SPOTS = {
    'royal_fortress': {'foot': (320, 846), 'ground': 1665, 'gate': (390, 1300),
                       'rail': [(120, 862), (480, 870), (560, 822), (640, 792), (690, 792)], 'railBottom': 990},
    'glacial_fortress': {'foot': (362, 566), 'ground': 1069, 'gate': (420, 840),
                         'rail': [(190, 570), (430, 576), (500, 546), (560, 522), (630, 526)], 'railBottom': 655},
    'draconic_castle': {'foot': (385, 573), 'ground': 1115, 'gate': (470, 860),
                        'rail': [(205, 572), (470, 582), (520, 522), (600, 508), (695, 540)], 'railBottom': 665},
    'sylvan_sanctuary': {'foot': (400, 660), 'ground': 1248, 'gate': (530, 960),
                         'rail': [(245, 652), (520, 662), (580, 620), (650, 598), (765, 630)], 'railBottom': 745},
    'shadow_necropolis': {'foot': (420, 640), 'ground': 1243, 'gate': (520, 950),
                          'rail': [(255, 622), (520, 642), (560, 572), (650, 556), (755, 592)], 'railBottom': 722},
}
# altura do pé do Barão até a base do castelo na arena (px da arena 1672x941): todos ficam com o mesmo porte
FOOT_TO_GROUND = 470
# arena (web/js/render.js ARENA): pé do Barão da esquerda e linha dos pés de cada rota
BARON = (178, 238 + 54)
LANES_Y = (322, 472, 652)
ARENA_H = 941
# frente reta do castelo da sacada para baixo (coordenadas da arena, lado esquerdo): passa por estes dois pontos
# e segue até a borda de baixo da tela; abaixo da sacada tudo que passar da linha é cortado e o vão vira muro
WALL_LINE = ((335, 472), (285, 652))
STONE = {'royal_fortress': (20, 1420, 180, 1560)}  # pedaço de parede lisa (imagem original) usado como textura do muro


def wall_front(im2, fx, fy, rail_bottom, stone):
    """Prolonga o castelo até a borda de baixo com a frente numa linha reta (sem pontas nem degraus para fora)."""
    (ax, ay), (bx, by) = WALL_LINE
    slope = (bx - ax) / (by - ay)
    xl = lambda yl: ax + (yl + fy - ay) * slope - fx  # x da linha (local) na altura yl (local)
    H = max(im2.height, ARENA_H - fy + 4)
    y0 = rail_bottom + 14
    out = Image.new('RGBA', (im2.width, H), (0, 0, 0, 0))
    # muro: textura de pedra repetida
    tile = stone
    tex = Image.new('RGBA', (im2.width, H))
    for ty in range(0, H, tile.height):
        for tx in range(0, im2.width, tile.width):
            tex.paste(tile, (tx, ty))
    poly = [(0, y0), (xl(y0), y0), (xl(H), H), (0, H)]
    m = Image.new('L', out.size, 0); ImageDraw.Draw(m).polygon(poly, fill=255)
    out.paste(tex, (0, 0), m)
    # sombra suave perto da quina (dá volume)
    sh = Image.new('L', out.size, 0); d = ImageDraw.Draw(sh)
    for k in range(18):
        d.line([(xl(y0) - k, y0), (xl(H) - k, H)], fill=int(90 * (1 - k / 18)), width=1)
    out.paste(Image.new('RGBA', out.size, (20, 14, 30, 255)), (0, 0), Image.fromarray((np.asarray(sh) * (np.asarray(m) > 0)).astype(np.uint8)))
    # castelo por cima, cortado na linha abaixo da sacada
    cm = Image.new('L', out.size, 0); dc = ImageDraw.Draw(cm)
    dc.rectangle((0, 0, im2.width, y0), fill=255); dc.polygon(poly, fill=255)
    layer = Image.new('RGBA', out.size, (0, 0, 0, 0)); layer.paste(im2, (0, 0))
    a = np.asarray(layer).copy(); a[..., 3] = (a[..., 3].astype(int) * (np.asarray(cm) > 0)).astype(np.uint8)
    out.alpha_composite(Image.fromarray(a))
    # acabamento dourado na quina, como as linhas das rotas
    d = ImageDraw.Draw(out)
    d.line([(xl(y0) + 2, y0), (xl(H) + 2, H)], fill=(60, 36, 10, 255), width=12)
    d.line([(xl(y0), y0), (xl(H), H)], fill=(222, 166, 52, 255), width=8)
    d.line([(xl(y0) - 2, y0), (xl(H) - 2, H)], fill=(255, 222, 120, 255), width=2)
    return out


def key(rgb):
    a = rgb.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    magenta = np.median(r[:20, :20]) > 200 and np.median(g[:20, :20]) < 60
    if magenta:
        k = np.minimum(r, b) - g
        alpha = np.clip((90 - k) / 60, 0, 1)
        cap = g + (np.maximum(r, b) - np.minimum(r, b))  # tira o reflexo rosa da borda
        lim = np.maximum(g, np.minimum(r, b) * (1 - (1 - alpha) * 0.9))
        r = np.where((alpha < 0.99) & (r > lim), lim, r); b = np.where((alpha < 0.99) & (b > lim), lim, b)
    else:
        mx = np.maximum(r, b); k = g - mx
        alpha = np.clip((90 - k) / 60, 0, 1)
        g = np.where((g > mx) & (alpha < 0.99), mx, g)
        g = np.where(g > mx, mx + (g - mx) * 0.25 * alpha, g)
    solid = alpha > 0.5
    lab, n = ndimage.label(solid)
    if n > 1:  # só o castelo (maior pedaço) e o que estiver perto dele
        sz = ndimage.sum(solid, lab, range(1, n + 1)); big = np.argmax(sz) + 1
        near = ndimage.binary_dilation(lab == big, iterations=25)
        keep = np.isin(lab, [i + 1 for i in range(n) if sz[i] > 400 or near[lab == i + 1].any()])
        alpha = np.where(keep | ~solid, alpha, 0)
    edge = solid & ~ndimage.binary_erosion(solid, iterations=1)
    alpha = np.where(edge, alpha * 0.5, alpha)
    return Image.fromarray(np.dstack([r, g, b, alpha * 255]).clip(0, 255).astype(np.uint8))


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for f in sorted(os.listdir(SRC)):
        # vista de lado (cortada pela borda esquerda) tem prioridade sobre a antiga vista 3/4
        if f.endswith('_side.webp'):
            cid = f[:-10]
        else:
            continue
        im = key(np.asarray(Image.open(os.path.join(SRC, f)).convert('RGB')))
        x0, y0, x1, y1 = im.getbbox()
        im = im.crop((x0, y0, x1, y1))
        sp = SPOTS.get(cid)
        if sp:
            s = FOOT_TO_GROUND / (sp['ground'] - sp['foot'][1])
            im2 = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
            P = lambda x, y: [round(x * s), round(y * s)]
            rail = [P(*q) for q in sp['rail']]
            rb = round(sp['railBottom'] * s)
            fx, fy = BARON[0] - round(sp['foot'][0] * s), BARON[1] - round(sp['foot'][1] * s)
            sx0, sy0, sx1, sy1 = STONE[cid]
            stone = im.crop((sx0 - x0, sy0 - y0, sx1 - x0, sy1 - y0)).resize((round((sx1 - sx0) * s), round((sy1 - sy0) * s)), Image.LANCZOS)
            im2 = wall_front(im2, fx, fy, rb, stone)
            im2.save(os.path.join(OUT, cid + '.webp'), 'WEBP', quality=88, method=6)
            # frente do castelo em cada rota (onde as tropas encostam): ponto mais à direita da arte na linha dos pés
            al = np.asarray(im2)[..., 3]
            front = []
            for ly in LANES_Y:
                y = ly - fy
                rows = al[max(0, y - 6):max(1, y + 6)] if 0 <= y < al.shape[0] else None
                xs = np.nonzero((rows > 128).any(axis=0))[0] if rows is not None else []
                front.append(int(fx + xs.max()) if len(xs) else None)
            meta[cid] = {'w': im2.width, 'h': im2.height, 'foot': P(*sp['foot']), 'gate': P(*sp['gate']),
                         'rail': rail + [[rail[-1][0], rb], [rail[0][0], rb]], 'front': front}
        print(cid, 'recorte', (x0, y0, x1, y1))
    with open(os.path.join(ROOT, 'web', 'js', 'castles.js'), 'w') as fh:
        fh.write('// gerado por tools/extract-castles.py\nwindow.BB = window.BB || {};\nBB.CASTLES_ART = ' + json.dumps(meta, indent=1) + ';\n')


if __name__ == '__main__':
    main()

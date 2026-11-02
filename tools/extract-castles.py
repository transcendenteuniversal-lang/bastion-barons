#!/usr/bin/env python3
"""Castelos da arena: art/source/castles/<id>_34.webp (fundo verde ou magenta, vista 3/4 do lado esquerdo)
-> web/img/castles/<id>.webp recortado + web/js/castles.js com âncora da sacada e região do parapeito.
O renderizador encaixa o ponto da sacada (bx, by) na posição do Barão da arena e escala por BALCONY."""
import os, json
import numpy as np
from PIL import Image
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
    'royal_fortress': {'foot': (350, 588), 'ground': 1083, 'gate': (400, 850),
                       'rail': [(140, 592), (420, 594), (470, 566), (530, 538), (600, 522)], 'railBottom': 668},
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
        if not f.endswith('_34.webp'):
            continue
        cid = f[:-8]
        im = key(np.asarray(Image.open(os.path.join(SRC, f)).convert('RGB')))
        x0, y0, x1, y1 = im.getbbox()
        im = im.crop((x0, y0, x1, y1))
        im.save(os.path.join(SRC, cid + '_cut.png'))
        sp = SPOTS.get(cid)
        if sp:
            s = FOOT_TO_GROUND / (sp['ground'] - sp['foot'][1])
            im2 = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
            im2.save(os.path.join(OUT, cid + '.webp'), 'WEBP', quality=88, method=6)
            P = lambda x, y: [round(x * s), round(y * s)]
            rail = [P(*q) for q in sp['rail']]
            rb = round(sp['railBottom'] * s)
            meta[cid] = {'w': im2.width, 'h': im2.height, 'foot': P(*sp['foot']), 'gate': P(*sp['gate']),
                         'rail': rail + [[rail[-1][0], rb], [rail[0][0], rb]]}
        print(cid, 'recorte', (x0, y0, x1, y1))
    with open(os.path.join(ROOT, 'web', 'js', 'castles.js'), 'w') as fh:
        fh.write('// gerado por tools/extract-castles.py\nwindow.BB = window.BB || {};\nBB.CASTLES_ART = ' + json.dumps(meta, indent=1) + ';\n')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Castelos da arena: art/source/castles/side/<id>.webp (1127x1396, mesmo enquadramento nos 5, fundo verde
ou magenta, castelo cortado pela borda esquerda). Gera web/img/castles/<id>.webp e web/js/castles.js com a
posição na arena (lado esquerdo; o direito é espelhado), o pé do Barão, o parapeito da sacada e a frente em cada rota."""
import os, json
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'source', 'castles', 'side')
OUT = os.path.join(ROOT, 'web', 'img', 'castles')
IDS = ['royal_fortress', 'glacial_fortress', 'draconic_castle', 'sylvan_sanctuary', 'shadow_necropolis']
# medidas na imagem original (iguais nos 5)
FOOT = (650, 645)       # piso da sacada onde o Barão pisa
GATE_BOTTOM = 1125      # base do portão (fica na linha dos pés da rota de baixo)
GATE = (565, 980)       # centro do portão (impactos)
RAIL = [(400, 680), (560, 722), (700, 722), (845, 610), (848, 720), (760, 785), (560, 795), (400, 765)]
BARON = (178, 292)      # pé do Barão na arena
LANES_Y = (322, 472, 652)
PAD_BOTTOM = 160
# (sem uso) base: todos terminam na mesma diagonal (a da Fortaleza Real); o que passar dela é cortado (borda suave)
BASE_CUT = [(1040, 712), (1100, 668), (1160, 611), (1220, 553), (1280, 502), (1396, 380), (1556, 220)]        # castelo continua para baixo (atrás da barra de cartas, celulares mais altos)


def key(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if np.median(r[:10, -10:]) > 200 and np.median(g[:10, -10:]) < 80:  # magenta
        k = np.minimum(r, b) - g
        al = np.clip((90 - k) / 60, 0, 1)
        lim = g + (1 - al) * 0 + np.maximum(0, np.minimum(r, b) - g) * al
        r = np.where(al < 0.99, np.minimum(r, np.maximum(g, lim)), r)
        b = np.where(al < 0.99, np.minimum(b, np.maximum(g, lim)), b)
    else:
        mx = np.maximum(r, b); k = g - mx
        al = np.clip((90 - k) / 60, 0, 1)
        g = np.where((g > mx) & (al < 0.99), mx, g)
        g = np.where(g > mx, mx + (g - mx) * 0.25 * al, g)
    solid = al > 0.5
    edge = solid & ~ndimage.binary_erosion(solid, iterations=1, border_value=1)
    al = np.where(edge, al * 0.5, al)
    return np.dstack([r, g, b, al * 255]).clip(0, 255).astype(np.uint8)


def finish_edge(k, lim):
    """Acabamento no corte da base: meio-fio de pedra com a cor da pedra do castelo e um friso dourado na borda
    (igual às linhas douradas da arena), para o corte parecer o fim do piso e não um pedaço apagado."""
    H, W = k.shape[:2]
    out = k.astype(np.float32)
    LIP, GOLD = 26, 7
    a = out[..., 3] > 200
    # cor da pedra: pixels pouco saturados e médios da metade de baixo do castelo
    px = out[H // 2:][a[H // 2:]][:, :3]
    sat = px.max(axis=1) - px.min(axis=1)
    lum = px.mean(axis=1)
    stone = np.median(px[(sat < 60) & (lum > 60) & (lum < 170)], axis=0)
    gold_hi, gold_lo = np.array([255, 214, 110.]), np.array([176, 112, 30.])
    for y in range(H):
        L = lim[y]
        if L > W + LIP or L < 0:
            continue
        # só onde o castelo existe perto do corte
        x0 = int(L) - LIP
        if x0 < 0 or not a[y, max(0, x0 - 20):max(1, x0)].any():
            continue
        for x in range(max(0, x0), min(W, int(L) + 1)):
            d = L - x
            if d <= GOLD:
                t = d / GOLD
                col = gold_lo + (gold_hi - gold_lo) * (1 - abs(t - 0.45) * 1.6).clip(0, 1)
                if d < 1.2:
                    col = col * 0.55
            else:
                t = (d - GOLD) / (LIP - GOLD)  # 0 perto do friso, 1 encostado no piso
                col = stone * (0.72 + 0.38 * t)
                if y % 30 < 2:
                    col = col * 0.62  # junta das pedras
                if d > LIP - 2:
                    col = stone * 1.25  # luz na emenda com o piso
            out[y, x, :3] = col
            out[y, x, 3] = 255 if d >= 1 else 160
    return out.clip(0, 255).astype(np.uint8)


def main():
    os.makedirs(OUT, exist_ok=True)
    s = (LANES_Y[2] - BARON[1]) / (GATE_BOTTOM - FOOT[1])
    meta = {}
    for cid in IDS:
        a = np.asarray(Image.open(os.path.join(SRC, cid + '.webp')).convert('RGB')).astype(np.float32)
        k = key(a)
        im = Image.fromarray(k)
        # prolonga a base para baixo (estica as últimas linhas): não aparece fundo embaixo do castelo
        # continua para baixo com o reflexo da parte de baixo do próprio castelo (sem esticar: nada embaçado)
        base = im.crop((0, im.height - PAD_BOTTOM, im.width, im.height)).transpose(Image.FLIP_TOP_BOTTOM)
        tall = Image.new('RGBA', (im.width, im.height + PAD_BOTTOM)); tall.paste(im, (0, 0)); tall.paste(base, (0, im.height))
        im = tall.resize((round(tall.width * s), round(tall.height * s)), Image.LANCZOS)
        im.save(os.path.join(OUT, cid + '.webp'), 'WEBP', quality=86, method=6)
        x, y = round(BARON[0] - FOOT[0] * s), round(BARON[1] - FOOT[1] * s)
        A = np.asarray(im)[..., 3]
        front = []
        for ly in LANES_Y:
            yy = ly - y
            xs = np.nonzero((A[yy - 8:yy + 8] > 128).any(axis=0))[0]
            front.append(int(xs.max()) + x if len(xs) else None)
        P = lambda px, py: [round(px * s), round(py * s)]
        meta[cid] = {'w': im.width, 'h': im.height, 'x': x, 'y': y, 'foot': P(*FOOT), 'gate': P(*GATE),
                     'rail': [P(*q) for q in RAIL], 'front': front, 'src': 'img/castles/' + cid + '.webp'}
        print(cid, 'frente nas rotas', front)
    with open(os.path.join(ROOT, 'web', 'js', 'castles.js'), 'w') as fh:
        fh.write('// gerado por tools/extract-castles-side.py\nwindow.BB = window.BB || {};\nBB.CASTLES_ART = ' + json.dumps(meta) + ';\n')


if __name__ == '__main__':
    main()

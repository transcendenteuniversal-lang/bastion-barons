#!/usr/bin/env python3
"""Os 5 castelos da arena a partir de art/source/castles/castles5.png (5 colunas, fundo verde, mesmo formato).
Cada castelo: recortado, escalado, com o lado esquerdo estendido (celulares largos mostram além da arena)
e a base sem sobras. Saída: web/img/castles/<id>.webp + web/js/castles.js (posição na arena, pé do Barão,
parapeito para desenhar na frente do Barão e frente do castelo em cada rota)."""
import os, json
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'source', 'castles', 'castles5.png')
OUT = os.path.join(ROOT, 'web', 'img', 'castles')
IDS = ['royal_fortress', 'glacial_fortress', 'draconic_castle', 'sylvan_sanctuary', 'shadow_necropolis']
SCALE = 1.2
EXT = 300                      # px (arena) de castelo além da borda esquerda da arena
FOOT = (120, 557)              # pé do Barão na coluna recortada (px da imagem original, y absoluto)
BARON_Y = 292                  # altura do pé do Barão na arena
# parapeito da frente da sacada (px da coluna, y absoluto): desenhado por cima do Barão
RAIL = [(25, 562), (120, 568), (200, 560), (232, 532), (262, 516), (284, 512), (284, 620), (25, 620)]
LANES_Y = (322, 472, 652)
GATE = (165, 777)              # centro do portão (px da coluna, y absoluto): impactos no castelo


def key(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = np.maximum(r, b); k = g - mx
    al = np.clip((90 - k) / 60, 0, 1)
    g = np.where((g > mx) & (al < 0.99), mx, g)
    g = np.where(g > mx, mx + (g - mx) * 0.25 * al, g)
    solid = al > 0.5
    edge = solid & ~ndimage.binary_erosion(solid, iterations=1)
    al = np.where(edge & (np.arange(a.shape[1])[None, :] > 3), al * 0.5, al)
    return np.dstack([r, g, b, al * 255]).clip(0, 255).astype(np.uint8)


def main():
    a = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
    rgba = key(a)
    al = rgba[..., 3] > 128
    col = al.sum(axis=0)
    runs, x = [], 0
    while x < len(col):
        if col[x] > 20:
            s = x
            while x < len(col) and col[x] > 20:
                x += 1
            if x - s > 100:
                runs.append((s, x))
        x += 1
    assert len(runs) == 5, runs
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    oy = BARON_Y - FOOT[1] * SCALE
    for cid, (x0, x1) in zip(IDS, runs):
        c = rgba[:, x0:x1].copy()
        c[:, :2, 3] = c[:, 2:3, 3]  # borda esquerda reta
        im = Image.fromarray(c)
        im = im.resize((round(im.width * SCALE), round(im.height * SCALE)), Image.LANCZOS)
        # extensão à esquerda: espelho da faixa esquerda do castelo (paredes e torres continuam)
        band = im.crop((4, 0, 150, im.height)).transpose(Image.FLIP_LEFT_RIGHT)
        ext = Image.new('RGBA', (EXT + im.width, im.height))
        xx, flip = EXT, False
        while xx > -band.width:
            ext.paste(band if not flip else band.transpose(Image.FLIP_LEFT_RIGHT), (xx - band.width, 0)); xx -= band.width; flip = not flip
        # a extensão fica mais escura (parece mais ao fundo e não compete com a sacada)
        e = np.asarray(ext).astype(np.float32)
        shade = np.linspace(0.5, 0.75, EXT)[None, :, None]
        e[:, :EXT, :3] *= shade
        ext = Image.fromarray(e.clip(0, 255).astype(np.uint8))
        ext.paste(im, (EXT, 0), im)
        ext.save(os.path.join(OUT, cid + '.webp'), 'WEBP', quality=86, method=6)
        y0 = round(oy)
        A = np.asarray(ext)[..., 3]
        front = []
        for ly in LANES_Y:
            y = ly - y0
            xs = np.nonzero((A[max(0, y - 8):y + 8] > 128).any(axis=0))[0]
            front.append(int(xs.max()) - EXT if len(xs) else None)
        meta[cid] = {'w': ext.width, 'h': ext.height, 'x': -EXT, 'y': y0,
                     'foot': [round(FOOT[0] * SCALE) + EXT, round(FOOT[1] * SCALE)],
                     'rail': [[round(px * SCALE) + EXT, round(py * SCALE)] for px, py in RAIL],
                     'gate': [round(GATE[0] * SCALE) + EXT, round(GATE[1] * SCALE)],
                     'front': front, 'src': 'img/castles/' + cid + '.webp'}
        print(cid, 'frente nas rotas', front)
    with open(os.path.join(ROOT, 'web', 'js', 'castles.js'), 'w') as fh:
        fh.write('// gerado por tools/extract-castles5.py\nwindow.BB = window.BB || {};\nBB.CASTLES_ART = ' + json.dumps(meta) + ';\n')


if __name__ == '__main__':
    main()

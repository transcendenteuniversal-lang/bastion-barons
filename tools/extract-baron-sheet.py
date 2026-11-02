#!/usr/bin/env python3
"""Animações de um Barão a partir de uma folha de quadros (6 linhas x 8 quadros, fundo verde).
Linhas: idle, power, victory, defeat, hurt, cheer. A coluna da esquerda (rótulos) é ignorada.
Gera web/img/barons/<id>_anim.webp e BB.BARON_ANIM em web/js/baron-anim.js.
Uso: python3 tools/extract-baron-sheet.py <id> <folha>   (requer numpy, scipy, pillow)"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROWS = ['idle', 'power', 'victory', 'defeat', 'hurt', 'cheer']
COLS = 8
BODY = 150  # altura do Barão parado no quadro salvo (px)


def key(rgb):
    a = rgb.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    k = g - np.maximum(r, b)
    alpha = np.clip((90 - k) / 60, 0, 1)
    g = np.where(g > np.maximum(r, b), np.maximum(r, b) + (g - np.maximum(r, b)) * 0.25 * alpha, g)
    return np.dstack([r, g, b, alpha * 255]).clip(0, 255).astype(np.uint8)


def main(uid, path):
    im = np.asarray(Image.open(path).convert('RGB'))
    H, W = im.shape[:2]
    rgba = key(im)
    a = rgba[..., 3] > 60
    # limites das linhas: faixas horizontais de fundo (sem personagem) entre as linhas
    rowmass = a[:, int(W * 0.1):].sum(axis=1)
    bands = np.linspace(0, H, len(ROWS) + 1).astype(int)
    for i in range(1, len(ROWS)):  # ajusta cada corte para a linha mais vazia perto do corte nominal
        lo, hi = bands[i] - 40, bands[i] + 40
        bands[i] = lo + int(np.argmin(rowmass[lo:hi]))
    x0 = int(W * 0.109)  # pula a coluna de rótulos (com a seta)
    colw = (W - x0) / COLS
    frames, scales = {}, {}
    for r, name in enumerate(ROWS):
        y0, y1 = bands[r], bands[r + 1]
        # separa os personagens pelo desenho (não por coluna fixa): cada pedaço vai para o quadro
        # cuja coluna contém o seu centro, então capa ou braço que passa da coluna continua inteiro
        band = rgba[y0:y1].copy()
        m = band[..., 3] > 60
        m[:, :x0] = False
        lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=1))
        lab = np.where(m, lab, 0)
        row = [np.zeros_like(band) for _ in range(COLS)]
        objs = ndimage.find_objects(lab)
        sizes = ndimage.sum(m, lab, range(1, n + 1)) if n else []
        for i, sl in enumerate(objs):
            if sl is None or sizes[i] < 40:
                continue
            comp = lab == i + 1
            ys, xs = np.nonzero(comp)
            if xs.max() - xs.min() > colw * 1.45:  # dois personagens encostados: divide pelas colunas
                for c in range(COLS):
                    cx0, cx1 = int(x0 + c * colw), int(x0 + (c + 1) * colw)
                    part = comp.copy(); part[:, :cx0] = False; part[:, cx1:] = False
                    row[c][part] = band[part]
                continue
            c = int(np.clip((np.median(xs) - x0) // colw, 0, COLS - 1))
            row[c][comp] = band[comp]
        # mantém só o personagem principal de cada quadro (e efeitos ligados a ele)
        for c in range(COLS):
            mm = row[c][..., 3] > 60
            l2, n2 = ndimage.label(ndimage.binary_dilation(mm, iterations=4))
            if n2:
                sz = ndimage.sum(mm, l2, range(1, n2 + 1))
                keep = np.isin(l2, [j + 1 for j, z in enumerate(sz) if z >= sz.max() * 0.06])
                row[c][..., 3] = np.where(keep, row[c][..., 3], 0)
        frames[name] = row
        # escala da linha: o 1º quadro (pose de espera) define a altura do corpo
        ys = np.nonzero(row[0][..., 3].max(axis=1) > 60)[0]
        scales[name] = BODY / max(1, ys.max() - ys.min())
    # quadro de saída comum: alinhado pelos pés e pelo centro do corpo
    out_cells, boxes = {}, []
    for name in ROWS:
        out_cells[name] = []
        for cell in frames[name]:
            s = scales[name]
            img = Image.fromarray(cell)
            img = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)
            al = np.asarray(img)[..., 3] > 60
            ys, xs = np.nonzero(al)
            if len(xs) == 0:
                out_cells[name].append((img, 0, 0)); continue
            foot = ys.max()
            # centro: mediana das colunas do tronco (metade de baixo do corpo, mais estável que armas e efeitos)
            cx = float(np.median(xs[ys > foot - BODY * 0.5]))
            out_cells[name].append((img, cx, foot))
            boxes.append((xs.min() - cx, ys.min() - foot, xs.max() - cx, ys.max() - foot))
    L = int(-min(b[0] for b in boxes)) + 4; R = int(max(b[2] for b in boxes)) + 4
    T = int(-min(b[1] for b in boxes)) + 4; B = 6
    G = 3  # margem transparente em volta de cada quadro: nada de um quadro aparece no vizinho
    fw, fh = L + R + 2 * G, T + B + 2 * G
    sheet = Image.new('RGBA', (fw * COLS, fh * len(ROWS)), (0, 0, 0, 0))
    for r, name in enumerate(ROWS):
        for c, (img, cx, foot) in enumerate(out_cells[name]):
            cell = Image.new('RGBA', (fw - 2 * G, fh - 2 * G), (0, 0, 0, 0))
            cell.paste(img, (int(L - cx), int(T - foot)), img)  # recorta o que passar do quadro
            sheet.paste(cell, (c * fw + G, r * fh + G))
    L += G; T += G
    os.makedirs(os.path.join(ROOT, 'web', 'img', 'barons'), exist_ok=True)
    sheet.save(os.path.join(ROOT, 'web', 'img', 'barons', uid + '_anim.webp'), 'WEBP', quality=84, method=6)
    meta_path = os.path.join(ROOT, 'web', 'js', 'baron-anim.js')
    meta = {}
    if os.path.exists(meta_path):
        t = open(meta_path).read()
        meta = json.JSONDecoder().raw_decode(t[t.index('BB.BARON_ANIM = ') + 16:])[0]
    meta[uid] = {'w': fw, 'h': fh, 'ax': L, 'ay': T, 'body': BODY, 'n': COLS, 'rows': ROWS}
    with open(meta_path, 'w') as f:
        f.write('// Animações dos Barões na sacada (gerado por tools/extract-baron-sheet.py).\nwindow.BB = window.BB || {};\nBB.BARON_ANIM = ' + json.dumps(meta, indent=1, sort_keys=True) + ';\n')
    print(uid, 'quadro', fw, 'x', fh, 'cortes das linhas', list(bands))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

#!/usr/bin/env python3
"""Folhas de animação novas (art/source/anim/<id>.webp): grade 6 colunas x 2 linhas em chroma key (verde ou magenta).
Linha 1 = andar/voar, linha 2 = ataque. Cada quadro é recortado só com o personagem (maior pedaço e o que estiver perto),
alinhado pelos pés e pelo centro do corpo, e salvo em alta resolução em web/img/units/<id>_g.webp.
Gera web/js/grids.js (carregado depois de sheets.js), que substitui a animação dessas tropas."""
import os, json
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'source', 'anim')
OUT = os.path.join(ROOT, 'web', 'img', 'units')
COLS, ROWS = 6, 2
BODY = 220          # altura do corpo (px) na folha final: alta resolução
FLYERS = {'fire_dragon', 'ice_dragon', 'phoenix', 'vampire_bat'}


def key(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    corner = a[:8, :8].reshape(-1, 3).mean(axis=0)
    if corner[0] > 180 and corner[1] < 90:  # magenta
        mn = np.minimum(r, b); k = mn - g; al = np.clip((90 - k) / 60, 0, 1)
        ex = np.clip(mn - g, 0, None) * np.where(al < 0.99, 1.0, 0.25)  # tira o reflexo rosa da borda
        r = r - ex; b = b - ex
    else:
        mx = np.maximum(r, b); k = g - mx; al = np.clip((90 - k) / 60, 0, 1)
        g = np.where((g > mx) & (al < 0.99), mx, g)
        g = np.where(g > mx, mx + (g - mx) * 0.25 * al, g)
    solid = al > 0.5
    edge = solid & ~ndimage.binary_erosion(solid, iterations=1, border_value=1)
    al = np.where(edge, al * 0.6, al)
    return np.dstack([r, g, b, al * 255]).clip(0, 255).astype(np.uint8)


def cell_mask(c):
    m = c[..., 3] > 90
    lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=3))
    if n == 0:
        return m
    sz = ndimage.sum(m, lab, range(1, n + 1)); big = int(np.argmax(sz)) + 1
    keep = lab == big
    near = ndimage.binary_dilation(keep, iterations=30)
    for i in range(1, n + 1):  # pedaços soltos perto do corpo (faísca do golpe, arma) ficam
        if i != big and sz[i - 1] > 40 and (near & (lab == i)).any():
            keep |= lab == i
    return m & keep


def main():
    sprites = {}
    for f in sorted(os.listdir(SRC)):
        if not f.endswith(('.webp', '.png', '.jpg')):
            continue
        uid = os.path.splitext(f)[0]
        im = key(np.asarray(Image.open(os.path.join(SRC, f)).convert('RGB')).astype(np.float32))
        H, W = im.shape[:2]
        cw, ch = W / COLS, H / ROWS
        cells = []
        for r in range(ROWS):
            for c in range(COLS):
                x0, y0 = int(c * cw), int(r * ch)
                cell = im[y0:int((r + 1) * ch), x0:int((c + 1) * cw)].copy()
                m = cell_mask(cell)
                cell[..., 3] = np.where(m, cell[..., 3], 0)
                ys, xs = np.nonzero(m)
                cells.append((cell, m, ys, xs))
        # escala única pela altura mediana do corpo nos quadros de andar
        hs = [ys.max() - ys.min() for (_, _, ys, _) in cells[:COLS] if len(ys)]
        s = BODY / float(np.median(hs))
        frames = []
        for cell, m, ys, xs in cells:
            if not len(ys):
                continue
            foot = ys.max() if uid not in FLYERS else (ys.min() + ys.max()) / 2
            # centro do corpo: média das colunas na faixa do tronco (sem a espada esticada)
            band = m[int(ys.min() + (ys.max() - ys.min()) * 0.3):int(ys.min() + (ys.max() - ys.min()) * 0.8)]
            cx = np.nonzero(band.any(axis=0))[0]
            cx = np.median(np.nonzero(band)[1]) if len(cx) else xs.mean()
            x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            crop = Image.fromarray(cell[y0:y1, x0:x1])
            crop = crop.resize((max(1, round(crop.width * s)), max(1, round(crop.height * s))), Image.LANCZOS)
            frames.append((crop, (cx - x0) * s, (foot - y0) * s))
        walk, atk = frames[:COLS], frames[COLS:]
        L = int(max(ax for _, ax, _ in frames)) + 4; R = int(max(f.width - ax for f, ax, _ in frames)) + 4
        T = int(max(ay for _, _, ay in frames)) + 4; B = int(max(f.height - ay for f, _, ay in frames)) + 4
        fw, fh = L + R, T + B
        sheet = Image.new('RGBA', (fw * COLS, fh * 2))
        for row, fr in enumerate((walk, atk)):
            for i, (f, ax, ay) in enumerate(fr):
                sheet.alpha_composite(f, (int(i * fw + L - ax), int(row * fh + T - ay)))
        sheet.save(os.path.join(OUT, uid + '_g.webp'), 'WEBP', quality=90, method=6)
        wb = [-int(max(ax for _, ax, _ in walk)), -int(max(ay for _, _, ay in walk)), int(max(f.width - ax for f, ax, _ in walk)), int(max(f.height - ay for f, _, ay in walk))]
        sprites[uid] = {'w': fw, 'h': fh, 'ax': L, 'ay': T, 'body': BODY, 'walk': len(walk), 'attack': len(atk), 'fps': 9, 'wb': wb,
                        'src': 'img/units/' + uid + '_g.webp'}
        print(uid, 'quadros', len(walk), len(atk), 'tamanho', fw, fh)
    with open(os.path.join(ROOT, 'web', 'js', 'grids.js'), 'w') as fh_:
        fh_.write('// Animações em alta resolução das folhas 6x2 (gerado por tools/extract-grid.py).\nwindow.BB = window.BB || {};\n'
                  'Object.assign(BB.SPRITES = BB.SPRITES || {}, ' + json.dumps(sprites, indent=1) + ');\n')


if __name__ == '__main__':
    main()

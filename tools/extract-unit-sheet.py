#!/usr/bin/env python3
"""Tropas e efeitos a partir das folhas de quadros (art/source/sheets/sheetN.png, fundo verde).
Cada linha: retrato + rótulo "ANDAR" + quadros de caminhada | divisória | rótulo "ATAQUE" + quadros de ataque.
Folhas de magia: a linha inteira (ou só a parte de ataque) vira uma animação de efeito.
Gera web/img/units/<id>_s.webp e web/js/sheets.js (substitui BB.SPRITES / BB.FX das tropas e magias).
Uso: python3 tools/extract-unit-sheet.py   (requer numpy, scipy, pillow)"""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'source', 'sheets')
OUT = os.path.join(ROOT, 'web', 'img', 'units')
BODY = 128
# folha -> (fim do retrato em px, [id por linha]); None = linha sem carta no jogo; 'fx_*' = efeito
SHEETS = {
    'sheet1': (128, ['royal_knight', 'barbarian', 'elven_archer', 'arcane_mage', 'royal_griffin', 'skeleton']),
    'sheet3': (128, ['stone_golem', 'stone_guardian', 'shadow_assassin', 'royal_archer', None, 'shadow_sorceress']),
    'sheet4': (128, [None, 'paladin', 'red_orc', None, 'phoenix', 'ice_dragon']),
    'sheet5': (128, [None, 'dwarf_warrior', 'necromancer', 'goblin_gunner', None, 'royal_cleric']),
    'sheet6': (142, ['fx_fireball', 'fx_arrow_rain', 'fx_freeze', 'fx_lightning', 'fx_divine_heal', 'fx_imperial_shield']),
    'sheet7': (172, ['fx_poison', 'fx_skeleton_summon', 'fire_dragon', None, 'guardian_ent']),
}


# onde começam os quadros (depois do rótulo + seta): (caminhada, ataque) em px da folha
STARTS = {'sheet1': (240, 930), 'sheet3': (240, 930), 'sheet4': (240, 928), 'sheet5': (240, 905),
          'sheet6': (276, 1006), 'sheet7': (322, 958)}
COUNTS = {
    'sheet1': [(6, 6)] * 6, 'sheet3': [(6, 6)] * 6,
    'sheet4': [(5, 5), (5, 5), (5, 5), (5, 5), (5, 4), (5, 5)],
    'sheet5': [(5, 5)] * 6,
    'sheet6': [(5, 4), (5, 5), (5, 4), (5, 4), (5, 2), (5, 3)],
    'sheet7': [(0, 5), (0, 5), (4, 4), (4, 4), (5, 5)],
}


def key(rgb):
    a = rgb.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    k = g - np.maximum(r, b)
    alpha = np.clip((90 - k) / 60, 0, 1)
    g = np.where(g > np.maximum(r, b), np.maximum(r, b) + (g - np.maximum(r, b)) * 0.25 * alpha, g)
    return np.dstack([r, g, b, alpha * 255]).clip(0, 255).astype(np.uint8)


def bands_of(im, nrows):
    H = im.shape[0]
    bright = (im[..., 0] > 200) & (im[..., 1] > 200) & (im[..., 2] > 200)
    rb = bright.mean(axis=1)
    seps = [y for y in range(H) if rb[y] > 0.5]
    cuts = [y for j, y in enumerate(seps) if j == 0 or y - seps[j - 1] > 3]
    if len(cuts) == nrows - 1:
        return [0] + cuts + [H], bright
    return list(np.linspace(0, H, nrows + 1).astype(int)), bright


def label_end(m, x0, x1):
    """Fim do rótulo (badge + seta) no começo da região: primeira coluna vazia depois de um bloco de desenho."""
    col = m[:, x0:x1].sum(axis=0)
    x = 0
    while x < len(col) and col[x] == 0:
        x += 1
    while x < len(col) and col[x] > 0:
        x += 1
    return x0 + x


def bodies(m, x0, x1):
    mass = ndimage.uniform_filter1d(m[:, x0:x1].sum(axis=0).astype(float), 7)
    if not (mass > 0).any():
        return []
    thr = 0.3 * np.percentile(mass[mass > 0], 90)
    on = mass > thr
    runs, x = [], 0
    while x < len(on):
        if on[x]:
            s = x
            while x < len(on) and on[x]:
                x += 1
            runs.append([s + x0, x + x0])
        x += 1
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < 14:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return [r for r in merged if r[1] - r[0] >= 24]


def hist(px):
    q = (px[:, :3] // 43).astype(int)
    h = np.bincount(q[:, 0] * 36 + q[:, 1] * 6 + q[:, 2], minlength=216).astype(float)
    return h / max(1, h.sum())


def segments(m, x0, x1, n):
    """n quadros na região: corta nos vales (colunas com menos desenho) perto das divisões iguais."""
    col = m[:, x0:x1].sum(axis=0)
    nz = np.nonzero(col)[0]
    a, b = x0 + nz.min(), x0 + nz.max() + 1
    mass = ndimage.uniform_filter1d(m[:, a:b].sum(axis=0).astype(float), 5)
    w = (b - a) / n
    cuts = [a]
    for k in range(1, n):
        c = int(k * w); lo, hi = max(1, int(c - w * 0.3)), min(b - a - 1, int(c + w * 0.3))
        cuts.append(a + lo + int(np.argmin(mass[lo:hi])))
    cuts.append(b)
    return [[cuts[k], cuts[k + 1]] for k in range(n)]


def split(band, m, x0, x1, n=None):
    """Separa os quadros da região: cada pedaço de desenho vai para o quadro do seu centro."""
    bs = segments(m, x0, x1, n) if n else bodies(m, x0, x1)
    if not bs:
        return [], []
    centers = np.array([(a + b) / 2 for a, b in bs])
    mm = m.copy(); mm[:, :x0] = False; mm[:, x1:] = False
    lab, n = ndimage.label(ndimage.binary_dilation(mm, iterations=1))
    lab = np.where(mm, lab, 0)
    cells = [np.zeros(band.shape[:2], bool) for _ in bs]
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if sl is None:
            continue
        comp = lab == i + 1
        if comp.sum() < 20:
            continue
        xs = np.nonzero(comp)[1]
        inside = [k for k, (a, b) in enumerate(bs) if xs.min() < b and xs.max() > a]
        if len(inside) > 1:
            cuts = [(bs[k][1] + bs[k + 1][0]) / 2 for k in range(len(bs) - 1)]
            for k in inside:
                lo = cuts[k - 1] if k > 0 else 0
                hi = cuts[k] if k < len(cuts) else band.shape[1]
                part = comp.copy(); part[:, :int(lo)] = False; part[:, int(hi):] = False
                cells[k] |= part
            continue
        cells[int(np.argmin(np.abs(centers - np.median(xs))))] |= comp
    return cells, bs


def render_frames(band, cells, bs, anchor_cells=None, scale=1.0, body_box=None):
    """Recorta cada quadro, alinhado pelos pés e pelo centro do corpo."""
    out = []
    for k, c in enumerate(cells):
        ys, xs = np.nonzero(c)
        if len(xs) == 0:
            continue
        ref = anchor_cells[k] if anchor_cells is not None else c
        a, b = bs[k] if body_box is None else body_box[k]
        ry, rx = np.nonzero(ref)
        sel = (rx >= a) & (rx < b)
        if sel.sum() < 10:
            sel = np.ones_like(rx, bool)
        foot = ry[sel].max()
        cx = float(np.median(rx[sel & (ry > foot - (foot - ry[sel].min()) * 0.5)])) if (sel & (ry > foot - (foot - ry[sel].min()) * 0.5)).any() else float(np.median(rx[sel]))
        img = np.zeros(band.shape, np.uint8); img[c] = band[c]
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = Image.fromarray(img[y0:y1, x0:x1])
        crop = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.LANCZOS)
        out.append((crop, (cx - x0) * scale, (foot - y0) * scale))
    return out


def pack(rows, pad=3):
    boxes = [(-ax, -ay, im.width - ax, im.height - ay) for row in rows for (im, ax, ay) in row]
    L = int(-min(b[0] for b in boxes)) + 2; R = int(max(b[2] for b in boxes)) + 2
    T = int(-min(b[1] for b in boxes)) + 2; B = int(max(b[3] for b in boxes)) + 2
    fw, fh = L + R + 2 * pad, T + B + 2 * pad
    cols = max(len(r) for r in rows)
    sheet = Image.new('RGBA', (fw * cols, fh * len(rows)), (0, 0, 0, 0))
    for r, row in enumerate(rows):
        for c, (im, ax, ay) in enumerate(row):
            sheet.paste(im, (int(c * fw + pad + L - ax), int(r * fh + pad + T - ay)), im)
    return sheet, fw, fh, L + pad, T + pad


def main():
    sprites, fx = {}, {}
    for name, (portrait, ids) in SHEETS.items():
        counts = COUNTS[name]
        im = np.asarray(Image.open(os.path.join(SRC, name + '.png')).convert('RGB'))
        rgba = key(im)
        bands, bright = bands_of(im, len(ids))
        for r, uid in enumerate(ids):
            if not uid:
                continue
            y0, y1 = bands[r] + 3, bands[r + 1] - 3
            band = rgba[y0:y1].copy()
            m = (band[..., 3] > 60) & ~bright[y0:y1]
            m[:, :portrait] = False
            W = m.shape[1]
            # divisória vertical clara (se houver nesta linha)
            colb = bright[y0:y1].mean(axis=0)
            divs = [x for x in range(int(W * 0.4), int(W * 0.7)) if colb[x] > 0.5]
            div = divs[0] if divs and counts[r][0] else None  # linhas só de efeito não têm divisória
            if div:
                m[:, div - 3:div + 4] = False
            sx0, sx1 = STARTS[name]
            m[:, :sx0] = False
            if div:
                m[:, div - 3:sx1] = False
            wx0 = sx0
            if uid.startswith('fx_'):
                x0 = sx1 if div else wx0
                cells, bs = split(band, m, x0, W, counts[r][1])
                for k, c in enumerate(cells):  # tira pedaços pequenos cortados na borda (são do quadro vizinho)
                    l2, n2 = ndimage.label(ndimage.binary_dilation(c, iterations=2))
                    if n2 < 2:
                        continue
                    sz = ndimage.sum(c, l2, range(1, n2 + 1))
                    a_, b_ = bs[k]
                    for j, sl in enumerate(ndimage.find_objects(l2)):
                        if sz[j] < sz.max() * 0.35 and (sl[1].start <= a_ + 2 or sl[1].stop >= b_ - 2):
                            c &= ~(l2 == j + 1)
                frames = render_frames(band, cells, bs)
                # efeitos: alinhados pela base e pelo centro da própria imagem
                frames = [(im_, im_.width / 2, im_.height) for (im_, _, _) in frames]
                hmax = max(f[0].height for f in frames)
                s = min(1.0, 240 / hmax)
                frames = [(f.resize((max(1, int(f.width * s)), max(1, int(f.height * s))), Image.LANCZOS), ax * s, ay * s) for f, ax, ay in frames]
                sheet, fw, fh, ax, ay = pack([frames])
                sheet.save(os.path.join(OUT, uid + '_s.webp'), 'WEBP', quality=82, method=6)
                fx[uid] = {'w': fw, 'h': fh, 'n': len(frames), 'src': 'img/units/' + uid + '_s.webp'}
                print(f'{name} linha {r + 1}: {uid} {len(frames)} quadros')
                continue
            wcells, wbs = split(band, m, wx0, div, counts[r][0])
            acells, abs_ = split(band, m, sx1, W, counts[r][1])
            # referência de cor do personagem: quadros de caminhada
            ref = hist(np.concatenate([band[c] for c in wcells]))
            hh = [ (np.nonzero(c)[0].max() - np.nonzero(c)[0].min()) for c in wcells if c.any()]
            scale = BODY / float(np.median(hh))
            # quadro de ataque que é só efeito (projétil, explosão): junta ao quadro anterior do personagem
            merged_c, merged_b = [], []
            for c, bb in zip(acells, abs_):
                sim = np.minimum(hist(band[c]), ref).sum() if c.any() else 0
                if merged_c and sim < 0.42:
                    merged_c[-1] = merged_c[-1] | c
                else:
                    merged_c.append(c); merged_b.append(bb)
            walk = render_frames(band, wcells, wbs, scale=scale)
            atk = render_frames(band, merged_c, merged_b, scale=scale)
            sheet, fw, fh, ax, ay = pack([walk, atk])
            sheet.save(os.path.join(OUT, uid + '_s.webp'), 'WEBP', quality=84, method=6)
            sprites[uid] = {'w': fw, 'h': fh, 'ax': ax, 'ay': ay, 'body': BODY, 'walk': len(walk), 'attack': len(atk),
                            'fps': 8, 'src': 'img/units/' + uid + '_s.webp'}
            print(f'{name} linha {r + 1}: {uid} andar {len(walk)} / ataque {len(atk)} (de {len(acells)})')
    with open(os.path.join(ROOT, 'web', 'js', 'sheets.js'), 'w') as f:
        f.write('// Tropas e efeitos das folhas de quadros (gerado por tools/extract-unit-sheet.py).\n'
                '// Substitui as animações vindas dos vídeos para estes ids.\nwindow.BB = window.BB || {};\n'
                'Object.assign(BB.SPRITES = BB.SPRITES || {}, ' + json.dumps(sprites, indent=1, sort_keys=True) + ');\n'
                'Object.assign(BB.FX = BB.FX || {}, ' + json.dumps(fx, indent=1, sort_keys=True) + ');\n')


if __name__ == '__main__':
    main()

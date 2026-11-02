#!/usr/bin/env python3
"""Animações de um Barão a partir de uma folha de quadros (6 linhas, fundo verde ou magenta).
Linhas: idle, power, victory, defeat, hurt, cheer. A coluna da esquerda (rótulos) é ignorada.
Cada linha pode ter de 6 a 10 quadros: os personagens são encontrados pelo "corpo" (colunas com
muito desenho), e efeitos finos (raios, faíscas, folhas) ficam com o personagem mais próximo.
Gera web/img/barons/<id>_anim.webp e BB.BARON_ANIM em web/js/baron-anim.js.
Uso: python3 tools/extract-baron-sheet.py <id> <folha>   (requer numpy, scipy, pillow)"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROWS = ['idle', 'power', 'victory', 'defeat', 'hurt', 'cheer']
BODY = 150  # altura do Barão parado no quadro salvo (px)
# quadros a usar por linha (índices dos quadros encontrados), quando a folha precisa de ajuste
FRAME_PICK = {
    # no poder do Malachar os quadros 4–7 mostram só os esqueletos: ele segura o cajado erguido
    ('malachar', 'power'): [0, 1, 2, 2, 2, 2, 1, -1],
}


def key(rgb):
    """Remove fundo verde ou magenta (detectado pela cor da borda)."""
    a = rgb.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    border = np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, -4:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    magenta = bg[0] > bg[1] and bg[2] > bg[1]
    k = (np.minimum(r, b) - g) if magenta else (g - np.maximum(r, b))
    alpha = np.clip((90 - k) / 60, 0, 1)
    if magenta:
        ex = np.clip(np.minimum(r, b) - g, 0, None) * (1 - alpha) * 0.9
        r, b = r - ex, b - ex
    else:
        g = np.where(g > np.maximum(r, b), np.maximum(r, b) + (g - np.maximum(r, b)) * 0.25 * alpha, g)
    return np.dstack([r, g, b, alpha * 255]).clip(0, 255).astype(np.uint8)


def find_bodies(m):
    """Intervalos de colunas com 'corpo' (muito desenho na vertical)."""
    mass = ndimage.uniform_filter1d(m.sum(axis=0).astype(float), 9)
    thr = 0.34 * np.percentile(mass[mass > 0], 92) if (mass > 0).any() else 1
    on = mass > thr
    runs, x = [], 0
    while x < len(on):
        if on[x]:
            s = x
            while x < len(on) and on[x]:
                x += 1
            runs.append([s, x])
        x += 1
    # junta pedaços do mesmo personagem (cajado, braço) separados por pouco espaço
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < 22 and (r[1] - merged[-1][0]) < 230:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    merged = [r for r in merged if r[1] - r[0] >= 30]
    # um personagem é alto; faixas baixas (raios, rastros) não são quadros
    def height(r):
        ys = np.nonzero(m[:, r[0]:r[1]].any(axis=1))[0]
        return ys.max() - ys.min() if len(ys) else 0
    hs = [height(r) for r in merged]
    return [r for r, h in zip(merged, hs) if h >= 0.55 * max(hs)]


def main(uid, path):
    im = np.asarray(Image.open(path).convert('RGB'))
    H, W = im.shape[:2]
    rgba = key(im)
    a = rgba[..., 3] > 60
    x0 = int(W * 0.109)  # pula a coluna de rótulos (com a seta)
    a[:, :x0] = False
    # linhas separadoras claras atravessando a folha não são desenho
    bright = (im[..., 0] > 170) & (im[..., 1] > 170) & (im[..., 2] > 170)
    lines = bright[:, x0:].mean(axis=1) > 0.5  # linha separadora: faixa clara atravessando a folha
    a[ndimage.binary_dilation(lines, iterations=2)] = False
    rgba[..., 3] = np.where(a, rgba[..., 3], 0)
    rowmass = a.sum(axis=1)
    bands = np.linspace(0, H, len(ROWS) + 1).astype(int)
    for i in range(1, len(ROWS)):
        lo, hi = bands[i] - 40, bands[i] + 40
        bands[i] = lo + int(np.argmin(rowmass[lo:hi]))
    frames, scales = {}, {}
    for r, name in enumerate(ROWS):
        y0, y1 = bands[r], bands[r + 1]
        band = rgba[y0:y1].copy()
        m = band[..., 3] > 60
        bodies = find_bodies(m)
        centers = np.array([(b0 + b1) / 2 for b0, b1 in bodies])
        lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=1))
        lab = np.where(m, lab, 0)
        row = [np.zeros_like(band) for _ in bodies]
        sizes = ndimage.sum(m, lab, range(1, n + 1)) if n else []
        for i, sl in enumerate(ndimage.find_objects(lab)):
            if sl is None or sizes[i] < 30:
                continue
            comp = lab == i + 1
            xs = np.nonzero(comp)[1]
            inside = [k for k, (b0, b1) in enumerate(bodies) if xs.min() < b1 and xs.max() > b0]
            if len(inside) > 1:  # encosta em dois personagens: divide no meio entre eles
                cuts = [(bodies[k][1] + bodies[k + 1][0]) / 2 for k in range(len(bodies) - 1)]
                for k in inside:
                    lo = cuts[k - 1] if k > 0 else 0
                    hi = cuts[k] if k < len(cuts) else W
                    part = comp.copy(); part[:, :int(lo)] = False; part[:, int(hi):] = False
                    row[k][part] = band[part]
                continue
            k = int(np.argmin(np.abs(centers - np.median(xs))))
            # pedaço solto e pequeno inteiramente atrás (à esquerda) do corpo: é projétil do quadro anterior
            if not inside and sizes[i] < 0.08 * m.sum() / max(1, len(bodies)) and xs.max() < bodies[k][0]:
                continue
            # projétil solto (flecha, raio) entre dois personagens: pertence a quem atira (à esquerda)
            if name in ('power', 'cheer') and not inside and sizes[i] < 0.08 * m.sum() / max(1, len(bodies)):
                left = [j for j, (b0, b1) in enumerate(bodies) if b1 <= xs.min()]
                if left: k = left[-1]
            row[k][comp] = band[comp]
        # em cada quadro, pedaços pequenos soltos fora da área do personagem (flechas em voo de outro
        # quadro, faíscas perdidas) são removidos; efeitos grudados no personagem continuam
        for c in range(len(row)):
            mm = row[c][..., 3] > 60
            l2, n2 = ndimage.label(ndimage.binary_dilation(mm, iterations=2))
            if n2 < 2:
                continue
            sz = ndimage.sum(mm, l2, range(1, n2 + 1))
            big = int(np.argmax(sz)); bsl = ndimage.find_objects(l2)[big]
            by0, by1, bx0, bx1 = bsl[0].start - 12, bsl[0].stop + 12, bsl[1].start - 12, bsl[1].stop + 12
            drop = np.zeros_like(mm)
            for j, sl in enumerate(ndimage.find_objects(l2)):
                if j == big or sz[j] > sz[big] * 0.15:
                    continue
                cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
                if not (by0 <= cy <= by1 and bx0 <= cx <= bx1) or sl[0].stop < bsl[0].start + 4:
                    drop |= l2 == j + 1
            row[c][..., 3] = np.where(drop, 0, row[c][..., 3])
        pick = FRAME_PICK.get((uid, name))
        if pick:
            row = [row[i] for i in pick]
        frames[name] = row
        ys = np.nonzero(row[0][..., 3].max(axis=1) > 60)[0]
        scales[name] = BODY / max(1, ys.max() - ys.min())
        print(f'  {name}: {len(bodies)} quadros encontrados' + (f' -> {len(row)} usados' if pick else ''))
    out, boxes = {}, []
    for name in ROWS:
        out[name] = []
        for cell in frames[name]:
            s = scales[name]
            img = Image.fromarray(cell)
            img = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)
            img = img.crop(img.getbbox() or (0, 0, 1, 1))
            al = np.asarray(img)[..., 3] > 60
            ys, xs = np.nonzero(al)
            if len(xs) == 0:
                out[name].append((img, 0, 0)); continue
            foot = ys.max()
            cx = float(np.median(xs[ys > foot - BODY * 0.5]))
            out[name].append((img, cx, foot))
            boxes.append((xs.min() - cx, ys.min() - foot, xs.max() - cx, ys.max() - foot))
    L = int(-min(b[0] for b in boxes)) + 4; R = int(max(b[2] for b in boxes)) + 4
    T = int(-min(b[1] for b in boxes)) + 4; B = 6
    G = 3  # margem transparente em volta de cada quadro
    fw, fh = L + R + 2 * G, T + B + 2 * G
    cols = max(len(out[n]) for n in ROWS)
    sheet = Image.new('RGBA', (fw * cols, fh * len(ROWS)), (0, 0, 0, 0))
    for r, name in enumerate(ROWS):
        for c, (img, cx, foot) in enumerate(out[name]):
            cell = Image.new('RGBA', (fw - 2 * G, fh - 2 * G), (0, 0, 0, 0))
            cell.paste(img, (int(L - cx), int(T - foot)), img)
            sheet.paste(cell, (c * fw + G, r * fh + G))
    os.makedirs(os.path.join(ROOT, 'web', 'img', 'barons'), exist_ok=True)
    sheet.save(os.path.join(ROOT, 'web', 'img', 'barons', uid + '_anim.webp'), 'WEBP', quality=84, method=6)
    meta_path = os.path.join(ROOT, 'web', 'js', 'baron-anim.js')
    meta = {}
    if os.path.exists(meta_path):
        t = open(meta_path).read()
        meta = json.JSONDecoder().raw_decode(t[t.index('BB.BARON_ANIM = ') + 16:])[0]
    meta[uid] = {'w': fw, 'h': fh, 'ax': L + G, 'ay': T + G, 'body': BODY, 'n': cols, 'rows': ROWS,
                 'counts': [len(out[n]) for n in ROWS]}
    with open(meta_path, 'w') as f:
        f.write('// Animações dos Barões na sacada (gerado por tools/extract-baron-sheet.py).\nwindow.BB = window.BB || {};\nBB.BARON_ANIM = ' + json.dumps(meta, indent=1, sort_keys=True) + ';\n')
    print(uid, 'quadro', fw, 'x', fh, 'contagem', meta[uid]['counts'])


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

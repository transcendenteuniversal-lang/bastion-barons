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
SCALE = {'fire_dragon': 1.3, 'ice_dragon': 1.3, 'skeleton': 0.8, 'war_wolf': 0.85, 'goblin_hunter': 0.78, 'dwarf_engineer': 0.8, 'dwarf_turret': 1.45}  # tamanho na arena


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


# troca de cor: (faixa de matiz de origem, matiz destino) — ex.: Orc Vermelho com a pele toda vermelha
RECOLOR = {'red_orc': ((0.115, 0.47), 0.005)}


def recolor(img, rng, hue):
    """Troca a matiz das cores da faixa `rng` por `hue` com transição suave (sem manchas)."""
    a = np.asarray(img.convert('RGBA')).astype(np.float32) / 255
    rgb = a[..., :3]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2); d = mx - mn + 1e-6
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    s = d / (mx + 1e-6)
    lo, hi = rng
    w = np.clip((h - (lo - 0.03)) / 0.03, 0, 1) * np.clip(((hi + 0.03) - h) / 0.03, 0, 1) * np.clip((s - 0.08) / 0.12, 0, 1)
    v = mx
    hh = np.full_like(h, hue) % 1.0
    i = np.floor(hh * 6); f = hh * 6 - i; ss = np.clip(s * 1.05, 0, 1)
    p_ = v * (1 - ss); q = v * (1 - f * ss); t = v * (1 - (1 - f) * ss)
    i = i.astype(int) % 6
    nr = np.choose(i, [v, q, p_, p_, t, v]); ng = np.choose(i, [t, v, v, q, p_, p_]); nb = np.choose(i, [p_, p_, t, v, v, q])
    out = rgb.copy()
    out[..., 0] = r * (1 - w) + nr * w; out[..., 1] = g * (1 - w) + ng * w; out[..., 2] = b * (1 - w) + nb * w
    return Image.fromarray((np.dstack([out, a[..., 3:]]) * 255).clip(0, 255).astype(np.uint8))


def fx_mask(c):
    m = c[..., 3] > 40
    lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=2))
    W_ = m.shape[1]
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if sl is not None and (sl[1].start <= 1 or sl[1].stop >= W_ - 1):
            m &= lab != i + 1
    return m


def cell_mask(c):
    m = c[..., 3] > 90
    lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=3))
    if n == 0:
        return m
    sz = ndimage.sum(m, lab, range(1, n + 1)); big = int(np.argmax(sz)) + 1
    objs = ndimage.find_objects(lab)
    W_ = m.shape[1]
    # pedaço que encosta na borda da célula estendida vem do quadro vizinho
    cut = {i + 1 for i, sl in enumerate(objs) if sl is not None and (sl[1].start <= 1 or sl[1].stop >= W_ - 1) and i + 1 != big}
    keep = lab == big
    near = ndimage.binary_dilation(keep, iterations=18)
    for i in range(1, n + 1):  # pedaços soltos perto do corpo (faísca do golpe, arma) ficam
        if i != big and i not in cut and sz[i - 1] > 40 and (near & (lab == i)).any():
            keep |= lab == i
    return m & keep


def fx_out(uid, cells, cw, fxs):
    ov = int(cw * 0.12)
    rows = []
    for r in range(ROWS):
        rc = cells[r * COLS:(r + 1) * COLS]
        ground = max((c[2].max() for c in rc if len(c[2])), default=0)
        rows.append(ground)
    frames = []
    for i, (cell, m, ys, xs) in enumerate(cells):
        cx = cw / 2 if i % COLS == 0 else ov + cw / 2  # centro da célula original dentro da célula estendida
        frames.append((Image.fromarray(cell), cx, rows[i // COLS]))
    # caixa comum a todos os quadros (relativa ao centro e ao chão)
    boxes = []
    for (im, cx, gy), (_, m, ys, xs) in zip(frames, cells):
        if len(xs): boxes.append((xs.min() - cx, ys.min() - gy, xs.max() + 1 - cx, ys.max() + 1 - gy))
    L = -min(b[0] for b in boxes); R = max(b[2] for b in boxes); T = -min(b[1] for b in boxes); B = max(0, max(b[3] for b in boxes))
    s = min(1.0, 300 / (T + B))
    fw, fh = int((max(L, R) * 2) * s) + 4, int((T + B) * s) + 4
    sheet = Image.new('RGBA', (fw * len(frames), fh))
    for i, (im, cx, gy) in enumerate(frames):
        x0, y0 = int(cx - max(L, R)), int(gy - T)
        crop = Image.new('RGBA', (int(max(L, R) * 2), int(T + B)))
        crop.paste(im.crop((max(0, x0), max(0, y0), x0 + crop.width, y0 + crop.height)), (max(0, -x0), max(0, -y0)))
        crop = crop.resize((fw - 4, fh - 4), Image.LANCZOS)
        sheet.paste(crop, (i * fw + 2, 2))
    sheet.save(os.path.join(OUT, uid + '_g.webp'), 'WEBP', quality=88, method=6)
    fxs[uid] = {'w': fw, 'h': fh, 'n': len(frames), 'src': 'img/units/' + uid + '_g.webp'}
    print(uid, 'efeito', len(frames), 'quadros', fw, fh)


def main():
    sprites, fxs = {}, {}
    for f in sorted(os.listdir(SRC)):
        if not f.endswith(('.webp', '.png', '.jpg')):
            continue
        uid = os.path.splitext(f)[0]
        raw = np.asarray(Image.open(os.path.join(SRC, f)).convert('RGB')).astype(np.float32)
        im = key(raw)
        if uid.startswith('fx_'):  # efeitos têm muito brilho semitransparente: tira a cor do fundo misturada (unmix)
            bg = raw[:8, :8].reshape(-1, 3).mean(axis=0)
            a = im[..., 3:4].astype(np.float32) / 255
            col = (raw - (1 - a) * bg) / np.maximum(a, 0.08)
            col = np.clip(col, 0, 255)
            im = np.dstack([np.where(a > 0.02, col, im[..., :3]), im[..., 3:4]]).astype(np.uint8)
            if bg[0] > 180 and bg[1] < 90:  # magenta: brilho rosado do fundo vira transparente e perde o tom rosa
                r_, g_, b_ = [raw[..., i] for i in range(3)]
                pink = np.clip((np.minimum(r_, b_) - g_ + 20) / 70, 0, 1)
                im = im.astype(np.float32)
                im[..., 3] *= 1 - pink * 0.85
                im[..., 2] = np.minimum(im[..., 2], im[..., 1] * (1 - 0.5 * pink) + 20)
                im = im.clip(0, 255).astype(np.uint8)
        H, W = im.shape[:2]
        cw, ch = W / COLS, H / ROWS
        cells = []
        for r in range(ROWS):
            for c in range(COLS):
                # a célula se estende um pouco para os lados (arma que passa da divisão); o vizinho fica longe e é descartado
                ov = int(cw * 0.12)
                x0, y0 = max(0, int(c * cw) - ov), int(r * ch)
                cell = im[y0:int((r + 1) * ch), x0:min(W, int((c + 1) * cw) + ov)].copy()
                m = fx_mask(cell) if uid.startswith('fx_') else cell_mask(cell)
                cell[..., 3] = np.where(m, cell[..., 3], 0)
                ys, xs = np.nonzero(m)
                cells.append((cell, m, ys, xs))
        # escala única pela altura mediana do corpo nos quadros de andar
        if uid.startswith('fx_'):  # magia: 12 quadros em sequência, alinhados pelo chão e pelo centro da célula
            fx_out(uid, cells, cw, fxs)
            continue
        ref = cells[COLS:] if uid == 'dwarf_turret' else cells[:COLS]  # torre: a linha de cima é a construção (alturas variam)
        hs = [ys.max() - ys.min() for (_, _, ys, _) in ref if len(ys)]
        s = BODY / float(np.median(hs))
        # altura do corpo de cada quadro (centro vertical) na posição original da célula: o andar balança pouco
        cys = [((ys.min() + ys.max()) / 2 if len(ys) else 0) for (_, _, ys, _) in cells]
        frames = []
        for idx, (cell, m, ys, xs) in enumerate(cells):
            if not len(ys):
                continue
            if uid in FLYERS:
                foot = (ys.min() + ys.max()) / 2
            else:
                # pé = linha do chão da linha da folha; o sobe-e-desce do corpo é amortecido (sem 'pulos')
                row = idx // COLS
                rc = [cys[k] for k in range(row * COLS, row * COLS + COLS) if len(cells[k][2])]
                ground = max(cells[k][2].max() for k in range(row * COLS, row * COLS + COLS) if len(cells[k][2]))
                mean = sum(rc) / len(rc)
                foot = ground + (cys[idx] - mean) * (0.25 if row == 0 else 0.4)
            # centro do corpo: média das colunas na faixa do tronco (sem a espada esticada)
            band = m[int(ys.min() + (ys.max() - ys.min()) * 0.3):int(ys.min() + (ys.max() - ys.min()) * 0.8)]
            cx = np.nonzero(band.any(axis=0))[0]
            cx = np.median(np.nonzero(band)[1]) if len(cx) else xs.mean()
            x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            crop = Image.fromarray(cell[y0:y1, x0:x1])
            crop = crop.resize((max(1, round(crop.width * s)), max(1, round(crop.height * s))), Image.LANCZOS)
            frames.append((crop, (cx - x0) * s, (foot - y0) * s))
        walk, atk = frames[:COLS], frames[COLS:]
        if uid == 'dwarf_turret':  # torre parada: primeiro quadro = torre pronta (a construção roda ao contrário só na vitrine)
            walk = walk[::-1]
        L = int(max(ax for _, ax, _ in frames)) + 4; R = int(max(f.width - ax for f, ax, _ in frames)) + 4
        T = int(max(ay for _, _, ay in frames)) + 4; B = int(max(f.height - ay for f, _, ay in frames)) + 4
        fw, fh = L + R, T + B
        sheet = Image.new('RGBA', (fw * COLS, fh * 2))
        for row, fr in enumerate((walk, atk)):
            for i, (f, ax, ay) in enumerate(fr):
                sheet.alpha_composite(f, (int(i * fw + L - ax), int(row * fh + T - ay)))
        if uid in RECOLOR:
            sheet = recolor(sheet, *RECOLOR[uid])
        sheet.save(os.path.join(OUT, uid + '_g.webp'), 'WEBP', quality=90, method=6)
        wb = [-int(max(ax for _, ax, _ in walk)), -int(max(ay for _, _, ay in walk)), int(max(f.width - ax for f, ax, _ in walk)), int(max(f.height - ay for f, _, ay in walk))]
        sprites[uid] = {'w': fw, 'h': fh, 'ax': L, 'ay': T, 'body': BODY, 'walk': len(walk), 'attack': len(atk), 'fps': 8, 'wb': wb, 'blend': 1, 'scale': SCALE.get(uid, 1),
                        'src': 'img/units/' + uid + '_g.webp'}
        print(uid, 'quadros', len(walk), len(atk), 'tamanho', fw, fh)
    with open(os.path.join(ROOT, 'web', 'js', 'grids.js'), 'w') as fh_:
        fh_.write('// Animações em alta resolução das folhas 6x2 (gerado por tools/extract-grid.py).\nwindow.BB = window.BB || {};\n'
                  'Object.assign(BB.SPRITES = BB.SPRITES || {}, ' + json.dumps(sprites, indent=1) + ');\n'
                  'Object.assign(BB.FX = BB.FX || {}, ' + json.dumps(fxs, indent=1) + ');\n')


if __name__ == '__main__':
    main()

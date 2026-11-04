#!/usr/bin/env python3
"""Efeito em tiras (1 coluna x N linhas, fundo verde): ex. Sopro do Dragão que cobre a rota inteira.
Uso: extract-strip.py <entrada> <id> <linhas>  -> web/img/units/<id>_g.webp (quadros empilhados na vertical) + web/js/strips.js"""
import os, sys, json
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src, uid, n = sys.argv[1], sys.argv[2], int(sys.argv[3])
FIRE = len(sys.argv) > 4 and sys.argv[4] == 'fire'  # correção de bordas oliva só para fogo
TINT = [float(v) for v in sys.argv[4][5:].split(',')] if len(sys.argv) > 4 and sys.argv[4].startswith('tint:') else None  # cor das bordas translúcidas
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
bg = a[:6, -6:].reshape(-1, 3).mean(axis=0)
MAG = bg[0] > 180 and bg[1] < 90
if MAG:  # fundo magenta
    k = np.minimum(r, b) - g
    al = np.clip((100 - k) / 70, 0, 1)
else:
    mx = np.maximum(r, b); k = g - mx
    al = np.clip((90 - k) / 60, 0, 1)
col = np.clip((a - (1 - al[..., None]) * bg) / np.maximum(al[..., None], 0.08), 0, 255)
if MAG:  # tira o rosa que sobra nos brilhos
    # o brilho do desenho já vem misturado com o rosa do fundo: tom rosa/magenta vira transparência
    pk = np.clip((np.minimum(col[..., 0], col[..., 2]) - col[..., 1] + 15) / 45, 0, 1) * np.clip((col[..., 2] - col[..., 1] * 0.75) / 40, 0, 1)
    al = al * (1 - pk * 0.92)
    lim = col[..., 1] + 25
    col[..., 0] = np.where(pk > 0, np.minimum(col[..., 0], np.maximum(lim, col[..., 0] * (1 - pk))), col[..., 0])
    col[..., 2] = np.where(pk > 0, np.minimum(col[..., 2], lim * 0.8), col[..., 2])
else:
    col[..., 1] = np.minimum(col[..., 1], np.maximum(col[..., 0], col[..., 2]))  # sem reflexo verde
    semi = al < 0.95
    col[..., 1] = np.where(semi, np.minimum(col[..., 1], col[..., 0] * 0.72), col[..., 1])  # borda do fogo: laranja, não oliva
# fogo: tons oliva (fogo misturado com o verde do fundo no próprio desenho) viram transparência + laranja
gr = (1.0 if FIRE else 0.0) * np.clip((col[..., 1] - col[..., 0] * 0.92) / 40, 0, 1) * (col[..., 2] < col[..., 1] * 0.8) * np.clip((215 - col[..., 1]) / 30, 0, 1)
al = al * (1 - gr * 0.85)
col[..., 1] = np.where(gr > 0, np.minimum(col[..., 1], col[..., 0] * 0.8), col[..., 1])
if TINT is not None:  # brilho translúcido: puxa para a cor do efeito (sem resto do verde do fundo)
    w = np.sqrt(np.clip(al, 0, 1))[..., None]
    col = col * w + np.array(TINT)[None, None, :] * (1 - w)
    if TINT[1] < min(TINT[0], TINT[2]):  # efeito sem verde (ex.: roxo): o verde nunca passa da média de vermelho e azul
        col[..., 1] = np.minimum(col[..., 1], (col[..., 0] + col[..., 2]) * 0.42)
    else:
        col[..., 1] = np.minimum(col[..., 1], np.maximum(col[..., 0], col[..., 2]))
rgba = np.dstack([col, al * 255]).astype(np.uint8)
H, W = al.shape; bh = H / n
xs = np.nonzero((al > 0.1).any(axis=0))[0]; x1 = xs.max() + 1
# divisões entre as tiras: linha mais vazia perto de cada divisão igual (não corta o fogo que encosta na borda)
rowsum = (al > 0.1).sum(axis=1)
cuts = [0]
for i in range(1, n):
    c = int(i * bh); lo, hi = int(c - bh * 0.25), int(c + bh * 0.25)
    cuts.append(lo + int(np.argmin(rowsum[lo:hi])))
cuts.append(H)
frames = [Image.fromarray(rgba[cuts[i]:cuts[i + 1], :x1]) for i in range(n)]
# alinha pela base: cada tira vai para uma moldura do mesmo tamanho com o fundo da arte embaixo
bottoms = [np.nonzero((np.asarray(f)[..., 3] > 25).any(axis=1))[0].max() + 1 for f in frames]
tops = [np.nonzero((np.asarray(f)[..., 3] > 25).any(axis=1))[0].min() for f in frames]
up = max(b - t for b, t in zip(bottoms, tops)) + 4
frames = [f.crop((0, b - up, x1, b)) for f, b in zip(frames, bottoms)]
fh = min(f.height for f in frames); fw = x1
s = min(1.0, 1400 / fw)
fw2, fh2 = round(fw * s), round(fh * s)
sheet = Image.new('RGBA', (fw2, fh2 * n))
for i, f in enumerate(frames): sheet.paste(f.crop((0, 0, fw, fh)).resize((fw2, fh2), Image.LANCZOS), (0, i * fh2))
sheet.save(os.path.join(ROOT, 'web', 'img', 'units', uid + '_g.webp'), 'WEBP', quality=86, method=6)
p = os.path.join(ROOT, 'web', 'js', 'strips.js')
d = {}
if os.path.exists(p):
    t = open(p).read(); i = t.index(', {') + 2; d = json.loads(t[i:t.rindex('}') + 1])
d[uid] = {'w': fw2, 'h': fh2, 'n': n, 'vert': 1, 'src': 'img/units/' + uid + '_g.webp'}
open(p, 'w').write('// Efeitos em tiras (gerado por tools/extract-strip.py).\nwindow.BB = window.BB || {};\nObject.assign(BB.FX = BB.FX || {}, ' + json.dumps(d, indent=1) + ');\n')
print(uid, fw2, fh2, n)

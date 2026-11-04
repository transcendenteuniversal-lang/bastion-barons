#!/usr/bin/env python3
"""Efeito em tiras (1 coluna x N linhas, fundo verde): ex. Sopro do Dragão que cobre a rota inteira.
Uso: extract-strip.py <entrada> <id> <linhas>  -> web/img/units/<id>_g.webp (quadros empilhados na vertical) + web/js/strips.js"""
import os, sys, json
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src, uid, n = sys.argv[1], sys.argv[2], int(sys.argv[3])
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]; mx = np.maximum(r, b); k = g - mx
al = np.clip((90 - k) / 60, 0, 1)
bg = a[:6, -6:].reshape(-1, 3).mean(axis=0)
col = np.clip((a - (1 - al[..., None]) * bg) / np.maximum(al[..., None], 0.08), 0, 255)
col[..., 1] = np.minimum(col[..., 1], np.maximum(col[..., 0], col[..., 2]))  # sem reflexo verde
semi = al < 0.95
col[..., 1] = np.where(semi, np.minimum(col[..., 1], col[..., 0] * 0.72), col[..., 1])  # borda do fogo: laranja, não oliva
# fogo: tons oliva (fogo misturado com o verde do fundo no próprio desenho) viram transparência + laranja
gr = np.clip((col[..., 1] - col[..., 0] * 0.92) / 40, 0, 1) * (col[..., 2] < col[..., 1] * 0.8) * np.clip((215 - col[..., 1]) / 30, 0, 1)
al = al * (1 - gr * 0.85)
col[..., 1] = np.where(gr > 0, np.minimum(col[..., 1], col[..., 0] * 0.8), col[..., 1])
rgba = np.dstack([col, al * 255]).astype(np.uint8)
H, W = al.shape; bh = H / n
xs = np.nonzero((al > 0.1).any(axis=0))[0]; x1 = xs.max() + 1
frames = [Image.fromarray(rgba[int(i * bh):int((i + 1) * bh), :x1]) for i in range(n)]
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

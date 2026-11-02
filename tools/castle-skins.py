#!/usr/bin/env python3
"""Castelos da arena a partir do castelo do modelo antigo (web/img/arena.webp, lado esquerdo):
mesma geometria para todos (sacada, portão e base na linha da arena) e só as cores do tema mudam
(telhados, bandeiras, escudos e um leve tom na pedra). Saída: web/img/castles/skin_<id>.webp + web/js/castles.js.
O lado direito é o mesmo desenho espelhado."""
import os, json, colorsys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, 'web')
# contorno do castelo esquerdo na arena final (sem o céu e as árvores entre as torres)
OUTLINE = [(0, 0), (243, 0), (243, 185), (272, 185), (272, 0), (372, 0), (372, 232), (372, 315), (330, 355), (305, 385),
           (300, 615), (255, 625), (210, 715), (200, 805), (0, 815)]
W_LAYER = 440
# tema: matiz alvo dos azuis (None = mantém), saturação e brilho dos azuis, tom da pedra (r, g, b multiplicadores)
THEMES = {
    'royal_fortress':    {'hue': None, 'sat': 1.0, 'val': 1.0, 'stone': (1, 1, 1)},
    'glacial_fortress':  {'hue': 0.54, 'sat': 0.55, 'val': 1.25, 'stone': (0.9, 0.97, 1.12)},
    'draconic_castle':   {'hue': 0.0, 'sat': 1.05, 'val': 0.95, 'stone': (1.05, 0.88, 0.82)},
    'sylvan_sanctuary':  {'hue': 0.33, 'sat': 0.9, 'val': 0.95, 'stone': (0.95, 1.03, 0.9)},
    'shadow_necropolis': {'hue': 0.79, 'sat': 0.9, 'val': 0.85, 'stone': (0.8, 0.74, 0.9)},
}


def main():
    arena = Image.open(os.path.join(WEB, 'img', 'arena.webp')).convert('RGB')
    H = arena.height
    m = Image.new('L', arena.size, 0)
    ImageDraw.Draw(m).polygon(OUTLINE, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(2)).crop((0, 0, W_LAYER, H))
    rgb = np.asarray(arena.crop((0, 0, W_LAYER, H))).astype(np.float32) / 255
    hsv = np.vectorize(colorsys.rgb_to_hsv, otypes=[np.float32] * 3)
    h, s, v = hsv(rgb[..., 0], rgb[..., 1], rgb[..., 2])
    blue = (h > 0.55) & (h < 0.75) & (s > 0.35) & (v > 0.15)
    gold = (h > 0.06) & (h < 0.17) & (s > 0.45)
    toc = np.vectorize(colorsys.hsv_to_rgb, otypes=[np.float32] * 3)
    os.makedirs(os.path.join(WEB, 'img', 'castles'), exist_ok=True)
    meta = {}
    for cid, t in THEMES.items():
        out = rgb.copy()
        if t['hue'] is not None:
            # azul -> cor do tema, mantendo a variação de tom (sombra/brilho) do desenho original
            dh = h - 0.64
            nh = np.mod(t['hue'] + dh, 1.0)
            ns = np.clip(s * t['sat'], 0, 1)
            nv = np.clip(v * t['val'], 0, 1)
            r2, g2, b2 = toc(nh, ns, nv)
            k = np.clip((s - 0.35) / 0.15, 0, 1) * blue  # transição suave
            for i, ch in enumerate((r2, g2, b2)):
                out[..., i] = out[..., i] * (1 - k) + ch * k
        st = np.array(t['stone'], np.float32)
        plain = ~blue & ~gold
        out[plain] = np.clip(out[plain] * st, 0, 1)
        im = Image.fromarray((out * 255).astype(np.uint8)).convert('RGBA')
        im.putalpha(m)
        im.save(os.path.join(WEB, 'img', 'castles', 'skin_' + cid + '.webp'), 'WEBP', quality=88, method=6)
        meta[cid] = {'src': 'img/castles/skin_' + cid + '.webp', 'w': W_LAYER, 'h': H}
    with open(os.path.join(WEB, 'js', 'castles.js'), 'w') as fh:
        fh.write('// gerado por tools/castle-skins.py\nwindow.BB = window.BB || {};\nBB.CASTLE_SKINS = ' + json.dumps(meta, indent=1) + ';\n')
    print('castelos:', ', '.join(meta))


if __name__ == '__main__':
    main()

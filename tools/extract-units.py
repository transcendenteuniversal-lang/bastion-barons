#!/usr/bin/env python3
"""Animações das tropas a partir dos vídeos gerados (fundo chroma verde ou magenta, câmera parada).

Cada vídeo (6 s, 24 fps): ~0–3 s andando, ~3–6 s atacando. Para cada tropa gera
web/img/units/<id>.webp (linha 1 = andar, linha 2 = ataque) e as medidas em web/js/sprites.js.

Uso:
  python3 tools/extract-units.py --import <vídeos...>   copia vídeos numerados (001_..., 002_...) para art/source/units/<id>.mp4
  python3 tools/extract-units.py [id ...]               (re)gera as animações (todas, se nenhum id for dado)
Requer: ffmpeg, numpy, scipy, pillow.
"""
import json, os, re, subprocess, sys, tempfile
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'source', 'units')
OUT = os.path.join(ROOT, 'web', 'img', 'units')
META = os.path.join(ROOT, 'web', 'js', 'sprites.js')

# Ordem dos prompts entregues (o número do vídeo = posição nesta lista)
ORDER = ['royal_knight', 'paladin', 'barbarian', 'red_orc', 'shadow_assassin', 'stone_guardian', 'dwarf_warrior', 'royal_lancer',
         'elven_archer', 'royal_archer', 'arcane_mage', 'shadow_sorceress', 'necromancer', 'goblin_gunner', 'fire_dragon', 'ice_dragon',
         'phoenix', 'stone_golem', 'mountain_troll', 'royal_griffin', 'guardian_ent', 'infernal_demon', 'royal_cleric', 'dwarf_engineer',
         'dwarf_turret', 'skeleton', 'rei_bastion', 'elara', 'malachar', 'thorg', 'eldrin',
         'fx_fireball', 'fx_freeze', 'fx_divine_heal', 'fx_lightning', 'fx_arcane_shield', 'fx_poison', 'fx_arrow_rain', 'fx_skeleton_summon',
         'fx_imperial_shield', 'fx_dragon_breath', 'fx_ice_storm']
UNITS = set(ORDER[:26])  # tropas e invocações (andar + atacar)

BODY = 128          # altura do corpo parado nos quadros salvos (px)
WALK_N, ATK_N = 16, 18
SPLIT = 0.5         # fração do vídeo em que termina a caminhada
# limite do recorte à direita (em alturas de corpo), quando o vídeo traz algo além do personagem
RIGHT = {}
# pedaços soltos menores que esta fração do maior são removidos (padrão 1,5%: mantém flechas e projéteis)
MINFRAC = {'stone_golem': 0.3}


def import_videos(paths):
    os.makedirs(SRC, exist_ok=True)
    for p in paths:
        m = re.search(r'(?:^|[-_/])(\d{3})_', os.path.basename(p)) or re.match(r'(\d{3})', os.path.basename(p))
        if not m:
            print('sem número:', p); continue
        n = int(m.group(1))
        if not 1 <= n <= len(ORDER):
            print('número fora da lista:', p); continue
        uid = ORDER[n - 1]
        dst = os.path.join(SRC, uid + '.mp4')
        # cópia reduzida (720p, boa qualidade) para manter o repositório leve
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', p, '-an', '-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-pix_fmt', 'yuv420p', dst], check=True)
        print(f'{n:03d} -> {uid}')


def key(rgb):
    """Remove fundo verde (#00FF00) ou magenta (#FF00FF): detecta pela cor da borda do quadro."""
    a = rgb.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    border = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    magenta = bg[0] > bg[1] and bg[2] > bg[1]
    k = (np.minimum(r, b) - g) if magenta else (g - np.maximum(r, b))
    alpha = np.clip((90 - k) / 60, 0, 1)
    # remove o reflexo da cor do fundo nas bordas
    if magenta:
        ex = np.clip(np.minimum(r, b) - g, 0, None) * (1 - alpha) * 0.9 + np.clip(np.minimum(r, b) - g - 40, 0, None) * alpha * 0.3
        r, b = r - ex, b - ex
    else:
        g = np.where(g > np.maximum(r, b), np.maximum(r, b) + (g - np.maximum(r, b)) * 0.25 * alpha, g)
    return np.dstack([r, g, b, alpha * 255]).clip(0, 255).astype(np.uint8)


def clean(rgba, minfrac=0.015):
    """Mantém só as partes ligadas ao personagem (tira pontos soltos do fundo)."""
    a = rgba[..., 3] > 40
    lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=3))
    if n == 0:
        return rgba
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= max(60, sizes.max() * minfrac)])
    out = rgba.copy()
    out[..., 3] = np.where(keep, out[..., 3], 0)
    return out


def frames_of(video):
    tmp = tempfile.mkdtemp()
    subprocess.run(['ffmpeg', '-v', 'error', '-i', video, os.path.join(tmp, '%04d.png')], check=True)
    return [os.path.join(tmp, f) for f in sorted(os.listdir(tmp))]


def bbox(alpha):
    ys, xs = np.nonzero(alpha > 60)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def extract(uid):
    video = os.path.join(SRC, uid + '.mp4')
    files = frames_of(video)
    n = len(files)
    cut = int(n * SPLIT)
    walk_idx = np.linspace(2, cut - 1, WALK_N).round().astype(int)
    atk_idx = np.linspace(cut, n - 2, ATK_N).round().astype(int)
    load = lambda i: clean(key(np.asarray(Image.open(files[i]).convert('RGB'))), MINFRAC.get(uid, 0.015))
    walk = [load(i) for i in walk_idx]
    atk = [load(i) for i in atk_idx]
    wb = [bbox(f[..., 3]) for f in walk if bbox(f[..., 3])]
    # medidas do corpo pela caminhada: altura mediana, pés e centro
    body_h = float(np.median([b[3] - b[1] for b in wb]))
    foot = float(np.median([b[3] for b in wb]))
    cx = float(np.median([(b[0] + b[2]) / 2 for b in wb]))
    allb = [bbox(f[..., 3]) for f in walk + atk]
    allb = [b for b in allb if b]
    x0 = max(min(b[0] for b in allb), int(cx - 1.4 * body_h))
    x1 = min(max(b[2] for b in allb), int(cx + RIGHT.get(uid, 2.4) * body_h))  # ataques à distância: limita o rastro do projétil
    y0 = max(0, min(b[1] for b in allb) - 4)
    y1 = int(min(walk[0].shape[0], max(foot + 6, max(b[3] for b in allb) + 2)))
    s = BODY / body_h
    w, h = max(1, round((x1 - x0) * s)), max(1, round((y1 - y0) * s))
    cols = max(WALK_N, ATK_N)
    sheet = Image.new('RGBA', (w * cols, h * 2), (0, 0, 0, 0))
    for row, seq in enumerate((walk, atk)):
        for i, f in enumerate(seq):
            im = Image.fromarray(f[y0:y1, x0:x1]).resize((w, h), Image.LANCZOS)
            sheet.paste(im, (i * w, row * h))
    os.makedirs(OUT, exist_ok=True)
    sheet.save(os.path.join(OUT, uid + '.webp'), 'WEBP', quality=82, method=6)
    meta = {'w': w, 'h': h, 'ax': round((cx - x0) * s, 1), 'ay': round((foot - y0) * s, 1), 'body': BODY, 'walk': WALK_N, 'attack': ATK_N}
    print(f'{uid}: quadro {w}x{h}, folha {sheet.width}x{sheet.height}, {os.path.getsize(os.path.join(OUT, uid + ".webp")) // 1024} KB')
    return meta


def main():
    args = sys.argv[1:]
    if args and args[0] == '--import':
        import_videos(args[1:])
        args = []
    meta = {}
    if os.path.exists(META):
        txt = open(META).read()
        meta = json.loads(txt[txt.index('BB.SPRITES = ') + 13:txt.rindex('}') + 1])
    ids = args or sorted(f[:-4] for f in os.listdir(SRC) if f.endswith('.mp4') and f[:-4] in UNITS)
    for uid in ids:
        meta[uid] = extract(uid)
    with open(META, 'w') as fh:
        fh.write('// Animações das tropas (gerado por tools/extract-units.py). Linha 1 = andar, linha 2 = ataque.\n')
        fh.write('window.BB = window.BB || {};\nBB.SPRITES = ' + json.dumps(meta, indent=1, sort_keys=True) + ';\n')


if __name__ == '__main__':
    main()

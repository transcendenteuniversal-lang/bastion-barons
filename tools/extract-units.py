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
# Segundo lote ("Clean-simple ..." no nome do arquivo): a numeração recomeça em 001 nesta ordem
ORDER2 = ['royal_cleric', 'dwarf_engineer', 'dwarf_turret', 'rei_bastion', 'elara', 'malachar', 'thorg', 'eldrin',
          'fx_fireball', 'fx_freeze', 'fx_divine_heal', 'fx_lightning', 'fx_arcane_shield', 'fx_poison', 'fx_arrow_rain', 'fx_skeleton_summon',
          'fx_imperial_shield', 'fx_dragon_breath', 'fx_ice_storm']
# Terceiro lote ("Clean heroic ..." / "Clean VFX ..." no nome): tropas refeitas no estilo limpo + efeitos extras
ORDER3 = ['royal_knight', 'paladin', 'barbarian', 'red_orc', 'shadow_assassin', 'stone_guardian', 'dwarf_warrior', 'royal_lancer',
          'elven_archer', 'royal_archer', 'arcane_mage', 'shadow_sorceress', 'necromancer', 'goblin_gunner', 'fire_dragon', 'ice_dragon',
          'phoenix', 'stone_golem', 'mountain_troll', 'royal_griffin', 'guardian_ent', 'infernal_demon', 'skeleton',
          'fx_royal_command', 'fx_elven_rain', 'fx_army_of_dead', 'fx_orc_fury', 'fx_arcane_storm',
          'fx_deploy', 'fx_death', 'fx_hit', 'fx_castle_hit', 'fx_castle_destroyed', 'fx_victory']
BARONS = {'rei_bastion', 'elara', 'malachar', 'thorg', 'eldrin'}
UNITS = set(ORDER[:26]) | BARONS  # tropas, invocações e Barões (linha 1 = andar/parado, linha 2 = ataque/poder)
# trechos do vídeo (frações) usados em cada linha; padrão: andar 0–50%, atacar 50–100%
SEG = {'dwarf_turret': ((0.2, 0.33), (0.33, 1.0))}
for _b in BARONS:
    SEG[_b] = ((0.0, 0.33), (0.33, 1.0))  # Barões: parado na sacada, depois o poder

BODY = 128          # altura do corpo parado nos quadros salvos (px)
WALK_N, ATK_N = 16, 18
SPLIT = 0.5         # fração do vídeo em que termina a caminhada
# limite do recorte à direita (em alturas de corpo), quando o vídeo traz algo além do personagem
RIGHT = {}
# pedaços soltos menores que esta fração do maior são removidos (padrão 1,5%: mantém flechas e projéteis)
MINFRAC = {'stone_golem': 0.3}


def import_videos(paths):
    os.makedirs(SRC, exist_ok=True)
    done = []
    for p in paths:
        m = re.search(r'(?:^|[-_/])(\d{3})_', os.path.basename(p)) or re.match(r'(\d{3})', os.path.basename(p))
        if not m:
            print('sem número:', p); continue
        n = int(m.group(1))
        if not 1 <= n <= len(ORDER):
            print('número fora da lista:', p); continue
        name = os.path.basename(p).lower()
        order = ORDER3 if ('clean-heroic' in name or 'clean-chibi' in name or 'clean-vfx' in name) else ORDER2 if 'clean' in name else ORDER
        if n > len(order):
            print('número fora da lista:', p); continue
        uid = order[n - 1]
        dst = os.path.join(SRC, uid + '.mp4')
        # cópia reduzida (720p, boa qualidade) para manter o repositório leve
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', p, '-an', '-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-pix_fmt', 'yuv420p', dst], check=True)
        print(f'{n:03d} -> {uid}')
        done.append(uid)

    return done


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
    (w0, w1), (a0, a1) = SEG.get(uid, ((0.0, SPLIT), (SPLIT, 1.0)))
    walk_idx = np.linspace(max(2, int(n * w0)), int(n * w1) - 1, WALK_N).round().astype(int)
    atk_idx = np.linspace(int(n * a0), min(n - 2, int(n * a1) - 1), ATK_N).round().astype(int)
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


# Efeitos (feitiços e poderes de castelo): uma linha de quadros com o trecho útil do vídeo
FX_N = 20
FX_MAXH, FX_MAXW = 240, 560
FX_SEG = {'fx_fireball': (0.3, 1.0), 'fx_lightning': (0.0, 0.9), 'fx_skeleton_summon': (0.0, 0.45),
          'fx_hit': (0.0, 0.33), 'fx_deploy': (0.0, 0.6), 'fx_death': (0.0, 0.6), 'fx_castle_hit': (0.0, 0.75)}


def extract_fx(fid):
    files = frames_of(os.path.join(SRC, fid + '.mp4'))
    n = len(files)
    a, b = FX_SEG.get(fid, (0.0, 1.0))
    idx = np.linspace(max(1, int(n * a)), min(n - 2, int(n * b) - 1), FX_N).round().astype(int)
    frames = [clean(key(np.asarray(Image.open(files[i]).convert('RGB'))), 0.004) for i in idx]
    bs = [bbox(f[..., 3]) for f in frames]
    bs = [x for x in bs if x]
    x0, y0 = max(0, min(x[0] for x in bs) - 4), max(0, min(x[1] for x in bs) - 4)
    x1, y1 = max(x[2] for x in bs) + 4, max(x[3] for x in bs) + 4
    s = min(FX_MAXH / (y1 - y0), FX_MAXW / (x1 - x0), 1.0)
    w, h = max(1, round((x1 - x0) * s)), max(1, round((y1 - y0) * s))
    sheet = Image.new('RGBA', (w * FX_N, h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(Image.fromarray(f[y0:y1, x0:x1]).resize((w, h), Image.LANCZOS), (i * w, 0))
    sheet.save(os.path.join(OUT, fid + '.webp'), 'WEBP', quality=80, method=6)
    print(f'{fid}: quadro {w}x{h}, {os.path.getsize(os.path.join(OUT, fid + ".webp")) // 1024} KB')
    return {'w': w, 'h': h, 'n': FX_N}


def read_js(name):
    if not os.path.exists(META):
        return {}
    txt = open(META).read()
    tag = 'BB.' + name + ' = '
    if tag not in txt:
        return {}
    start = txt.index(tag) + len(tag)
    return json.JSONDecoder().raw_decode(txt[start:])[0]


def main():
    args = sys.argv[1:]
    if args and args[0] == '--import':
        args = import_videos(args[1:])  # processa só os vídeos importados
        if not args:
            return
    meta, fx = read_js('SPRITES'), read_js('FX')
    vids = sorted(f[:-4] for f in os.listdir(SRC) if f.endswith('.mp4'))
    ids = args or vids
    for uid in ids:
        if uid in UNITS:
            meta[uid] = extract(uid)
        elif uid.startswith('fx_'):
            fx[uid] = extract_fx(uid)
    with open(META, 'w') as fh:
        fh.write('// Animações (gerado por tools/extract-units.py).\n')
        fh.write('// SPRITES: linha 1 = andar (Barões: parado), linha 2 = ataque (Barões: poder). FX: uma linha de quadros.\n')
        fh.write('window.BB = window.BB || {};\nBB.SPRITES = ' + json.dumps(meta, indent=1, sort_keys=True) + ';\n')
        fh.write('BB.FX = ' + json.dumps(fx, indent=1, sort_keys=True) + ';\n')


if __name__ == '__main__':
    main()

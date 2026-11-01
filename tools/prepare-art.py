#!/usr/bin/env python3
"""Recorta e otimiza a arte enviada (art/source) para o jogo (web/img) e gera os ícones Android.

Uso: python3 tools/prepare-art.py
"""
import os
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art", "source")
WEB = os.path.join(ROOT, "web", "img")
RES = os.path.join(ROOT, "android", "res")

mock = Image.open(os.path.join(SRC, "battle_mockup.png")).convert("RGB")
banner = Image.open(os.path.join(SRC, "banner_barons.png")).convert("RGB")


def inset(box, l=0, t=0, r=0, b=0):
    return (box[0] + l, box[1] + t, box[2] - r, box[3] - b)


def square(img, box, size=256, anchor_top=False):
    """Recorta 'box' e centraliza num quadrado (cortando o excesso)."""
    c = img.crop(box)
    w, h = c.size
    s = min(w, h)
    x = (w - s) // 2
    y = 0 if anchor_top else (h - s) // 2
    return c.crop((x, y, x + s, y + s)).resize((size, size), Image.LANCZOS)


def hue(img, degrees, sat=1.0):
    hsv = img.convert("HSV")
    h, s, v = hsv.split()
    h = h.point(lambda p: (p + int(degrees / 360 * 255)) % 256)
    s = s.point(lambda p: min(255, int(p * sat)))
    return Image.merge("HSV", (h, s, v)).convert("RGB")


def save(img, path, q=82):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "WEBP", quality=q, method=6)


# Cartas da barra do mockup (o selo de custo do canto é coberto pelo selo do jogo)
CARD_ROW = {
    "paladin": (355, 750, 478, 872),
    "elven_archer": (497, 750, 620, 872),
    "stone_golem": (642, 750, 765, 872),
    "fireball": (787, 750, 910, 872),
    "freeze": (935, 750, 1058, 872),
    "skeleton_summon": (1082, 750, 1205, 872),
    "fire_dragon": (1228, 750, 1352, 872),
    "shadow_sorceress": (1375, 750, 1500, 872),
}
cards = {k: square(mock, inset(v, 7, 7, 7, 7)) for k, v in CARD_ROW.items()}

# Personagens do campo de batalha do mockup
FIELD = {
    "royal_knight": (470, 225, 565, 338),
    "red_orc": (995, 190, 1195, 345),
    "goblin_gunner": (1222, 232, 1312, 338),
    "royal_archer": (385, 402, 520, 528),
    "stone_guardian": (730, 375, 950, 535),
    "necromancer": (1062, 395, 1195, 530),
    "skeleton": (1228, 410, 1325, 528),
    "royal_griffin": (335, 525, 590, 725),
    "arcane_mage": (665, 565, 805, 720),
    "dwarf_warrior": (845, 612, 925, 712),  # cavaleiro-esqueleto pequeno: provisório até arte própria
}
for k, box in FIELD.items():
    cards[k] = square(mock, box, anchor_top=False)
cards.pop("dwarf_warrior")  # não representa um anão: fica com a arte gerada no jogo

# Variações de cor (provisórias e registradas em docs/ASSETS.md)
dragon_field = square(mock, (1160, 540, 1495, 725))
cards["ice_dragon"] = hue(dragon_field, 190, 0.9)
cards["mountain_troll"] = hue(square(mock, (995, 190, 1195, 345)), 70, 0.6)
cards["infernal_demon"] = hue(square(mock, (995, 190, 1195, 345)), -18, 1.4)
cards["phoenix"] = hue(cards["fire_dragon"], 25, 1.2)

for k, im in cards.items():
    save(im, os.path.join(WEB, "cards", k + ".webp"))

# Barões (banner oficial)
BARONS = {
    "eldrin": (70, 190, 390, 520),
    "elara": (380, 100, 660, 400),
    "rei_bastion": (600, 0, 980, 400),
    "malachar": (1060, 110, 1380, 450),
    "thorg": (1360, 230, 1672, 560),
}
for k, box in BARONS.items():
    save(square(banner, box, 320, anchor_top=True), os.path.join(WEB, "barons", k + ".webp"))

# Logo com fundo transparente (o original tem fundo preto)
logo = Image.open(os.path.join(SRC, "logo.png")).convert("RGBA")
px = logo.load()
w, h = logo.size
from collections import deque
seen = bytearray(w * h)
q = deque([(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)])
while q:
    x, y = q.popleft()
    if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]:
        continue
    seen[y * w + x] = 1
    r, g, b, a = px[x, y]
    if r + g + b > 60:
        continue
    px[x, y] = (0, 0, 0, 0)
    q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
logo = logo.crop(logo.getbbox())
logo.thumbnail((900, 900), Image.LANCZOS)
logo.save(os.path.join(WEB, "logo.webp"), "WEBP", quality=88, method=6)

bg = Image.open(os.path.join(SRC, "splash_bg.png")).convert("RGB")
bg.thumbnail((1280, 1280), Image.LANCZOS)
save(bg, os.path.join(WEB, "menu_bg.webp"), 78)
save(Image.open(os.path.join(SRC, "banner_barons.png")).convert("RGB").resize((1280, 720), Image.LANCZOS), os.path.join(WEB, "banner.webp"), 80)

# Ícones Android
icon = Image.open(os.path.join(SRC, "app_icon.png")).convert("RGB")
icon = icon.crop((60, 60, icon.width - 60, icon.height - 60))
for name, size in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
    d = os.path.join(RES, "mipmap-" + name)
    os.makedirs(d, exist_ok=True)
    icon.resize((size, size), Image.LANCZOS).save(os.path.join(d, "ic_launcher.png"))
icon.resize((512, 512), Image.LANCZOS).save(os.path.join(ROOT, "android", "icon-512.png"))
icon.resize((192, 192), Image.LANCZOS).save(os.path.join(WEB, "icon.png"))
print("cartas:", len(cards), "barões:", len(BARONS))

#!/usr/bin/env python3
"""Monta art/source/arena.png: base limpa (rotas douradas) + castelos com sacada por cima.
CASTLE_DY desloca os castelos para baixo (sacada mais baixa = Barão mais visível)."""
import os
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'source')
CASTLE_DY = 70
W, H = 1672, 941
base = Image.open(os.path.join(SRC, 'arena_clean_base.png')).convert('RGB').resize((W, H), Image.LANCZOS)
old = Image.open(os.path.join(SRC, 'arena_v3_castles.png')).convert('RGB')
m = Image.new('L', (W, H), 0)
ImageDraw.Draw(m).polygon([(0, 0), (385, 0), (385, 250), (372, 300), (330, 340), (305, 370), (300, 600), (255, 610), (210, 700), (200, 790), (0, 800)], fill=255)
m = m.filter(ImageFilter.GaussianBlur(10))
shifted = Image.new('RGB', (W, H)); shifted.paste(old, (0, CASTLE_DY))
# topo vazio após o deslocamento: repete a parte de cima do castelo
shifted.paste(old.crop((0, 0, W, CASTLE_DY)).resize((W, CASTLE_DY)), (0, 0))
ms = Image.new('L', (W, H), 0); ms.paste(m, (0, CASTLE_DY)); ms.paste(m.crop((0, 0, W, CASTLE_DY)), (0, 0))
out = base.copy()
out.paste(shifted, (0, 0), ms); out.paste(shifted, (0, 0), ms.transpose(Image.FLIP_LEFT_RIGHT))
out.save(os.path.join(SRC, 'arena.png'))
print('arena montada, castelos +%d px' % CASTLE_DY)

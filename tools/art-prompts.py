#!/usr/bin/env python3
"""Gera docs/prompts_arte.html: um prompt por carta (tropas, invocadas e magias) para gerar as folhas de animação
em chroma key. Cada bloco tem botão de copiar e a arte da carta (anexar como referência no gerador)."""
import base64, html, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G, M = 'perfectly flat solid chroma GREEN background (#00FF00)', 'perfectly flat solid MAGENTA background (#FF00FF)'
STYLE = ('Stylized 3D cartoon, Castle Crush / Castle Clash style: clean shapes, few colors, bold readable silhouette, '
         'crisp edges, high definition. Use the attached card art as the exact character design reference (same face, colors, outfit and weapon).')
RULES = ('{bg}, no gradients, no shadow on the background, no ground, no text, no numbers, no labels, no frame borders or grid lines. '
         'Exactly 2 horizontal rows of 6 frames each, all 12 frames the same size on an invisible even grid. '
         'Side view, the character always faces RIGHT. ROW 1: {walk}. ROW 2: {attack}. '
         'Same character size, same scale and the same foot line in every frame; the character never changes position inside its frame. '
         'Leave generous empty background space around every frame (at least 25% margin on all sides) so weapons, wings, tails, '
         'projectiles and attack effects are never cut and never touch the neighbour frame.')
WALK = 'a smooth looping walk cycle (6 frames)'
FLY = 'a smooth looping flying/hovering cycle with wing flaps, body slightly above the foot line (6 frames)'

T = [  # id, nome, fundo, descrição do personagem, linha 1, ataque
 ('royal_knight','Cavaleiro Real',G,'a sturdy royal knight in blue and gold plate armor with a fleur-de-lis shield and a short sword',WALK,
  'a strong shield bash plus sword slash (wind-up, lunge forward, impact, follow-through, recover, back to stance); a small white impact burst at the moment of the hit'),
 ('paladin','Paladino',G,'a tall holy paladin in silver and gold armor with a big warhammer and a glowing golden halo',WALK,
  'a two-handed warhammer smash on the ground (raise, swing down, impact with a small golden light ring, recover)'),
 ('barbarian','Bárbaro',G,'a muscular red-bearded barbarian with fur shoulder pads and a big two-handed axe',WALK,
  'a heavy overhead axe chop (big wind-up, chop, impact, follow-through, recover)'),
 ('red_orc','Orc Vermelho',M,'a big green orc in red and dark armor with a jagged cleaver',WALK,
  'a brutal cleaver swing; in frames 4-6 his eyes glow red with angry red steam to show his enraged mode'),
 ('shadow_assassin','Assassino Sombrio',G,'a slim hooded assassin in dark purple with twin daggers and a glowing purple scarf',
  'a fast low running cycle, leaning forward (6 frames)',
  'a lightning-fast double dagger slash with purple motion streaks (crouch, dash, slash, slash, spin, recover)'),
 ('stone_guardian','Guardião de Pedra',G,'a bulky armored stone guardian with blue-grey rock body and gold armor plates and a huge stone fist',
  'a slow heavy stomping walk cycle (6 frames)', 'a slow ground-pound punch (raise fist, slam, rock debris burst, recover)'),
 ('dwarf_warrior','Guerreiro Anão',G,'a stocky dwarf warrior with a braided brown beard, horned helmet and a double-headed battle axe',WALK,
  'a wide spinning axe sweep that hits all around him, with a dust ring on the ground at the impact (area attack)'),
 ('royal_lancer','Lanceiro Real',G,'a royal soldier in blue armor with a long spear and a round shield',WALK,
  'a long forward spear thrust (pull back, thrust, full extension, recover)'),
 ('elven_archer','Arqueira Élfica',M,'a graceful elf archer with long blond hair, green hood and a wooden longbow',WALK,
  'drawing and shooting the longbow (take arrow, draw, aim, release with the arrow just leaving the bow, recoil, recover); do not draw the arrow flying away'),
 ('royal_archer','Arqueiro Real',G,'a royal archer with a blue hood and cape and a big crossbow',WALK,
  'loading and firing the crossbow (load, aim, shoot with a small flash at the tip, recoil, recover); do not draw the bolt flying away'),
 ('arcane_mage','Mago Arcano',G,'a wizard in a blue robe and pointed hat with a staff topped with a glowing blue crystal',WALK,
  'casting a spell: raise staff, blue magic gathers on the crystal, thrust staff forward with a blue glowing orb leaving the crystal, recover'),
 ('shadow_sorceress','Feiticeira Sombria',G,'a dark sorceress in a black and purple dress with glowing purple hands',WALK,
  'casting: purple energy swirls in her hands, she throws a purple orb forward, recover'),
 ('necromancer','Necromante',G,'a skeletal necromancer in a tattered purple hooded robe with a skull staff and floating green ghost flames',WALK,
  'raising the staff and sending a green ghostly orb forward while small green souls swirl around him'),
 ('goblin_gunner','Atirador Goblin',M,'a small green goblin with goggles carrying a big brass hand cannon',WALK,
  'two quick shots in a row (aim, shot with muzzle flash and smoke, recoil, aim, second shot, recoil)'),
 ('fire_dragon','Dragão de Fogo',G,'a big red and orange dragon with large wings',FLY,
  'breathing a long stream of fire forward (open mouth, fire grows, long fire breath, fire fades, close mouth)'),
 ('ice_dragon','Dragão de Gelo',G,'a light blue ice dragon with crystal spikes and frosty wings',FLY,
  'a short icy bite with a burst of frost crystals in front of the mouth (close range freeze attack)'),
 ('phoenix','Fênix',G,'a majestic phoenix bird made of golden orange flames',FLY,
  'a fiery wing strike that throws a small fireball forward (raise wings, flap, fireball leaves, recover)'),
 ('stone_golem','Golem de Pedra',G,'a colossal grey stone golem with moss and glowing blue runes',
  'a very slow heavy walk cycle (6 frames)', 'a slow double-fist smash on a wall in front of him (raise both fists, smash, rock debris, recover)'),
 ('mountain_troll','Troll das Montanhas',G,'a huge grey-blue mountain troll with a big wooden club and fur loincloth',WALK,
  'a powerful upward golf-swing with the club that launches the enemy away (wind-up low, swing up, impact with a big dust burst, follow-through high, recover)'),
 ('royal_griffin','Grifo Real',G,'a royal griffin with white eagle head, golden lion body, blue and gold armor saddle, walking on the ground (wings folded)',WALK,
  'pouncing forward with a beak bite and claw swipe, wings opening for balance'),
 ('guardian_ent','Ent Guardião',M,'a giant walking tree guardian with bark skin, glowing green eyes and leafy crown',
  'a slow heavy walk cycle (6 frames)', 'a slow branch-arm slam with leaves and splinters flying'),
 ('infernal_demon','Demônio Infernal',G,'a huge red demon with black horns, bat wings folded, burning orange eyes and a flaming sword',WALK,
  'a wide flaming sword slash with an arc of fire (area attack); in frame 1 a dark purple aura pulses around him'),
 ('royal_cleric','Clériga Real',G,'a young cleric woman in white and gold robes with a golden holy staff',WALK,
  'raising the staff and releasing a soft golden healing light pulse around her'),
 ('dwarf_engineer','Engenheiro Anão',G,'a dwarf engineer with goggles, leather apron and a big wrench',WALK,
  'hammering with the wrench in front of him with small sparks (building/repairing motion)'),
 ('war_wolf','Lobo de Guerra',G,'a big grey war wolf wearing blue and gold armor plates',
  'a fast galloping run cycle (6 frames)', 'a leaping bite attack (crouch, leap, bite, land, recover)'),
 ('goblin_hunter','Caçador de Goblins',G,'a human hunter with a green hood, leather armor and a heavy crossbow with a goblin skull trophy on the belt',WALK,
  'firing the heavy crossbow (aim, shoot, recoil, reload, recover); do not draw the bolt flying away'),
 ('forest_druid','Druida da Floresta',M,'an old druid with a green moss beard, leaf cloak and a twisted wooden staff with glowing leaves',WALK,
  'raising the staff and sending a glowing green leaf forward with small leaves swirling'),
 ('skeleton_summoner','Invocador de Esqueletos',G,'a hooded dark priest in purple robes with a bone staff and floating skulls',WALK,
  'slamming the bone staff on the ground with a purple magic circle appearing under it'),
 ('vampire_bat','Morcego Vampírico',G,'a big dark red vampire bat with wide leathery wings and sharp fangs',FLY,
  'a diving bite with fangs and a small red drain wisp coming back to the bat'),
 ('skeleton','Esqueleto (invocado)',G,'a small cartoon skeleton warrior with a rusty sword and a small wooden shield',WALK,
  'a quick sword slash'),
 ('dwarf_turret','Torre Anã (invocada)',G,'a small wooden and brass dwarf cannon tower with a blue flag',
  'ROW 1 instead shows the tower being built: 6 frames from wooden pieces to the complete tower',
  'the cannon on top firing (aim, fire with muzzle flash and smoke, recoil, recover)'),
]
S = [  # magias: 1 linha de 8 quadros
 ('fireball','Bola de Fogo','a big fireball falling from the sky diagonally, hitting the ground and exploding into a round fire blast with smoke and embers'),
 ('freeze','Congelamento','ice crystals bursting up from the ground into a frozen ice cluster, holding, then shattering into ice shards'),
 ('divine_heal','Cura Divina','a column of soft golden holy light coming down from the sky with sparkles and a golden circle on the ground, then fading'),
 ('lightning','Relâmpago','a dark cloud flash and a bright blue-white lightning bolt striking the ground with an electric burst, then fading sparks'),
 ('arcane_shield','Escudo Arcano','a translucent blue arcane dome shield with glowing runes forming from the ground up, shimmering, then fading'),
 ('poison','Veneno','a toxic green bubbling cloud with skull-shaped bubbles growing on the ground, swirling, then dispersing'),
 ('arrow_rain','Chuva de Flechas','a volley of many arrows falling diagonally from the sky and sticking into the ground, with small dust puffs'),
 ('skeleton_summon','Invocação Esquelética','a purple magic circle on the ground with purple flames, skeleton hands and bones rising out of it, then the glow fading'),
]
SPELL = ('Sprite sheet of a spell visual effect for a 2D mobile battle game. ' + STYLE.replace(' Use the attached card art as the exact character design reference (same face, colors, outfit and weapon).', ' Use the attached card art as color and style reference.') +
         ' {bg}, no gradients, no shadow on the background, no ground, no text, no labels, no frame borders. '
         'Exactly 1 horizontal row of 8 frames, all the same size on an invisible even grid, seen from the side at ground level. '
         'Effect "{name}": {desc}. Frames 1-2 start, frames 3-5 full strength, frames 6-8 fade out. '
         'The effect is centered in each frame and sits on the same ground line in every frame. '
         'Leave generous empty background space around every frame (at least 20% margin) so nothing is cut or touches the next frame.')

def img(cid):
    p = os.path.join(ROOT, 'web', 'img', 'cards', cid + '.webp')
    if not os.path.exists(p):
        return ''
    return '<img src="data:image/webp;base64,' + base64.b64encode(open(p, 'rb').read()).decode() + '">'

CHAR = ('Character design reference sheet for a 2D mobile battle game: ONE single full-body character, {desc}. ' + STYLE + ' '
        'Show only this one character, standing in a neutral ready pose, full body from head to feet, seen from the side (3/4 side view) facing RIGHT, '
        'holding its weapon (if it has one) in its normal position. Show every detail clearly: face, hair, armor, clothes, colors, patterns, weapon and accessories (whatever it has), '
        'so this exact design can be reused later for the animations. {bg}, no gradients, no vignette, no shadow on the background, no floor, no text, '
        'no numbers, no labels, no border. Square image (1:1). The character is centered and takes about 60% of the image height, '
        'with wide empty background space on all four sides so no part (weapon, wings, tail, hat, cape, effects) is cut or touches the edge. '
        'Sharp, clean, high definition, even lighting.')
CHAR_FLY = CHAR.replace('standing in a neutral ready pose, full body from head to feet', 'flying in a neutral hovering pose with wings fully open, the whole body and both wings visible')
FX = ('Visual effect design reference for a 2D mobile battle game: the spell "{name}" at its full strength, one single image of the effect: {desc}. '
      + STYLE.replace(' Use the attached card art as the exact character design reference (same face, colors, outfit and weapon).', ' Use the attached card art as color and style reference.') +
      ' Seen from the side at ground level. Show every detail clearly (shapes, colors, glow, particles) so this exact design can be reused later for the animation. '
      '{bg}, no gradients, no vignette, no shadow on the background, no floor, no text, no labels, no border. Square image (1:1). '
      'The effect is centered and takes about 60% of the image, with wide empty background space on all four sides so nothing is cut or touches the edge.')
FLYERS = {'fire_dragon', 'ice_dragon', 'phoenix', 'vampire_bat'}
blocks = []
for cid, nm, bg, desc, walk, atk in T:
    if cid == 'dwarf_turret':
        desc = 'a small finished wooden and brass dwarf cannon tower with a blue flag, cannon pointing RIGHT'
    pr = (CHAR_FLY if cid in FLYERS else CHAR).format(desc=desc, bg=bg[0].upper() + bg[1:])
    if cid == 'dwarf_turret':
        pr = pr.replace('ONE single full-body character', 'ONE single object').replace('Show only this one character', 'Show only this one object').replace(', standing in a neutral ready pose, full body from head to feet, seen from the side (3/4 side view) facing RIGHT, holding the weapon in its normal position', ', complete, seen from the side (3/4 side view)')
    blocks.append((cid, nm, 'Tropa' if 'invocad' not in nm else 'Invocada', bg == M, pr))
EN = {'fireball':'Fireball','freeze':'Freeze','divine_heal':'Divine Heal','lightning':'Lightning','arcane_shield':'Arcane Shield','poison':'Poison','arrow_rain':'Arrow Rain','skeleton_summon':'Skeleton Summon'}
FULL = {'fireball':'a big round fire explosion on the ground with flames, smoke and embers, a fireball still visible at the top',
        'freeze':'a cluster of sharp blue ice crystals bursting out of the ground with frost mist',
        'divine_heal':'a column of soft golden holy light from above with sparkles and a glowing golden circle on the ground',
        'lightning':'a bright blue-white lightning bolt striking the ground with an electric burst and sparks',
        'arcane_shield':'a translucent blue arcane dome shield with glowing runes around its base',
        'poison':'a bubbling toxic green cloud with small skull-shaped bubbles over a green puddle',
        'arrow_rain':'many arrows falling diagonally from above and several stuck in the ground with dust puffs',
        'skeleton_summon':'a purple magic circle on the ground with purple flames and skeleton hands and bones rising from it'}
for cid, nm, desc in S:
    bg = M if cid == 'poison' else G
    blocks.append((cid, nm, 'Magia', bg == M, FX.format(name=EN[cid], desc=FULL[cid], bg=bg[0].upper() + bg[1:])))

out = ['<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
       '<title>Prompts de arte</title><style>body{font-family:system-ui,sans-serif;background:#10162b;color:#eef;margin:12px;max-width:900px}'
       'h1{font-size:21px}.c{background:#18213f;border:1px solid #33406a;border-radius:12px;padding:12px;margin:14px 0}'
       '.h{display:flex;gap:10px;align-items:center}.h img{width:64px;height:64px;border-radius:8px}.h b{font-size:17px}.t{color:#ffd77a;font-size:13px}'
       '.m{color:#ff8ad8;font-size:13px}pre{white-space:pre-wrap;background:#0b1024;padding:10px;border-radius:8px;font-size:13px;line-height:1.4}'
       'button{background:#2f5bd3;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-size:14px}li{margin:4px 0}</style></head><body>'
       '<h1>Prompts de personagens — Bastion Barons</h1>'
       '<ul><li><b>Anexe a imagem da carta</b> (a que aparece em cada bloco) como referência junto com o prompt.</li>'
       '<li>Uma imagem por carta: só o personagem (ou o efeito da magia), com todos os detalhes. A animação vem depois.</li>'
       '<li>Fundo verde; personagens verdes (goblin, orc, ent, druida, elfa) e o veneno vão em <b>magenta</b> para o recorte não apagar o personagem.</li>'
       '<li>Mande cada folha como <b>anexo de arquivo</b> e diga de qual carta é.</li></ul>']
for i, (cid, nm, kind, mag, pr) in enumerate(blocks, 1):
    out.append(f'<div class="c"><div class="h">{img(cid)}<div><b>{i}. {html.escape(nm)}</b><div class="t">{kind}' + (' · <span class="m">fundo magenta</span>' if mag else '') +
               f'</div></div></div><pre id="p{i}">{html.escape(pr)}</pre><button onclick="navigator.clipboard.writeText(document.getElementById(\'p{i}\').innerText);this.textContent=\'Copiado!\'">Copiar prompt</button></div>')
out.append('</body></html>')
open(os.path.join(ROOT, 'docs', 'prompts_arte.html'), 'w').write('\n'.join(out))
with open(os.path.join(ROOT, 'docs', 'PROMPTS_ARTE.md'), 'w') as f:
    for i, (cid, nm, kind, mag, pr) in enumerate(blocks, 1):
        f.write(f'## {i}. {nm} ({kind}{", fundo magenta" if mag else ""})\n\n{pr}\n\n')
print(len(blocks), 'prompts')

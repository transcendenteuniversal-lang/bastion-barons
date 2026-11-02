// Gera docs/CARTAS.md e docs/cartas.html com todas as cartas, barões, castelos e regras (em português).
// Uso: node tools/cards-doc.js
const fs = require('fs'), path = require('path');
global.window = global;
require('../web/js/data.js'); require('../web/js/strings.js');
const C = window.BB.CONTENT, P = window.BB.STRINGS.pt, B = C.balance, sp = B.moveSpeedScale || 1;
const n = (v) => String(+(+v).toFixed(2)).replace('.', ',');
const R = { Common: 'Comum', Rare: 'Rara', Epic: 'Épica', Legendary: 'Lendária', Mythic: 'Mítica' };
const ALVO = { Ground: 'Terra', Air: 'Ar', Both: 'Terra e ar', CastleOnly: 'Só castelo' };
const nm = (id) => P['card.' + id + '.name'] || id;
const ds = (c) => (P['card.' + c.id + '.desc'] || '').replace(/\|/g, '/');
function hab(c) {
  const v = c.abilityValue, pct = (x) => Math.round(x * 100) + '%';
  switch (c.ability) {
    case 'Lifesteal': return 'Roubo de vida: recupera ' + pct(v) + ' do dano causado';
    case 'HealAura': return 'Cura ' + v + ' de vida nos aliados num raio de ' + n(c.abilityRadius) + ', a cada ' + n(c.abilityInterval) + ' s';
    case 'BonusVs': return '+' + pct(v) + ' de dano contra ' + ({ goblin: 'goblins' }[c.bonusTag] || c.bonusTag);
    case 'ProtectAura': return 'Aura protetora: aliados num raio de ' + n(c.abilityRadius) + ' recebem ' + pct(v) + ' menos dano';
    case 'Splash': return 'Dano em área (raio ' + n(c.abilityRadius) + ')';
    case 'BuildTurret': return 'Ao entrar, constrói ' + (c.summonCount || 1) + ' ' + nm(c.summonId);
    case 'Summon': return 'Invoca ' + (c.summonCount || 1) + ' ' + nm(c.summonId) + (c.summonCount > 1 ? 's' : '') + ' a cada ' + n(c.abilityInterval) + ' s';
    case 'SlowOnHit': return 'Cada ataque deixa o alvo ' + pct(v) + ' mais lento por ' + n(c.abilityDuration || 2) + ' s';
    case 'Rebirth': return 'Renasce uma vez com ' + pct(v) + ' da vida';
    case 'Regen': return 'Regenera ' + v + ' de vida por segundo';
    case 'None': case undefined: return '—';
    default: return c.ability;
  }
}
function efeito(c) {
  const v = c.spellValue, r = c.spellRadius ? ' num raio de ' + n(c.spellRadius) : ' em toda a rota';
  switch (c.spell) {
    case 'Heal': return 'Cura ' + v + ' de vida das suas tropas' + r;
    case 'Shield': return 'Escudo de ' + v + ' nas suas tropas' + r + ' por ' + n(c.spellDuration) + ' s';
    case 'Poison': return v + ' de dano por segundo' + r + ' por ' + n(c.spellDuration) + ' s';
    case 'Damage': return v + ' de dano nos inimigos' + r;
    case 'Summon': return 'Invoca ' + (c.summonCount || 1) + ' ' + nm(c.summonId) + 's';
    case 'Stun': return 'Paralisa os inimigos' + r + ' por ' + n(c.spellDuration) + ' s';
    case 'StrongestTargets': return v + ' de dano em cada um dos ' + c.spellHits + ' inimigos mais fortes da rota';
    default: return c.spell;
  }
}
let o = '# Cartas — Bastion Barons\n\n**DPS** = dano por segundo (dano ÷ intervalo entre ataques). **Velocidade** = unidades andadas por segundo. ' +
  'A rota mede ' + B.laneLength + ' unidades (' + (B.laneLength - 2 * B.castleFront) + ' entre as frentes dos castelos); o alcance usa a mesma medida (1,5 = corpo a corpo).\n\n';
const groups = [['Tropas e criaturas', (c) => !c.isSpell && c.type !== 'Spell' && !c.token], ['Magias', (c) => c.type === 'Spell'], ['Invocadas (não colecionáveis)', (c) => c.token]];
for (const [g, f] of groups) {
  const L = C.cards.filter(f).sort((a, b) => (a.cost || 0) - (b.cost || 0) || nm(a.id).localeCompare(nm(b.id)));
  o += '## ' + g + ' (' + L.length + ')\n\n';
  if (g === 'Magias') {
    o += '| # | Carta | Na arena | Nome | Raridade | Custo | Efeito | Dano no castelo | Descrição |\n|---|---|---|---|---|---|---|---|---|\n';
    L.forEach((c, i) => o += '| ' + (i + 1) + ' | {{img:card:' + c.id + '}} | {{img:arena:' + (c.type === 'Spell' ? 'fx_' + c.id : c.id) + '}} | **' + nm(c.id) + '** | ' + R[c.rarity] + ' | ' + c.cost + ' | ' + efeito(c) + ' | ' + (c.castleDamageRatio ? Math.round(c.castleDamageRatio * 100) + '% do dano' : '—') + ' | ' + ds(c) + ' |\n');
  } else {
    o += '| # | Carta | Na arena | Nome | Raridade | Voa | Custo | Vida | Dano | Intervalo | DPS | Velocidade | Alcance | Ataca | Habilidade | Descrição |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
    L.forEach((c, i) => o += '| ' + (i + 1) + ' | {{img:card:' + c.id + '}} | {{img:arena:' + (c.type === 'Spell' ? 'fx_' + c.id : c.id) + '}} | **' + nm(c.id) + '** | ' + (R[c.rarity] || '') + ' | ' + (c.flying ? 'Sim' : 'Não') + ' | ' + (c.cost ?? '') + ' | ' + c.hp + ' | ' + c.damage +
      ' | ' + n(c.attackInterval) + ' s | ' + Math.round(c.damage / c.attackInterval) + ' | ' + n(c.moveSpeed * sp) + ' | ' + n(c.range) + ' | ' + (ALVO[c.targets] || c.targets) + ' | ' + hab(c) + ' | ' + ds(c) + ' |\n');
  }
  o += '\n';
}
o += '## Barões\n\n| Foto | Barão | Poder | Recarga | Efeito |\n|---|---|---|---|---|\n';
for (const b of C.barons) o += '| {{img:baron:' + b.id + '}} | **' + P['baron.' + b.id + '.name'] + '** | ' + P['baron.' + b.id + '.ability'] + ' | ' + b.chargeSeconds + ' s | ' + P['baron.' + b.id + '.desc'] + ' |\n';
o += '\n## Castelos\n\n| Foto | Castelo | Poder | Recarga (1ª vez) | Efeito |\n|---|---|---|---|---|\n';
for (const k of C.castles) o += '| {{img:castle:' + k.id + '}} | **' + P['castle.' + k.id + '.name'] + '** | ' + P['castle.' + k.id + '.ability'] + ' | ' + k.cooldown + ' s (' + k.initialCooldown + ' s) | ' + P['castle.' + k.id + '.desc'] + ' |\n';
o += '\n## Regras gerais\n\n- Vida do castelo: ' + B.castleHp + '. A torre do castelo atira ' + B.castleAttackDamage + ' de dano a cada ' + n(B.castleAttackInterval) + ' s, alcance ' + B.castleAttackRange + '.\n' +
  '- Partida de ' + B.matchSeconds + ' s. Baralho de ' + B.deckSize + ' cartas, mão de até ' + B.handMax + ', compra uma carta a cada ' + B.drawInterval + ' s.\n' +
  '- Mana: começa em ' + B.startEnergy + '; o máximo começa em ' + B.maxEnergyStart + ' e sobe +1 a cada ' + n(B.maxEnergyGrowEvery) + ' s até ' + B.maxEnergy + '. Enche ' + n(B.energyPerSecond) + ' por segundo, acelera até +' + Math.round(B.energyRamp * 100) + '% em ' + B.energyRampSeconds + ' s, e no último minuto fica ×' + n(B.doubleEnergyMult) + '.\n' +
  '- Cada nível da carta dá +' + Math.round(B.levelStatBonus * 100) + '% de vida e dano (nível máximo ' + B.maxCardLevel + ').\n' +
  '- Velocidade de todas as tropas multiplicada por ' + n(sp) + ' (já aplicado na tabela).\n';
const WEB = path.join(__dirname, '..', 'web');
const imgFile = (kind, id) => {
  if (kind === 'arena') return fs.existsSync(path.join(__dirname, '..', 'docs', 'img', 'arena', id + '.webp')) ? '../docs/img/arena/' + id + '.webp' : null;
  const f = kind === 'card' ? 'img/cards/' + id + '.webp' : kind === 'baron' ? 'img/barons/' + id + '.webp' : 'img/castle_cards/' + id + '.webp';
  return fs.existsSync(path.join(WEB, f)) ? f : null;
};
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'CARTAS.md'), o.replace(/\{\{img:(\w+):(\w+)\}\}/g, (_, k, id) => { const f = imgFile(k, id); return f ? '![](' + (k === 'arena' ? 'img/arena/' + id + '.webp' : '../web/' + f) + ')' : '—'; }));
// imagem embutida na página (abre sozinha, sem depender de outros arquivos)
global.window.BB.SPRITES = {}; require('../web/js/sprites.js'); require('../web/js/sheets.js');
const SPR = window.BB.SPRITES || {};
const imgTag = (kind, id) => {
  const f = imgFile(kind, id);
  if (f) return '<img class="ph' + (kind === 'arena' ? ' ar' : '') + '" src="data:image/webp;base64,' + fs.readFileSync(path.join(WEB, f)).toString('base64') + '">';
  const sp = SPR[id];  // sem arte de carta (ex.: Torre Anã): primeiro quadro da animação
  if (sp && sp.src && fs.existsSync(path.join(WEB, sp.src))) {
    const k = 72 / Math.max(sp.w, sp.h);
    return '<div class="ph" style="background:url(data:image/webp;base64,' + fs.readFileSync(path.join(WEB, sp.src)).toString('base64') + ') 0 0/' + Math.round(sp.w * k * (sp.walk + sp.attack)) + 'px auto no-repeat;width:' + Math.round(sp.w * k) + 'px;height:' + Math.round(sp.h * k) + 'px"></div>';
  }
  return '—';
};
// versão em página
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;'), inl = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\{\{img:(\w+):(\w+)\}\}/g, (_, k, id) => imgTag(k, id));
const lines = o.split('\n'), h = ['<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cartas — Bastion Barons</title><style>body{font-family:system-ui,sans-serif;background:#10162b;color:#eef;margin:12px}h1{font-size:22px}h2{font-size:18px;color:#ffd77a;margin-top:24px}.w{overflow-x:auto}table{border-collapse:collapse;font-size:13px;min-width:900px}th,td{border:1px solid #33406a;padding:5px 7px;text-align:left;vertical-align:top}th{background:#1e2b55}tr:nth-child(even) td{background:#161f3d}td:nth-child(2){white-space:nowrap}li{margin:4px 0}.ph{width:72px;height:auto;border-radius:8px;display:block}.ar{width:auto;max-width:90px;max-height:90px;border-radius:0;background:radial-gradient(#3a4a7a,#1a2244 70%);padding:4px}td:first-child+td{width:76px}</style></head><body>'];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (l.startsWith('# ')) h.push('<h1>' + inl(l.slice(2)) + '</h1>');
  else if (l.startsWith('## ')) h.push('<h2>' + inl(l.slice(3)) + '</h2>');
  else if (l.startsWith('|')) {
    const rows = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]); i--;
    const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    h.push('<div class="w"><table><tr>' + cells(rows[0]).map((c) => '<th>' + inl(c) + '</th>').join('') + '</tr>' + rows.slice(2).map((r) => '<tr>' + cells(r).map((c) => '<td>' + inl(c) + '</td>').join('') + '</tr>').join('') + '</table></div>');
  } else if (l.startsWith('- ')) h.push('<li>' + inl(l.slice(2)) + '</li>');
  else if (l.trim()) h.push('<p>' + inl(l) + '</p>');
}
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'cartas.html'), h.join('\n') + '</body></html>');
console.log('docs/CARTAS.md e docs/cartas.html gerados');

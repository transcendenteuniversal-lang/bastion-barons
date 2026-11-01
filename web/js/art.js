// Arte: ilustrações recortadas da arte oficial (img/cards, img/barons). Cartas ainda sem ilustração própria
// recebem um emblema provisório gerado aqui (lista em docs/ASSETS.md).
(function (BB) {
  'use strict';
  const HAS_ART = ['arcane_mage', 'elven_archer', 'fire_dragon', 'fireball', 'freeze', 'goblin_gunner', 'ice_dragon', 'infernal_demon', 'mountain_troll',
    'necromancer', 'paladin', 'phoenix', 'red_orc', 'royal_archer', 'royal_griffin', 'royal_knight', 'shadow_sorceress', 'skeleton', 'skeleton_summon',
    'stone_golem', 'stone_guardian'];
  const GLYPH = { barbarian: '🪓', shadow_assassin: '🗡️', dwarf_warrior: '⚒️', royal_lancer: '🔱', guardian_ent: '🌳', royal_cleric: '✨', dwarf_engineer: '🔧',
    divine_heal: '💖', lightning: '⚡', arcane_shield: '🛡️', poison: '☠️', arrow_rain: '🏹', dwarf_turret: '🏰' };
  const CLASS_COLOR = { King: '#2d57c8', Paladin: '#c9d2e0', Archer: '#3e9b45', Mage: '#2e5fd6', Necromancer: '#6b2fb0', Orc: '#b8322b', Assassin: '#2b2b3a',
    Druid: '#4f7f22', Cleric: '#e8d9a8', Engineer: '#c27a2c', Barbarian: '#8b5a2b', Guardian: '#7d8590', Beast: '#c9562b' };
  const cache = {}, imgs = {};

  function generated(def) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const col = CLASS_COLOR[def.cls] || '#556';
    const grd = g.createRadialGradient(128, 110, 10, 128, 128, 190);
    grd.addColorStop(0, '#ffffff55'); grd.addColorStop(0.15, col); grd.addColorStop(1, '#0a0f24');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,215,120,.35)'; g.lineWidth = 6;
    for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(128, 128); const a = (i / 12) * Math.PI * 2; g.lineTo(128 + Math.cos(a) * 200, 128 + Math.sin(a) * 200); g.stroke(); }
    g.font = '120px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 16;
    g.fillText(GLYPH[def.id] || '★', 128, 136);
    return c.toDataURL('image/png');
  }

  BB.art = {
    cardUrl(def) {
      if (cache[def.id]) return cache[def.id];
      return (cache[def.id] = HAS_ART.includes(def.id) ? 'img/cards/' + def.id + '.webp' : generated(def));
    },
    baronUrl(id) { return 'img/barons/' + id + '.webp'; },
    // Imagens carregadas para desenhar no canvas da batalha
    image(url) {
      if (imgs[url]) return imgs[url];
      const im = new Image(); im.src = url; imgs[url] = im;
      return im;
    },
    cardImage(def) { return BB.art.image(BB.art.cardUrl(def)); },
    preload(content) { for (const c of content.allCards) BB.art.cardImage(c); for (const b of content.barons) BB.art.image(BB.art.baronUrl(b.id)); },
    hasArt: (id) => HAS_ART.includes(id),
  };
})(window.BB);

// Arte: ilustrações da coleção oficial (img/cards) e retratos dos Barões (img/barons).
// Só a Torre Anã (unidade invocada, sem carta) usa um emblema gerado aqui.
(function (BB) {
  'use strict';
  const NO_ART = ['dwarf_turret'];
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

  // castelos com arte própria em img/castles/<id>.webp (vazio = usa o castelo desenhado na arena)
  BB.CASTLE_ART = [];

  // caminho da folha de uma tropa / efeito (folhas de quadros têm 'src' próprio)
  BB.unitSrc = (id) => (BB.SPRITES && BB.SPRITES[id] && BB.SPRITES[id].src) || 'img/units/' + id + '.webp';
  BB.fxSrc = (key) => (BB.FX && BB.FX[key] && BB.FX[key].src) || 'img/units/' + key + '.webp';

  BB.art = {
    cardUrl(def) {
      if (cache[def.id]) return cache[def.id];
      return (cache[def.id] = !NO_ART.includes(def.id) ? 'img/cards/' + def.id + '.webp' : generated(def));
    },
    baronUrl(id) { return 'img/barons/' + id + '.webp'; },
    // Imagens carregadas para desenhar no canvas da batalha
    image(url) {
      if (imgs[url]) return imgs[url];
      const im = new Image(); im.src = url; imgs[url] = im;
      return im;
    },
    cardImage(def) { return BB.art.image(BB.art.cardUrl(def)); },
    preload(content) { for (const c of content.allCards) { BB.art.cardImage(c); if (BB.SPRITES && BB.SPRITES[c.id]) BB.art.image(BB.unitSrc(c.id)); } for (const b of content.barons) { BB.art.image(BB.art.baronUrl(b.id)); if (BB.BARON_ANIM && BB.BARON_ANIM[b.id]) BB.art.image('img/barons/' + b.id + '_anim.webp'); if (BB.SPRITES && BB.SPRITES[b.id]) BB.art.image(BB.unitSrc(b.id)); }
      for (const k in BB.FX || {}) BB.art.image(BB.fxSrc(k)); },
    hasArt: (id) => !NO_ART.includes(id),

    // Prévia animada (tela de baralho): criatura andando com tamanho padrão da carta; feitiço com sua animação de efeito
    animatePreviews(root) {
      const cvs = [...root.querySelectorAll('canvas[data-unit]')];
      if (!cvs.length) return;
      const t0 = performance.now();
      const loop = (now) => {
        if (!cvs[0].isConnected) return;
        const t = (now - t0) / 1000;
        cvs.forEach((cv, i) => BB.art.drawPreview(cv, BB.content.card(cv.dataset.unit), t + i * 0.37));
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },
    drawPreview(cv, def, t) {
      const g = cv.getContext('2d'), W = cv.width, H = cv.height;
      g.clearRect(0, 0, W, H);
      const sp = BB.SPRITES && BB.SPRITES[def.sprite || def.id], fx = BB.FX && BB.FX['fx_' + def.id];
      if (sp) {
        const im = BB.art.image(BB.unitSrc(def.id));
        if (!im.complete || !im.naturalWidth) return;
        const body = (def.flying ? 108 : 122) * (0.86 + Math.min(1, def.hp / 1800) * 0.3);
        const lift = def.flying ? 14 + Math.sin(t * 2) * 3 : 0, foot = H - 8 - lift;
        // cabe no quadro: nada cortado em cima nem dos lados
        const wb = sp.wb || [-sp.ax, -sp.ay, sp.w - sp.ax, sp.h - sp.ay];
        const s = Math.min(body / sp.body, (foot - 4) / -wb[1], (W / 2 - 2) / Math.max(-wb[0], wb[2], 1));
        const fr = Math.floor(t * 5) % sp.walk; // passo calmo na vitrine
        g.drawImage(im, fr * sp.w, 0, sp.w, sp.h, W / 2 - sp.ax * s, foot - sp.ay * s, sp.w * s, sp.h * s);
      } else if (fx) {
        const im = BB.art.image(BB.fxSrc('fx_' + def.id));
        if (!im.complete || !im.naturalWidth) return;
        const fr = Math.floor((t % 2) / 2 * fx.n), s = Math.min((W - 10) / fx.w, (H - 10) / fx.h);
        g.drawImage(im, fr * fx.w, 0, fx.w, fx.h, (W - fx.w * s) / 2, H - 6 - fx.h * s, fx.w * s, fx.h * s);
      } else {
        const im = BB.art.cardImage(def);
        if (im.complete && im.naturalWidth) g.drawImage(im, W / 2 - 55, H - 120, 110, 110);
      }
    },
  };
})(window.BB);

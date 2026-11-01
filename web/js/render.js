// Desenho do campo de batalha: a arte da arena (img/arena.webp) é o cenário, e tropas, Barões e efeitos
// são posicionados nas coordenadas dessa imagem (1672×941). Só lê o estado da partida; nunca o altera.
(function (BB) {
  'use strict';
  const TAU = Math.PI * 2;
  const AW = 1672, AH = 941;

  // Medidas da arena em pixels da imagem (ver art/source/arena.png)
  const ARENA = {
    lanes: [ // centro Y, faixa Y, início/fim X (perspectiva: a rota de baixo é mais larga), escala das tropas
      { y: 322, y0: 272, y1: 370, xL: 385, xR: 1295, k: 0.88 },
      { y: 470, y0: 418, y1: 522, xL: 352, xR: 1328, k: 1.0 },
      { y: 630, y0: 574, y1: 690, xL: 282, xR: 1398, k: 1.12 },
    ],
    castle: [{ x0: 0, y0: 0, x1: 360, y1: 700, gx: 200, gy: 520 }, { x0: 1312, y0: 0, x1: 1672, y1: 700, gx: 1475, gy: 520 }],
    // o Barão fica na sacada do castelo
    baron: [{ x: 226, y: 262, r: 56 }, { x: 1446, y: 262, r: 56 }],
    unitR: 46,
  };
  BB.ARENA = ARENA;

  const SPELL_COLOR = {
    fireball: '#ff6a1e', freeze: '#9fe6ff', divine_heal: '#ffe68a', lightning: '#fff27a', arcane_shield: '#6fd8ff',
    poison: '#7cd32b', arrow_rain: '#e9d8a6', skeleton_summon: '#c04dff', elven_rain_wave: '#7cff8a',
  };
  const PROJ_COLOR = { Necromancer: '#c04dff', Mage: '#6fd8ff', Beast: '#ff8a3a', Archer: '#f2e3b3', Cleric: '#ffe68a', Engineer: '#ffd27a' };

  class Renderer {
    constructor(canvas) {
      this.cv = canvas; this.g = canvas.getContext('2d');
      this.views = new Map(); this.ghosts = []; this.fx = []; this.texts = [];
      this.shake = 0; this.castleHit = [0, 0]; this.baronCast = [0, 0]; this.baronAnim = [-1, -1]; this.collapse = [0, 0]; this.t = 0; this.lastDt = 0;
      this.arena = BB.art.image('img/arena.webp');
      this.resize();
    }

    // Encaixa a arena inteira na tela (sem cortar o HUD desenhado na arte); sobras laterais recebem a própria arte desfocada.
    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = window.innerWidth, H = window.innerHeight;
      this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
      this.dpr = dpr; this.W = W; this.H = H;
      const s = Math.min(W / AW, H / AH);
      this.s = s; this.ox = (W - AW * s) / 2; this.oy = (H - AH * s) / 2;
      if (this.onLayout) this.onLayout(this);
    }

    // conversões imagem <-> tela
    X(x) { return this.ox + x * this.s; }
    Y(y) { return this.oy + y * this.s; }
    toImage(px, py) { return { x: (px - this.ox) / this.s, y: (py - this.oy) / this.s }; }

    lane(i) { return ARENA.lanes[i]; }
    // posição da simulação (0..L) -> X na imagem, por rota
    laneX(m, x, i) {
      const l = ARENA.lanes[i], f0 = m.castleFront(0), f1 = m.castleFront(1);
      return l.xL + ((x - f0) / (f1 - f0)) * (l.xR - l.xL);
    }
    laneAt(px, py) {
      const p = this.toImage(px, py);
      for (let i = 0; i < 3; i++) {
        const l = ARENA.lanes[i];
        if (p.y >= l.y0 - 20 && p.y <= l.y1 + (i === 2 ? 0 : 5) && p.x > l.xL - 140 && p.x < l.xR + 140) return i;
      }
      return -1;
    }

    // ------------------------------------------------------------ eventos -> efeitos (coordenadas da imagem)
    onEvent(m, e) {
      const v = e.unitId ? this.views.get(e.unitId) : null;
      const laneW = (i) => ARENA.lanes[i].xR - ARENA.lanes[i].xL;
      switch (e.type) {
        case 'UnitAttack': {
          const def = m.content.cards[e.id];
          if (v) { v.lunge = 0.22; v.atk = 0; v.atkDur = def ? Math.max(0.45, Math.min(1.1, def.attackInterval * 0.85)) : 0.6; }
          if (!def || !v) break;
          if (def.range <= 4) {
            const tv = e.targetId ? this.views.get(e.targetId) : null;
            if (tv) this.playFx('fx_hit', tv.x, tv.y - tv.r * 0.2, 70, 0.3);
            else if (!e.targetId) { const c = this.castlePoint(1 - e.player); this.playFx('fx_hit', c.x, c.y + 40, 90, 0.3); }
          }
          if (def.range > 4) {
            const tv = e.targetId ? this.views.get(e.targetId) : null;
            const to = tv ? { x: tv.x, y: tv.y - tv.r * 0.4 - tv.lift } : this.castlePoint(1 - e.player);
            const col = PROJ_COLOR[def.cls] || '#f2e3b3';
            this.fx.push({ k: 'proj', x0: v.x, y0: v.y - v.r - v.lift, x1: to.x, y1: to.y, t: 0, d: 0.22, c: col, r: def.cls === 'Mage' ? 9 : 6 });
            if (def.ability === 'Splash') this.fx.push({ k: 'burst', x: to.x, y: to.y, r: (def.abilityRadius / m.L) * laneW(e.lane), t: -0.2, d: 0.4, c: col });
          }
          break;
        }
        case 'UnitSpawned': {
          const l = ARENA.lanes[e.lane];
          this.playFx('fx_deploy', this.laneX(m, e.x, e.lane), l.y + (l.y1 - l.y0) * 0.35, 95 * l.k, 0.55);
          break;
        }
        case 'UnitDied': if (v) this.playFx('fx_death', v.x, v.y + v.r * 0.5 - v.lift, 90 * ARENA.lanes[v.u.lane].k, 0.6); break;
        case 'MatchEnded': {
          if (e.player === 0 || e.player === 1) {
            const c = ARENA.castle[1 - e.player];
            this.playFx('fx_castle_destroyed', (c.x0 + c.x1) / 2, c.y1, 520, 2.2);
            if (e.player === 0) this.playFx('fx_victory', AW / 2, 560, 420, 2.8);
          }
          break;
        }
        case 'UnitRevived': if (v) { v.born = 0; this.fx.push({ k: 'burst', x: v.x, y: v.y, r: v.r * 2.5, t: 0, d: 0.5, c: '#ffb23a' }); } break;
        case 'Heal': if (v) this.fx.push({ k: 'burst', x: v.x, y: v.y - v.lift, r: v.r * 1.4, t: 0, d: 0.35, c: '#7cff8a' }); break;
        case 'SpellCast': {
          const c = SPELL_COLOR[e.id] || '#f7c548';
          const l = ARENA.lanes[e.lane], lh = l.y1 - l.y0, sx = this.laneX(m, e.x, e.lane);
          const SPELL_FX = { // posição e tamanho de cada efeito animado
            fireball: { x: sx, h: lh * 2.4, d: 0.9 }, freeze: { x: sx, h: lh * 1.9, d: 1.1 }, poison: { x: sx, h: lh * 1.9, d: 1.3 },
            divine_heal: { x: sx, h: lh * 2.2, d: 1.2 }, arcane_shield: { x: sx, h: lh * 2.0, d: 1.2 },
            lightning: { x: sx, h: lh * 2.6, d: 1.0 }, arrow_rain: { x: (l.xL + l.xR) / 2, w: (l.xR - l.xL) * 0.75, d: 1.2 },
            skeleton_summon: { x: sx, h: lh * 1.3, d: 0.8 },
          };
          const anim = SPELL_FX[e.id];
          if (anim && this.fxSheet('fx_' + e.id)) this.fx.push(Object.assign({ k: 'anim', key: 'fx_' + e.id, y: l.y1 - lh * 0.15, t: 0 }, anim));
          else if (!e.radius) this.fx.push({ k: 'lane', lane: e.lane, t: 0, d: 0.6, c });
          else this.fx.push({ k: 'burst', x: sx, y: l.y, r: (e.radius / m.L) * laneW(e.lane), t: 0, d: 0.55, c });
          if (e.id === 'fireball') this.shake = 0.25;
          break;
        }
        case 'BaronUsed': {
          this.baronCast[e.player] = 1; this.baronAnim[e.player] = 0;
          const bab = m.players[e.player].baron.ability;
          const bkey = { RoyalCommand: 'fx_royal_command', ElvenRain: 'fx_elven_rain', ArmyOfDead: 'fx_army_of_dead', OrcFury: 'fx_orc_fury', ArcaneStorm: 'fx_arcane_storm' }[bab];
          if (bkey && this.fxSheet(bkey)) {
            if (e.lane < 0) { // Comando Real: todas as rotas
              for (const l of ARENA.lanes) this.playFx(bkey, (l.xL + l.xR) / 2, l.y1, null, 1.6, { w: (l.xR - l.xL) * 0.55 });
            } else {
              const l = ARENA.lanes[e.lane];
              const x = bab === 'ArmyOfDead' ? this.laneX(m, m.spawnX(e.player), e.lane) : (l.xL + l.xR) / 2;
              this.playFx(bkey, x, l.y1, bab === 'ArmyOfDead' ? (l.y1 - l.y0) * 1.8 : null, 1.8, bab === 'ArmyOfDead' ? {} : { w: (l.xR - l.xL) * 0.85 });
            }
            break;
          }
          const c = e.player === 0 ? '#ffd966' : '#ff9a6a';
          if (e.lane >= 0) this.fx.push({ k: 'lane', lane: e.lane, t: 0, d: 0.9, c });
          else for (let l = 0; l < 3; l++) this.fx.push({ k: 'lane', lane: l, t: 0, d: 0.9, c });
          break;
        }
        case 'CastleUsed': {
          const c = e.id === 'draconic_castle' ? '#ff6a1e' : e.id === 'glacial_fortress' ? '#9fe6ff' : '#8fe3ff';
          const key = { royal_fortress: 'fx_imperial_shield', draconic_castle: 'fx_dragon_breath', glacial_fortress: 'fx_ice_storm' }[e.id];
          const castle = ARENA.castle[e.player];
          if (key && this.fxSheet(key)) {
            if (e.lane < 0) this.fx.push({ k: 'anim', key, x: (castle.x0 + castle.x1) / 2, y: castle.y1 - 20, h: 420, t: 0, d: 1.6 });
            else {
              const l = ARENA.lanes[e.lane], lh = l.y1 - l.y0, meta = BB.FX[key];
              if (key === 'fx_dragon_breath') { // cabeça de dragão na borda do castelo, fogo atravessando a rota
                const h = lh * 1.9, w = meta.w * (h / meta.h);
                const x = e.player === 0 ? l.xL - 70 + w / 2 : l.xR + 70 - w / 2;
                this.fx.push({ k: 'anim', key, x, y: l.y1 - lh * 0.05, h, t: 0, d: 1.4, flip: e.player === 1 });
              } else this.fx.push({ k: 'anim', key, x: (l.xL + l.xR) / 2, y: l.y1 - lh * 0.1, w: (l.xR - l.xL) * 0.95, t: 0, d: 1.4, flip: e.player === 1 });
            }
          } else if (e.lane >= 0) this.fx.push({ k: 'lane', lane: e.lane, t: 0, d: 0.9, c });
          break;
        }
        case 'CastleDamaged': {
          this.castleHit[e.player] = 0.18;
          if (!this.lastCastleFx) this.lastCastleFx = [0, 0];
          if (this.t - this.lastCastleFx[e.player] > 0.6) {
            this.lastCastleFx[e.player] = this.t;
            const cp = this.castlePoint(e.player);
            this.playFx('fx_castle_hit', cp.x + (Math.random() - 0.5) * 80, cp.y + 20 - Math.random() * 120, 190, 0.7);
          }
          const pt = this.castlePoint(e.player);
          if (e.value >= 1) this.texts.push({ x: pt.x + (Math.random() - 0.5) * 60, y: pt.y - 40, s: '-' + Math.round(e.value), t: 0, d: 0.9, c: e.player === 0 ? '#ff8080' : '#ffe08a' });
          break;
        }
        case 'CastleAttack': {
          const tv = this.views.get(e.targetId);
          if (tv) { const c = ARENA.castle[e.player]; this.fx.push({ k: 'proj', x0: c.gx, y0: c.gy - 150, x1: tv.x, y1: tv.y - tv.lift, t: 0, d: 0.3, c: '#f2e3b3', r: 6 }); }
          break;
        }
      }
    }

    castlePoint(owner) { const c = ARENA.castle[owner]; return { x: c.gx, y: c.gy }; }

    // ------------------------------------------------------------ quadro
    draw(m, dt, ui) {
      this.t += dt; this.lastDt = dt;
      const g = this.g;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      // fundo: sobras laterais/verticais com a arte esticada e desfocada
      g.fillStyle = '#0b1230'; g.fillRect(0, 0, this.W, this.H);
      const img = this.arena;
      const ready = img.complete && img.naturalWidth;
      if (ready && (this.ox > 1 || this.oy > 1)) {
        g.save(); g.filter = 'blur(14px) brightness(.7)';
        const cs = Math.max(this.W / AW, this.H / AH);
        g.drawImage(img, (this.W - AW * cs) / 2, (this.H - AH * cs) / 2, AW * cs, AH * cs);
        g.restore();
      }
      let sh = 0;
      if (this.shake > 0) { this.shake -= dt; sh = this.shake * 14; }
      g.save();
      if (sh) g.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
      g.translate(this.ox, this.oy); g.scale(this.s, this.s);
      if (ready) g.drawImage(img, 0, 0, AW, AH);
      for (let i = 0; i < 2; i++) { if (this.castleHit[i] > 0) this.castleHit[i] -= dt; if (this.baronCast[i] > 0) this.baronCast[i] = Math.max(0, this.baronCast[i] - dt * 1.2); }
      if (m.over && m.winner >= 0) this.collapse[1 - m.winner] = Math.min(1, this.collapse[1 - m.winner] + dt * 0.6);

      if (ui && ui.armed) {
        for (let i = 0; i < 3; i++) {
          const l = ARENA.lanes[i], hov = i === ui.hoverLane;
          g.fillStyle = hov ? 'rgba(255,217,102,.35)' : 'rgba(255,255,255,' + (0.07 + 0.06 * Math.sin(this.t * 6)) + ')';
          g.fillRect(l.xL - 60, l.y0, l.xR - l.xL + 120, l.y1 - l.y0);
          if (hov) { g.strokeStyle = '#ffd966'; g.lineWidth = 5; g.strokeRect(l.xL - 60, l.y0, l.xR - l.xL + 120, l.y1 - l.y0); }
        }
      }

      for (let i = 0; i < 2; i++) this.drawCastleState(m, i);
      this.syncViews(m, dt);
      const list = [...this.views.values(), ...this.ghosts].sort((a, b) => (a.fly - b.fly) || (a.y - b.y));
      for (const v of list) this.drawUnit(v, dt);
      for (let i = 0; i < 2; i++) this.drawBaron(m, i);
      this.drawFx(dt);
      g.restore();
    }

    // Estado do castelo sobre a arte: impacto, escudo, rachaduras, fumaça e destruição
    drawCastleState(m, owner) {
      const g = this.g, p = m.players[owner], c = ARENA.castle[owner];
      // castelo modular: se houver arte própria (img/castles/<id>.webp, desenhada para o lado esquerdo), ela cobre o castelo da arena
      if ((BB.CASTLE_ART || []).includes(p.castle.id)) {
        const im = BB.art.image('img/castles/' + p.castle.id + '.webp');
        if (im.complete && im.naturalWidth) {
          g.save(); if (owner === 1) { g.translate(AW, 0); g.scale(-1, 1); }
          const cl = ARENA.castle[0]; g.drawImage(im, cl.x0, cl.y0, cl.x1 - cl.x0, cl.y1 - cl.y0); g.restore();
        }
      }
      const w = c.x1 - c.x0, h = c.y1 - c.y0, cx = (c.x0 + c.x1) / 2;
      if (this.castleHit[owner] > 0) {
        g.fillStyle = 'rgba(255,90,60,' + this.castleHit[owner] * 1.2 + ')';
        g.beginPath(); g.ellipse(c.gx, c.gy - 40, 110, 150, 0, 0, TAU); g.fill();
      }
      const dmg = 1 - m.hpPct(p);
      if (dmg > 0.2) { // fumaça crescente com o dano
        const n = Math.floor(dmg * 6);
        for (let i = 0; i < n; i++) {
          const x = cx + Math.sin(i * 2.7) * w * 0.3, y = c.y0 + 80 + (i % 3) * 90;
          const k = (this.t * 0.6 + i * 0.37) % 1;
          g.fillStyle = 'rgba(60,55,55,' + 0.35 * (1 - k) + ')';
          g.beginPath(); g.arc(x, y - k * 90, 18 + k * 30, 0, TAU); g.fill();
        }
      }
      if (this.collapse[owner] > 0) {
        const k = this.collapse[owner];
        g.fillStyle = 'rgba(20,10,10,' + 0.5 * k + ')'; g.fillRect(c.x0, c.y0, w, h);
        for (let i = 0; i < 8; i++) {
          const x = c.x0 + ((i * 97) % w), y = c.y1 - ((i * 53) % h) * 0.7, f = 0.5 + 0.5 * Math.sin(this.t * 9 + i);
          g.fillStyle = 'rgba(255,' + Math.round(120 + 80 * f) + ',40,' + 0.8 * k + ')';
          g.beginPath(); g.moveTo(x - 22, y); g.quadraticCurveTo(x, y - 70 * f - 30, x + 22, y); g.fill();
        }
      }
      if (p.castleShield > 0) {
        g.save(); g.globalAlpha = 0.22 + 0.08 * Math.sin(this.t * 6);
        g.fillStyle = '#8fe3ff'; g.beginPath(); g.ellipse(cx, c.y0 + h * 0.5, w * 0.6, h * 0.58, 0, 0, TAU); g.fill();
        g.globalAlpha = 0.9; g.strokeStyle = '#bff1ff'; g.lineWidth = 6; g.stroke(); g.restore();
      }
    }

    // O Barão fica no castelo comandando: não pode ser atacado
    // efeito animado de vídeo (se existir); retorna true se foi usado
    playFx(key, x, y, size, d, extra) {
      if (!this.fxSheet(key)) return false;
      this.fx.push(Object.assign({ k: 'anim', key, x, y, h: size, t: 0, d }, extra || {}));
      return true;
    }

    fxSheet(key) {
      if (!BB.FX || !BB.FX[key]) return null;
      const im = BB.art.image('img/units/' + key + '.webp');
      return im.complete && im.naturalWidth ? im : null;
    }

    drawBaron(m, owner) {
      const g = this.g, p = m.players[owner], b = ARENA.baron[owner];
      const win = m.over && m.winner === owner, lose = m.over && m.winner === 1 - owner;
      const sp = BB.SPRITES && BB.SPRITES[p.baron.id];
      const sheet = sp ? BB.art.image('img/units/' + p.baron.id + '.webp') : null;
      if (sheet && sheet.complete && sheet.naturalWidth) {
        // de pé na sacada: parado em loop; ao usar o poder, toca a animação do poder
        const foot = b.y + 54 - (win ? Math.abs(Math.sin(this.t * 7)) * 14 : 0);
        if (m.baronReady(p) && !m.over) {
          g.fillStyle = 'rgba(255,215,100,' + (0.35 + 0.3 * Math.sin(this.t * 6)) + ')';
          g.beginPath(); g.ellipse(b.x, foot, 62, 16, 0, 0, TAU); g.fill();
        }
        let row = 0, fr = Math.floor(this.t * 8 + owner * 5) % sp.walk;
        const at = this.baronAnim[owner];
        if (at >= 0 && at < 1.8) { row = 1; fr = Math.min(sp.attack - 1, Math.floor((at / 1.8) * sp.attack)); }
        if (at >= 0) this.baronAnim[owner] = at + this.lastDt;
        const s = 118 / sp.body;
        g.save(); g.translate(b.x, foot); if (owner === 1) g.scale(-1, 1);
        if (lose) g.filter = 'grayscale(1) brightness(.8)';
        g.drawImage(sheet, fr * sp.w, row * sp.h, sp.w, sp.h, -sp.ax * s, -sp.ay * s, sp.w * s, sp.h * s);
        g.restore();
        return;
      }
      const y = b.y + Math.sin(this.t * 2 + owner) * 4 - (win ? Math.abs(Math.sin(this.t * 7)) * 18 : 0) + (lose ? 10 : 0);
      const cast = this.baronCast[owner], r = b.r * (1 + cast * 0.35);
      if (m.baronReady(p) && !m.over) {
        g.strokeStyle = 'rgba(255,215,100,' + (0.5 + 0.5 * Math.sin(this.t * 6)) + ')'; g.lineWidth = 9;
        g.beginPath(); g.arc(b.x, y, r + 10, 0, TAU); g.stroke();
      }
      if (cast > 0) { g.fillStyle = 'rgba(255,230,140,' + cast * 0.6 + ')'; g.beginPath(); g.arc(b.x, y, r * 1.9, 0, TAU); g.fill(); }
      g.save(); if (lose) g.filter = 'grayscale(1)';
      medallion(g, BB.art.image(BB.art.baronUrl(p.baron.id)), b.x, y, r, owner === 0 ? '#2f7bff' : '#e0323a', 7, owner === 1);
      g.restore();
    }

    // Posições na tela: cada tropa segue a simulação, mas com espaçamento visual para não empilhar:
    // 1) quem luta corpo a corpo para a uma distância de corpo do alvo (frente a frente);
    // 2) aliados próximos na mesma rota se distribuem em fileiras (frente, trás, acima, abaixo).
    syncViews(m, dt) {
      const seen = new Set();
      const base = new Map();
      const alive = m.units.filter((u) => u.hp > 0);
      for (const u of alive) base.set(u.id, this.laneX(m, u.x, u.lane));
      const bodyW = (u) => 70 * ARENA.lanes[u.lane].k * (0.86 + Math.min(1, u.def.hp / 1800) * 0.3) * (u.flying ? 1.3 : 1);
      const tx = new Map();
      for (const u of alive) {
        let x = base.get(u.id);
        const dir = u.owner === 0 ? 1 : -1;
        if (u.state === 'Attacking' && u.targetId && base.has(u.targetId)) {
          const t = m.findUnit(u.targetId);
          if (t && t.flying === u.flying) { // frente a frente: distância mínima de corpo a corpo
            const contact = (bodyW(u) + bodyW(t)) * 0.5;
            const want = base.get(u.targetId) - dir * contact;
            if (dir * (x - want) > 0) x = want;
          }
        } else if (u.state === 'AttackingCastle') {
          const f = this.laneX(m, m.castleFront(1 - u.owner), u.lane) - dir * bodyW(u) * 0.35;
          if (dir * (x - f) > 0) x = f;
        }
        tx.set(u.id, x);
      }
      // fileiras: por rota e time, da frente para trás
      const ROWS = [0, -1, 1];
      const rowOf = new Map();
      for (let lane = 0; lane < 3; lane++) for (const owner of [0, 1]) for (const fly of [false, true]) {
        const dir = owner === 0 ? 1 : -1;
        const group = alive.filter((u) => u.lane === lane && u.owner === owner && u.flying === fly).sort((a, b) => dir * (tx.get(b.id) - tx.get(a.id)) || a.id - b.id);
        const lastX = ROWS.map(() => null);
        for (const u of group) {
          const x = tx.get(u.id), gap = bodyW(u) * 0.95;
          let r = ROWS.findIndex((_, i) => lastX[i] === null || dir * (lastX[i] - x) >= gap);
          if (r < 0) { // todas as fileiras ocupadas: recua na fileira com mais espaço
            r = 0; let best = -Infinity;
            ROWS.forEach((_, i) => { const d = dir * (lastX[i] - x); if (d > best) { best = d; r = i; } });
            tx.set(u.id, lastX[r] - dir * gap);
          }
          lastX[r] = tx.get(u.id);
          rowOf.set(u.id, ROWS[r]);
        }
      }
      for (const u of alive) {
        seen.add(u.id);
        const l = ARENA.lanes[u.lane];
        const x = tx.get(u.id), y = l.y + rowOf.get(u.id) * (l.y1 - l.y0) * 0.24;
        let v = this.views.get(u.id);
        if (!v) {
          const size = 0.8 + Math.min(1, u.def.hp / 1800) * 0.5;
          v = { id: u.id, u, x, y, r: ARENA.unitR * l.k * size, lift: u.flying ? 52 * l.k : 0, born: 0, lunge: 0, flash: 0, lastHp: u.hp,
            fly: u.flying ? 1 : 0, owner: u.owner, img: BB.art.cardImage(u.def), phase: Math.random() * 10, dying: -1, atk: -1, atkDur: 0.6 };
          this.views.set(u.id, v);
        }
        v.u = u;
        v.x += (x - v.x) * Math.min(1, dt * 10);
        v.y += (y - v.y) * Math.min(1, dt * 8);
        if (u.hp < v.lastHp - 0.5) v.flash = 0.12;
        v.lastHp = u.hp;
      }
      for (const [id, v] of this.views) if (!seen.has(id)) { this.views.delete(id); v.dying = 0; this.ghosts.push(v); }
      this.ghosts = this.ghosts.filter((v) => (v.dying += dt) < 0.4);
    }

    drawUnit(v, dt) {
      const g = this.g, u = v.u;
      v.born = Math.min(1, v.born + dt * 3);
      v.phase += dt;
      if (v.lunge > 0) v.lunge -= dt;
      if (v.flash > 0) v.flash -= dt;
      const dir = v.owner === 0 ? 1 : -1;
      const sp = BB.SPRITES && BB.SPRITES[u.def.id];
      const sheet = sp ? BB.art.image('img/units/' + u.def.id + '.webp') : null;
      if (sheet && sheet.complete && sheet.naturalWidth) return this.drawSprite(v, u, sp, sheet, dt, dir);
      let x = v.x, r = v.r;
      const y = v.y;
      const moving = u.state === 'Moving';
      const bob = v.fly ? Math.sin(v.phase * 3) * 6 : moving ? -Math.abs(Math.sin(v.phase * 9)) * r * 0.18 : 0;
      if (v.lunge > 0) x += dir * Math.sin((1 - v.lunge / 0.22) * Math.PI) * r * 0.5;
      let scale = v.born < 1 ? 0.3 + 0.7 * easeOutBack(v.born) : 1;
      let alpha = 1;
      if (v.dying >= 0) { scale *= 1 - v.dying / 0.4; alpha = 1 - v.dying / 0.4; }
      r *= scale;
      g.save(); g.globalAlpha = alpha;
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x, y + v.r * 0.75, v.r * (v.fly ? 0.7 : 0.95), v.r * 0.28, 0, 0, TAU); g.fill();
      const cy = y - v.lift + bob;
      if (v.fly) {
        const flap = Math.sin(v.phase * 10) * 0.5;
        g.fillStyle = v.owner === 0 ? 'rgba(80,130,255,.85)' : 'rgba(230,70,70,.85)';
        for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x - dir * r * 0.2, cy - r * 0.3, r * 1.1, r * (0.35 + flap * 0.2), s * (0.5 + flap * 0.3), 0, TAU); g.fill(); }
      }
      medallion(g, v.img, x, cy, r, v.owner === 0 ? '#2f7bff' : '#e0323a', Math.max(4, r * 0.16), dir < 0);
      if (v.flash > 0) { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(x, cy, r, 0, TAU); g.fill(); }
      if (u.state === 'Stunned') { g.fillStyle = 'rgba(160,230,255,.5)'; g.beginPath(); g.arc(x, cy, r, 0, TAU); g.fill(); }
      if (u.poisonTime > 0) { g.fillStyle = 'rgba(124,211,43,.3)'; g.beginPath(); g.arc(x, cy, r, 0, TAU); g.fill(); }
      if (u.shield > 0) { g.strokeStyle = '#8fe3ff'; g.lineWidth = 5; g.beginPath(); g.arc(x, cy, r + 8, 0, TAU); g.stroke(); }
      if (u.slow < 1) { g.strokeStyle = '#bfefff'; g.lineWidth = 3; g.setLineDash([7, 5]); g.beginPath(); g.arc(x, cy, r + 5, 0, TAU); g.stroke(); g.setLineDash([]); }
      const pct = Math.max(0, u.hp / u.maxHp);
      if (v.dying < 0 && (pct < 0.999 || u.shield > 0)) {
        const bw = v.r * 2, bh = Math.max(7, v.r * 0.22), bx = x - bw / 2, by = cy - r - bh - 6;
        g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
        g.fillStyle = v.owner === 0 ? '#3f8bff' : '#ff4a4a'; g.fillRect(bx, by, bw * pct, bh);
      }
      if (u.level > 1 && v.dying < 0) {
        g.fillStyle = v.owner === 0 ? '#1d3f9a' : '#8a1a20'; g.beginPath(); g.arc(x - r * 0.8, cy + r * 0.75, r * 0.34, 0, TAU); g.fill();
        g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(r * 0.42) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(u.level, x - r * 0.8, cy + r * 0.77);
      }
      g.restore();
    }

    // Tropa animada (quadros extraídos dos vídeos: linha 0 = andar, linha 1 = ataque; desenhados virados para a direita)
    drawSprite(v, u, sp, sheet, dt, dir) {
      const g = this.g, k = ARENA.lanes[u.lane].k;
      const bodyPx = (v.fly ? 126 : 140) * k * (0.86 + Math.min(1, u.def.hp / 1800) * 0.3);
      let scale = v.born < 1 ? 0.3 + 0.7 * easeOutBack(v.born) : 1, alpha = 1;
      if (v.dying >= 0) { scale *= 1 - v.dying / 0.4; alpha = 1 - v.dying / 0.4; }
      const s = (bodyPx / sp.body) * scale;
      let row = 0, frame = 0;
      if (v.atk >= 0 && v.atk < v.atkDur && v.dying < 0) {
        row = 1; frame = Math.min(sp.attack - 1, Math.floor((v.atk / v.atkDur) * sp.attack)); v.atk += dt;
      } else {
        v.atk = -1;
        if (u.state === 'Moving' || v.fly) frame = Math.floor(v.phase * 11) % sp.walk;
      }
      const lift = v.fly ? 46 * k : 0, bob = v.fly ? Math.sin(v.phase * 3) * 5 : 0;
      const foot = v.y + v.r * 0.55;
      g.save(); g.globalAlpha = alpha;
      // sombra e marca do time no chão
      g.strokeStyle = v.owner === 0 ? 'rgba(63,139,255,.85)' : 'rgba(255,74,74,.85)'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(v.x, foot, bodyPx * 0.3, bodyPx * 0.085, 0, 0, TAU); g.stroke();
      g.save();
      g.translate(v.x, foot - lift + bob);
      if (dir < 0) g.scale(-1, 1);
      if (v.flash > 0) g.filter = 'brightness(1.9)';
      else if (u.state === 'Stunned') g.filter = 'saturate(.35) brightness(1.25) hue-rotate(160deg)';
      else if (u.poisonTime > 0) g.filter = 'sepia(.4) hue-rotate(50deg) saturate(1.4)';
      g.drawImage(sheet, frame * sp.w, row * sp.h, sp.w, sp.h, -sp.ax * s, -sp.ay * s, sp.w * s, sp.h * s);
      g.restore();
      const top = foot - lift + bob - bodyPx * scale;
      if (u.shield > 0) { g.strokeStyle = '#8fe3ff'; g.lineWidth = 4; g.beginPath(); g.ellipse(v.x, top + bodyPx * 0.5, bodyPx * 0.42, bodyPx * 0.58, 0, 0, TAU); g.stroke(); }
      if (u.slow < 1) { g.strokeStyle = '#bfefff'; g.lineWidth = 3; g.setLineDash([7, 5]); g.beginPath(); g.ellipse(v.x, foot, bodyPx * 0.36, bodyPx * 0.11, 0, 0, TAU); g.stroke(); g.setLineDash([]); }
      // vida e nível: discretos, acima da cabeça
      const pct = Math.max(0, u.hp / u.maxHp);
      if (v.dying < 0) {
        const bw = Math.max(46, bodyPx * 0.42), bh = 6, bx = v.x - bw / 2 + 7, by = top - 12;
        g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(bx - 1.5, by - 1.5, bw + 3, bh + 3);
        g.fillStyle = v.owner === 0 ? '#3f8bff' : '#ff4a4a'; g.fillRect(bx, by, bw * pct, bh);
        if (u.shield > 0) { g.fillStyle = '#bff1ff'; g.fillRect(bx, by - 3, bw * Math.min(1, u.shield / u.maxHp), 2); }
        const cx = bx - 9, cy = by + bh / 2;
        g.fillStyle = v.owner === 0 ? '#1d3f9a' : '#8a1a20'; g.beginPath(); g.arc(cx, cy, 9, 0, TAU); g.fill();
        g.strokeStyle = '#f2c14e'; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(u.level, cx, cy + 0.5);
      }
      g.restore();
    }

    drawFx(dt) {
      const g = this.g;
      this.fx = this.fx.filter((f) => (f.t += dt) < f.d);
      for (const f of this.fx) {
        if (f.t < 0) continue;
        const k = f.t / f.d;
        if (f.k === 'proj') {
          const x = f.x0 + (f.x1 - f.x0) * k, y = f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * 40;
          g.fillStyle = f.c; g.shadowColor = f.c; g.shadowBlur = 16; g.beginPath(); g.arc(x, y, f.r, 0, TAU); g.fill(); g.shadowBlur = 0;
        } else if (f.k === 'burst') {
          g.globalAlpha = 1 - k; g.fillStyle = f.c; g.beginPath(); g.ellipse(f.x, f.y, f.r * (0.4 + k * 0.8), f.r * (0.25 + k * 0.45), 0, 0, TAU); g.fill();
          g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke(); g.globalAlpha = 1;
        } else if (f.k === 'anim') {
          const meta = BB.FX[f.key], sheet = this.fxSheet(f.key);
          if (!sheet) continue;
          const fr = Math.min(meta.n - 1, Math.floor(k * meta.n));
          const sc = f.w ? f.w / meta.w : f.h / meta.h, w = meta.w * sc, h = meta.h * sc;
          g.save(); g.translate(f.x, f.y); if (f.flip) g.scale(-1, 1);
          g.drawImage(sheet, fr * meta.w, 0, meta.w, meta.h, -w / 2, -h, w, h);
          g.restore();
        } else if (f.k === 'lane') {
          const l = ARENA.lanes[f.lane];
          g.globalAlpha = 0.55 * Math.sin(k * Math.PI); g.fillStyle = f.c;
          g.fillRect(l.xL - 60, l.y0, l.xR - l.xL + 120, l.y1 - l.y0); g.globalAlpha = 1;
        }
      }
      this.texts = this.texts.filter((t) => (t.t += dt) < t.d);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 40px sans-serif';
      for (const t of this.texts) {
        g.globalAlpha = 1 - t.t / t.d;
        g.lineWidth = 7; g.strokeStyle = '#000'; g.strokeText(t.s, t.x, t.y - t.t * 70);
        g.fillStyle = t.c; g.fillText(t.s, t.x, t.y - t.t * 70);
      }
      g.globalAlpha = 1;
    }

    reset() { this.views.clear(); this.ghosts = []; this.fx = []; this.texts = []; this.collapse = [0, 0]; this.baronCast = [0, 0]; this.baronAnim = [-1, -1]; this.castleHit = [0, 0]; }
  }

  function medallion(g, img, x, y, r, ring, lw, flip) {
    g.save();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.closePath();
    g.fillStyle = '#1a2040'; g.fill();
    g.clip();
    if (img && img.complete && img.naturalWidth) {
      if (flip) { g.translate(x, y); g.scale(-1, 1); g.drawImage(img, -r, -r, r * 2, r * 2); }
      else g.drawImage(img, x - r, y - r, r * 2, r * 2);
    }
    g.restore();
    g.lineWidth = lw; g.strokeStyle = ring; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,230,150,.9)'; g.beginPath(); g.arc(x, y, r + lw / 2, 0, TAU); g.stroke();
  }
  function easeOutBack(t) { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

  BB.Renderer = Renderer;
})(window.BB);

// Desenho do campo de batalha: a arte da arena (img/arena.webp) é o cenário, e tropas, Barões e efeitos
// são posicionados nas coordenadas dessa imagem (1672×941). Só lê o estado da partida; nunca o altera.
(function (BB) {
  'use strict';
  const TAU = Math.PI * 2;
  const AW = 1672, AH = 941;

  // Medidas da arena em pixels da imagem (ver art/source/arena.png)
  const ARENA = {
    lanes: [ // centro Y, faixa Y, início/fim X (perspectiva: a rota de baixo é mais larga), escala das tropas
      { y: 340, y0: 292, y1: 395, xL: 375, xR: 1305, k: 0.86 },
      { y: 468, y0: 405, y1: 545, xL: 300, xR: 1380, k: 1.0 },
      { y: 632, y0: 555, y1: 712, xL: 255, xR: 1430, k: 1.16 },
    ],
    castle: [{ x0: 0, y0: 130, x1: 330, y1: 610, gx: 200, gy: 440 }, { x0: 1342, y0: 130, x1: 1672, y1: 610, gx: 1475, gy: 440 }],
    baron: [{ x: 252, y: 236, r: 54 }, { x: 1420, y: 236, r: 54 }],
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
      this.shake = 0; this.castleHit = [0, 0]; this.baronCast = [0, 0]; this.collapse = [0, 0]; this.t = 0;
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
          if (v) v.lunge = 0.22;
          const def = m.content.cards[e.id];
          if (!def || !v) break;
          if (def.range > 4) {
            const tv = e.targetId ? this.views.get(e.targetId) : null;
            const to = tv ? { x: tv.x, y: tv.y - tv.r * 0.4 - tv.lift } : this.castlePoint(1 - e.player);
            const col = PROJ_COLOR[def.cls] || '#f2e3b3';
            this.fx.push({ k: 'proj', x0: v.x, y0: v.y - v.r - v.lift, x1: to.x, y1: to.y, t: 0, d: 0.22, c: col, r: def.cls === 'Mage' ? 9 : 6 });
            if (def.ability === 'Splash') this.fx.push({ k: 'burst', x: to.x, y: to.y, r: (def.abilityRadius / m.L) * laneW(e.lane), t: -0.2, d: 0.4, c: col });
          }
          break;
        }
        case 'UnitRevived': if (v) { v.born = 0; this.fx.push({ k: 'burst', x: v.x, y: v.y, r: v.r * 2.5, t: 0, d: 0.5, c: '#ffb23a' }); } break;
        case 'Heal': if (v) this.fx.push({ k: 'burst', x: v.x, y: v.y - v.lift, r: v.r * 1.4, t: 0, d: 0.35, c: '#7cff8a' }); break;
        case 'SpellCast': {
          const c = SPELL_COLOR[e.id] || '#f7c548';
          if (!e.radius) this.fx.push({ k: 'lane', lane: e.lane, t: 0, d: 0.6, c });
          else this.fx.push({ k: 'burst', x: this.laneX(m, e.x, e.lane), y: ARENA.lanes[e.lane].y, r: (e.radius / m.L) * laneW(e.lane), t: 0, d: 0.55, c });
          if (e.id === 'fireball') this.shake = 0.25;
          break;
        }
        case 'BaronUsed': {
          this.baronCast[e.player] = 1;
          const c = e.player === 0 ? '#ffd966' : '#ff9a6a';
          if (e.lane >= 0) this.fx.push({ k: 'lane', lane: e.lane, t: 0, d: 0.9, c });
          else for (let l = 0; l < 3; l++) this.fx.push({ k: 'lane', lane: l, t: 0, d: 0.9, c });
          break;
        }
        case 'CastleUsed': {
          const c = e.id === 'draconic_castle' ? '#ff6a1e' : e.id === 'glacial_fortress' ? '#9fe6ff' : '#8fe3ff';
          if (e.lane >= 0) this.fx.push({ k: 'lane', lane: e.lane, t: 0, d: 0.9, c });
          break;
        }
        case 'CastleDamaged': {
          this.castleHit[e.player] = 0.18;
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
      this.t += dt;
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
    drawBaron(m, owner) {
      const g = this.g, p = m.players[owner], b = ARENA.baron[owner];
      const win = m.over && m.winner === owner, lose = m.over && m.winner === 1 - owner;
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

    syncViews(m, dt) {
      const seen = new Set();
      for (const u of m.units) {
        if (u.hp <= 0) continue;
        seen.add(u.id);
        const l = ARENA.lanes[u.lane];
        const jitter = (((u.id * 37) % 5) - 2) * (l.y1 - l.y0) * 0.07;
        const tx = this.laneX(m, u.x, u.lane), ty = l.y + jitter;
        let v = this.views.get(u.id);
        if (!v) {
          const size = 0.8 + Math.min(1, u.def.hp / 1800) * 0.5;
          v = { id: u.id, u, x: tx, y: ty, r: ARENA.unitR * l.k * size, lift: u.flying ? 52 * l.k : 0, born: 0, lunge: 0, flash: 0, lastHp: u.hp,
            fly: u.flying ? 1 : 0, owner: u.owner, img: BB.art.cardImage(u.def), phase: Math.random() * 10, dying: -1 };
          this.views.set(u.id, v);
        }
        v.u = u;
        v.x += (tx - v.x) * Math.min(1, dt * 12);
        v.y += (ty - v.y) * Math.min(1, dt * 12);
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

    reset() { this.views.clear(); this.ghosts = []; this.fx = []; this.texts = []; this.collapse = [0, 0]; this.baronCast = [0, 0]; this.castleHit = [0, 0]; }
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

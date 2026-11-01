// Desenho do campo de batalha no canvas: cenário, 3 rotas, castelos, Barões, tropas e efeitos.
// Só lê o estado da partida; nunca o altera.
(function (BB) {
  'use strict';
  const TAU = Math.PI * 2;

  const SPELL_COLOR = {
    fireball: '#ff6a1e', freeze: '#9fe6ff', divine_heal: '#ffe68a', lightning: '#fff27a', arcane_shield: '#6fd8ff',
    poison: '#7cd32b', arrow_rain: '#e9d8a6', skeleton_summon: '#c04dff', elven_rain_wave: '#7cff8a',
  };
  const PROJ_COLOR = { Necromancer: '#c04dff', Mage: '#6fd8ff', Beast: '#ff8a3a', Archer: '#f2e3b3', Cleric: '#ffe68a', Engineer: '#ffd27a' };

  class Renderer {
    constructor(canvas) {
      this.cv = canvas; this.g = canvas.getContext('2d');
      this.views = new Map(); this.ghosts = []; this.fx = []; this.texts = [];
      this.shake = 0; this.castleHit = [0, 0]; this.baronCast = [0, 0]; this.collapse = [0, 0];
      this.bg = null; this.W = 0; this.H = 0; this.t = 0;
      this.resize();
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = window.innerWidth, H = window.innerHeight;
      this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
      this.dpr = dpr; this.W = W; this.H = H;
      const top = H * 0.19, bot = H * 0.73;
      this.L = { top, bot, laneH: (bot - top) / 3, xL: W * 0.17, xR: W * 0.83, castleW: W * 0.135 };
      this.bg = null;
    }

    laneY(i) { return this.L.top + this.L.laneH * (i + 0.5); }
    sx(m, x) {
      const f0 = m.castleFront(0), f1 = m.castleFront(1);
      return this.L.xL + ((x - f0) / (f1 - f0)) * (this.L.xR - this.L.xL);
    }
    laneAt(px, py) {
      const L = this.L;
      if (py < L.top - L.laneH * 0.2 || py > L.bot + L.laneH * 0.1) return -1;
      return Math.max(0, Math.min(2, Math.floor((py - L.top) / L.laneH)));
    }

    // ------------------------------------------------------------ cenário (pré-desenhado)
    buildBackground() {
      const c = document.createElement('canvas');
      c.width = this.cv.width; c.height = this.cv.height;
      const g = c.getContext('2d');
      g.scale(this.dpr, this.dpr);
      const { W, H } = this, L = this.L;
      let grd = g.createLinearGradient(0, 0, 0, L.top);
      grd.addColorStop(0, '#5fb3f0'); grd.addColorStop(1, '#bfe6ff');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      // montanhas distantes
      g.fillStyle = '#8aa6cc';
      g.beginPath(); g.moveTo(0, L.top);
      for (let i = 0; i <= 12; i++) g.lineTo((i / 12) * W, L.top - H * (0.05 + 0.06 * Math.abs(Math.sin(i * 1.7))));
      g.lineTo(W, L.top); g.fill();
      // falésias e cachoeira
      g.fillStyle = '#8c8a86';
      for (let i = 0; i < 9; i++) {
        const x = (i / 9) * W, w = W / 9 + 2, h = H * (0.05 + 0.04 * ((i * 7) % 3));
        g.fillRect(x, L.top - h, w, h);
        g.fillStyle = '#5daa3c'; g.fillRect(x, L.top - h - H * 0.012, w, H * 0.014); g.fillStyle = '#8c8a86';
      }
      g.fillStyle = 'rgba(190,235,255,.9)'; g.fillRect(W * 0.56, L.top - H * 0.085, W * 0.025, H * 0.085);
      // gramado
      grd = g.createLinearGradient(0, L.top - L.laneH * 0.25, 0, H);
      grd.addColorStop(0, '#6cbf45'); grd.addColorStop(1, '#3f8a2c');
      g.fillStyle = grd; g.fillRect(0, L.top - L.laneH * 0.25, W, H);
      // árvores de fundo
      for (let i = 0; i < 16; i++) {
        const x = (i / 16) * W + 10, y = L.top - L.laneH * 0.18;
        g.fillStyle = '#6b4423'; g.fillRect(x - 2, y - 6, 4, 10);
        g.fillStyle = i % 2 ? '#3f8a35' : '#4fa040'; g.beginPath(); g.arc(x, y - 12, 11, 0, TAU); g.fill();
      }
      // rotas de pedra (degraus como na arte de referência)
      for (let i = 0; i < 3; i++) {
        const y = this.laneY(i), h = L.laneH * 0.8, x0 = L.xL - W * 0.04, x1 = L.xR + W * 0.04;
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x0, y + h / 2, x1 - x0, L.laneH * 0.08);
        grd = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
        grd.addColorStop(0, '#d8c8a8'); grd.addColorStop(1, '#b9a785');
        g.fillStyle = grd; g.fillRect(x0, y - h / 2, x1 - x0, h);
        g.strokeStyle = 'rgba(90,70,50,.25)'; g.lineWidth = 1;
        const tile = h / 2;
        for (let r = 0; r < 2; r++) for (let x = x0 + (r ? tile / 2 : 0); x < x1; x += tile) g.strokeRect(x, y - h / 2 + r * tile, tile, tile);
        g.fillStyle = '#9a9384'; g.fillRect(x0, y - h / 2 - 3, x1 - x0, 4);
      }
      this.bg = c;
    }

    // ------------------------------------------------------------ castelo
    drawCastle(m, owner) {
      const g = this.g, L = this.L, p = m.players[owner], def = p.castle;
      const isLeft = owner === 0, f = isLeft ? 1 : -1;
      const w = L.castleW, cx = isLeft ? L.xL - w * 0.5 : L.xR + w * 0.5;
      const top = L.top - L.laneH * 0.95, bot = L.bot + L.laneH * 0.05, h = bot - top;
      const stone = def.stoneColor || '#9ea3ad', roof = def.roofColor || '#2f5bd3';
      const banner = owner === 0 ? '#2450b8' : '#b3202a';
      g.save();
      let ox = 0, oy = 0, rot = 0, alpha = 1;
      if (this.castleHit[owner] > 0) { ox = (Math.random() - 0.5) * 6; oy = (Math.random() - 0.5) * 4; }
      if (this.collapse[owner] > 0) { const k = Math.min(1, this.collapse[owner]); oy += k * h * 0.25; rot = k * 0.12 * -f; alpha = 1 - k * 0.5; }
      g.translate(cx + ox, bot + oy); g.rotate(rot); g.translate(-cx, -bot); g.globalAlpha = alpha;

      const shade = (c, k) => shadeColor(c, k);
      // muralha principal
      const wallTop = top + h * 0.38;
      g.fillStyle = shade(stone, -0.08); g.fillRect(cx - w * 0.5, wallTop, w, bot - wallTop);
      bricks(g, cx - w * 0.5, wallTop, w, bot - wallTop, shade(stone, -0.25));
      crenel(g, cx - w * 0.5, wallTop, w, h * 0.04, shade(stone, 0.05));
      // torres laterais e torre central
      const towers = [[cx - w * 0.36, w * 0.24, h * 0.55], [cx + w * 0.36, w * 0.24, h * 0.55], [cx, w * 0.34, h * 0.78]];
      for (const [tx, tw, th] of towers) {
        const ty = bot - th;
        g.fillStyle = stone; g.fillRect(tx - tw / 2, ty, tw, th);
        bricks(g, tx - tw / 2, ty, tw, th, shade(stone, -0.22));
        g.fillStyle = '#f2b636'; g.fillRect(tx - tw * 0.58, ty - h * 0.015, tw * 1.16, h * 0.03);
        // telhado cônico
        g.fillStyle = roof; g.beginPath(); g.moveTo(tx - tw * 0.6, ty - h * 0.01); g.lineTo(tx, ty - th * 0.42); g.lineTo(tx + tw * 0.6, ty - h * 0.01); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(tx - tw * 0.1, ty - h * 0.01); g.lineTo(tx, ty - th * 0.42); g.lineTo(tx - tw * 0.35, ty - h * 0.01); g.fill();
        // bandeira
        const fx = tx, fy = ty - th * 0.42;
        g.strokeStyle = '#f2b636'; g.lineWidth = 2; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx, fy - h * 0.08); g.stroke();
        const wave = Math.sin(this.t * 4 + tx) * 3;
        g.fillStyle = banner; g.beginPath(); g.moveTo(fx, fy - h * 0.08); g.lineTo(fx + f * tw * 0.5, fy - h * 0.065 + wave); g.lineTo(fx, fy - h * 0.045); g.fill();
        // janela iluminada
        g.fillStyle = '#ffc85a'; roundRect(g, tx - tw * 0.12, ty + th * 0.18, tw * 0.24, th * 0.12, tw * 0.1); g.fill();
      }
      // portão
      g.fillStyle = '#4a3020'; roundRect(g, cx - w * 0.12, bot - h * 0.2, w * 0.24, h * 0.2, w * 0.12); g.fill();
      g.strokeStyle = '#f2b636'; g.lineWidth = 2; g.stroke();
      // estandarte com coroa
      const bx = cx + f * w * 0.36, by = wallTop + h * 0.08;
      g.fillStyle = banner; g.beginPath(); g.moveTo(bx - w * 0.08, by); g.lineTo(bx + w * 0.08, by); g.lineTo(bx + w * 0.08, by + h * 0.2); g.lineTo(bx, by + h * 0.16); g.lineTo(bx - w * 0.08, by + h * 0.2); g.fill();
      g.strokeStyle = '#f2b636'; g.lineWidth = 2; g.stroke();
      crown(g, bx, by + h * 0.08, w * 0.05);
      // rachaduras conforme o dano
      const dmg = 1 - m.hpPct(p);
      if (dmg > 0.15) {
        g.strokeStyle = 'rgba(30,20,20,.7)'; g.lineWidth = 2;
        const n = Math.floor(dmg * 8);
        for (let i = 0; i < n; i++) {
          const sx = cx + Math.sin(i * 12.9) * w * 0.4, sy = wallTop + Math.abs(Math.cos(i * 7.3)) * (bot - wallTop) * 0.8;
          g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 6, sy + 8); g.lineTo(sx + 2, sy + 15); g.lineTo(sx + 8, sy + 22); g.stroke();
        }
      }
      // escudo imperial
      if (p.castleShield > 0) {
        g.globalAlpha = 0.25 + 0.1 * Math.sin(this.t * 6);
        g.fillStyle = '#8fe3ff'; g.beginPath(); g.ellipse(cx, bot - h * 0.42, w * 0.6, h * 0.5, 0, 0, TAU); g.fill();
        g.globalAlpha = 0.9; g.strokeStyle = '#bff1ff'; g.lineWidth = 3; g.stroke();
      }
      g.restore();

      // Barão: fica no castelo comandando, não pode ser atacado
      const by2 = L.top + L.laneH * 0.55 + Math.sin(this.t * 2 + owner) * 3 - (m.over && m.winner === owner ? Math.abs(Math.sin(this.t * 7)) * 10 : 0);
      const bxx = cx + f * w * 0.08, r = L.laneH * 0.48;
      const cast = this.baronCast[owner];
      const rr = r * (1 + cast * 0.35);
      if (m.baronReady(p) && !m.over) {
        g.strokeStyle = 'rgba(255,215,100,' + (0.5 + 0.5 * Math.sin(this.t * 6)) + ')'; g.lineWidth = 5;
        g.beginPath(); g.arc(bxx, by2, rr + 6, 0, TAU); g.stroke();
      }
      if (cast > 0) { g.fillStyle = 'rgba(255,230,140,' + cast * 0.6 + ')'; g.beginPath(); g.arc(bxx, by2, rr * 1.8, 0, TAU); g.fill(); }
      medallion(g, BB.art.image(BB.art.baronUrl(p.baron.id)), bxx, by2, rr, '#f2b636', 4, !isLeft);
    }

    // ------------------------------------------------------------ eventos -> efeitos
    onEvent(m, e) {
      const v = e.unitId ? this.views.get(e.unitId) : null;
      switch (e.type) {
        case 'UnitAttack': {
          if (v) v.lunge = 0.22;
          const def = m.content.cards[e.id];
          if (!def || !v) break;
          if (def.range > 4) {
            const tv = e.targetId ? this.views.get(e.targetId) : null;
            const to = tv ? { x: tv.x, y: tv.y } : this.castlePoint(m, 1 - e.player);
            const col = PROJ_COLOR[def.cls] || '#f2e3b3';
            this.fx.push({ k: 'proj', x0: v.x, y0: v.y - v.r * 0.6, x1: to.x, y1: to.y, t: 0, d: 0.22, c: col, r: def.cls === 'Mage' ? 5 : 3.5 });
            if (def.ability === 'Splash') this.fx.push({ k: 'burst', x: to.x, y: to.y, r: (def.abilityRadius / m.L) * (this.L.xR - this.L.xL), t: -0.2, d: 0.4, c: col });
          }
          break;
        }
        case 'UnitRevived': if (v) { v.born = 0; this.fx.push({ k: 'burst', x: v.x, y: v.y, r: v.r * 2.5, t: 0, d: 0.5, c: '#ffb23a' }); } break;
        case 'Heal': if (v) this.fx.push({ k: 'burst', x: v.x, y: v.y, r: v.r * 1.4, t: 0, d: 0.35, c: '#7cff8a' }); break;
        case 'SpellCast': {
          const c = SPELL_COLOR[e.id] || '#f7c548';
          if (!e.radius) this.fx.push({ k: 'lane', lane: e.lane, t: 0, d: 0.6, c });
          else this.fx.push({ k: 'burst', x: this.sx(m, e.x), y: this.laneY(e.lane), r: (e.radius / m.L) * (this.L.xR - this.L.xL), t: 0, d: 0.55, c });
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
          const id = e.id;
          const c = id === 'draconic_castle' ? '#ff6a1e' : id === 'glacial_fortress' ? '#9fe6ff' : '#8fe3ff';
          if (e.lane >= 0) this.fx.push({ k: 'lane', lane: e.lane, t: 0, d: 0.9, c });
          break;
        }
        case 'CastleDamaged': {
          this.castleHit[e.player] = 0.18;
          const pt = this.castlePoint(m, e.player);
          if (e.value >= 1) this.texts.push({ x: pt.x + (Math.random() - 0.5) * 30, y: pt.y - 20, s: '-' + Math.round(e.value), t: 0, d: 0.9, c: e.player === 0 ? '#ff8080' : '#ffe08a' });
          break;
        }
        case 'CastleAttack': {
          const tv = this.views.get(e.targetId);
          if (tv) { const pt = this.castlePoint(m, e.player); this.fx.push({ k: 'proj', x0: pt.x, y0: pt.y - this.L.laneH, x1: tv.x, y1: tv.y, t: 0, d: 0.3, c: '#f2e3b3', r: 3 }); }
          break;
        }
      }
    }

    castlePoint(m, owner) {
      return { x: owner === 0 ? this.L.xL - this.L.castleW * 0.1 : this.L.xR + this.L.castleW * 0.1, y: (this.L.top + this.L.bot) / 2 };
    }

    // ------------------------------------------------------------ quadro
    draw(m, dt, ui) {
      this.t += dt;
      const g = this.g, L = this.L;
      if (!this.bg) this.buildBackground();
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      let sh = 0;
      if (this.shake > 0) { this.shake -= dt; sh = this.shake * 14; }
      g.save();
      if (sh) g.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
      g.drawImage(this.bg, 0, 0, this.W, this.H);
      for (let i = 0; i < 2; i++) { if (this.castleHit[i] > 0) this.castleHit[i] -= dt; if (this.baronCast[i] > 0) this.baronCast[i] = Math.max(0, this.baronCast[i] - dt * 1.2); }
      if (m.over && m.winner >= 0) this.collapse[1 - m.winner] = Math.min(1, this.collapse[1 - m.winner] + dt * 0.6);

      // destaque das rotas ao escolher onde jogar
      if (ui && ui.armed) {
        for (let i = 0; i < 3; i++) {
          const hov = i === ui.hoverLane;
          g.fillStyle = hov ? 'rgba(255,217,102,.38)' : 'rgba(255,255,255,' + (0.08 + 0.06 * Math.sin(this.t * 6)) + ')';
          g.fillRect(L.xL - this.W * 0.04, this.laneY(i) - L.laneH * 0.4, L.xR - L.xL + this.W * 0.08, L.laneH * 0.8);
          if (hov) { g.strokeStyle = '#ffd966'; g.lineWidth = 3; g.strokeRect(L.xL - this.W * 0.04, this.laneY(i) - L.laneH * 0.4, L.xR - L.xL + this.W * 0.08, L.laneH * 0.8); }
        }
      }

      this.drawCastle(m, 0); this.drawCastle(m, 1);
      this.syncViews(m, dt);
      // ordena por Y (profundidade) e desenha voadores por último
      const list = [...this.views.values(), ...this.ghosts].sort((a, b) => (a.fly - b.fly) || (a.y - b.y));
      for (const v of list) this.drawUnit(v, dt);
      this.drawFx(dt);
      g.restore();
    }

    syncViews(m, dt) {
      const seen = new Set();
      for (const u of m.units) {
        if (u.hp <= 0) continue;
        seen.add(u.id);
        let v = this.views.get(u.id);
        const jitter = (((u.id * 37) % 5) - 2) * this.L.laneH * 0.07;
        const tx = this.sx(m, u.x), ty = this.laneY(u.lane) + jitter;
        const size = 0.78 + Math.min(1, u.def.hp / 1800) * 0.5;
        if (!v) {
          v = { id: u.id, u, x: tx, y: ty, r: this.L.laneH * 0.3 * size, born: 0, lunge: 0, flash: 0, lastHp: u.hp, fly: u.flying ? 1 : 0, owner: u.owner,
            img: BB.art.cardImage(u.def), phase: Math.random() * 10, dying: -1 };
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
      let x = v.x, y = v.y, r = v.r;
      const moving = u.state === 'Moving';
      const bob = v.fly ? Math.sin(v.phase * 3) * 3 : moving ? -Math.abs(Math.sin(v.phase * 9)) * r * 0.18 : 0;
      if (v.lunge > 0) x += dir * Math.sin((1 - v.lunge / 0.22) * Math.PI) * r * 0.5;
      const lift = v.fly ? this.L.laneH * 0.32 : 0;
      let scale = v.born < 1 ? 0.3 + 0.7 * easeOutBack(v.born) : 1;
      let alpha = 1;
      if (v.dying >= 0) { scale *= 1 - v.dying / 0.4; alpha = 1 - v.dying / 0.4; }
      r *= scale;
      g.save(); g.globalAlpha = alpha;
      // sombra no chão
      g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(x, y + v.r * 0.75, v.r * (v.fly ? 0.7 : 0.95), v.r * 0.28, 0, 0, TAU); g.fill();
      const cy = y - lift + bob;
      // asas para voadores
      if (v.fly) {
        const flap = Math.sin(v.phase * 10) * 0.5;
        g.fillStyle = v.owner === 0 ? 'rgba(80,130,255,.85)' : 'rgba(230,70,70,.85)';
        for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x - dir * r * 0.2, cy - r * 0.3, r * 1.1, r * (0.35 + flap * 0.2), s * (0.5 + flap * 0.3), 0, TAU); g.fill(); }
      }
      const ring = v.owner === 0 ? '#2f7bff' : '#e0323a';
      medallion(g, v.img, x, cy, r, ring, Math.max(2.5, r * 0.16), dir < 0);
      // estados
      if (v.flash > 0) { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(x, cy, r, 0, TAU); g.fill(); }
      if (u.state === 'Stunned') { g.fillStyle = 'rgba(160,230,255,.5)'; g.beginPath(); g.arc(x, cy, r, 0, TAU); g.fill(); }
      if (u.poisonTime > 0) { g.fillStyle = 'rgba(124,211,43,.3)'; g.beginPath(); g.arc(x, cy, r, 0, TAU); g.fill(); }
      if (u.shield > 0) { g.strokeStyle = '#8fe3ff'; g.lineWidth = 3; g.beginPath(); g.arc(x, cy, r + 5, 0, TAU); g.stroke(); }
      if (u.slow < 1) { g.strokeStyle = '#bfefff'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.arc(x, cy, r + 3, 0, TAU); g.stroke(); g.setLineDash([]); }
      // vida
      const pct = Math.max(0, u.hp / u.maxHp);
      if (v.dying < 0 && (pct < 0.999 || u.shield > 0)) {
        const bw = v.r * 2, bh = Math.max(4, v.r * 0.22), bx = x - bw / 2, by = cy - r - bh - 4;
        g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        g.fillStyle = v.owner === 0 ? '#3f8bff' : '#ff4a4a'; g.fillRect(bx, by, bw * pct, bh);
      }
      // nível
      if (u.level > 1 && v.dying < 0) {
        g.fillStyle = v.owner === 0 ? '#1d3f9a' : '#8a1a20'; g.beginPath(); g.arc(x - r * 0.8, cy + r * 0.75, r * 0.32, 0, TAU); g.fill();
        g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(r * 0.4) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(u.level, x - r * 0.8, cy + r * 0.77);
      }
      g.restore();
    }

    drawFx(dt) {
      const g = this.g, L = this.L;
      this.fx = this.fx.filter((f) => (f.t += dt) < f.d);
      for (const f of this.fx) {
        const k = Math.max(0, f.t / f.d);
        if (f.t < 0) continue;
        if (f.k === 'proj') {
          const x = f.x0 + (f.x1 - f.x0) * k, y = f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * 20;
          g.fillStyle = f.c; g.shadowColor = f.c; g.shadowBlur = 10; g.beginPath(); g.arc(x, y, f.r, 0, TAU); g.fill(); g.shadowBlur = 0;
        } else if (f.k === 'burst') {
          g.globalAlpha = 1 - k; g.fillStyle = f.c; g.beginPath(); g.ellipse(f.x, f.y, f.r * (0.4 + k * 0.8), f.r * (0.25 + k * 0.45), 0, 0, TAU); g.fill();
          g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); g.globalAlpha = 1;
        } else if (f.k === 'lane') {
          const y = this.laneY(f.lane);
          g.globalAlpha = 0.6 * Math.sin(k * Math.PI); g.fillStyle = f.c;
          g.fillRect(L.xL - this.W * 0.04, y - L.laneH * 0.42, L.xR - L.xL + this.W * 0.08, L.laneH * 0.84); g.globalAlpha = 1;
        }
      }
      this.texts = this.texts.filter((t) => (t.t += dt) < t.d);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const t of this.texts) {
        g.globalAlpha = 1 - t.t / t.d;
        g.font = '900 ' + Math.round(this.H * 0.04) + 'px sans-serif';
        g.lineWidth = 4; g.strokeStyle = '#000'; g.strokeText(t.s, t.x, t.y - t.t * 40);
        g.fillStyle = t.c; g.fillText(t.s, t.x, t.y - t.t * 40);
      }
      g.globalAlpha = 1;
    }

    reset() { this.views.clear(); this.ghosts = []; this.fx = []; this.texts = []; this.collapse = [0, 0]; this.baronCast = [0, 0]; }
  }

  // ------------------------------------------------------------ utilitários de desenho
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
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,230,150,.8)'; g.beginPath(); g.arc(x, y, r + lw / 2, 0, TAU); g.stroke();
  }
  function bricks(g, x, y, w, h, col) {
    g.strokeStyle = col; g.lineWidth = 1;
    const bh = Math.max(6, h / 10), bw = bh * 2;
    for (let r = 0, yy = y; yy < y + h; r++, yy += bh) {
      g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke();
      for (let xx = x + (r % 2 ? bw / 2 : 0); xx < x + w; xx += bw) { g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, Math.min(y + h, yy + bh)); g.stroke(); }
    }
  }
  function crenel(g, x, y, w, h, col) {
    g.fillStyle = col;
    const n = 7, cw = w / (n * 2 - 1);
    for (let i = 0; i < n; i++) g.fillRect(x + i * cw * 2, y - h, cw, h);
  }
  function crown(g, x, y, s) {
    g.fillStyle = '#f7c548';
    g.beginPath(); g.moveTo(x - s, y + s * 0.6); g.lineTo(x - s, y - s * 0.4); g.lineTo(x - s * 0.5, y + s * 0.1); g.lineTo(x, y - s * 0.6);
    g.lineTo(x + s * 0.5, y + s * 0.1); g.lineTo(x + s, y - s * 0.4); g.lineTo(x + s, y + s * 0.6); g.closePath(); g.fill();
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function shadeColor(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
    return 'rgb(' + f(r) + ',' + f(gg) + ',' + f(b) + ')';
  }
  function easeOutBack(t) { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

  BB.Renderer = Renderer;
})(window.BB);

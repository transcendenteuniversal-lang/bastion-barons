// Desenho do campo de batalha: a arte da arena (img/arena.webp) é o cenário, e tropas, Barões e efeitos
// são posicionados nas coordenadas dessa imagem (1672×941). Só lê o estado da partida; nunca o altera.
(function (BB) {
  'use strict';
  const TAU = Math.PI * 2;
  const AW = 1672, AH = 941;

  // Medidas da arena em pixels da imagem (ver art/source/arena.png)
  const ARENA = {
    // rotas da arena (img/arena.webp): pés das tropas em y; faixa y0–y1; início/fim xL–xR.
    // k = 1 em todas: a mesma criatura tem sempre o mesmo tamanho, em qualquer rota.
    lanes: [
      { y: 322, y0: 242, y1: 374, xL: 400, xR: 1272, k: 1 },
      { y: 472, y0: 380, y1: 538, xL: 345, xR: 1327, k: 1 },
      { y: 652, y0: 545, y1: 742, xL: 292, xR: 1380, k: 1 },
    ],
    castle: [{ x0: 0, y0: 0, x1: 360, y1: 760, gx: 190, gy: 540 }, { x0: 1312, y0: 0, x1: 1672, y1: 760, gx: 1482, gy: 540 }],
    // Barão em pé no piso da sacada (pés escondidos atrás do parapeito, que é redesenhado na frente)
    baron: [{ x: 178, y: 238, r: 56 }, { x: 1494, y: 238, r: 56 }],
    // contorno do parapeito + escudo da sacada esquerda (a direita é espelhada)
    railing: [[38, 283], [206, 282], [214, 268], [256, 260], [294, 268], [300, 262], [328, 248], [348, 226], [360, 204], [372, 210], [372, 300],
      [340, 334], [300, 348], [272, 372], [252, 376], [230, 352], [200, 352], [38, 352]],
    unitR: 46,
  };
  // primeira junta do piso ao lado do castelo esquerdo (a direita é espelhada): é onde as tropas nascem e batem
  ARENA.seam = (y) => 400 - (y - 260) * 0.41;
  ARENA.laneEnds = ARENA.lanes.map((l) => [l.xL, l.xR]); // padrão (castelo antigo da arena)
  BB.ARENA = ARENA;

  const SPELL_COLOR = {
    fireball: '#ff6a1e', freeze: '#9fe6ff', divine_heal: '#ffe68a', lightning: '#fff27a', arcane_shield: '#6fd8ff',
    poison: '#7cd32b', arrow_rain: '#e9d8a6', skeleton_summon: '#c04dff', elven_rain_wave: '#7cff8a',
  };
  // forma do ataque de cada criatura que atira
  const PROJ_KIND = { royal_archer: 'arrow', elven_archer: 'arrow', goblin_hunter: 'bolt', goblin_gunner: 'bullet', dwarf_turret: 'bullet',
    arcane_mage: 'orb', shadow_sorceress: 'orb', necromancer: 'orb', skeleton_summoner: 'orb', royal_cleric: 'orb', forest_druid: 'leaf',
    fire_dragon: 'fire', phoenix: 'fire', ice_dragon: 'ice' };
  const PROJ_TINT = { arcane_mage: '#6fd8ff', shadow_sorceress: '#c04dff', necromancer: '#9dff6a', skeleton_summoner: '#c04dff', royal_cleric: '#ffe68a',
    forest_druid: '#7dff6a', fire_dragon: '#ff8a2a', phoenix: '#ffb02a', ice_dragon: '#bfefff' };
  const HEAVY = new Set(['mountain_troll', 'stone_golem', 'infernal_demon', 'stone_guardian', 'guardian_ent', 'barbarian', 'shadow_assassin']);
  const RARITY_COLOR = { Common: '#9fd0ff', Rare: '#3f8fff', Epic: '#b05cff', Legendary: '#ffb422', Mythic: '#ff3d6e' };
  const PROJ_COLOR = { Necromancer: '#c04dff', Mage: '#6fd8ff', Beast: '#ff8a3a', Archer: '#f2e3b3', Cleric: '#ffe68a', Engineer: '#ffd27a' };

  class Renderer {
    constructor(canvas) {
      this.cv = canvas; this.g = canvas.getContext('2d');
      this.views = new Map(); this.ghosts = []; this.fx = []; this.texts = [];
      this.shake = 0; this.castleHit = [0, 0]; this.baronCast = [0, 0]; this.baronAnim = [-1, -1]; this.baronState = [{ name: 'idle', t: 0 }, { name: 'idle', t: 0 }]; this.collapse = [0, 0]; this.t = 0; this.lastDt = 0;
      // com as artes dos castelos, a arena vem sem castelos e cada lado desenha o castelo escolhido
      this.castleArt = !!(BB.CASTLES_ART && Object.keys(BB.CASTLES_ART).length);
      // castelos do modelo antigo com a cor do tema (tools/castle-skins.py): mesma geometria em todos
      this.skins = !this.castleArt && !!(BB.CASTLE_SKINS && Object.keys(BB.CASTLE_SKINS).length);
      this.arena = BB.art.image(this.castleArt || this.skins ? 'img/arena_bg.webp' : 'img/arena.webp');
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
    // posição na rota (unidades da simulação) a partir de um ponto da tela
    simX(m, px, lane) {
      const l = ARENA.lanes[lane], f0 = m.castleFront(0), f1 = m.castleFront(1);
      const ix = (px - this.ox) / this.s;
      return f0 + ((ix - l.xL) / (l.xR - l.xL)) * (f1 - f0);
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
          const heavy = HEAVY.has(def.id) || e.value >= 140;
          if (def.range <= 4) {
            const tv = e.targetId ? this.views.get(e.targetId) : null;
            if (tv) {
              this.playFx('fx_hit', tv.x, tv.y - tv.r * 0.2, heavy ? 95 : 70, 0.3);
              tv.kick = heavy ? 0.22 : 0.14; tv.kickDir = e.player === 0 ? 1 : -1; // tranco para trás
              this.dust(tv.x, tv.y, heavy ? 7 : 4);
              this.sparks(tv.x - tv.kickDir * tv.r * 0.4, tv.y - tv.r * 0.5, heavy ? 8 : 5);
            } else if (!e.targetId) { const c = this.castlePoint(1 - e.player); this.playFx('fx_hit', c.x, c.y + 40, 90, 0.3); this.sparks(c.x, c.y, 6); }
            this.hitstop = Math.max(this.hitstop || 0, heavy ? 0.085 : 0.035);
          }
          if (heavy) this.shake = Math.max(this.shake, 0.18);
          if (def.range > 4) {
            const tv = e.targetId ? this.views.get(e.targetId) : null;
            const to = tv ? { x: tv.x, y: tv.y - tv.r * 0.4 - tv.lift } : this.castlePoint(1 - e.player);
            const col = PROJ_COLOR[def.cls] || '#f2e3b3';
            const pk = PROJ_KIND[def.id] || 'orb', x0 = v.x + (e.player === 0 ? 1 : -1) * v.r * 0.3, y0 = v.y - v.r - v.lift;
            const dist = Math.hypot(to.x - x0, to.y - y0);
            this.fx.push({ k: 'proj', pk, x0, y0, x1: to.x, y1: to.y, t: 0, d: Math.max(0.16, Math.min(0.5, dist / 1500)), c: PROJ_TINT[def.id] || col,
              r: def.cls === 'Mage' ? 9 : 6, arc: pk === 'arrow' || pk === 'bolt' ? Math.min(60, dist * 0.12) : pk === 'bullet' ? 4 : 18 });
            if (pk === 'bullet') this.fx.push({ k: 'puff', x: x0, y: y0, t: 0, d: 0.3 });
            if (def.ability === 'Splash') this.fx.push({ k: 'burst', x: to.x, y: to.y, r: (def.abilityRadius / m.L) * laneW(e.lane), t: -0.2, d: 0.4, c: col });
          }
          break;
        }
        case 'UnitSpawned': {
          const l = ARENA.lanes[e.lane], def = m.content.cards[e.id], x = this.laneX(m, e.x, e.lane);
          const col = RARITY_COLOR[def && def.rarity] || '#9fd0ff', big = def && (def.rarity === 'Legendary' || def.rarity === 'Mythic');
          if (def && def.token) { this.fx.push({ k: 'flash', x, y: l.y - 30, r: 50, c: '#b98cff', t: 0, d: 0.3 }); break; }
          this.playFx('fx_deploy', x, l.y + (l.y1 - l.y0) * 0.35, 95 * l.k, 0.55);
          this.fx.push({ k: 'ring', x, y: l.y + 4, r: big ? 95 : 70, c: col, t: 0, d: big ? 1.3 : 0.9 });
          this.fx.push({ k: 'flash', x, y: l.y - 40, r: big ? 170 : 110, c: col, t: 0, d: big ? 0.6 : 0.35, beam: big });
          this.dust(x, l.y, big ? 10 : 5);
          if (big) { this.slowmo = 0.45; this.shake = Math.max(this.shake, 0.3); }
          break;
        }
        case 'DeathBlast': { const l = ARENA.lanes[e.lane]; const x = this.laneX(m, e.x, e.lane);
          if (!this.playFx('fx_fireball', x, l.y1 - (l.y1 - l.y0) * 0.1, (l.y1 - l.y0) * 1.3, 0.6)) this.fx.push({ k: 'burst', x, y: l.y, r: (e.radius / m.L) * laneW(e.lane), t: 0, d: 0.5, c: '#ff8a2a' }); break; }
        case 'Hexed': case 'UnitRestored': case 'Raised': if (v) this.fx.push({ k: 'burst', x: v.x, y: v.y, r: v.r * 1.6, t: 0, d: 0.5, c: e.type === 'UnitRestored' ? '#ffffff' : '#a64dff' }); break;
        case 'UnitGrew': if (v) this.fx.push({ k: 'burst', x: v.x, y: v.y, r: v.r * 1.4, t: 0, d: 0.45, c: '#ffd34d' }); break;
        case 'Frozen': if (v) this.fx.push({ k: 'burst', x: v.x, y: v.y, r: v.r * 1.1, t: 0, d: 0.35, c: '#bfefff' }); break;
        case 'Blocked': if (v) this.fx.push({ k: 'burst', x: v.x, y: v.y - v.r, r: v.r * 0.9, t: 0, d: 0.3, c: '#ffe68a' }); break;
        case 'UnitDied':
          if (!this.lastCheer) this.lastCheer = [0, 0];
          if (this.t - this.lastCheer[1 - e.player] > 3) { this.lastCheer[1 - e.player] = this.t; this.baronReact(1 - e.player, 'cheer'); this.bubble(1 - e.player, ['💪', '😄', '🔥', '👊'][Math.floor(Math.random() * 4)]); }
          if (v) this.playFx('fx_death', v.x, v.y + v.r * 0.5 - v.lift, 90 * ARENA.lanes[v.u.lane].k, 0.6); break;
        case 'MatchEnded': {
          if (e.player === 0 || e.player === 1) {
            const c = ARENA.castle[1 - e.player];
            this.playFx('fx_castle_destroyed', (c.x0 + c.x1) / 2, c.y1, 520, 2.2);
            if (e.player === 0) this.playFx('fx_victory', AW / 2, 560, 420, 2.8);
          }
          break;
        }
        case 'UnitRevived': if (v) { v.x = this.laneX(m, e.x, e.lane); v.born = 0; this.fx.push({ k: 'burst', x: v.x, y: v.y, r: v.r * 2.5, t: 0, d: 0.5, c: '#ffb23a' }); } break;
        case 'Heal': if (v) this.fx.push({ k: 'burst', x: v.x, y: v.y - v.lift, r: v.r * 1.4, t: 0, d: 0.35, c: '#7cff8a' }); break;
        case 'SpellCast': {
          const c = SPELL_COLOR[e.id] || '#f7c548';
          const l = ARENA.lanes[e.lane], lh = l.y1 - l.y0, sx = this.laneX(m, e.x, e.lane);
          const SPELL_FX = { // posição e tamanho de cada efeito animado (altura em relação à rota)
            fireball: { x: sx, h: lh * 1.6, d: 1.2 }, freeze: { x: sx, h: lh * 1.4, d: 1.3 }, poison: { x: sx, h: lh * 1.05, d: 1.4 },
            divine_heal: { x: sx, h: lh * 1.0, d: 1.1 }, arcane_shield: { x: sx, h: lh * 1.4, d: 1.2 },
            lightning: { x: sx, h: lh * 1.5, d: 1.0 }, arrow_rain: { x: (l.xL + l.xR) / 2, h: lh * 1.2, d: 1.2 },
            skeleton_summon: { x: sx, h: lh * 1.0, d: 1.0 },
            spark: { x: sx, h: lh * 0.9, d: 0.6, key: 'fx_lightning' },
          };
          const anim = SPELL_FX[e.id];
          if (anim && this.fxSheet(anim.key || 'fx_' + e.id)) this.fx.push(Object.assign({ k: 'anim', key: 'fx_' + e.id, y: l.y1 - lh * 0.15, t: 0 }, anim));
          else if (!e.radius) this.fx.push({ k: 'lane', lane: e.lane, t: 0, d: 0.6, c });
          else this.fx.push({ k: 'burst', x: sx, y: l.y, r: (e.radius / m.L) * laneW(e.lane), t: 0, d: 0.55, c });
          this.shake = Math.max(this.shake, e.id === 'fireball' || e.id === 'lightning' ? 0.3 : 0.15);
          break;
        }
        case 'BaronUsed': {
          this.baronCast[e.player] = 1; this.baronAnim[e.player] = 0; this.setBaronAnim(e.player, 'power');
          const bab = m.players[e.player].baron.ability;
          if (bab === 'OrcFury' && e.lane >= 0) (this.rage = this.rage || []).push({ lane: e.lane, t: 0, d: m.players[e.player].baron.duration || 8 });
          const bkey = { RoyalCommand: 'fx_royal_command', ElvenRain: 'fx_elven_rain', ArmyOfDead: 'fx_army_of_dead', OrcFury: 'fx_orc_fury', ArcaneStorm: 'fx_arcane_storm' }[bab];
          if (bkey && this.fxSheet(bkey)) {
            if (e.lane < 0) { // Comando Real: todas as rotas
              for (const l of ARENA.lanes) this.playFx(bkey, (l.xL + l.xR) / 2, l.y1, (l.y1 - l.y0) * 1.5, 1.6);
            } else {
              const l = ARENA.lanes[e.lane];
              const x = bab === 'ArmyOfDead' ? this.laneX(m, m.spawnX(e.player), e.lane) : (l.xL + l.xR) / 2;
              this.playFx(bkey, x, l.y1, (l.y1 - l.y0) * (bab === 'ArcaneStorm' ? 2.2 : 1.8), 1.8);
            }
            break;
          }
          const c = e.player === 0 ? '#ffd966' : '#ff9a6a';
          if (e.lane >= 0) this.fx.push({ k: 'lane', lane: e.lane, t: 0, d: 0.9, c });
          else for (let l = 0; l < 3; l++) this.fx.push({ k: 'lane', lane: l, t: 0, d: 0.9, c });
          break;
        }
        case 'CastleUsed': {
          const c = { draconic_castle: '#ff6a1e', glacial_fortress: '#9fe6ff', sylvan_sanctuary: '#7dff8a', shadow_necropolis: '#b06bff' }[e.id] || '#8fe3ff';
          // ícones/efeitos próprios dos castelos novos ainda não chegaram: usa efeitos parecidos
          const key = { royal_fortress: 'fx_imperial_shield', draconic_castle: 'fx_dragon_breath', glacial_fortress: 'fx_ice_storm',
            sylvan_sanctuary: 'fx_sylvan_blessing', shadow_necropolis: 'fx_soul_drain' }[e.id];
          if (!this.fxSheet(key) && e.id === 'sylvan_sanctuary' && this.fxSheet('fx_divine_heal')) {
            for (let l = 0; l < 3; l++) this.fx.push({ k: 'lane', lane: l, t: 0, d: 0.9, c });
            const cs = ARENA.castle[e.player];
            this.fx.push({ k: 'anim', key: 'fx_divine_heal', x: (cs.x0 + cs.x1) / 2, y: cs.y1 - 20, h: 380, t: 0, d: 1.4 });
            break;
          }
          const castle = ARENA.castle[e.player];
          if (key && this.fxSheet(key)) {
            if (e.lane < 0) this.fx.push({ k: 'anim', key, x: (castle.x0 + castle.x1) / 2, y: castle.y1 - 20, h: 420, t: 0, d: 1.6 });
            else {
              const l = ARENA.lanes[e.lane], lh = l.y1 - l.y0, meta = BB.FX[key];
              if (key === 'fx_dragon_breath') { // cabeça de dragão na borda do castelo, fogo atravessando a rota
                const h = lh * 1.9, w = meta.w * (h / meta.h);
                const x = e.player === 0 ? l.xL - 70 + w / 2 : l.xR + 70 - w / 2;
                this.fx.push({ k: 'anim', key, x, y: l.y1 - lh * 0.05, h, t: 0, d: 1.4, flip: e.player === 1 });
              } else this.fx.push({ k: 'anim', key, x: (l.xL + l.xR) / 2, y: l.y1 - lh * 0.1, h: lh * 1.7, t: 0, d: 1.4, flip: e.player === 1 });
            }
          } else if (e.lane >= 0) this.fx.push({ k: 'lane', lane: e.lane, t: 0, d: 0.9, c });
          break;
        }
        case 'WallDamaged': {
          (this.wallHit = this.wallHit || {})[e.player + ':' + e.lane] = 0.18;
          const w = this.wallPoint(e.player, e.lane);
          if (e.value >= 1) this.texts.push({ x: w.x + (Math.random() - 0.5) * 30, y: w.y - 60, s: '-' + Math.round(e.value), t: 0, d: 0.8, c: e.player === 0 ? '#ff8080' : '#ffe08a' });
          break;
        }
        case 'WallDestroyed': {
          const w = this.wallPoint(e.player, e.lane), l = ARENA.lanes[e.lane];
          this.shake = Math.max(this.shake, 0.35);
          if (!this.playFx('fx_castle_hit', w.x, l.y1, (l.y1 - l.y0) * 1.6, 0.8)) this.fx.push({ k: 'burst', x: w.x, y: l.y, r: 90, t: 0, d: 0.6, c: '#ffd34d' });
          for (let i = 0; i < 14; i++) this.fx.push({ k: 'shard', x: w.x, y: l.y - 20, vx: (Math.random() - 0.5) * 420 + (e.player === 0 ? 160 : -160), vy: -200 - Math.random() * 260, t: 0, d: 0.9, c: e.player === 0 ? '#7fb6ff' : '#ff8a7a' });
          this.texts.push({ x: w.x, y: l.y0 - 10, s: '👑', t: 0, d: 1.4, c: '#ffd34d', big: true });
          break;
        }
        case 'CastleDamaged': {
          this.castleHit[e.player] = 0.18;
          if (!this.lastHurt) this.lastHurt = [0, 0];
          if (this.t - this.lastHurt[e.player] > 2.5) { this.lastHurt[e.player] = this.t; this.baronReact(e.player, 'hurt'); this.bubble(e.player, ['😱', '😠', '❗'][Math.floor(Math.random() * 3)]); }
          { // rachaduras em etapas (75%, 50%, 25%): pedras caem ao passar de cada uma
            const p = m.players[e.player], st = p.castleHp <= p.castleMaxHp * 0.25 ? 3 : p.castleHp <= p.castleMaxHp * 0.5 ? 2 : p.castleHp <= p.castleMaxHp * 0.75 ? 1 : 0;
            if (!this.crack) this.crack = [0, 0];
            if (st > this.crack[e.player]) {
              this.crack[e.player] = st; this.shake = Math.max(this.shake, 0.35);
              const cp = this.castlePoint(e.player);
              for (let i = 0; i < 16; i++) this.fx.push({ k: 'rock', x: cp.x + (Math.random() - 0.5) * 160, y: cp.y - 160 - Math.random() * 200, vx: (Math.random() - 0.5) * 300, vy: -120 - Math.random() * 200, r: 5 + Math.random() * 9, c: ['#7d7385', '#6a6070', '#958aa0'][i % 3], t: 0, d: 1.1 });
              this.dust(cp.x, cp.y + 60, 12, 2);
            }
          }
          if (!this.lastCastleFx) this.lastCastleFx = [0, 0];
          if (this.t - this.lastCastleFx[e.player] > 0.6) {
            this.lastCastleFx[e.player] = this.t;
            const cp = this.castlePoint(e.player);
            this.playFx('fx_castle_hit', cp.x + (Math.random() - 0.5) * 80, cp.y + 20 - Math.random() * 120, 190, 0.7);
          }
          const pt = this.castlePoint(e.player);
          if (e.value >= 1) this.texts.push({ x: pt.x + (Math.random() - 0.5) * 60, y: pt.y - 40, s: '-' + Math.round(e.value), t: 0, d: 0.9, c: '#ff4a3a', size: 40, pop: true });
          break;
        }
        case 'CastleAttack': {
          const tv = this.views.get(e.targetId);
          if (tv) { // a torre do castelo atira flechas (saem da sacada)
            const b = ARENA.baron[e.player], x0 = b.x + (e.player === 0 ? 70 : -70), y0 = b.y + 20, x1 = tv.x, y1 = tv.y - tv.r * 0.4 - tv.lift;
            const dist = Math.hypot(x1 - x0, y1 - y0);
            this.fx.push({ k: 'proj', pk: 'arrow', x0, y0, x1, y1, t: 0, d: Math.max(0.18, Math.min(0.45, dist / 1500)), c: '#f2e3b3', r: 6, arc: Math.min(50, dist * 0.12) });
          }
          break;
        }
      }
    }

    // desenho do projétil: flecha, virote, bala, orbe mágico, folha, bola de fogo, estilhaço de gelo
    drawProj(f, x, y, ang, k) {
      const g = this.g;
      g.save(); g.translate(x, y); g.rotate(ang);
      switch (f.pk) {
        case 'arrow': case 'bolt': {
          const L = f.pk === 'arrow' ? 34 : 26;
          g.strokeStyle = '#6b4423'; g.lineWidth = 3; g.beginPath(); g.moveTo(-L, 0); g.lineTo(0, 0); g.stroke();
          g.fillStyle = '#d9dde3'; g.beginPath(); g.moveTo(8, 0); g.lineTo(-3, -5); g.lineTo(-3, 5); g.closePath(); g.fill();
          g.fillStyle = f.pk === 'arrow' ? '#e8e2d0' : '#c33'; g.beginPath(); g.moveTo(-L, 0); g.lineTo(-L - 7, -6); g.lineTo(-L + 6, 0); g.lineTo(-L - 7, 6); g.closePath(); g.fill();
          break;
        }
        case 'bullet':
          g.fillStyle = 'rgba(255,220,140,.5)'; g.fillRect(-22, -2, 20, 4);
          g.fillStyle = '#3a3a40'; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill(); g.fillStyle = '#9aa'; g.beginPath(); g.arc(-2, -2, 2, 0, TAU); g.fill();
          break;
        case 'leaf':
          g.rotate(k * 12); g.fillStyle = f.c; g.shadowColor = f.c; g.shadowBlur = 12;
          g.beginPath(); g.ellipse(0, 0, 11, 5, 0, 0, TAU); g.fill(); g.shadowBlur = 0;
          break;
        case 'ice':
          g.fillStyle = 'rgba(191,239,255,.35)'; g.fillRect(-26, -4, 22, 8);
          g.fillStyle = '#e8fbff'; g.strokeStyle = '#5cc8f0'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(14, 0); g.lineTo(0, -7); g.lineTo(-12, 0); g.lineTo(0, 7); g.closePath(); g.fill(); g.stroke();
          break;
        case 'fire': {
          for (let i = 4; i >= 0; i--) { g.globalAlpha = 0.25 + 0.15 * (4 - i); g.fillStyle = i > 2 ? '#ff5a1a' : '#ffb02a'; g.beginPath(); g.arc(-i * 8, Math.sin(k * 30 + i) * 2, 13 - i * 2, 0, TAU); g.fill(); }
          g.globalAlpha = 1; g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(2, 0, 6, 0, TAU); g.fill();
          break;
        }
        default: { // orbe mágico com rastro
          g.shadowColor = f.c; g.shadowBlur = 18;
          for (let i = 3; i >= 1; i--) { g.globalAlpha = 0.18 * (4 - i); g.fillStyle = f.c; g.beginPath(); g.arc(-i * 9, 0, f.r * (1 - i * 0.18), 0, TAU); g.fill(); }
          g.globalAlpha = 1; g.fillStyle = f.c; g.beginPath(); g.arc(0, 0, f.r, 0, TAU); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, f.r * 0.45, 0, TAU); g.fill(); g.shadowBlur = 0;
        }
      }
      g.restore();
    }

    // Fúria Orc: a rota fica vermelha e as linhas douradas das bordas pegam fogo
    drawRage(dt) {
      if (!this.rage || !this.rage.length) return;
      const g = this.g;
      this.rage = this.rage.filter((r) => (r.t += dt) < r.d);
      for (const r of this.rage) {
        const l = ARENA.lanes[r.lane], fade = Math.min(1, r.t / 0.3, (r.d - r.t) / 0.6);
        const pulse = 0.3 + 0.07 * Math.sin(this.t * 6);
        g.save(); g.globalAlpha = fade;
        const gr = g.createLinearGradient(0, l.y0, 0, l.y1);
        gr.addColorStop(0, 'rgba(255,40,20,' + (pulse + 0.1) + ')'); gr.addColorStop(0.5, 'rgba(200,20,10,' + pulse + ')'); gr.addColorStop(1, 'rgba(255,40,20,' + (pulse + 0.1) + ')');
        g.fillStyle = gr; g.fillRect(l.xL - 40, l.y0, l.xR - l.xL + 80, l.y1 - l.y0);
        g.globalCompositeOperation = 'lighter';
        for (const ey of [l.y0, l.y1]) { // chamas ao longo das duas linhas da rota
          for (let x = l.xL - 30; x < l.xR + 30; x += 18) {
            const seed = x * 0.37 + ey, f = 0.5 + 0.5 * Math.sin(this.t * 11 + seed) * Math.sin(this.t * 7.3 + seed * 1.7);
            const h = 16 + 22 * f, w = 9 + 3 * f;
            g.fillStyle = 'rgba(255,' + Math.round(90 + 90 * f) + ',20,.75)';
            g.beginPath(); g.moveTo(x - w, ey); g.quadraticCurveTo(x - w * 0.6, ey - h * 0.6, x, ey - h); g.quadraticCurveTo(x + w * 0.6, ey - h * 0.6, x + w, ey); g.closePath(); g.fill();
            g.fillStyle = 'rgba(255,240,150,.7)';
            g.beginPath(); g.ellipse(x, ey - h * 0.25, w * 0.35, h * 0.25, 0, 0, TAU); g.fill();
          }
        }
        g.restore();
      }
    }

    dust(x, y, n, s = 1) {
      for (let i = 0; i < n; i++) this.fx.push({ k: 'dust', x: x + (Math.random() - 0.5) * 30 * s, y: y - Math.random() * 6, vx: (Math.random() - 0.5) * 70, vy: -20 - Math.random() * 40, r: (8 + Math.random() * 10) * s, t: 0, d: 0.45 + Math.random() * 0.25 });
    }
    sparks(x, y, n) {
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 160 + Math.random() * 260; this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, t: 0, d: 0.25 + Math.random() * 0.15 }); }
    }

    // silhueta branca do quadro atual (piscada de dano)
    whiteFrame(sheet, sx, sy, w, h) {
      if (!this.tint) { this.tint = document.createElement('canvas'); }
      const c = this.tint; if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const t = c.getContext('2d'); t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, w, h);
      t.drawImage(sheet, sx, sy, w, h, 0, 0, w, h); t.globalCompositeOperation = 'source-in'; t.fillStyle = '#fff'; t.fillRect(0, 0, w, h);
      return c;
    }

    wallPoint(owner, lane) {
      const l = ARENA.lanes[lane], x = ARENA.seam ? ARENA.seam(l.y) - 6 : l.xL;
      return { x: owner === 0 ? x : AW - x, y: l.y };
    }

    // muralha mágica de cada rota: faixa de energia na linha do piso, na cor do time, com barra de vida
    drawWalls(m, owner) {
      const p = m.players[owner];
      if (!p.walls || !p.wallMaxHp) return;
      const g = this.g, col = owner === 0 ? [90, 160, 255] : [255, 90, 80];
      for (let lane = 0; lane < 3; lane++) {
        const hp = p.walls[lane];
        if (hp <= 0) continue;
        const l = ARENA.lanes[lane], pct = hp / p.wallMaxHp;
        const X = (y) => { const x = (ARENA.seam ? ARENA.seam(y) : l.xL) - 6; return owner === 0 ? x : AW - x; };
        const hit = (this.wallHit && this.wallHit[owner + ':' + lane]) || 0;
        if (hit > 0) this.wallHit[owner + ':' + lane] = hit - this.lastDt;
        const y0 = l.y0 + 4, y1 = l.y1 - 2, a = 0.55 + 0.12 * Math.sin(this.t * 4 + lane) + (hit > 0 ? 0.3 : 0), W2 = 16;
        g.save();
        const band = () => { g.beginPath(); g.moveTo(X(y0) - W2, y0); g.lineTo(X(y1) - W2, y1); g.lineTo(X(y1) + W2, y1); g.lineTo(X(y0) + W2, y0); g.closePath(); };
        // véu de energia grosso, mais forte embaixo
        band();
        const gr = g.createLinearGradient(0, y0, 0, y1);
        gr.addColorStop(0, `rgba(${col},${a * 0.35})`); gr.addColorStop(0.6, `rgba(${col},${a * 0.75})`); gr.addColorStop(1, `rgba(${col},${a})`);
        g.fillStyle = gr; g.fill();
        g.save(); band(); g.clip(); // linhas de escudo (hexagonal simples) correndo
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5;
        for (let k = 0; k < 7; k++) { const y = y0 + ((k / 7 + this.t * 0.15) % 1) * (y1 - y0); g.beginPath(); g.moveTo(X(y) - W2, y); g.lineTo(X(y), y - 8); g.lineTo(X(y) + W2, y); g.stroke(); }
        g.restore();
        // bordas brilhantes
        g.shadowColor = `rgb(${col})`; g.shadowBlur = 14; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3;
        for (const sx of [-W2, W2]) { g.beginPath(); g.moveTo(X(y0) + sx, y0); g.lineTo(X(y1) + sx, y1); g.stroke(); }
        g.shadowBlur = 0;
        // base no chão
        g.fillStyle = `rgba(${col},.5)`; g.beginPath(); g.ellipse(X(y1), y1, W2 + 10, 7, 0, 0, TAU); g.fill();
        // barra de vida
        const bx = X(y0) - 36, by = y0 - 16, bw = 72;
        g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(bx - 2, by - 2, bw + 4, 12);
        g.fillStyle = owner === 0 ? '#3f8bff' : '#ff4a4a'; g.fillRect(bx, by, bw * pct, 8);
        g.strokeStyle = '#f2c14e'; g.lineWidth = 1.5; g.strokeRect(bx - 2, by - 2, bw + 4, 12);
        g.restore();
      }
    }

    castlePoint(owner) { const c = ARENA.castle[owner]; return { x: c.gx, y: c.gy }; }

    // ------------------------------------------------------------ quadro
    // cada rota começa na parede do castelo escolhido: as tropas encostam no castelo ao atacar
    // (rota de cima: na beira da sacada; rotas 2 e 3: um pouco por dentro, colando na parede)
    applyCastleFronts(m) {
      const key = m.players[0].castle.id + '|' + m.players[1].castle.id;
      if (this.frontKey === key) return;
      this.frontKey = key;
      // as 3 rotas começam numa mesma linha reta diagonal (igual para todos os castelos), na frente da sacada e do portão
      const edge = (id, i) => (this.castleArtFor(id) ? ARENA.seam(ARENA.lanes[i].y) : null);
      // Barão em pé na sacada do castelo escolhido
      for (let o = 0; o < 2; o++) {
        const a = this.castleArtFor(m.players[o].castle.id);
        if (a && a.x != null) { const bx = a.x + a.foot[0], by = a.y + a.foot[1] - 54; ARENA.baron[o].x = o ? AW - bx : bx; ARENA.baron[o].y = by; }
      }
      ARENA.lanes.forEach((l, i) => {
        const [dL, dR] = ARENA.laneEnds[i];
        const e0 = edge(m.players[0].castle.id, i), e1 = edge(m.players[1].castle.id, i);
        l.xL = e0 == null ? dL : e0;
        l.xR = e1 == null ? dR : AW - e1;
      });
    }

    draw(m, dt, ui) {
      this.t += dt; this.lastDt = dt;
      this.applyCastleFronts(m);
      const g = this.g;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      // fundo: sobras laterais/verticais com a arte esticada e desfocada
      g.fillStyle = '#0b1230'; g.fillRect(0, 0, this.W, this.H);
      const img = this.arena;
      const ready = img.complete && img.naturalWidth;
      if (ready && (this.ox > 1 || this.oy > 1)) {
        if (this.oy <= 1) {
          // celular largo: as sobras dos lados mostram a própria arena espelhada (muro e piso continuam, sem desfoque)
          const w = AW * this.s, h = AH * this.s;
          g.save(); g.translate(this.ox, 0); g.scale(-1, 1); g.drawImage(img, 0, this.oy, w, h); g.restore();
          g.save(); g.translate(this.ox + 2 * w, 0); g.scale(-1, 1); g.drawImage(img, 0, this.oy, w, h); g.restore();
        } else {
          g.save(); g.filter = 'blur(14px) brightness(.7)';
          const cs = Math.max(this.W / AW, this.H / AH);
          g.drawImage(img, (this.W - AW * cs) / 2, (this.H - AH * cs) / 2, AW * cs, AH * cs);
          g.restore();
        }
      }
      let sh = 0;
      if (this.shake > 0) { this.shake -= dt; sh = this.shake * 14; }
      g.save();
      if (sh) g.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
      g.translate(this.ox, this.oy); g.scale(this.s, this.s);
      // fim de partida: câmera aproxima do Barão vencedor para mostrar a comemoração
      if (m.over && m.winner >= 0) {
        this.endZoom = Math.min(1, (this.endZoom || 0) + dt / 1.2);
        const k = this.endZoom * this.endZoom * (3 - 2 * this.endZoom), b = ARENA.baron[m.winner];
        const z = 1 + 1.6 * k, fx = b.x, fy = b.y - 10;
        const tx = fx + (AW / 2 - fx) * k, ty = fy + (AH * 0.48 - fy) * k;
        g.translate(tx, ty); g.scale(z, z); g.translate(-fx, -fy);
      } else this.endZoom = 0;
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
      for (let i = 0; i < 2; i++) this.drawWalls(m, i);
      this.drawFrontWall();
      this.drawRage(dt);
      this.syncViews(m, dt);
      const list = [...this.views.values(), ...this.ghosts].sort((a, b) => (a.fly - b.fly) || (a.y - b.y));
      for (const v of list) this.drawUnit(v, dt);
      if (ui && ui.ghost) this.drawGhost(m, ui.ghost);
      for (let i = 0; i < 2; i++) this.drawBaron(m, i);
      this.drawFx(dt);
      g.restore();
    }

    // Estado do castelo sobre a arte: impacto, escudo, rachaduras, fumaça e destruição
    drawCastleState(m, owner) {
      const g = this.g, p = m.players[owner], c = ARENA.castle[owner];
      // castelo escolhido (arte 3/4 desenhada para o lado esquerdo; o da direita é espelhado):
      // o ponto da sacada encaixa exatamente onde o Barão pisa
      const skin = this.skins && (BB.CASTLE_SKINS[p.castle.id] || BB.CASTLE_SKINS.royal_fortress);
      if (skin) {
        const im = BB.art.image(skin.src);
        if (im.complete && im.naturalWidth) {
          g.save(); if (owner === 1) { g.translate(AW, 0); g.scale(-1, 1); }
          g.drawImage(im, 0, 0, skin.w, skin.h); g.restore();
        }
      }
      const art = this.castleArtFor(p.castle.id);
      if (art) {
        const im = BB.art.image(art.src);
        if (im.complete && im.naturalWidth) {
          g.save(); if (owner === 1) { g.translate(AW, 0); g.scale(-1, 1); }
          g.drawImage(im, art.x, art.y, art.w, art.h); g.restore();
        }
        const gx = art.x + art.gate[0], gy = art.y + art.gate[1];
        c.gx = owner === 1 ? AW - gx : gx; c.gy = gy;
      }
      const w = c.x1 - c.x0, h = c.y1 - c.y0, cx = (c.x0 + c.x1) / 2;
      const crack = (this.crack && this.crack[owner]) || 0;
      if (crack > 0) { // rachaduras na parede do castelo
        g.save(); if (owner === 1) { g.translate(AW, 0); g.scale(-1, 1); }
        g.strokeStyle = 'rgba(25,15,20,.85)'; g.lineWidth = 4; g.lineCap = 'round';
        const C = [[[170, 420], [195, 470], [180, 520], [210, 575]], [[90, 560], [130, 600], [115, 650], [150, 700]], [[250, 300], [230, 350], [262, 395], [240, 440]],
          [[60, 380], [95, 420], [80, 470]], [[300, 520], [280, 570], [305, 610]], [[140, 250], [165, 290], [150, 330]]];
        for (let i = 0; i < Math.min(C.length, crack * 2); i++) { g.beginPath(); C[i].forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
        g.restore();
      }
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
      const im = BB.art.image(BB.fxSrc(key));
      return im.complete && im.naturalWidth ? im : null;
    }

    // muro da frente da arena (fileira de pedras de baixo) por cima da base dos castelos, de ponta a ponta da tela:
    // o castelo fica "atrás" do muro e a base dele nunca aparece cortada
    drawFrontWall() {
      if (!this.castleArt) return;
      // peça de muro curvo nos cantos (img/corner_wall.webp): cobre a base do castelo e encontra o muro da arena
      const im = BB.art.image('img/corner_wall.webp');
      if (!im.complete || !im.naturalWidth) return;
      const g = this.g, X = -330, Y = 490;
      g.drawImage(im, X, Y);
      g.save(); g.translate(AW, 0); g.scale(-1, 1); g.drawImage(im, X, Y); g.restore();
    }

    // posição do castelo (lado esquerdo) para que o pé do Barão caia no ponto da sacada
    // castelo sem arte própria ainda: usa o mesmo formato (Fortaleza Real) para manter a linha da arena
    castleArtFor(id) {
      if (!this.castleArt) return null;
      const key = BB.CASTLES_ART[id] ? id : 'royal_fortress';
      const a = BB.CASTLES_ART[key];
      if (!a) return null;
      if (a.x != null) return a; // posição fixa na arena (pode passar da borda: celulares largos)
      const b = ARENA.baron[0];
      return Object.assign({ x: b.x - a.foot[0], y: b.y + 54 - a.foot[1], src: 'img/castles/' + key + '.webp' }, a);
    }

    // parapeito da sacada recortado da arena e desenhado na frente do Barão
    drawRailing(owner, m) {
      const skin = this.skins && m && (BB.CASTLE_SKINS[m.players[owner].castle.id] || BB.CASTLE_SKINS.royal_fortress);
      if (skin) {
        const im = BB.art.image(skin.src);
        if (!im.complete || !im.naturalWidth) return;
        const g = this.g;
        g.save(); if (owner === 1) { g.translate(AW, 0); g.scale(-1, 1); }
        g.beginPath(); ARENA.railing.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath(); g.clip(); g.drawImage(im, 0, 0, skin.w, skin.h); g.restore();
        return;
      }
      const art = m && this.castleArtFor(m.players[owner].castle.id);
      if (art) {
        const im = BB.art.image(art.src);
        if (!im.complete || !im.naturalWidth) return;
        const g = this.g;
        g.save(); if (owner === 1) { g.translate(AW, 0); g.scale(-1, 1); }
        g.beginPath(); art.rail.forEach(([x, y], i) => (i ? g.lineTo(art.x + x, art.y + y) : g.moveTo(art.x + x, art.y + y)));
        g.closePath(); g.clip();
        g.drawImage(im, art.x, art.y, art.w, art.h); g.restore();
        return;
      }
      if (!this.railing) {
        const img = this.arena;
        if (!img.complete || !img.naturalWidth) return;
        this.railing = [0, 1].map((side) => {
          const c = document.createElement('canvas'); c.width = AW; c.height = 420;
          const g = c.getContext('2d');
          g.beginPath();
          ARENA.railing.forEach(([x, y], i) => { const px = side ? AW - x : x; if (i) g.lineTo(px, y); else g.moveTo(px, y); });
          g.closePath(); g.clip();
          g.drawImage(img, 0, 0, AW, AH);
          return c;
        });
      }
      this.g.drawImage(this.railing[owner], 0, 0);
    }

    // balão com emoji sobre o Barão
    bubble(owner, s) { const b = ARENA.baron[owner]; this.texts.push({ x: b.x + (owner === 0 ? 60 : -60), y: b.y - 110, s, t: 0, d: 1.2, big: true }); }

    setBaronAnim(owner, name) { this.baronState[owner] = { name, t: 0 }; }
    // reações do Barão (só interrompem a espera ou outra reação, nunca o poder)
    baronReact(owner, name) {
      const st = this.baronState[owner];
      if (st.name === 'idle' || (name === 'hurt' && st.name === 'cheer')) this.setBaronAnim(owner, name);
    }

    drawBaron(m, owner) {
      const g = this.g, p = m.players[owner], b = ARENA.baron[owner];
      const win = m.over && m.winner === owner, lose = m.over && m.winner === 1 - owner;
      // folha de animações própria do Barão (espera, poder, vitória, derrota, dano, comando)
      const ba = BB.BARON_ANIM && BB.BARON_ANIM[p.baron.id];
      const bsheet = ba ? BB.art.image('img/barons/' + p.baron.id + '_anim.webp') : null;
      if (bsheet && bsheet.complete && bsheet.naturalWidth) {
        const foot = b.y + 54;
        if (m.baronReady(p) && !m.over) {
          g.fillStyle = 'rgba(255,215,100,' + (0.35 + 0.3 * Math.sin(this.t * 6)) + ')';
          g.beginPath(); g.ellipse(b.x, foot, 62, 16, 0, 0, TAU); g.fill();
        }
        const st = this.baronState[owner];
        if (m.over && st.name !== 'victory' && st.name !== 'defeat') this.setBaronAnim(owner, win ? 'victory' : lose ? 'defeat' : 'idle');
        st.t += this.lastDt;
        const SPEED = { idle: 0.2, power: 0.19, victory: 0.18, defeat: 0.2, hurt: 0.11, cheer: 0.15 };
        const cnt = (name) => (ba.counts ? ba.counts[ba.rows.indexOf(name)] : ba.n) || ba.n;
        let fr = Math.floor(st.t / SPEED[st.name]);
        if (st.name === 'idle') fr %= cnt('idle');
        else if (fr >= cnt(st.name)) {
          const n = cnt(st.name);
          if (st.name === 'victory') fr = Math.max(0, n - 4) + Math.floor(st.t * 5) % 3; // repete o trecho final da comemoração
          else if (st.name === 'defeat') fr = Math.max(0, n - 2);                       // fica abatido
          else { this.setBaronAnim(owner, 'idle'); fr = 0; }
        }
        const row = Math.max(0, ba.rows.indexOf(this.baronState[owner].name));
        const s = 150 / ba.body;
        // a folha da Elara foi desenhada olhando para a esquerda: inverte o lado
        const faceLeft = ba.faceLeft || p.baron.id === 'elara';
        g.save(); g.translate(b.x, foot); if ((owner === 1) !== faceLeft) g.scale(-1, 1);
        g.drawImage(bsheet, fr * ba.w, row * ba.h, ba.w, ba.h, -ba.ax * s, -ba.ay * s, ba.w * s, ba.h * s);
        g.restore();
        this.drawRailing(owner, m);
        return;
      }
      const sp = BB.SPRITES && BB.SPRITES[p.baron.id];
      const sheet = sp ? BB.art.image(BB.unitSrc(p.baron.id)) : null;
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
        let x = tx.get(u.id); const y = l.y + rowOf.get(u.id) * (l.y1 - l.y0) * 0.24;
        if (this.castleArt) { // segue a junta do piso também nas fileiras de cima e de baixo
          const f = (x - l.xL) / (l.xR - l.xL), a = ARENA.seam(y); x = a + f * (AW - 2 * a);
        }
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
        if (u.hp < v.lastHp - 0.5) {
          v.flash = 0.24;
          const dmg = v.lastHp - u.hp;
          if (dmg >= 8) this.texts.push({ x: v.x + (Math.random() - 0.5) * 30, y: v.y - v.r * 2.2 - v.lift, s: String(Math.round(dmg)), t: 0, d: 0.75,
            c: dmg >= 120 ? '#ffd34d' : '#ffffff', size: dmg >= 120 ? 46 : 30, pop: true });
        }
        if (u.state === 'Moving' && !u.flying && (v.dustT = (v.dustT || 0) - dt) <= 0) { v.dustT = 0.22 + Math.random() * 0.1; this.dust(v.x - (u.owner === 0 ? 1 : -1) * v.r * 0.5, v.y, 1, 0.5); }
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
      const sp = BB.SPRITES && BB.SPRITES[u.def.sprite || u.def.id];
      const sheet = sp ? BB.art.image(BB.unitSrc(u.def.sprite || u.def.id)) : null;
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
      const bodyPx = (v.fly ? 126 : 140) * k * (0.86 + Math.min(1, u.def.hp / 1800) * 0.3) * (u.size || 1) * (sp.scale || 1) * (u.def.visualScale || 1);
      let scale = v.born < 1 ? 0.3 + 0.7 * easeOutBack(v.born) : 1, alpha = 1;
      if (v.dying >= 0) { scale *= 1 - v.dying / 0.4; alpha = 1 - v.dying / 0.4; }
      const s = (bodyPx / sp.body) * scale;
      let row = 0, frame = 0;
      if (v.atk >= 0 && v.atk < v.atkDur && v.dying < 0) {
        row = 1; frame = Math.min(sp.attack - 1, Math.floor((v.atk / v.atkDur) * sp.attack)); v.atk += dt;
      } else {
        v.atk = -1;
        if (u.state === 'Moving' || v.fly) {
          const ph = v.phase * Math.min(7, sp.fps || 11);
          frame = Math.floor(ph) % sp.walk;
          if (sp.blend) v.blendNext = { f: (frame + 1) % sp.walk, a: ph - Math.floor(ph) }; // passo suave: mistura com o próximo quadro
        }
      }
      const lift = v.fly ? 46 * k : 0, bob = v.fly ? Math.sin(v.phase * 3) * 5 : 0;
      if (v.kick > 0) { v.kick -= dt; }
      const kx = v.kick > 0 ? v.kickDir * Math.sin((v.kick / 0.22) * Math.PI) * 14 : 0;
      const foot = v.y;
      g.save(); g.globalAlpha = alpha;
      if (u.def.ability === 'ShieldDome' && v.dying < 0) { // cúpula do Paladino no chão
        const l = ARENA.lanes[u.lane], rr = ((u.def.abilityRadius || 6) / 100) * (l.xR - l.xL);
        g.fillStyle = 'rgba(255,230,138,.12)'; g.strokeStyle = 'rgba(255,230,138,.55)'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(v.x, v.y, rr, rr * 0.28, 0, 0, TAU); g.fill(); g.stroke();
      }
      // sombra e marca do time no chão
      g.save();
      g.translate(v.x + kx, foot - lift + bob);
      if (dir < 0) g.scale(-1, 1);
      if (u.state === 'Stunned') g.filter = 'saturate(.35) brightness(1.25) hue-rotate(160deg)';
      else if (u.poisonTime > 0) g.filter = 'sepia(.4) hue-rotate(50deg) saturate(1.4)';
      const bn = row === 0 && v.blendNext; v.blendNext = null;
      if (bn && bn.a > 0.5) { // cruza os dois quadros vizinhos do andar
        const a0 = g.globalAlpha;
        g.drawImage(sheet, frame * sp.w, 0, sp.w, sp.h, -sp.ax * s, -sp.ay * s, sp.w * s, sp.h * s);
        g.globalAlpha = a0 * (bn.a - 0.5) * 2 * 0.85;
        g.drawImage(sheet, bn.f * sp.w, 0, sp.w, sp.h, -sp.ax * s, -sp.ay * s, sp.w * s, sp.h * s);
        g.globalAlpha = a0;
      } else g.drawImage(sheet, frame * sp.w, row * sp.h, sp.w, sp.h, -sp.ax * s, -sp.ay * s, sp.w * s, sp.h * s);
      // piscada branca ao levar dano (duas piscadas rápidas)
      if (v.flash > 0 && Math.floor(v.flash / 0.06) % 2 === 1) {
        g.filter = 'none'; g.globalAlpha = alpha * 0.85;
        g.drawImage(this.whiteFrame(sheet, frame * sp.w, row * sp.h, sp.w, sp.h), -sp.ax * s, -sp.ay * s, sp.w * s, sp.h * s);
      }
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

    // Indicador de invocação: a rota escolhida brilha e a criatura aparece transparente onde vai nascer
    drawGhost(m, gh) {
      const g = this.g, l = ARENA.lanes[gh.lane], x = this.laneX(m, gh.x, gh.lane);
      g.save();
      g.strokeStyle = 'rgba(255,230,120,.95)'; g.lineWidth = 4; g.setLineDash([12, 8]);
      g.beginPath(); g.ellipse(x, l.y, 46, 13, 0, 0, TAU); g.stroke(); g.setLineDash([]);
      const sp = BB.SPRITES && BB.SPRITES[gh.def.id], sheet = sp ? BB.art.image(BB.unitSrc(gh.def.id)) : null;
      g.globalAlpha = 0.55 + 0.15 * Math.sin(this.t * 8);
      if (sheet && sheet.complete && sheet.naturalWidth) {
        const bodyPx = (gh.def.flying ? 126 : 140) * (0.86 + Math.min(1, gh.def.hp / 1800) * 0.3), s = bodyPx / sp.body;
        const lift = gh.def.flying ? 46 : 0;
        g.drawImage(sheet, 0, 0, sp.w, sp.h, x - sp.ax * s, l.y - lift - sp.ay * s, sp.w * s, sp.h * s);
      } else medallion(g, BB.art.cardImage(gh.def), x, l.y - 50, 44, '#ffd966', 5, false);
      g.restore();
    }

    drawFx(dt) {
      const g = this.g;
      this.fx = this.fx.filter((f) => (f.t += dt) < f.d);
      for (const f of this.fx) {
        if (f.t < 0) continue;
        const k = f.t / f.d;
        if (f.k === 'proj') {
          const P = (q) => ({ x: f.x0 + (f.x1 - f.x0) * q, y: f.y0 + (f.y1 - f.y0) * q - Math.sin(q * Math.PI) * (f.arc ?? 40) });
          const p = P(k), pb = P(Math.max(0, k - 0.06)), ang = Math.atan2(p.y - pb.y, p.x - pb.x);
          this.drawProj(f, p.x, p.y, ang, k);
        } else if (f.k === 'shard') { // pedaços da muralha voando
          const tt = f.t; g.globalAlpha = 1 - k; g.fillStyle = f.c;
          g.save(); g.translate(f.x + f.vx * tt, f.y + f.vy * tt + 600 * tt * tt); g.rotate(tt * 8); g.fillRect(-6, -6, 12, 12); g.restore(); g.globalAlpha = 1;
        } else if (f.k === 'dust') {
          g.globalAlpha = 0.45 * (1 - k); g.fillStyle = '#cfc6b8';
          g.beginPath(); g.arc(f.x + f.vx * f.t, f.y + f.vy * f.t, f.r * (0.6 + k), 0, TAU); g.fill(); g.globalAlpha = 1;
        } else if (f.k === 'spark') {
          const x = f.x + f.vx * f.t, y = f.y + f.vy * f.t + 500 * f.t * f.t;
          g.globalAlpha = 1 - k; g.strokeStyle = '#fff4b0'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x - f.vx * 0.03, y - f.vy * 0.03); g.stroke(); g.globalAlpha = 1;
        } else if (f.k === 'ring') { // círculo mágico da invocação
          const a = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
          g.save(); g.globalAlpha = a; g.translate(f.x, f.y); g.scale(1, 0.32); g.rotate(f.t * 2);
          g.strokeStyle = f.c; g.lineWidth = 5; g.shadowColor = f.c; g.shadowBlur = 18;
          g.beginPath(); g.arc(0, 0, f.r, 0, TAU); g.stroke();
          g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, f.r * 0.72, 0, TAU); g.stroke();
          for (let i = 0; i < 6; i++) { const q = i * TAU / 6; g.beginPath(); g.moveTo(Math.cos(q) * f.r * 0.72, Math.sin(q) * f.r * 0.72); g.lineTo(Math.cos(q + TAU / 3) * f.r * 0.72, Math.sin(q + TAU / 3) * f.r * 0.72); g.stroke(); }
          g.restore();
        } else if (f.k === 'flash') {
          const a = 1 - k; const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
          gr.addColorStop(0, `rgba(255,255,255,${0.9 * a})`); gr.addColorStop(0.4, f.c + Math.round(160 * a).toString(16).padStart(2, '0')); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(f.x, f.y, f.r, 0, TAU); g.fill();
          if (f.beam) { g.fillStyle = `rgba(255,240,200,${0.35 * a})`; g.fillRect(f.x - f.r * 0.25, f.y - 700, f.r * 0.5, 700); }
        } else if (f.k === 'rock') {
          const x = f.x + f.vx * f.t, y = f.y + f.vy * f.t + 900 * f.t * f.t;
          g.globalAlpha = 1 - k * k; g.fillStyle = f.c; g.save(); g.translate(x, y); g.rotate(f.t * 6); g.fillRect(-f.r, -f.r, f.r * 2, f.r * 1.6); g.restore(); g.globalAlpha = 1;
        } else if (f.k === 'puff') {
          g.globalAlpha = 0.6 * (1 - k); g.fillStyle = '#d8d4cc';
          for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(f.x + (i - 1) * 8 * (1 + k), f.y - k * 18 - i * 4, 6 + k * 10, 0, TAU); g.fill(); }
          g.globalAlpha = 1;
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
        if (t.big) { g.save(); g.font = 'bold 64px sans-serif'; g.fillText(t.s, t.x, t.y - t.t * 50); g.restore(); continue; }
        if (t.pop) {
          const sc = t.t < 0.12 ? 0.6 + (t.t / 0.12) * 0.7 : 1.3 - Math.min(0.3, (t.t - 0.12) * 1.5);
          g.save(); g.font = '900 ' + Math.round(t.size * sc) + 'px sans-serif'; g.lineWidth = 6; g.strokeStyle = '#000';
          g.strokeText(t.s, t.x, t.y - t.t * 55); g.fillStyle = t.c; g.fillText(t.s, t.x, t.y - t.t * 55); g.restore(); continue;
        }
        g.lineWidth = 7; g.strokeStyle = '#000'; g.strokeText(t.s, t.x, t.y - t.t * 70);
        g.fillStyle = t.c; g.fillText(t.s, t.x, t.y - t.t * 70);
      }
      g.globalAlpha = 1;
    }

    reset() { this.crack = [0, 0]; this.lastCheer = [0, 0]; this.hitstop = 0; this.slowmo = 0; this.rage = []; this.views.clear(); this.ghosts = []; this.fx = []; this.texts = []; this.collapse = [0, 0]; this.baronCast = [0, 0]; this.baronAnim = [-1, -1]; this.baronState = [{ name: 'idle', t: 0 }, { name: 'idle', t: 0 }]; this.castleHit = [0, 0]; this.endZoom = 0; }
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

// Simulação da partida (regras puras, sem desenho). Roda igual no navegador, no app e no Node (testes/servidor).
// Rota = reta X ∈ [0, laneLength]. Castelo do jogador 0 em X=0, do jogador 1 em X=laneLength.
(function (BB) {
  'use strict';

  class Rng {
    constructor(seed) {
      this.s = ((seed | 0) ^ 0x9e3779b9) >>> 0;
      if (this.s === 0) this.s = 0x6c078965;
    }
    nextUInt() {
      let s = this.s;
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      this.s = s;
      return s;
    }
    next() { return (this.nextUInt() >>> 8) / 16777216; }
    range(min, maxEx) { return maxEx <= min ? min : min + (this.nextUInt() % (maxEx - min)); }
    shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = this.range(0, i + 1);
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }
  }

  const RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];

  // ---------------------------------------------------------------- conteúdo
  class Content {
    constructor(file) {
      const errors = [];
      this.version = file.version || '0';
      this.balance = Object.assign({}, file.balance);
      this.cards = {}; this.allCards = []; this.collectible = [];
      this.barons = []; this.castles = []; this.baronById = {}; this.castleById = {};
      for (const src of file.cards || []) {
        const c = Object.assign({ count: 1, attackInterval: 1, range: 1.5, targets: 'Ground', ability: 'None', spell: 'None', moveSpeed: 0 }, src);
        if (!c.id) { errors.push('carta sem id'); continue; }
        if (this.cards[c.id]) { errors.push('carta duplicada ' + c.id); continue; }
        c.isSpell = c.type === 'Spell';
        c.rarityIndex = RARITIES.indexOf(c.rarity || 'Common');
        if (c.rarityIndex < 0) errors.push(c.id + ': raridade inválida');
        if (!c.isSpell && !(c.hp > 0)) errors.push(c.id + ': hp');
        if (!c.token && (c.cost < 1 || c.cost > this.balance.maxEnergy)) errors.push(c.id + ': custo');
        this.cards[c.id] = c; this.allCards.push(c);
        if (!c.token) this.collectible.push(c);
      }
      for (const c of this.allCards) {
        const needs = c.ability === 'Summon' || c.ability === 'BuildTurret' || c.spell === 'Summon';
        if (needs && !this.cards[c.summonId]) errors.push(c.id + ': summonId');
      }
      for (const b of file.barons || []) { this.barons.push(b); this.baronById[b.id] = b; }
      for (const k of file.castles || []) { this.castles.push(k); this.castleById[k.id] = k; }
      if (!this.barons.length || !this.castles.length) errors.push('sem barões/castelos');
      if (errors.length) throw new Error('Conteúdo inválido: ' + errors.join('; '));
    }
    card(id) { const c = this.cards[id]; if (!c) throw new Error('Carta desconhecida: ' + id); return c; }
    baron(id) { const b = this.baronById[id]; if (!b) throw new Error('Barão desconhecido: ' + id); return b; }
    castle(id) { const k = this.castleById[id]; if (!k) throw new Error('Castelo desconhecido: ' + id); return k; }
    levelMult(level) { return 1 + this.balance.levelStatBonus * (Math.max(1, level || 1) - 1); }
  }

  const DeckRules = {
    // retorna 'Ok' | 'WrongSize' | 'UnknownCard' | 'NotCollectible' | 'Duplicate' | 'NotOwned'
    validate(deck, content, profile) {
      if (!deck || deck.length !== content.balance.deckSize) return 'WrongSize';
      const seen = new Set();
      for (const id of deck) {
        if (!content.cards[id]) return 'UnknownCard';
        if (content.cards[id].token) return 'NotCollectible';
        if (seen.has(id)) return 'Duplicate';
        seen.add(id);
        if (profile && !BB.Progress.owned(profile, id)) return 'NotOwned';
      }
      return 'Ok';
    },
    averageCost(deck, content) {
      if (!deck.length) return 0;
      return deck.reduce((s, id) => s + (content.cards[id] ? content.cards[id].cost : 0), 0) / deck.length;
    },
  };

  class DeckState {
    constructor(deck, handSize, rng) {
      const list = rng.shuffle(deck.slice());
      this.hand = list.slice(0, handSize);
      this.queue = list.slice(handSize);
    }
    get next() { return this.queue.length ? this.queue[0] : null; }
    play(i) {
      const id = this.hand[i];
      if (this.queue.length) { this.hand[i] = this.queue.shift(); this.queue.push(id); }
      return id;
    }
  }

  const dirOf = (owner) => (owner === 0 ? 1 : -1);

  // ---------------------------------------------------------------- partida
  class Match {
    constructor(content, setup) {
      this.content = content;
      const B = (this.B = content.balance);
      this.dt = 1 / Math.max(1, B.tickRate);
      this.rng = new Rng(setup.seed | 0);
      this.tick = 0; this.over = false; this.winner = -1; this.endReason = 'None';
      this.units = []; this.events = []; this.effects = []; this.recordEvents = true;
      this.nextId = 1; this.doubleAnnounced = false;
      this.players = [0, 1].map((i) => {
        const ps = setup.players[i];
        const err = DeckRules.validate(ps.deck, content, null);
        if (err !== 'Ok') throw new Error('Baralho inválido do jogador ' + i + ': ' + err);
        const baron = content.baron(ps.baronId), castle = content.castle(ps.castleId);
        const hp = castle.hp > 0 ? castle.hp : B.castleHp;
        return {
          index: i, baron, castle, deck: new DeckState(ps.deck, B.handSize, this.rng), levels: ps.levels || {},
          energy: B.startEnergy, castleHp: hp, castleMaxHp: hp, castleShield: 0, castleShieldTime: 0,
          baronCharge: (baron.initialCharge || 0) * baron.chargeSeconds, castleCooldown: castle.initialCooldown || 0,
          castleAttackCd: 0, mods: [],
          stats: { cardsPlayed: 0, spellsCast: 0, unitsDeployed: 0, unitsLost: 0, unitsDestroyed: 0, baronUses: 0, castleUses: 0, damageToCastle: 0, killValue: 0 },
        };
      });
    }

    get L() { return this.B.laneLength; }
    get time() { return this.tick * this.dt; }
    get timeLeft() { return Math.max(0, this.B.matchSeconds - this.time); }
    get doubleEnergy() { return this.timeLeft <= this.B.doubleEnergyLastSeconds; }
    castleFront(owner) { return owner === 0 ? this.B.castleFront : this.L - this.B.castleFront; }
    spawnX(owner) { return owner === 0 ? this.B.spawnOffset : this.L - this.B.spawnOffset; }
    level(p, id) { return Math.max(1, p.levels[id] || 1); }
    baronReady(p) { return p.baronCharge >= p.baron.chargeSeconds; }
    baronProgress(p) { return p.baron.chargeSeconds <= 0 ? 1 : Math.min(1, p.baronCharge / p.baron.chargeSeconds); }
    castleReady(p) { return p.castleCooldown <= 0; }
    castleProgress(p) { return p.castleCooldown <= 0 ? 1 : Math.max(0, 1 - p.castleCooldown / (p.castle.cooldown || 1)); }
    hpPct(p) { return p.castleMaxHp <= 0 ? 0 : Math.max(0, p.castleHp) / p.castleMaxHp; }

    emit(type, player, o) {
      if (!this.recordEvents) return;
      this.events.push(Object.assign({ type, player, tick: this.tick }, o));
    }
    drainEvents() { const e = this.events; this.events = []; return e; }
    aliveCount(owner) { let n = 0; for (const u of this.units) if (u.owner === owner && u.hp > 0) n++; return n; }
    findUnit(id) { return this.units.find((u) => u.id === id) || null; }

    // ---------------------------------------------------------- comandos
    validate(c) {
      if (this.over) return 'MatchOver';
      if (c.player !== 0 && c.player !== 1) return 'InvalidPlayer';
      const p = this.players[c.player];
      const laneOk = Number.isInteger(c.lane) && c.lane >= 0 && c.lane < 3;
      if (c.type === 'play') {
        if (!laneOk) return 'InvalidLane';
        if (!(c.hand >= 0 && c.hand < p.deck.hand.length)) return 'InvalidHandIndex';
        const id = p.deck.hand[c.hand];
        if (c.cardId && c.cardId !== id) return 'CardMismatch';
        const def = this.content.card(id);
        if (p.energy + 1e-4 < def.cost) return 'NotEnoughEnergy';
        if (!def.isSpell && this.aliveCount(c.player) + def.count > this.B.maxUnitsPerPlayer) return 'UnitCap';
        return 'Ok';
      }
      if (c.type === 'baron') {
        if (!this.baronReady(p)) return 'NotReady';
        if (p.baron.requiresLane && !laneOk) return 'InvalidLane';
        return 'Ok';
      }
      if (c.type === 'castle') {
        if (!this.castleReady(p)) return 'NotReady';
        if (p.castle.requiresLane && !laneOk) return 'InvalidLane';
        return 'Ok';
      }
      return 'InvalidPlayer';
    }

    execute(c) {
      const r = this.validate(c);
      if (r !== 'Ok') return r;
      const p = this.players[c.player];
      if (c.type === 'play') this.playCard(p, c.hand, c.lane);
      else if (c.type === 'baron') this.useBaron(p, c.lane);
      else this.useCastle(p, c.lane);
      return r;
    }

    surrender(player) { if (!this.over) this.end(1 - player, 'Surrender'); }
    forfeitByDisconnect(player) { if (!this.over) this.end(1 - player, 'Disconnect'); }

    playCard(p, handIndex, lane) {
      const id = p.deck.play(handIndex);
      const def = this.content.card(id);
      p.energy -= def.cost;
      p.stats.cardsPlayed++;
      this.emit('CardPlayed', p.index, { lane, id });
      const level = this.level(p, id);
      if (def.isSpell) { p.stats.spellsCast++; this.castSpell(p, def, lane, this.content.levelMult(level), level); }
      else {
        const x = this.spawnX(p.index);
        for (let i = 0; i < def.count; i++) {
          this.spawnUnit(p.index, def, lane, x - dirOf(p.index) * 1.4 * i, level);
          p.stats.unitsDeployed++;
        }
      }
    }

    spawnUnit(owner, def, lane, x, level) {
      if (this.aliveCount(owner) >= this.B.maxUnitsPerPlayer) return null;
      const mult = this.content.levelMult(level);
      const B = this.B;
      const u = {
        id: this.nextId++, owner, lane, def, level,
        x: Math.min(this.L - B.castleFront, Math.max(B.castleFront, x)),
        maxHp: def.hp * mult, hp: def.hp * mult, damage: def.damage * mult,
        abilityPower: (def.abilityValue || 0) * (def.ability === 'HealAura' || def.ability === 'Regen' ? mult : 1),
        attackCd: def.attackInterval * 0.5, abilityTimer: 0, deploy: B.deployDelay, life: def.lifetime || 0,
        shield: 0, shieldTime: 0, stun: 0, slowTime: 0, slow: 1, poisonDps: 0, poisonTime: 0,
        rebirthUsed: false, expired: false, state: 'Deploying', targetId: 0,
        get alive() { return this.hp > 0; }, get flying() { return !!this.def.flying; }, get dir() { return dirOf(this.owner); },
      };
      this.units.push(u);
      this.emit('UnitSpawned', owner, { unitId: u.id, lane, x: u.x, id: def.id });
      if (def.ability === 'BuildTurret' && this.content.cards[def.summonId]) {
        const t = this.content.cards[def.summonId];
        for (let i = 0; i < Math.max(1, def.summonCount || 1); i++)
          this.spawnUnit(owner, t, lane, u.x + dirOf(owner) * (B.turretForwardOffset + i * 2), level);
      }
      return u;
    }

    // ---------------------------------------------------------- passo de simulação
    step() {
      if (this.over) return;
      this.tick++;
      const dt = this.dt, B = this.B;
      if (this.doubleEnergy && !this.doubleAnnounced) { this.doubleAnnounced = true; this.emit('DoubleEnergy', -1, {}); }
      for (const p of this.players) {
        const rate = B.energyPerSecond * (this.doubleEnergy ? 2 : 1);
        p.energy = Math.min(B.maxEnergy, p.energy + rate * dt);
        p.baronCharge = Math.min(p.baron.chargeSeconds, p.baronCharge + dt);
        if (p.castleCooldown > 0) p.castleCooldown -= dt;
        if (p.castleShieldTime > 0) { p.castleShieldTime -= dt; if (p.castleShieldTime <= 0) p.castleShield = 0; }
        for (let m = p.mods.length - 1; m >= 0; m--) { p.mods[m].time -= dt; if (p.mods[m].time <= 0) p.mods.splice(m, 1); }
      }
      for (let e = this.effects.length - 1; e >= 0; e--) {
        const fx = this.effects[e];
        fx.timer -= dt;
        if (fx.timer <= 0) {
          fx.timer += fx.interval; fx.waves--;
          this.damageLane(fx.player, fx.lane, fx.damage, -1, 0);
          this.emit('SpellCast', fx.player, { lane: fx.lane, id: 'elven_rain_wave', x: this.L / 2, radius: 0 });
        }
        if (fx.waves <= 0) this.effects.splice(e, 1);
      }
      const n = this.units.length;
      for (let i = 0; i < n; i++) this.updateUnit(this.units[i], dt);
      for (const p of this.players) this.castleDefense(p, dt);
      this.units = this.units.filter((u) => u.hp > 0);
      this.checkEnd();
    }

    updateUnit(u, dt) {
      if (u.hp <= 0) return;
      const d = u.def;
      if (d.lifetime > 0) {
        u.life -= dt;
        if (u.life <= 0) { u.expired = true; u.hp = 0; u.state = 'Dead'; this.emit('UnitDied', u.owner, { unitId: u.id, lane: u.lane, x: u.x }); return; }
      }
      if (u.shieldTime > 0) { u.shieldTime -= dt; if (u.shieldTime <= 0) u.shield = 0; }
      if (u.poisonTime > 0) { u.poisonTime -= dt; this.applyDamage(u, u.poisonDps * dt, 1 - u.owner); if (u.hp <= 0) return; }
      if (u.slowTime > 0) { u.slowTime -= dt; if (u.slowTime <= 0) u.slow = 1; }
      if (d.ability === 'Regen' && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.abilityPower * dt);
      if (u.deploy > 0) { u.deploy -= dt; u.state = 'Deploying'; return; }
      if (u.stun > 0) { u.stun -= dt; u.state = 'Stunned'; return; }

      const m = this.modifiers(u);
      const moveMult = m.move * u.slow, atkMult = m.atk * u.slow;
      if ((d.ability === 'HealAura' || d.ability === 'Summon') && d.abilityInterval > 0) {
        u.abilityTimer += dt;
        if (u.abilityTimer >= d.abilityInterval) { u.abilityTimer -= d.abilityInterval; this.abilityPulse(u); }
      }
      u.attackCd -= dt * atkMult;
      const target = this.findTarget(u);
      if (target) {
        u.state = 'Attacking'; u.targetId = target.id;
        if (u.attackCd <= 0) { u.attackCd = Math.max(0, u.attackCd + d.attackInterval); this.attack(u, target, m.dmg); }
        return;
      }
      const front = this.castleFront(1 - u.owner);
      const dist = (front - u.x) * u.dir;
      if (dist <= d.range + 0.01) {
        u.state = 'AttackingCastle'; u.targetId = 0;
        if (u.attackCd <= 0) {
          u.attackCd = Math.max(0, u.attackCd + d.attackInterval);
          const dmg = u.damage * m.dmg;
          this.emit('UnitAttack', u.owner, { unitId: u.id, targetId: 0, lane: u.lane, x: front, value: dmg, id: d.id });
          this.damageCastle(1 - u.owner, dmg, u.owner);
        }
        return;
      }
      if (u.attackCd < 0) u.attackCd = 0;
      if (d.moveSpeed <= 0) { u.state = 'Idle'; return; }
      u.state = 'Moving';
      u.x += u.dir * Math.min(d.moveSpeed * moveMult * dt, Math.max(0, dist - d.range));
    }

    modifiers(u) {
      const r = { dmg: 1, move: 1, atk: 1 };
      for (const m of this.players[u.owner].mods) {
        if (m.lane !== -1 && m.lane !== u.lane) continue;
        r.dmg *= m.dmg; r.move *= m.move; r.atk *= m.atk;
      }
      return r;
    }

    static canTarget(def, t) {
      if (def.targets === 'CastleOnly') return false;
      if (t.flying && def.targets === 'Ground') return false;
      return true;
    }

    findTarget(u) {
      if (u.def.targets === 'CastleOnly') return null;
      let best = null, bestD = Infinity;
      for (const e of this.units) {
        if (e.hp <= 0 || e.owner === u.owner || e.lane !== u.lane || !Match.canTarget(u.def, e)) continue;
        const d = Math.abs(e.x - u.x);
        if (d <= u.def.range + 0.01 && d < bestD) { best = e; bestD = d; }
      }
      return best;
    }

    attack(u, target, dmgMult) {
      const dmg = u.damage * dmgMult;
      const d = u.def;
      this.emit('UnitAttack', u.owner, { unitId: u.id, targetId: target.id, lane: u.lane, x: target.x, value: dmg, id: d.id });
      if (d.ability === 'Splash' && d.abilityRadius > 0) {
        const cx = target.x;
        for (const e of this.units) {
          if (e.hp <= 0 || e.owner === u.owner || e.lane !== u.lane || !Match.canTarget(d, e)) continue;
          if (Math.abs(e.x - cx) <= d.abilityRadius) this.applyDamage(e, dmg, u.owner);
        }
      } else {
        this.applyDamage(target, dmg, u.owner);
        if (d.ability === 'SlowOnHit' && target.hp > 0) {
          target.slowTime = Math.max(target.slowTime, d.abilityDuration);
          target.slow = Math.min(target.slow, 1 - d.abilityValue);
        }
      }
    }

    abilityPulse(u) {
      const d = u.def;
      if (d.ability === 'HealAura') {
        for (const a of this.units) {
          if (a.hp <= 0 || a.owner !== u.owner || a.lane !== u.lane || Math.abs(a.x - u.x) > d.abilityRadius || a.hp >= a.maxHp) continue;
          a.hp = Math.min(a.maxHp, a.hp + u.abilityPower);
          this.emit('Heal', u.owner, { unitId: a.id, lane: a.lane, x: a.x, value: u.abilityPower });
        }
      } else if (d.ability === 'Summon' && this.content.cards[d.summonId]) {
        const s = this.content.cards[d.summonId];
        for (let i = 0; i < Math.max(1, d.summonCount || 1); i++) this.spawnUnit(u.owner, s, u.lane, u.x + u.dir * (1 + i), u.level);
      }
    }

    auraReduction(t) {
      let best = 0;
      for (const a of this.units) {
        if (a.hp <= 0 || a.owner !== t.owner || a.lane !== t.lane || a.def.ability !== 'ProtectAura') continue;
        if (Math.abs(a.x - t.x) <= a.def.abilityRadius) best = Math.max(best, a.def.abilityValue);
      }
      return Math.min(0.9, best);
    }

    applyDamage(t, amount, source) {
      if (t.hp <= 0 || amount <= 0) return;
      amount *= 1 - this.auraReduction(t);
      if (t.shield > 0) { const a = Math.min(t.shield, amount); t.shield -= a; amount -= a; }
      t.hp -= amount;
      if (t.hp <= 0) this.onKilled(t, source);
    }

    onKilled(t, source) {
      if (t.def.ability === 'Rebirth' && !t.rebirthUsed) {
        t.rebirthUsed = true; t.hp = t.maxHp * Math.max(0.1, t.def.abilityValue); t.deploy = 1; t.poisonTime = 0; t.stun = 0;
        this.emit('UnitRevived', t.owner, { unitId: t.id, lane: t.lane, x: t.x });
        return;
      }
      t.hp = 0; t.state = 'Dead';
      if ((source === 0 || source === 1) && source !== t.owner) {
        const s = this.players[source].stats;
        s.unitsDestroyed++;
        s.killValue += t.def.token ? 0.5 : t.def.cost / t.def.count;
      }
      this.players[t.owner].stats.unitsLost++;
      this.emit('UnitDied', t.owner, { unitId: t.id, lane: t.lane, x: t.x });
    }

    damageCastle(victim, amount, source) {
      const p = this.players[victim];
      if (amount <= 0 || p.castleHp <= 0) return;
      if (p.castleShield > 0) { const a = Math.min(p.castleShield, amount); p.castleShield -= a; amount -= a; }
      if (amount <= 0) return;
      p.castleHp -= amount;
      if (source === 0 || source === 1) this.players[source].stats.damageToCastle += amount;
      this.emit('CastleDamaged', victim, { value: amount });
    }

    castleDefense(p, dt) {
      const B = this.B;
      if (B.castleAttackDamage <= 0 || p.castleHp <= 0) return;
      p.castleAttackCd -= dt;
      if (p.castleAttackCd > 0) return;
      const front = this.castleFront(p.index);
      let best = null, bestD = Infinity;
      for (const e of this.units) {
        if (e.hp <= 0 || e.owner === p.index) continue;
        const d = Math.abs(e.x - front);
        if (d <= B.castleAttackRange && d < bestD) { best = e; bestD = d; }
      }
      if (!best) { p.castleAttackCd = 0; return; }
      p.castleAttackCd = B.castleAttackInterval;
      this.emit('CastleAttack', p.index, { targetId: best.id, lane: best.lane, x: best.x, value: B.castleAttackDamage });
      this.applyDamage(best, B.castleAttackDamage, p.index);
    }

    // ---------------------------------------------------------- feitiços e poderes
    frontUnit(owner, lane) {
      let best = -Infinity, x = null;
      for (const u of this.units) {
        if (u.hp <= 0 || u.owner !== owner || u.lane !== lane) continue;
        const adv = u.x * dirOf(owner);
        if (adv > best) { best = adv; x = u.x; }
      }
      return x;
    }

    damageLane(caster, lane, dmg, center, radius) {
      let hits = 0;
      for (const e of this.units) {
        if (e.hp <= 0 || e.owner === caster || e.lane !== lane) continue;
        if (radius > 0 && Math.abs(e.x - center) > radius) continue;
        this.applyDamage(e, dmg, caster); hits++;
      }
      return hits;
    }

    castSpell(p, def, lane, mult, level) {
      const enemy = 1 - p.index;
      const value = (def.spellValue || 0) * mult, r = def.spellRadius || 0;
      let center = this.L / 2;
      switch (def.spell) {
        case 'Damage': {
          const f = this.frontUnit(enemy, lane);
          center = f === null ? this.castleFront(enemy) : f;
          this.damageLane(p.index, lane, value, center, r);
          if (def.castleDamageRatio > 0 && (r <= 0 || Math.abs(this.castleFront(enemy) - center) <= r + 2))
            this.damageCastle(enemy, value * def.castleDamageRatio, p.index);
          break;
        }
        case 'Stun':
        case 'Poison': {
          const f = this.frontUnit(enemy, lane);
          center = f === null ? this.castleFront(enemy) : f;
          for (const e of this.units) {
            if (e.hp <= 0 || e.owner === p.index || e.lane !== lane) continue;
            if (r > 0 && Math.abs(e.x - center) > r) continue;
            if (def.spell === 'Stun') e.stun = Math.max(e.stun, def.spellDuration);
            else { e.poisonDps = Math.max(e.poisonTime > 0 ? e.poisonDps : 0, value); e.poisonTime = def.spellDuration; }
          }
          break;
        }
        case 'Heal':
        case 'Shield': {
          const f = this.frontUnit(p.index, lane);
          center = f === null ? this.spawnX(p.index) : f;
          for (const a of this.units) {
            if (a.hp <= 0 || a.owner !== p.index || a.lane !== lane) continue;
            if (r > 0 && Math.abs(a.x - center) > r) continue;
            if (def.spell === 'Heal') { a.hp = Math.min(a.maxHp, a.hp + value); this.emit('Heal', p.index, { unitId: a.id, lane, x: a.x, value }); }
            else { a.shield = Math.max(a.shield, value); a.shieldTime = def.spellDuration; }
          }
          break;
        }
        case 'StrongestTargets': {
          const list = this.units.filter((e) => e.hp > 0 && e.owner !== p.index && e.lane === lane).sort((a, b) => b.hp - a.hp);
          const hits = Math.max(1, def.spellHits || 1);
          for (let i = 0; i < list.length && i < hits; i++) this.applyDamage(list[i], value, p.index);
          center = list.length ? list[0].x : this.castleFront(enemy);
          if (list.length < hits && def.castleDamageRatio > 0) this.damageCastle(enemy, value * def.castleDamageRatio, p.index);
          break;
        }
        case 'Summon': {
          center = this.spawnX(p.index);
          const s = this.content.cards[def.summonId];
          if (s) for (let i = 0; i < Math.max(1, def.summonCount || 1); i++) this.spawnUnit(p.index, s, lane, center - dirOf(p.index) * 1.2 * i, level);
          break;
        }
      }
      this.emit('SpellCast', p.index, { lane, x: center, id: def.id, radius: r });
    }

    useBaron(p, lane) {
      const b = p.baron;
      const l = Math.max(0, Math.min(2, lane | 0));
      switch (b.ability) {
        case 'RoyalCommand': p.mods.push({ lane: -1, dmg: 1 + b.value, move: 1 + (b.value2 || 0), atk: 1, time: b.duration }); break;
        case 'OrcFury': p.mods.push({ lane: l, dmg: 1 + b.value, move: 1, atk: 1 + (b.value2 || 0), time: b.duration }); break;
        case 'ElvenRain': this.effects.push({ player: p.index, lane: l, waves: Math.max(1, b.count), interval: Math.max(0.05, b.interval), timer: 0, damage: b.value }); break;
        case 'ArmyOfDead': {
          const s = this.content.cards[b.summonId];
          if (s) for (let i = 0; i < Math.max(1, b.count); i++) this.spawnUnit(p.index, s, l, this.spawnX(p.index) - dirOf(p.index) * 1.2 * i, 1);
          break;
        }
        case 'ArcaneStorm': this.damageLane(p.index, l, b.value, -1, 0); break;
      }
      p.baronCharge = 0;
      p.stats.baronUses++;
      this.emit('BaronUsed', p.index, { lane: b.requiresLane ? l : -1, id: b.id });
    }

    useCastle(p, lane) {
      const c = p.castle;
      const l = Math.max(0, Math.min(2, lane | 0));
      switch (c.ability) {
        case 'ImperialShield': p.castleShield = c.value; p.castleShieldTime = c.duration; break;
        case 'DragonBreath': this.damageLane(p.index, l, c.value, -1, 0); break;
        case 'IceStorm': this.players[1 - p.index].mods.push({ lane: l, dmg: 1, move: 1 - c.value, atk: 1 - (c.value2 || 0), time: c.duration }); break;
      }
      p.castleCooldown = c.cooldown;
      p.stats.castleUses++;
      this.emit('CastleUsed', p.index, { lane: c.requiresLane ? l : -1, id: c.id });
    }

    // ---------------------------------------------------------- fim
    checkEnd() {
      const d0 = this.players[0].castleHp <= 0, d1 = this.players[1].castleHp <= 0;
      if (d0 || d1) { if (d0 && d1) this.end(-1, 'Draw'); else this.end(d0 ? 1 : 0, 'CastleDestroyed'); return; }
      if (this.time >= this.B.matchSeconds - 1e-6) this.decideByTimeout();
    }

    // Desempate: 1) maior % de vida no próprio castelo; 2) maior valor de tropas inimigas destruídas; 3) empate
    decideByTimeout() {
      const a = this.hpPct(this.players[0]), b = this.hpPct(this.players[1]);
      if (Math.abs(a - b) > 1e-4) return this.end(a > b ? 0 : 1, 'TimeoutHp');
      const ka = this.players[0].stats.killValue, kb = this.players[1].stats.killValue;
      if (Math.abs(ka - kb) > 1e-4) return this.end(ka > kb ? 0 : 1, 'TimeoutKills');
      this.end(-1, 'Draw');
    }

    end(winner, reason) {
      if (this.over) return;
      this.over = true; this.winner = winner; this.endReason = reason;
      this.emit('MatchEnded', winner, { id: reason });
    }
  }

  BB.Rng = Rng;
  BB.Content = Content;
  BB.DeckRules = DeckRules;
  BB.Match = Match;
  BB.RARITIES = RARITIES;
})(typeof window !== 'undefined' ? (window.BB = window.BB || {}) : (global.BB = global.BB || {}));

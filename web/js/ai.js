// Adversário controlado pela IA. Usa os mesmos comandos e validações do jogador:
// a dificuldade muda só a qualidade das decisões (reação, leitura de ameaça, contra-ataques), nunca atributos.
(function (BB) {
  'use strict';

  class AI {
    constructor(match, player, difficulty, seed) {
      this.m = match; this.me = player; this.diff = difficulty; // 'easy' | 'normal' | 'hard'
      this.rng = new BB.Rng(seed | 0);
      this.think = 1.5; this.pushLane = -1; this.pushTimer = 0;
      this.issued = 0; this.rejected = 0;
    }

    get reaction() { return this.diff === 'easy' ? 2.4 : this.diff === 'normal' ? 1.2 : 0.6; }

    tick() {
      const m = this.m;
      if (m.over) return;
      if (this.pushTimer > 0) this.pushTimer -= m.dt;
      this.think -= m.dt;
      if (this.think > 0) return;
      this.think = this.reaction * (0.75 + 0.5 * this.rng.next());
      this.decide();
    }

    analyze() {
      const m = this.m, enemy = 1 - this.me, myFront = m.castleFront(this.me);
      const lanes = [0, 1, 2].map(() => ({ enemyPower: 0, myPower: 0, threat: 0, frontDist: m.L, enemyCount: 0, myCount: 0, flyers: 0 }));
      for (const u of m.units) {
        if (u.hp <= 0) continue;
        const power = u.hp + (u.damage / u.def.attackInterval) * 8;
        const L = lanes[u.lane];
        if (u.owner === enemy) {
          const dist = Math.abs(u.x - myFront);
          L.enemyPower += power * (1 + 2 * (1 - Math.min(1, dist / m.L)));
          L.enemyCount++;
          if (u.flying) L.flyers++;
          L.frontDist = Math.min(L.frontDist, dist);
        } else { L.myPower += power; L.myCount++; }
      }
      for (const L of lanes) L.threat = L.enemyPower - L.myPower * 0.8;
      return lanes;
    }

    decide() {
      const p = this.m.players[this.me];
      const lanes = this.analyze();
      if (this.diff === 'easy') return this.decideEasy(p, lanes);
      const hard = this.diff === 'hard';
      const threatLane = argMax(lanes, (x) => x.threat);
      this.tryCastle(p, lanes, threatLane);
      this.tryBaron(p, lanes, threatLane);
      if (lanes[threatLane].threat > (hard ? 200 : 320) && this.playBest(p, threatLane, lanes[threatLane], true)) return;
      for (let l = 0; l < 3; l++) if (lanes[l].enemyCount >= (hard ? 3 : 4) && this.playSpell(p, l, lanes[l])) return;
      if (this.pushTimer > 0 && this.pushLane >= 0 && p.energy >= 3 && this.playBest(p, this.pushLane, lanes[this.pushLane], false)) return;
      if (p.energy >= Math.min(hard ? 8 : 7, this.m.energyCap - 0.3)) {
        const lane = argMax(lanes, (x) => -x.enemyPower + x.myPower * 0.5);
        if (this.playBest(p, lane, lanes[lane], false)) { this.pushLane = lane; this.pushTimer = hard ? 4 : 0; }
      }
    }

    decideEasy(p, lanes) {
      const r = this.rng;
      if (this.m.baronReady(p) && r.next() < 0.3) this.issue({ type: 'baron', lane: r.range(0, 3) });
      if (this.m.castleReady(p) && r.next() < 0.25) this.issue({ type: 'castle', lane: r.range(0, 3) });
      if (r.next() > 0.65) return;
      const idx = r.range(0, p.deck.hand.length);
      const def = this.m.content.card(p.deck.hand[idx]);
      if (p.energy < def.cost) return;
      const lane = r.next() < 0.4 ? argMax(lanes, (x) => x.threat) : r.range(0, 3);
      if (def.isSpell && !['Summon', 'Heal', 'Shield'].includes(def.spell) && lanes[lane].enemyCount === 0) return;
      this.issue({ type: 'play', hand: idx, cardId: def.id, lane });
    }

    playBest(p, lane, info, defending) {
      let best = -1, bestScore = 0;
      p.deck.hand.forEach((id, i) => {
        const def = this.m.content.card(id);
        if (def.cost > p.energy) return;
        const s = this.score(def, info, defending);
        if (s > bestScore) { bestScore = s; best = i; }
      });
      return best >= 0 && this.issue({ type: 'play', hand: best, cardId: p.deck.hand[best], lane });
    }

    playSpell(p, lane) {
      for (let i = 0; i < p.deck.hand.length; i++) {
        const def = this.m.content.card(p.deck.hand[i]);
        if (def.isSpell && def.cost <= p.energy && ['Damage', 'Stun', 'Poison', 'StrongestTargets', 'Zap'].includes(def.spell))
          return this.issue({ type: 'play', hand: i, cardId: def.id, lane });
      }
      return false;
    }

    score(def, info, defending) {
      const hard = this.diff === 'hard';
      if (def.isSpell) {
        switch (def.spell) {
          case 'Damage': case 'StrongestTargets': case 'Poison': case 'Zap':
            return info.enemyCount === 0 ? 0 : (def.spellValue * Math.min(info.enemyCount, def.spellRadius <= 0 ? 6 : 3)) / (def.cost * 60);
          case 'Stun': return info.enemyCount >= 2 && defending ? 3 : 0;
          case 'Heal': case 'Shield': return info.myCount >= 3 ? 2 : 0;
          case 'Summon': return defending ? 2.5 : 1.5;
        }
        return 0;
      }
      let s = (def.hp * def.count) / 300 + (def.damage * def.count) / def.attackInterval / 40;
      if (defending) {
        if (info.flyers > 0) s *= def.targets === 'Both' ? (hard ? 2.2 : 1.5) : 0.3;
        if (def.targets === 'CastleOnly') s *= 0.2;
        if (info.frontDist < 20 && def.range > 6) s *= 1.3;
      } else {
        if (def.targets === 'CastleOnly') s *= hard ? 1.6 : 1.2;
        if (hard && info.myCount > 0 && def.range > 6) s *= 1.3;
      }
      return s / (0.5 + def.cost * 0.15);
    }

    tryBaron(p, lanes, threatLane) {
      if (!this.m.baronReady(p)) return;
      switch (p.baron.ability) {
        case 'ElvenRain': case 'ArcaneStorm': { // chuva de dano / congelar a rota com mais inimigos
          const l = argMax(lanes, (x) => x.enemyCount);
          if (lanes[l].enemyCount >= 2) this.issue({ type: 'baron', lane: l });
          break;
        }
        case 'OrcFury': {
          const l = argMax(lanes, (x) => x.myCount);
          if (lanes[l].myCount >= 2) this.issue({ type: 'baron', lane: l });
          break;
        }
        case 'RoyalCommand':
          if (lanes.reduce((s, x) => s + x.myCount, 0) >= 4) this.issue({ type: 'baron', lane: 0 });
          break;
        case 'ArmyOfDead':
          if (lanes[threatLane].threat > 150) this.issue({ type: 'baron', lane: threatLane });
          else if (this.diff === 'hard' && this.pushLane >= 0) this.issue({ type: 'baron', lane: this.pushLane });
          break;
      }
    }

    tryCastle(p, lanes, threatLane) {
      if (!this.m.castleReady(p)) return;
      if (p.castle.ability === 'ForestBlessing') {
        const hurt = this.m.units.filter((u) => u.owner === this.me && u.hp > 0 && u.hp < u.maxHp * 0.6).length;
        if (this.m.hpPct(p) < 0.85 || hurt >= 3) this.issue({ type: 'castle', lane: threatLane });
      } else if (p.castle.ability === 'ImperialShield') {
        if (lanes[threatLane].frontDist < 12 && this.m.hpPct(p) < 0.95) this.issue({ type: 'castle', lane: threatLane });
      } else if (lanes[threatLane].enemyCount >= 2 && lanes[threatLane].threat > 150) this.issue({ type: 'castle', lane: threatLane });
    }

    issue(c) {
      c.player = this.me;
      const r = this.m.execute(c);
      if (r === 'Ok') { this.issued++; return true; }
      this.rejected++;
      return false;
    }
  }

  function argMax(arr, f) {
    let best = 0, bv = -Infinity;
    arr.forEach((x, i) => { const v = f(x); if (v > bv) { bv = v; best = i; } });
    return best;
  }

  BB.AI = AI;
})(typeof window !== 'undefined' ? (window.BB = window.BB || {}) : (global.BB = global.BB || {}));

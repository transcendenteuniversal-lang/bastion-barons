// Tutorial da primeira partida: batalha fácil guiada, passo a passo, com uma mão mostrando o que arrastar.
(function (BB) {
  'use strict';
  const T = (...a) => BB.T(...a);

  class Tutorial {
    constructor(battle) {
      this.b = battle; this.step = -1; this.t = 0; this.aiOn = false; this.hand = null;
      const m = battle.match;
      // castelo inimigo com vida normal: com a IA lenta do tutorial a vitória sai em cerca de 1 minuto
      m.players[0].baronCharge = 0;
      // a batalha já abre com ação: tropas se enfrentando nas rotas de cima e de baixo
      const C = (id) => BB.content.card(id), L = m.L;
      for (const [o, id, l, k] of [[0, 'royal_knight', 0, 0.42], [0, 'royal_archer', 0, 0.33], [1, 'skeleton', 0, 0.56], [1, 'skeleton', 0, 0.6],
        [0, 'barbarian', 2, 0.44], [0, 'elven_archer', 2, 0.35], [1, 'goblin_gunner', 2, 0.6]]) {
        if (BB.content.cards[id]) m.spawnUnit(o, C(id), l, L * k, 1);
      }
    }

    start() {
      this.el = document.createElement('div');
      this.el.id = 'coach';
      this.el.innerHTML = '<div class="coach-box"><div class="coach-text"></div><button class="btn gold small coach-ok"></button></div><div class="coach-hand">👆</div>';
      document.body.appendChild(this.el);
      this.el.querySelector('.coach-ok').onclick = () => { BB.audio.play('click'); this.next(); };
      this.go(1); // sem tela de boas-vindas: o jogador já começa jogando
    }

    // passos: 1 arrastar carta · 2 tropas lutam sozinhas / mana · 3 poder do Barão · 4 destrua o castelo
    go(i) {
      this.step = i; this.t = 0;
      const box = this.el.querySelector('.coach-box'), ok = this.el.querySelector('.coach-ok');
      const say = (key, button) => { this.el.querySelector('.coach-text').innerHTML = T(key); ok.style.display = button ? '' : 'none'; ok.textContent = T('tut.ok'); box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); };
      const m = this.b.match, me = m.players[0];
      this.hand = null; this.el.classList.remove('dim');
      if (i === 1) {
        this.b.paused = false; say('tut.drag');
        // aponta a carta mais barata da mão e garante mana para ela
        let bi = 0; me.deck.hand.forEach((id, k) => { if (BB.content.card(id).cost < BB.content.card(me.deck.hand[bi]).cost) bi = k; });
        me.energy = Math.max(me.energy, Math.min(m.energyCap, BB.content.card(me.deck.hand[bi]).cost));
        this.slot = bi; this.hand = { from: () => this.rect('#slot' + this.slot), to: () => this.lanePt(1) };
      } else if (i === 2) { this.aiOn = true; say('tut.fight'); this.enemyShow(); }
      else if (i === 3) {
        me.baronCharge = me.baron.chargeSeconds; say('tut.baron');
        this.hand = { from: () => this.rect('#baronBtn'), to: () => this.lanePt(1) };
      } else if (i === 4) { say('tut.win'); }
      else this.end();
    }
    next() { /* sem botões: cada passo avança com a ação do jogador */ }
    // some o balão, mas o tutorial só termina com o fim da batalha
    hide() { this.step = 5; this.hand = null; if (this.el) this.el.style.display = 'none'; }

    // um inimigo aparece para mostrar a luta
    enemyShow() { const m = this.b.match; m.spawnUnit(1, BB.content.card('skeleton'), 1, m.L * 0.62, 1); }

    rect(sel) { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    lanePt(i) { const l = BB.ARENA.lanes[i], R = BB.renderer; return { x: R.X((l.xL + l.xR) / 2), y: R.Y(l.y) }; }

    onEvent(e) {
      if (e.type === 'CardPlayed' && e.player === 0 && this.step === 1) this.go(2);
      if (e.type === 'BaronUsed' && e.player === 0 && this.step === 3) this.go(4);
    }

    update(dt) {
      if (!this.el) return;
      this.t += dt;
      if (this.step === 2 && this.t > 3.5) this.go(3);
      if (this.step === 4 && this.t > 4) this.hide();
      const h = this.el.querySelector('.coach-hand');
      if (this.hand) {
        const a = this.hand.from(), b = this.hand.to();
        if (a && b) {
          const k = (this.t % 1.6) / 1.2, q = Math.min(1, k), e = q * q * (3 - 2 * q);
          h.style.display = 'block'; h.style.opacity = k > 1 ? String(1 - (k - 1) / 0.33) : '1';
          h.style.left = (a.x + (b.x - a.x) * e) + 'px'; h.style.top = (a.y + (b.y - a.y) * e) + 'px';
        }
      } else h.style.display = 'none';
    }

    end() {
      this.step = 99; this.hand = null; this.aiOn = true;
      if (this.el) { this.el.remove(); this.el = null; }
      BB.profile.tutorialDone = true; BB.profile.seenHelp = true; BB.save();
    }
  }
  BB.Tutorial = Tutorial;
})(window.BB);

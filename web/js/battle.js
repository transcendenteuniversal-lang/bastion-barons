// Batalha offline contra a IA: laço de simulação em passos fixos, toque/arraste das cartas, HUD e fim de partida.
(function (BB) {
  'use strict';
  const T = (...a) => BB.T(...a);
  const $ = (s, r) => (r || document).querySelector(s);

  class Battle {
    constructor(difficulty) {
      this.difficulty = difficulty;
      const content = BB.content, p = BB.profile;
      const seed = (Date.now() & 0x7fffffff) ^ 0x5bd1e995;
      const rng = new BB.Rng(seed);
      const deck = p.decks[p.activeDeck].slice();
      const levels = {};
      let sum = 0;
      for (const id of deck) { const o = BB.Progress.owned(p, id); levels[id] = o ? o.level : 1; sum += levels[id]; }
      // IA justa: mesmo nível médio de cartas do jogador, sem bônus de atributos
      const aiLevel = Math.max(1, Math.round(sum / deck.length));
      const aiDeck = Battle.aiDeck(content, rng);
      const aiLevels = {};
      for (const id of aiDeck) aiLevels[id] = aiLevel;
      this.match = new BB.Match(content, {
        seed,
        players: [
          { baronId: p.selectedBaron, castleId: p.selectedCastle, deck, levels },
          { baronId: content.barons[rng.range(0, content.barons.length)].id, castleId: content.castles[rng.range(0, content.castles.length)].id, deck: aiDeck, levels: aiLevels },
        ],
      });
      this.ai = new BB.AI(this.match, 1, difficulty, seed + 17);
      this.acc = 0; this.paused = false; this.armed = null; this.sel = -1; this.hoverLane = -1; this.endT = 0; this.finished = false; this.last = 0;
      this.handKey = '';
    }

    static aiDeck(content, rng) {
      const spells = rng.shuffle(content.collectible.filter((c) => c.isSpell).map((c) => c.id));
      const troops = rng.shuffle(content.collectible.filter((c) => !c.isSpell).map((c) => c.id));
      return spells.slice(0, 4).concat(troops.slice(0, content.balance.deckSize - 4));
    }

    start() {
      BB.renderer.reset();
      BB.renderer.resize();
      document.getElementById('field').style.display = 'block';
      this.buildHud();
      BB.audio.music('battle');
      this.onMove = (e) => this.pointerMove(e);
      this.onUp = (e) => this.pointerUp(e);
      document.addEventListener('pointermove', this.onMove);
      document.addEventListener('pointerup', this.onUp);
      this.raf = requestAnimationFrame((t) => this.frame(t));
      if (!BB.profile.seenHelp) {
        this.paused = true;
        BB.ui.modal(T('help.title'), T('help.text'), [{ label: T('help.ok'), cls: 'gold', fn: () => { BB.profile.seenHelp = true; BB.save(); this.paused = false; } }]);
      }
    }

    stop() {
      cancelAnimationFrame(this.raf);
      document.removeEventListener('pointermove', this.onMove);
      document.removeEventListener('pointerup', this.onUp);
      document.getElementById('field').style.display = 'none';
      const hud = $('#hud'); hud.innerHTML = ''; hud.classList.add('hidden');
    }

    // ---------------------------------------------------------- HUD
    buildHud() {
      const m = this.match, me = m.players[0], foe = m.players[1];
      const hud = $('#hud');
      hud.classList.remove('hidden');
      const diffName = T('ui.' + this.difficulty);
      hud.innerHTML = `
        <div class="hp-panel me"><img src="${BB.art.baronUrl(me.baron.id)}"><div class="who"><div class="nm">${esc(BB.profile.playerName)}</div><div class="hpbar"><i id="hpMe"></i><span id="hpMeT"></span></div></div></div>
        <div class="hp-panel foe"><img src="${BB.art.baronUrl(foe.baron.id)}"><div class="who"><div class="nm">${T('battle.ai', diffName)} • ${BB.baronName(foe.baron.id)}</div><div class="hpbar"><i id="hpFoe"></i><span id="hpFoeT"></span></div></div></div>
        <div class="timer" id="timer">3:00</div>
        <div class="x2 hidden" id="x2">${T('battle.double_energy')}</div>
        <div class="offline" id="offline">${T('battle.offline')}</div>
        <button class="pause tap" id="pauseBtn">II</button>
        <button class="power baron tap" id="baronBtn"><div class="hd">${T('battle.baron_power')}</div><div class="nm">${T('baron.' + me.baron.id + '.ability')}</div><div class="ds">${T('baron.' + me.baron.id + '.desc')}</div><div class="bar"><i id="baronFill"></i><span id="baronState"></span></div></button>
        <button class="power castle tap" id="castleBtn"><div class="hd">${T('battle.castle_power')}</div><div class="nm">${T('castle.' + me.castle.id + '.ability')}</div><div class="ds">${T('castle.' + me.castle.id + '.desc')}</div><div class="bar"><i id="castleFill"></i><span id="castleState"></span></div></button>
        <div class="tray tap" id="tray"><div class="next"><span>${T('battle.next')}</span><div id="nextCard"></div></div><div class="hand" id="hand"></div></div>
        <div class="energy"><div class="bar"><i id="energyFill"></i></div><div class="ticks">${'<b></b>'.repeat(10)}</div><div class="num" id="energyNum">5</div></div>
        <div class="hint" id="hint"></div>`;
      this.el = {
        hpMe: $('#hpMe'), hpMeT: $('#hpMeT'), hpFoe: $('#hpFoe'), hpFoeT: $('#hpFoeT'), timer: $('#timer'), x2: $('#x2'), offline: $('#offline'),
        baronBtn: $('#baronBtn'), baronFill: $('#baronFill'), baronState: $('#baronState'), castleBtn: $('#castleBtn'), castleFill: $('#castleFill'),
        castleState: $('#castleState'), hand: $('#hand'), next: $('#nextCard'), energyFill: $('#energyFill'), energyNum: $('#energyNum'), hint: $('#hint'),
      };
      $('#pauseBtn').onclick = () => this.pause();
      this.el.baronBtn.onclick = () => this.powerPressed('baron');
      this.el.castleBtn.onclick = () => this.powerPressed('castle');
      this.handKey = '';
      this.refreshHud();
    }

    refreshHand() {
      const me = this.match.players[0];
      const key = me.deck.hand.join(',') + '|' + me.deck.next;
      if (key === this.handKey) return;
      this.handKey = key;
      this.el.hand.innerHTML = me.deck.hand.map((id, i) => BB.ui.cardHtml(BB.content.card(id), BB.Progress.owned(BB.profile, id), { level: true, attrs: 'data-i="' + i + '"' })).join('');
      this.el.next.innerHTML = me.deck.next ? BB.ui.cardHtml(BB.content.card(me.deck.next), null, {}) : '';
      this.el.hand.querySelectorAll('.card').forEach((c) => {
        c.addEventListener('pointerdown', (e) => { e.preventDefault(); this.selectCard(+c.dataset.i); });
      });
    }

    refreshHud() {
      const m = this.match, me = m.players[0], foe = m.players[1], el = this.el;
      const secs = Math.ceil(m.timeLeft);
      el.timer.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
      el.timer.classList.toggle('low', secs <= 30);
      el.x2.classList.toggle('hidden', !m.doubleEnergy || m.over);
      el.offline.classList.toggle('hidden', m.doubleEnergy && !m.over);
      el.hpMe.style.width = m.hpPct(me) * 100 + '%';
      el.hpFoe.style.width = m.hpPct(foe) * 100 + '%';
      el.hpMeT.textContent = Math.ceil(Math.max(0, me.castleHp)) + (me.castleShield > 0 ? '  +' + Math.ceil(me.castleShield) : '');
      el.hpFoeT.textContent = Math.ceil(Math.max(0, foe.castleHp)) + (foe.castleShield > 0 ? '  +' + Math.ceil(foe.castleShield) : '');
      el.energyFill.style.width = (me.energy / m.B.maxEnergy) * 100 + '%';
      el.energyNum.textContent = Math.floor(me.energy);
      const bReady = m.baronReady(me), cReady = m.castleReady(me);
      el.baronFill.style.width = m.baronProgress(me) * 100 + '%';
      el.baronState.textContent = bReady ? T('battle.ready') : Math.floor(m.baronProgress(me) * 100) + '%';
      el.baronBtn.classList.toggle('ready', bReady && !m.over);
      el.baronBtn.classList.toggle('armed', this.armed === 'baron');
      el.castleFill.style.width = m.castleProgress(me) * 100 + '%';
      el.castleState.textContent = cReady ? T('battle.ready') : Math.ceil(Math.max(0, me.castleCooldown)) + 's';
      el.castleBtn.classList.toggle('ready', cReady && !m.over);
      el.castleBtn.classList.toggle('armed', this.armed === 'castle');
      this.refreshHand();
      el.hand.querySelectorAll('.card').forEach((c) => {
        const i = +c.dataset.i;
        c.classList.toggle('poor', me.energy < BB.content.card(me.deck.hand[i]).cost);
        c.classList.toggle('sel', this.armed === 'card' && this.sel === i);
      });
      el.hint.textContent = this.armed ? T('battle.select_lane') : '';
    }

    // ---------------------------------------------------------- entrada
    selectCard(i) {
      if (this.match.over || this.paused) return;
      BB.audio.unlock();
      if (this.armed === 'card' && this.sel === i) { this.disarm(); return; }
      this.armed = 'card'; this.sel = i; this.dragging = true;
      BB.audio.play('card');
    }

    powerPressed(kind) {
      const m = this.match, me = m.players[0];
      if (m.over || this.paused) return;
      const ready = kind === 'baron' ? m.baronReady(me) : m.castleReady(me);
      if (!ready) { BB.audio.play('error'); return; }
      const needsLane = kind === 'baron' ? me.baron.requiresLane : me.castle.requiresLane;
      if (needsLane) { this.armed = this.armed === kind ? null : kind; BB.audio.play('click'); return; }
      this.exec({ type: kind, player: 0, lane: 0 });
    }

    disarm() { this.armed = null; this.sel = -1; this.dragging = false; this.hoverLane = -1; }

    pointerMove(e) {
      if (!this.armed) return;
      this.hoverLane = BB.renderer.laneAt(e.clientX, e.clientY);
    }

    pointerUp(e) {
      const wasDrag = this.dragging;
      this.dragging = false;
      if (!this.armed || this.paused || this.match.over) return;
      if (e.target.closest && e.target.closest('.tap')) return; // soltou sobre a interface
      const lane = BB.renderer.laneAt(e.clientX, e.clientY);
      if (lane < 0) { if (!wasDrag) this.disarm(); return; }
      if (this.armed === 'card') this.exec({ type: 'play', player: 0, hand: this.sel, cardId: this.match.players[0].deck.hand[this.sel], lane });
      else this.exec({ type: this.armed, player: 0, lane });
    }

    exec(c) {
      const r = this.match.execute(c);
      if (r === 'Ok') { this.disarm(); BB.vibrate(15); return; }
      BB.audio.play('error');
      if (r === 'NotEnoughEnergy') BB.ui.toast(T('battle.not_enough_energy'));
      else if (r === 'UnitCap') BB.ui.toast(T('battle.unit_cap'));
      else this.disarm();
    }

    // ---------------------------------------------------------- pausa / fim
    pause() {
      if (this.match.over || this.paused) return;
      this.paused = true; this.disarm();
      BB.ui.modal(T('battle.paused'), '', [
        { label: T('battle.resume'), cls: 'green', fn: () => { this.paused = false; } },
        { label: T('battle.surrender'), cls: 'red', fn: () => BB.ui.modal(T('battle.surrender'), T('battle.confirm_surrender'), [
          { label: T('battle.yes'), cls: 'red', fn: () => { this.paused = false; this.match.surrender(0); } },
          { label: T('battle.no'), cls: 'dark', fn: () => { this.paused = false; } },
        ]) },
      ]);
    }

    onAppPause() { if (!this.match.over && !this.paused) this.pause(); }

    finish() {
      if (this.finished) return;
      this.finished = true;
      const m = this.match, me = m.players[0], foe = m.players[1];
      const result = m.winner === 0 ? 1 : m.winner === 1 ? -1 : 0;
      const record = { date: new Date().toISOString(), mode: 'training_' + this.difficulty, result, baron: me.baron.id, opponentBaron: foe.baron.id,
        myPct: m.hpPct(me), foePct: m.hpPct(foe), seconds: Math.round(m.time) };
      const rewards = BB.Progress.applyResult(BB.profile, BB.content, result, new BB.Rng(Date.now() & 0x7fffffff), record);
      BB.save();
      BB.ui.show('result', { result, reason: m.endReason, stats: me.stats, myPct: m.hpPct(me), foePct: m.hpPct(foe), rewards, difficulty: this.difficulty });
    }

    // ---------------------------------------------------------- laço
    frame(ts) {
      this.raf = requestAnimationFrame((t) => this.frame(t));
      const dt = Math.min(0.1, this.last ? (ts - this.last) / 1000 : 0.016);
      this.last = ts;
      const m = this.match;
      if (!this.paused && !m.over) {
        this.acc += dt;
        let steps = 0;
        while (this.acc >= m.dt && steps < 8) { this.ai.tick(); m.step(); this.acc -= m.dt; steps++; }
        if (steps >= 8) this.acc = 0;
      }
      for (const e of m.drainEvents()) this.onEvent(e);
      BB.renderer.draw(m, this.paused ? 0 : dt, { armed: !!this.armed, hoverLane: this.hoverLane });
      this.refreshHud();
      if (m.over) {
        if (this.endT === 0) this.showEnd();
        this.endT += dt;
        if (this.endT > 3.2) this.finish();
      }
    }

    showEnd() {
      const m = this.match;
      this.disarm();
      document.getElementById('toast').innerHTML = '';
      BB.audio.stopMusic();
      BB.audio.play(m.winner === 0 ? 'victory' : 'defeat');
      const key = m.winner === 0 ? 'result.victory' : m.winner === 1 ? 'result.defeat' : 'result.draw';
      const d = document.createElement('div');
      d.className = 'end-title title'; d.textContent = T(key);
      $('#hud').appendChild(d);
      BB.vibrate(m.winner === 0 ? 60 : 200);
    }

    onEvent(e) {
      const m = this.match;
      BB.renderer.onEvent(m, e);
      switch (e.type) {
        case 'UnitSpawned': if (e.player === 0) BB.audio.play('spawn'); break;
        case 'UnitAttack': {
          const def = m.content.cards[e.id];
          if (!def) break;
          BB.audio.play(def.range > 4 ? (def.cls === 'Mage' || def.cls === 'Necromancer' ? 'magic' : def.flying ? 'dragon' : 'bow') : 'sword');
          break;
        }
        case 'UnitDied': BB.audio.play('death'); break;
        case 'Heal': BB.audio.play('heal'); break;
        case 'SpellCast': BB.audio.play(e.id === 'fireball' ? 'explosion' : 'magic'); break;
        case 'BaronUsed':
          BB.audio.play('baron');
          if (e.player === 1 && !m.over) BB.ui.toast(BB.baronName(e.id) + ': ' + T('baron.' + e.id + '.ability'));
          break;
        case 'CastleUsed':
          BB.audio.play(e.id === 'draconic_castle' ? 'dragon' : 'magic');
          if (e.player === 1 && !m.over) BB.ui.toast(BB.castleName(e.id) + ': ' + T('castle.' + e.id + '.ability'));
          break;
        case 'CastleDamaged': BB.audio.play('castle'); if (e.player === 0) BB.vibrate(10); break;
        case 'DoubleEnergy': BB.ui.toast(T('battle.double_energy')); break;
      }
    }
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
  BB.esc = esc;
  BB.Battle = Battle;
})(window.BB);

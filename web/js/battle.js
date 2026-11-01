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
      BB.renderer.onLayout = null;
      document.getElementById('field').style.display = 'none';
      const hud = $('#hud'); hud.innerHTML = ''; hud.classList.add('hidden');
    }

    // ---------------------------------------------------------- HUD (encaixado nas molduras da arte da arena)
    buildHud() {
      const m = this.match, me = m.players[0], foe = m.players[1];
      const hud = $('#hud');
      hud.classList.remove('hidden');
      const diffName = T('ui.' + this.difficulty);
      hud.innerHTML = `
        <img class="h-portrait" data-r="20,16,120,114" src="${BB.art.baronUrl(me.baron.id)}">
        <div class="h-name" data-r="134,24,438,100"><b>${esc(BB.profile.playerName)}</b><span>${BB.baronName(me.baron.id)} • ${BB.castleName(me.castle.id)}</span></div>
        <div class="h-hp me" data-r="121,113,423,139"><i id="hpMe"></i><span id="hpMeT"></span></div>
        <img class="h-portrait" data-r="1552,16,1652,114" src="${BB.art.baronUrl(foe.baron.id)}">
        <div class="h-name foe" data-r="1234,24,1544,100"><b>${T('battle.ai', diffName)}</b><span>${BB.baronName(foe.baron.id)} • ${BB.castleName(foe.castle.id)}</span></div>
        <div class="h-hp foe" data-r="1250,113,1551,139"><i id="hpFoe"></i><span id="hpFoeT"></span></div>
        <div class="h-crown me" data-r="700,20,757,64" id="crownMe">0</div>
        <div class="h-timer" data-r="773,18,902,66" id="timer">3:00</div>
        <div class="h-crown foe" data-r="916,20,974,64" id="crownFoe">0</div>
        <div class="h-x2 hidden" data-r="700,70,975,104" id="x2">${T('battle.double_energy')}</div>
        <div class="h-off" data-r="700,70,975,100" id="offline">${T('battle.offline')}</div>
        <button class="h-pause tap" data-r="462,18,514,68" id="pauseBtn">II</button>
        <button class="h-power tap" data-r="14,610,324,743" id="baronBtn">
          <img data-r="26,626,103,703" src="${BB.art.baronUrl(me.baron.id)}">
          <div class="pw-t" data-r="112,616,320,648">${T('baron.' + me.baron.id + '.ability')}</div>
          <div class="pw-d" data-r="112,648,320,708">${T('baron.' + me.baron.id + '.desc')}</div>
          <div class="pw-bar" data-r="61,715,306,737"><i id="baronFill"></i><span id="baronState"></span></div></button>
        <button class="h-power castle tap" data-r="1362,768,1660,926" id="castleBtn">
          <div class="pw-h" data-r="1376,776,1650,800">${T('battle.castle_power')}</div>
          <div class="pw-t" data-r="1376,800,1650,834">${T('castle.' + me.castle.id + '.ability')}</div>
          <div class="pw-d" data-r="1376,834,1650,890">${T('castle.' + me.castle.id + '.desc')}</div>
          <div class="pw-bar" data-r="1376,894,1648,916"><i id="castleFill"></i><span id="castleState"></span></div></button>
        <div class="h-tray tap" data-r="330,705,1356,941" id="tray"></div>
        ${[378, 535, 692, 849, 1006, 1163].map((x, i) => `<div class="h-slot${i === 5 ? ' next' : ' tap'}" data-r="${x + 4},${722},${x + 138},${862}" id="slot${i}"></div>`).join('')}
        <div class="h-nextlbl" data-r="1167,700,1301,722">${T('battle.next')}</div>
        <div class="h-enum" data-r="357,862,428,934" id="energyNum">5</div>
        <div class="h-ebar" data-r="433,886,1313,920"><i id="energyFill"></i>${'<b></b>'.repeat(9)}</div>
        <div class="h-hint" data-r="436,240,1236,290" id="hint"></div>`;
      this.el = {
        hpMe: $('#hpMe'), hpMeT: $('#hpMeT'), hpFoe: $('#hpFoe'), hpFoeT: $('#hpFoeT'), timer: $('#timer'), x2: $('#x2'), offline: $('#offline'),
        crownMe: $('#crownMe'), crownFoe: $('#crownFoe'),
        baronBtn: $('#baronBtn'), baronFill: $('#baronFill'), baronState: $('#baronState'), castleBtn: $('#castleBtn'), castleFill: $('#castleFill'),
        castleState: $('#castleState'), slots: [0, 1, 2, 3, 4, 5].map((i) => $('#slot' + i)), energyFill: $('#energyFill'), energyNum: $('#energyNum'), hint: $('#hint'),
      };
      $('#pauseBtn').onclick = () => this.pause();
      this.el.baronBtn.onclick = () => this.powerPressed('baron');
      this.el.castleBtn.onclick = () => this.powerPressed('castle');
      BB.renderer.onLayout = () => this.layoutHud();
      this.layoutHud();
      this.handKey = '';
      this.refreshHud();
    }

    // posiciona cada elemento em coordenadas da imagem da arena (data-r = x0,y0,x1,y1)
    layoutHud() {
      const R = BB.renderer, hud = $('#hud');
      if (!hud || !this.el) return;
      hud.style.fontSize = R.s * 26 + 'px';
      hud.querySelectorAll('[data-r]').forEach((el) => {
        const [x0, y0, x1, y1] = el.dataset.r.split(',').map(Number);
        const parent = el.parentElement.closest('[data-r]');
        let px = 0, py = 0;
        if (parent) { const [a, b] = parent.dataset.r.split(',').map(Number); px = R.X(a); py = R.Y(b); }
        el.style.left = R.X(x0) - px + 'px'; el.style.top = R.Y(y0) - py + 'px';
        el.style.width = (x1 - x0) * R.s + 'px'; el.style.height = (y1 - y0) * R.s + 'px';
      });
    }

    refreshHand() {
      const me = this.match.players[0];
      const key = me.deck.hand.join(',') + '|' + me.deck.next;
      if (key === this.handKey) return;
      this.handKey = key;
      me.deck.hand.forEach((id, i) => {
        if (!this.el.slots[i]) return;
        this.el.slots[i].innerHTML = BB.ui.cardHtml(BB.content.card(id), BB.Progress.owned(BB.profile, id), { level: true, attrs: 'data-i="' + i + '"' });
        this.el.slots[i].firstElementChild.addEventListener('pointerdown', (e) => { e.preventDefault(); this.selectCard(i); });
      });
      this.el.slots[5].innerHTML = me.deck.next ? BB.ui.cardHtml(BB.content.card(me.deck.next), null, {}) : '';
    }

    refreshHud() {
      const m = this.match, me = m.players[0], foe = m.players[1], el = this.el;
      const secs = Math.ceil(m.timeLeft);
      el.timer.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
      el.timer.classList.toggle('low', secs <= 30);
      el.x2.classList.toggle('hidden', !m.doubleEnergy || m.over);
      el.offline.classList.toggle('hidden', m.doubleEnergy && !m.over);
      // coroas: 1 a cada terço de vida destruído do castelo adversário
      el.crownMe.textContent = Math.min(3, Math.floor((1 - m.hpPct(foe)) * 3 + 1e-9));
      el.crownFoe.textContent = Math.min(3, Math.floor((1 - m.hpPct(me)) * 3 + 1e-9));
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
      for (let i = 0; i < me.deck.hand.length && i < 5; i++) {
        const c = el.slots[i].firstElementChild;
        if (!c) continue;
        c.classList.toggle('poor', me.energy < BB.content.card(me.deck.hand[i]).cost);
        c.classList.toggle('sel', this.armed === 'card' && this.sel === i);
      }
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

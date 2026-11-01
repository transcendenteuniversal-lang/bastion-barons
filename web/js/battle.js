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
    // HUD desenhado pelo jogo sobre a arena (posições em pixels da arte 1672×941, ver data-r)
    buildHud() {
      const m = this.match, me = m.players[0], foe = m.players[1], p = BB.profile;
      const hud = $('#hud');
      hud.classList.remove('hidden');
      const diffName = T('ui.' + this.difficulty);
      const aiLevel = Math.max(1, ...Object.values(foe.levels || { a: 1 }));
      const CASTLE_ICON = { ImperialShield: '🛡️', DragonBreath: '🐉', IceStorm: '❄️' };
      hud.innerHTML = `
        <div class="hb-panel me" data-r="40,6,415,118"></div>
        <img class="hb-portrait me" data-r="45,9,155,117" src="${BB.art.baronUrl(me.baron.id)}">
        <div class="hb-name" data-r="168,12,410,46">${esc(p.playerName)}</div>
        <div class="hb-sub" data-r="168,46,410,76">${BB.baronName(me.baron.id)} • ${BB.castleName(me.castle.id)}</div>
        <div class="hb-wins" data-r="168,76,410,108">🏆 ${T('battle.wins', p.wins)}</div>
        <div class="hb-hp me" data-r="112,120,362,158"><i id="hpMe"></i><span id="hpMeT"></span></div>
        <div class="hb-lvl me" data-r="62,112,126,166">${p.accountLevel}</div>

        <div class="hb-panel foe" data-r="1257,6,1632,118"></div>
        <img class="hb-portrait foe" data-r="1522,9,1632,117" src="${BB.art.baronUrl(foe.baron.id)}">
        <div class="hb-name foe" data-r="1262,12,1512,46">${T('battle.ai', diffName)}</div>
        <div class="hb-sub foe" data-r="1262,46,1512,76">${BB.baronName(foe.baron.id)} • ${BB.castleName(foe.castle.id)}</div>
        <div class="hb-wins foe" data-r="1262,76,1512,108">${T('battle.card_level', aiLevel)}</div>
        <div class="hb-hp foe" data-r="1310,120,1560,158"><i id="hpFoe"></i><span id="hpFoeT"></span></div>
        <div class="hb-lvl foe" data-r="1546,112,1610,166">${aiLevel}</div>

        <button class="hb-btn tap" data-r="430,12,492,72" id="pauseBtn">❚❚</button>
        <div class="hb-score me" data-r="598,8,766,80"><b>👑</b><span id="crownMe">0</span></div>
        <div class="hb-timer" data-r="764,8,910,80" id="timer">3:00</div>
        <div class="hb-score foe" data-r="908,8,1078,80"><span id="crownFoe">0</span><b>👑</b></div>
        <div class="hb-net" data-r="1126,14,1238,58" id="offline">● ${T('battle.offline_short')}</div>
        <div class="hb-x2 hidden" data-r="690,84,986,116" id="x2">${T('battle.double_energy')}</div>

        <button class="hb-power tap" data-r="15,688,378,852" id="baronBtn">
          <img class="hb-icon" data-r="22,694,140,812" src="${BB.art.baronUrl(me.baron.id)}">
          <div class="hb-pt" data-r="150,700,372,732">${T('baron.' + me.baron.id + '.ability')}</div>
          <div class="hb-pd" data-r="150,734,372,810">${T('baron.' + me.baron.id + '.desc')}</div>
          <div class="hb-bar" data-r="58,816,342,844"><i id="baronFill"></i><span id="baronState"></span></div></button>
        <button class="hb-power castle tap" data-r="1296,688,1658,852" id="castleBtn">
          <div class="hb-icon castle" data-r="1304,700,1416,812">${CASTLE_ICON[me.castle.ability] || '🏰'}</div>
          <div class="hb-ph" data-r="1422,698,1652,728">${T('battle.castle_power')}</div>
          <div class="hb-pt" data-r="1422,728,1652,758">${T('castle.' + me.castle.id + '.ability')}</div>
          <div class="hb-pd" data-r="1422,758,1652,812">${T('castle.' + me.castle.id + '.desc')}</div>
          <div class="hb-bar" data-r="1406,816,1632,844"><i id="castleFill"></i><span id="castleState"></span></div></button>

        <div class="hb-tray" data-r="388,672,1290,936"></div>
        ${[435, 601, 767, 933, 1099].map((x, i) => `<div class="hb-slot tap" data-r="${x},682,${x + 154},852" id="slot${i}"></div>`).join('')}
        <div class="hb-ebar" data-r="452,866,1262,918" id="ebar"><i id="energyFill"></i>${'<b></b>'.repeat(9)}</div>
        <div class="hb-enum" data-r="358,846,462,936" id="energyNum">5</div>

        <button class="hb-btn big tap" data-r="30,862,138,930" id="emoteBtn">😃</button>
        <div class="hb-emotes tap hidden" data-r="30,770,420,852" id="emotes">${['👍', '😃', '😠', '😱', '👑'].map((e) => `<button data-e="${e}">${e}</button>`).join('')}</div>
        <button class="hb-btn auto tap" data-r="1414,862,1544,930" id="autoBtn">⚔ ${T('battle.auto')}</button>
        <button class="hb-btn big tap" data-r="1560,862,1648,930" id="setBtn">⚙</button>
        <div class="hb-bubble hidden" data-r="270,150,380,225" id="bubbleMe"></div>
        <div class="hb-bubble foe hidden" data-r="1292,150,1402,225" id="bubbleFoe"></div>
        <div class="hb-hint" data-r="436,196,1236,250" id="hint"></div>`;
      this.el = {
        hpMe: $('#hpMe'), hpMeT: $('#hpMeT'), hpFoe: $('#hpFoe'), hpFoeT: $('#hpFoeT'), timer: $('#timer'), x2: $('#x2'), offline: $('#offline'),
        crownMe: $('#crownMe'), crownFoe: $('#crownFoe'), ebar: $('#ebar'),
        baronBtn: $('#baronBtn'), baronFill: $('#baronFill'), baronState: $('#baronState'), castleBtn: $('#castleBtn'), castleFill: $('#castleFill'),
        castleState: $('#castleState'), slots: [0, 1, 2, 3, 4].map((i) => $('#slot' + i)), energyFill: $('#energyFill'), energyNum: $('#energyNum'), hint: $('#hint'),
        autoBtn: $('#autoBtn'), emotes: $('#emotes'), bubbles: [$('#bubbleMe'), $('#bubbleFoe')],
      };
      $('#pauseBtn').onclick = () => this.pause();
      this.el.baronBtn.onclick = () => this.powerPressed('baron');
      this.el.castleBtn.onclick = () => this.powerPressed('castle');
      $('#emoteBtn').onclick = () => { BB.audio.play('click'); this.el.emotes.classList.toggle('hidden'); };
      this.el.emotes.querySelectorAll('[data-e]').forEach((b) => b.onclick = () => { this.el.emotes.classList.add('hidden'); this.emote(0, b.dataset.e); });
      this.el.autoBtn.onclick = () => this.toggleAuto();
      $('#setBtn').onclick = () => this.openSettings();
      BB.renderer.onLayout = () => this.layoutHud();
      this.layoutHud();
      this.handKey = '';
      this.refreshHud();
    }

    // Emotes: balão sobre o Barão por 2 s (a IA às vezes responde)
    emote(player, e) {
      const now = performance.now();
      if (!this.emoteAt) this.emoteAt = [0, 0];
      if (now - this.emoteAt[player] < 2500) return;
      this.emoteAt[player] = now;
      const b = this.el.bubbles[player];
      b.textContent = e; b.classList.remove('hidden'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      clearTimeout(b._t); b._t = setTimeout(() => b.classList.add('hidden'), 2000);
      BB.audio.play('click');
      if (player === 0 && Math.random() < 0.5) setTimeout(() => this.emote(1, ['👍', '😠', '😃'][Math.floor(Math.random() * 3)]), 900);
    }

    // Auto: a IA joga as cartas e poderes do jogador (mesmas validações)
    toggleAuto() {
      this.auto = this.auto ? null : new BB.AI(this.match, 0, 'normal', Date.now() & 0xffff);
      this.disarm();
      this.el.autoBtn.classList.toggle('on', !!this.auto);
      BB.audio.play('click');
    }

    openSettings() {
      if (this.match.over) return;
      const wasPaused = this.paused;
      this.paused = true; this.disarm();
      const p = BB.profile;
      const lbl = (k, on) => T(k) + ': ' + (on ? T('ui.on') : T('ui.off'));
      const show = () => BB.ui.modal(T('ui.settings'), '', [
        { label: lbl('settings.music', p.music > 0), cls: 'dark', fn: () => { p.music = p.music > 0 ? 0 : 0.6; BB.audio.setVolumes(p.music, p.sfx); BB.save(); show(); } },
        { label: lbl('settings.sfx', p.sfx > 0), cls: 'dark', fn: () => { p.sfx = p.sfx > 0 ? 0 : 0.8; BB.audio.setVolumes(p.music, p.sfx); BB.save(); show(); } },
        { label: lbl('settings.vibration', p.vibration), cls: 'dark', fn: () => { p.vibration = !p.vibration; BB.save(); show(); } },
        { label: T('battle.resume'), cls: 'green', fn: () => { this.paused = wasPaused; } },
      ]);
      show();
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
      const key = me.deck.hand.join(',');
      if (key === this.handKey) return;
      this.handKey = key;
      me.deck.hand.forEach((id, i) => {
        if (!this.el.slots[i]) return;
        this.el.slots[i].innerHTML = BB.ui.cardHtml(BB.content.card(id), BB.Progress.owned(BB.profile, id), { level: true, attrs: 'data-i="' + i + '"' });
        this.el.slots[i].firstElementChild.addEventListener('pointerdown', (e) => { e.preventDefault(); this.selectCard(i); });
      });
    }

    refreshHud() {
      const m = this.match, me = m.players[0], foe = m.players[1], el = this.el;
      const secs = Math.ceil(m.timeLeft);
      el.timer.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
      el.timer.classList.toggle('low', secs <= 30);
      el.x2.classList.toggle('hidden', !m.doubleEnergy || m.over);
      // coroas: 1 a cada terço de vida destruído do castelo adversário
      el.crownMe.textContent = Math.min(3, Math.floor((1 - m.hpPct(foe)) * 3 + 1e-9));
      el.crownFoe.textContent = Math.min(3, Math.floor((1 - m.hpPct(me)) * 3 + 1e-9));
      el.hpMe.style.width = m.hpPct(me) * 100 + '%';
      el.hpFoe.style.width = m.hpPct(foe) * 100 + '%';
      el.hpMeT.textContent = Math.ceil(Math.max(0, me.castleHp)) + (me.castleShield > 0 ? '  +' + Math.ceil(me.castleShield) : '');
      el.energyNum.classList.toggle('full', me.energy >= m.B.maxEnergy - 0.01);
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
      if (r === 'Ok') {
        const btn = c.type === 'baron' ? this.el.baronBtn : c.type === 'castle' ? this.el.castleBtn : null;
        if (btn) { btn.classList.remove('fire'); void btn.offsetWidth; btn.classList.add('fire'); }
        this.disarm(); BB.vibrate(15); return;
      }
      BB.audio.play('error');
      if (r === 'NotEnoughEnergy') {
        BB.ui.toast(T('battle.not_enough_energy'));
        const card = this.el.slots[this.sel] && this.el.slots[this.sel].firstElementChild;
        for (const el of [this.el.ebar, card]) if (el) { el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); }
      }
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
        while (this.acc >= m.dt && steps < 8) { this.ai.tick(); if (this.auto) this.auto.tick(); m.step(); this.acc -= m.dt; steps++; }
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
        case 'CastleDamaged':
          BB.audio.play('castle'); if (e.player === 0) BB.vibrate(10);
          if (Math.random() < 0.015) this.emote(e.player, e.player === 1 ? '😠' : '😱'); // reação da IA (e do seu Barão)
          break;
        case 'DoubleEnergy': BB.ui.toast(T('battle.double_energy')); break;
      }
    }
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
  BB.esc = esc;
  BB.Battle = Battle;
})(window.BB);

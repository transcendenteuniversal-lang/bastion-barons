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
        <div class="hb-panel me" data-r="40,6,420,112"></div>
        <img class="hb-portrait me" data-r="45,9,141,109" src="${BB.art.baronUrl(me.baron.id)}">
        <div class="hb-lvl me" data-r="30,72,74,118">${p.accountLevel}</div>
        <div class="hb-name" data-r="150,10,412,40">${esc(p.playerName)}</div>
        <div class="hb-sub" data-r="150,40,412,68">${BB.baronName(me.baron.id)} • 🏆 ${p.wins}</div>
        <div class="hb-hp me" data-r="150,72,412,104"><i id="hpMe"></i><span id="hpMeT"></span></div>

        <div class="hb-panel foe" data-r="1252,6,1632,112"></div>
        <img class="hb-portrait foe" data-r="1531,9,1627,109" src="${BB.art.baronUrl(foe.baron.id)}">
        <div class="hb-lvl foe" data-r="1598,72,1642,118">${aiLevel}</div>
        <div class="hb-name foe" data-r="1260,10,1522,40">${T('battle.ai', diffName)}</div>
        <div class="hb-sub foe" data-r="1260,40,1522,68">${BB.baronName(foe.baron.id)} • ${T('battle.offline_short')}</div>
        <div class="hb-hp foe" data-r="1260,72,1522,104"><i id="hpFoe"></i><span id="hpFoeT"></span></div>

        <button class="hb-btn tap" data-r="436,14,494,70" id="pauseBtn">❚❚</button>
        <div class="hb-score me" data-r="598,8,766,78"><b>👑</b><span id="crownMe">0</span></div>
        <div class="hb-timer" data-r="764,8,910,78" id="timer">3:00</div>
        <div class="hb-score foe" data-r="908,8,1078,78"><span id="crownFoe">0</span><b>👑</b></div>
        <button class="hb-orb tap" data-r="22,770,172,920" id="baronBtn"><img src="${BB.art.baronUrl(me.baron.id)}"></button>
        <button class="hb-orb castle tap" data-r="182,770,332,920" id="castleBtn"><span>${CASTLE_ICON[me.castle.ability] || '🏰'}</span></button>
        <div class="hb-tip hidden" data-r="22,580,560,760" id="tip"></div>
        <button class="hb-btn big tap" data-r="1350,800,1440,880" id="emoteBtn">😃</button>
        <button class="hb-btn auto tap" data-r="1452,800,1640,880" id="autoBtn">⚔ ${T('battle.auto')}</button>
        <div class="hb-emotes tap hidden" data-r="1290,706,1640,790" id="emotes">${['👍', '😃', '😠', '😱', '👑'].map((e) => `<button data-e="${e}">${e}</button>`).join('')}</div>
        <div class="hb-x2 hidden" data-r="690,84,986,116" id="x2">${T('battle.double_energy')}</div>

        <div class="hb-tray" data-r="338,744,1334,941"></div>
        <button class="hb-trash tap" data-r="346,770,420,872" id="trash">🗑</button>
        ${[0, 1, 2, 3, 4, 5].map((i) => `<div class="hb-slot tap" data-r="${428 + i * 128},756,${544 + i * 128},902" id="slot${i}"></div>`).join('')}
        <div class="hb-pile" data-r="1200,762,1326,900" id="pile"><div class="hb-pilecards"></div><div class="hb-pilebar"><i id="drawFill"></i></div><span id="pileTxt"></span></div>
        <div class="hb-enum" data-r="352,880,418,941" id="energyNum">1</div>
        <div class="hb-max" data-r="428,903,700,925" id="energyMax"></div>
        <div class="hb-ebar" data-r="704,908,1192,932" id="ebar"><i id="energyFill"></i><u id="energyCap"></u>${'<b></b>'.repeat(9)}</div>
        <div class="hb-bubble hidden" data-r="290,150,400,225" id="bubbleMe"></div>
        <div class="hb-bubble foe hidden" data-r="1272,150,1382,225" id="bubbleFoe"></div>
        <div class="hb-hint" data-r="436,120,1236,170" id="hint"></div>`;
      this.el = {
        hpMe: $('#hpMe'), hpMeT: $('#hpMeT'), hpFoe: $('#hpFoe'), hpFoeT: $('#hpFoeT'), timer: $('#timer'), x2: $('#x2'), offline: $('#offline'),
        crownMe: $('#crownMe'), crownFoe: $('#crownFoe'), ebar: $('#ebar'),
        baronBtn: $('#baronBtn'), castleBtn: $('#castleBtn'), tip: $('#tip'),
        slots: [0, 1, 2, 3, 4, 5].map((i) => $('#slot' + i)), drawFill: $('#drawFill'), pileTxt: $('#pileTxt'), energyMax: $('#energyMax'), energyCap: $('#energyCap'), trash: $('#trash'), energyFill: $('#energyFill'), energyNum: $('#energyNum'), hint: $('#hint'),
        autoBtn: $('#autoBtn'), emotes: $('#emotes'), bubbles: [$('#bubbleMe'), $('#bubbleFoe')],
      };
      $('#pauseBtn').onclick = () => this.pause();
      this.bindOrb(this.el.baronBtn, 'baron');
      this.bindOrb(this.el.castleBtn, 'castle');
      $('#emoteBtn').onclick = () => { BB.audio.play('click'); this.el.emotes.classList.toggle('hidden'); };
      this.el.emotes.querySelectorAll('[data-e]').forEach((b) => b.onclick = () => { this.el.emotes.classList.add('hidden'); this.emote(0, b.dataset.e); });
      this.el.autoBtn.onclick = () => this.toggleAuto();
      $('#trash').onclick = () => this.discardSelected();
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
      BB.renderer.baronReact(player, 'cheer');
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
      this.el.slots.forEach((slot, i) => {
        const id = me.deck.hand[i];
        if (!id) { slot.innerHTML = '<div class="hb-empty"></div>'; return; }
        slot.innerHTML = BB.ui.cardHtml(BB.content.card(id), BB.Progress.owned(BB.profile, id), { level: true, attrs: 'data-i="' + i + '"' });
        slot.firstElementChild.addEventListener('pointerdown', (e) => { e.preventDefault(); this.selectCard(i); });
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
      el.baronBtn.style.setProperty('--p', m.baronProgress(me));
      el.baronBtn.classList.toggle('ready', bReady && !m.over);
      el.baronBtn.classList.toggle('armed', this.armed === 'baron');
      el.castleBtn.style.setProperty('--p', m.castleProgress(me));
      el.castleBtn.classList.toggle('ready', cReady && !m.over);
      el.castleBtn.classList.toggle('armed', this.armed === 'castle');
      this.refreshHand();
      // compra automática, mão cheia e máximo de energia
      const full = me.deck.hand.length >= m.handMax;
      el.drawFill.style.width = (full ? 100 : Math.min(100, (me.drawTimer / (m.B.drawInterval || 4)) * 100)) + '%';
      el.pileTxt.textContent = full ? T('battle.hand_full') : '';
      el.pileTxt.parentElement.classList.toggle('full', full);
      el.energyMax.textContent = T('battle.energy_max', m.energyCap);
      el.energyCap.style.left = (m.energyCap / m.B.maxEnergy) * 100 + '%';
      el.trash.classList.toggle('on', this.armed === 'card');
      for (let i = 0; i < me.deck.hand.length && i < 6; i++) {
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

    // Círculo de poder: toque rápido usa; segurar mostra a descrição (soltar depois de segurar não usa)
    bindOrb(btn, kind) {
      let timer = null, held = false;
      const me = () => this.match.players[0];
      const info = () => kind === 'baron'
        ? { t: T('baron.' + me().baron.id + '.ability'), h: BB.baronName(me().baron.id), d: T('baron.' + me().baron.id + '.desc') }
        : { t: T('castle.' + me().castle.id + '.ability'), h: T('battle.castle_power'), d: T('castle.' + me().castle.id + '.desc') };
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault(); held = false;
        timer = setTimeout(() => {
          held = true; const i = info();
          this.el.tip.innerHTML = `<small>${esc(i.h)}</small><b>${esc(i.t)}</b><p>${esc(i.d)}</p>`;
          this.el.tip.classList.remove('hidden');
        }, 420);
      });
      const end = (use) => {
        clearTimeout(timer);
        if (held) { this.el.tip.classList.add('hidden'); held = false; return; }
        if (use) this.powerPressed(kind);
      };
      btn.addEventListener('pointerup', () => end(true));
      btn.addEventListener('pointerleave', () => end(false));
      btn.addEventListener('pointercancel', () => end(false));
    }

    discardSelected() {
      if (this.armed !== 'card' || this.sel < 0) { BB.ui.toast(T('battle.discard_hint')); return; }
      const me = this.match.players[0];
      const r = this.match.execute({ type: 'discard', player: 0, hand: this.sel, cardId: me.deck.hand[this.sel] });
      if (r === 'Ok') { BB.audio.play('card'); BB.vibrate(10); }
      this.disarm();
    }

    pointerMove(e) {
      if (!this.armed) return;
      this.hoverLane = BB.renderer.laneAt(e.clientX, e.clientY);
      this.hoverX = this.hoverLane >= 0 ? BB.renderer.simX(this.match, e.clientX, this.hoverLane) : null;
    }

    pointerUp(e) {
      const wasDrag = this.dragging;
      this.dragging = false;
      if (!this.armed || this.paused || this.match.over) return;
      if (wasDrag && this.armed === 'card' && e.target.closest && e.target.closest('#trash')) { this.discardSelected(); return; }
      if (e.target.closest && e.target.closest('.tap')) return; // soltou sobre a interface
      const lane = BB.renderer.laneAt(e.clientX, e.clientY);
      if (lane < 0) { if (!wasDrag) this.disarm(); return; }
      if (this.armed === 'card') this.exec({ type: 'play', player: 0, hand: this.sel, cardId: this.match.players[0].deck.hand[this.sel], lane, x: BB.renderer.simX(this.match, e.clientX, lane) });
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
        { label: T('ui.settings'), cls: 'dark', fn: () => { this.paused = false; this.openSettings(); } },
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
      let ghost = null;
      if (this.armed === 'card' && this.hoverLane >= 0 && this.sel >= 0) {
        const def = BB.content.cards[m.players[0].deck.hand[this.sel]];
        if (def && !def.isSpell) ghost = { lane: this.hoverLane, x: m.deployX(0, this.hoverLane, this.hoverX, def), def };
      }
      BB.renderer.draw(m, this.paused ? 0 : dt, { armed: !!this.armed, hoverLane: this.hoverLane, ghost });
      this.refreshHud();
      if (m.over) {
        if (this.endT === 0) this.showEnd();
        this.endT += dt;
        if (this.endT > 4.6) this.finish();
      }
    }

    showEnd() {
      const m = this.match;
      this.disarm();
      document.getElementById('toast').innerHTML = '';
      BB.audio.stopMusic();
      BB.audio.play(m.winner === 0 ? 'victory' : 'defeat');
      $('#hud').classList.add('ending');
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

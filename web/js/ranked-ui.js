// Ranqueada: telas (ranking, login, busca de adversário, VS), resultado, prêmio da temporada e abandono.
// A regra de pontos fica em ranked.js (pura); a nuvem em cloud.js. Aqui só junta tudo e desenha.
(function (BB) {
  'use strict';
  const T = (...a) => BB.T(...a);
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => BB.esc(s);
  const R = () => BB.Ranked;
  const C = () => BB.cloud;
  const now = () => (BB.Ranked.clock ? BB.Ranked.clock() : Date.now());
  let inflight = null;   // envio em andamento (a leitura espera ele terminar)
  let lastErr = null;

  const RU = {
    // a Ranqueada fica fora da versão da CrazyGames
    available() { return BB.platform.name !== 'crazygames'; },

    // ------------------------------------------------------------ estado local (por conta)
    data() {
      const p = BB.profile;
      if (!p.ranked || typeof p.ranked !== 'object') p.ranked = {};
      const d = p.ranked;
      if (!d.st || !d.st.season) d.st = R().newState(R().seasonId(now()));
      return d;
    },
    st() { return RU.data().st; },
    leagueName(i) { return T('league.' + R().LEAGUES[i].id); },
    leagueImg(i, cls) { return `<img class="lg-ico ${cls || ''}" src="img/ui/${R().LEAGUES[i].img}.webp" alt="">`; },
    ico(n, cls) { return `<img class="ui-ico ${cls || ''}" src="img/ui/${n}.webp" alt="">`; },
    fromRow(r) {
      return { season: r.season, points: r.points, maxLeague: r.max_league, streak: r.streak, wins: r.wins, losses: r.losses, draws: r.draws,
        trophies: r.trophies, prevSeason: r.prev_season || '', prevPoints: r.prev_points || 0 };
    },
    // ao entrar com uma conta: os pontos dela vêm da nuvem (outra conta no mesmo aparelho começa do zero)
    async ensureAccount() {
      const d = RU.data(), uid = C().userId();
      if (!uid || d.uid === uid) return;
      const row = await C().myRow();
      d.uid = uid; d.rowExists = !!row; d.inProgress = null;
      if (row) { d.st = RU.fromRow(row); d.pending = false; d.named = true; if (row.name) BB.profile.playerName = row.name; }
      else { d.st = R().newState(R().seasonId(now())); d.pending = true; d.named = false; }
      BB.save();
    },
    // envia o último estado; se falhar (sem internet ou recusado) fica guardado e é reenviado depois
    sync() {
      const d = RU.data();
      if (!C().configured() || !C().loggedIn() || d.uid !== C().userId() || !d.pending) return inflight || Promise.resolve(true);
      if (inflight) return inflight;
      const row = C().rowFrom(d.st, BB.playerName(BB.profile), BB.profile.selectedBaron);
      inflight = C().upload(row, d.rowExists === true ? true : d.rowExists === false ? false : null)
        .then(() => { d.pending = false; d.rowExists = true; lastErr = null; BB.save(); return true; })
        .catch((e) => { lastErr = e; return false; })
        .finally(() => { inflight = null; });
      return inflight;
    },

    // ------------------------------------------------------------ partida
    markStart(opp) {
      const d = RU.data();
      d.inProgress = { opp: { name: opp.name, points: opp.points }, season: d.st.season, at: now() };
      BB.save();
    },
    // fim da partida: aplica os pontos, limpa a marca de "em andamento" e envia
    matchEnded(result, opp) {
      const d = RU.data();
      d.inProgress = null;
      RU.rolloverLocal();
      const r = R().applyMatch(d.st, result, opp.points);
      d.pending = true;
      BB.save();
      RU.sync();
      return Object.assign({ opp: opp.name, result }, r);
    },
    // se o jogo abriu com uma partida marcada, ela foi abandonada: conta como derrota
    checkAbandon() {
      const d = RU.data();
      if (!d.inProgress || BB.battle) return null;
      const ip = d.inProgress; d.inProgress = null;
      let r = null;
      if (ip.season === d.st.season) { r = R().applyMatch(d.st, -1, ip.opp.points || 0); d.pending = true; }
      BB.save(); RU.sync();
      return Object.assign({ opp: ip.opp.name }, r || { delta: 0 });
    },
    showAbandon(a) {
      RU.okModal(T('rk.abandon_title'), T('rk.abandon_text', a.opp, a.delta));
    },

    // ------------------------------------------------------------ virada de temporada
    // sem nuvem (ou sem conta) a colocação final conta só bots e você
    rolloverLocal(realsFinal) {
      const d = RU.data();
      const reward = R().rollover(d.st, now(), (s, pts) => R().finalRank(s, pts, realsFinal || []));
      if (!reward) return null;
      const p = BB.profile;
      p.gold += reward.gold || 0; p.crystals += reward.crystals || 0;
      d.reward = reward; d.pending = true;
      BB.save();
      return reward;
    },
    async checkSeason() {
      const d = RU.data();
      if (d.st.season !== R().seasonId(now())) {
        let reals = [];
        if (C().configured()) try { reals = (await C().readFinal(d.st.season)).filter((r) => r.id !== d.uid); } catch (e) { /* sem internet: só bots */ }
        if (RU.rolloverLocal(reals) || d.pending) await RU.sync(); // a virada vai para a nuvem na hora
      }
      if (d.reward) RU.showReward();
    },
    // janela de prêmio: só fecha no OK (fica salva até o jogador ver)
    showReward() {
      const d = RU.data(), w = d.reward;
      if (!w || $('#rkReward')) return;
      const lines = [T('rk.reward_text', RU.leagueName(w.league), w.rank > 0 ? '#' + w.rank : '—', w.points)];
      if (w.top10) lines.push(T('rk.reward_top10'));
      lines.push(T('rk.reward_items', w.gold, w.crystals ? ' · 💎 ' + w.crystals : ''));
      RU.okModal(T('rk.reward_title', R().seasonNumber(w.season)), lines.join('\n'), () => { d.reward = null; BB.save(); }, 'rkReward');
    },
    okModal(title, text, fn, id) {
      const ov = document.getElementById('overlay'), m = document.createElement('div');
      m.className = 'modal rk-modal'; if (id) m.id = id;
      m.innerHTML = `<div class="panel"><h2 class="title">${esc(title)}</h2>${text.split('\n').map((l) => '<p>' + esc(l) + '</p>').join('')}<div class="acts"><button class="btn gold" data-cancel="1">${T('rk.ok')}</button></div></div>`;
      m.querySelector('button').onclick = () => { BB.audio.play('click'); m.remove(); if (fn) fn(); };
      ov.appendChild(m);
      BB.audio.jingle('reward');
    },

    onMenu() {
      if (!RU.available()) return;
      if (C().configured()) C().checkRedirect(); // voltou do login do Google (navegador)
      setTimeout(() => {
        if (BB.ui.current() !== 'menu') return;
        const a = RU.checkAbandon();
        if (a) RU.showAbandon(a);
        RU.checkSeason();
      }, 500);
    },

    // ------------------------------------------------------------ login
    loginModal(after) {
      const ov = document.getElementById('overlay'), m = document.createElement('div');
      m.className = 'modal rk-login';
      const close = () => m.remove();
      const step = (html) => { m.innerHTML = `<div class="panel"><button class="ci-x" data-cancel="1">✕</button>${html}</div>`; m.querySelector('.ci-x').onclick = close; };
      const fail = (e) => { BB.ui.toast(e && e.status === 0 ? T('rk.offline_short') : T('rk.error')); };
      const first = () => {
        step(`<h2 class="title">${T('rk.login_title')}</h2><p>${T('rk.login_text')}</p>
          <div class="rk-acts"><button class="btn rk-google" id="rkG"><b>G</b> ${T('rk.google')}</button><button class="btn" id="rkE">✉ ${T('rk.email')}</button></div>`);
        $('#rkG', m).onclick = () => { BB.audio.play('click'); C().googleStart(); };
        $('#rkE', m).onclick = () => { BB.audio.play('click'); email(); };
      };
      const email = () => {
        step(`<h2 class="title">${T('rk.email')}</h2><input class="rk-in" id="rkMail" type="email" autocomplete="email" placeholder="${T('rk.email_ph')}">
          <div class="rk-acts"><button class="btn gold" id="rkSend">${T('rk.send_code')}</button></div>`);
        $('#rkSend', m).onclick = async () => {
          const v = $('#rkMail', m).value.trim();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { BB.ui.toast(T('rk.email_bad')); return; }
          try { await C().emailStart(v); code(v); } catch (e) { fail(e); }
        };
      };
      const code = (mail) => {
        step(`<h2 class="title">${T('rk.email')}</h2><p>${esc(T('rk.code_sent', mail))}</p><input class="rk-in code" id="rkCode" inputmode="numeric" maxlength="8" placeholder="000000">
          <div class="rk-acts"><button class="btn gold" id="rkOk">${T('rk.confirm')}</button></div>`);
        $('#rkOk', m).onclick = async () => {
          try { if (await C().emailVerify(mail, $('#rkCode', m).value)) { close(); RU.afterLogin(after); } } catch (e) { fail(e); }
        };
      };
      first(); ov.appendChild(m);
    },
    async afterLogin(after) {
      if (BB.Shop) BB.Shop.checkTester();
      try { await RU.ensureAccount(); } catch (e) { /* tenta de novo ao abrir o ranking */ }
      const d = RU.data();
      if (!d.named && !BB.Progress.nameLockLeft(BB.profile)) RU.nickModal(after);
      else { d.named = true; if (after) after(); }
    },
    nickModal(after) {
      const ov = document.getElementById('overlay'), m = document.createElement('div');
      m.className = 'modal rk-login';
      m.innerHTML = `<div class="panel"><h2 class="title">${T('rk.nick_title')}</h2><p>${T('rk.nick_text')} ${T('rk.nick_lock', BB.Progress.NAME_LOCK_DAYS)}</p>
        <input class="rk-in" id="rkNick" maxlength="16" value="${esc(BB.playerName(BB.profile))}"><div class="rk-acts"><button class="btn gold" id="rkSave">${T('rk.save')}</button></div></div>`;
      ov.appendChild(m);
      $('#rkSave', m).onclick = () => {
        const v = $('#rkNick', m).value.trim().replace(/\s+/g, ' ');
        if (v.length < 2 || v.length > 16) { BB.ui.toast(T('rk.nick_bad')); return; }
        BB.audio.play('click');
        if (v !== BB.profile.playerName) BB.Progress.setName(BB.profile, v); // conta como troca: próxima só em 14 dias
        const d = RU.data(); d.named = true; d.pending = true; BB.save(); RU.sync();
        m.remove(); if (after) after();
      };
    },

    // ------------------------------------------------------------ tela do ranking
    rowHtml(e) {
      const medal = e.pos === 1 ? '🥇' : e.pos === 2 ? '🥈' : e.pos === 3 ? '🥉' : '#' + e.pos;
      return `<div class="rk-row ${e.me ? 'me' : ''}"><span class="rk-pos">${medal}</span>${e.me ? BB.Shop.img(BB.Shop.avatarPic(BB.profile)) : `<img src="${BB.art.baronUrl(e.baron || 'rei_bastion')}" alt="">`}
        <span class="rk-name">${esc(e.me ? e.name + ' (' + T('rk.you') + ')' : e.name)}</span>${e.trophies ? `<span class="rk-tro">🏆${e.trophies > 1 ? e.trophies : ''}</span>` : ''}
        <span class="rk-lg">${RU.leagueImg(e.league)}</span><b>${e.points}</b></div>`;
    },
    render(board, status) {
      const d = RU.data(), st = d.st, li = R().league(st.points), nx = R().nextLeague(st.points);
      const logged = C().configured() && C().loggedIn();
      const lo = R().LEAGUES[li].floor, hi = nx ? R().LEAGUES[nx.index].floor : lo;
      const pct = nx ? Math.round(((st.points - lo) / (hi - lo)) * 100) : 100;
      const left = $('#rkLeft'), list = $('#rkList'), mine = $('#rkMine');
      if (!left) return;
      left.innerHTML = `<div class="rk-emblem">${RU.leagueImg(li, 'big')}</div><h2 class="title">${RU.leagueName(li)}</h2>
        <div class="rk-big">${board && board.position ? '#' + board.position.toLocaleString() : '—'} <span>·</span> ${T('rk.points', st.points)}</div>
        <div class="rk-bar"><i style="width:${pct}%"></i></div>
        <div class="rk-next">${nx ? T('rk.next', nx.need, RU.leagueName(nx.index)) : T('rk.max')}</div>
        <div class="rk-rec">${T('rk.record', st.wins, st.losses, st.draws)}${st.streak >= 2 ? '<br>' + T('rk.streak', st.streak) : ''}</div>
        ${logged ? `<button class="btn gold rk-play" id="rkPlay">⚔ ${T('rk.play')}</button>` : `<button class="btn gold rk-play" id="rkLogin">${T('rk.login')}</button>`}
        <div class="rk-status">${status || ''}</div>
        ${logged ? `<div class="rk-acc"><small>${esc(C().email())}</small> <a id="rkOut">${T('rk.logout')}</a> · <a id="rkDel">${T('rk.delete')}</a></div>` : ''}`;
      if (board) {
        list.innerHTML = board.top.map(RU.rowHtml).join('');
        const meE = board.top.find((e) => e.me);
        mine.innerHTML = !meE && logged ? RU.rowHtml({ me: true, pos: board.position, name: BB.playerName(BB.profile), baron: BB.profile.selectedBaron, points: st.points, trophies: st.trophies, league: li })
          .replace('#' + board.position, '#' + board.position.toLocaleString()) : '';
        const me = list.querySelector('.me'); if (me && !RU._scrolled) { RU._scrolled = true; me.scrollIntoView({ block: 'center' }); }
      }
      const play = $('#rkPlay'); if (play) play.onclick = () => RU.play();
      const lg = $('#rkLogin'); if (lg) lg.onclick = () => { BB.audio.play('click'); if (!C().configured()) { BB.ui.toast(T('rk.not_configured')); return; } RU.loginModal(() => BB.ui.show('ranking')); };
      const out = $('#rkOut'); if (out) out.onclick = () => { C().signOut(); if (BB.Shop) BB.Shop.checkTester(); BB.ui.show('ranking'); };
      const del = $('#rkDel'); if (del) del.onclick = () => BB.ui.modal(T('rk.delete'), T('rk.delete_confirm'), [
        { label: T('battle.yes'), cls: 'red', fn: async () => { try { await C().deleteAccount(); const dd = RU.data(); dd.uid = null; dd.st = R().newState(R().seasonId(now())); dd.named = false; BB.save(); BB.ui.show('ranking'); } catch (e) { BB.ui.toast(T('rk.error')); } } },
        { label: T('battle.no'), cls: 'dark' },
      ]);
    },
    // lê o ranking da nuvem (depois de enviar o que estava pendente) e devolve o quadro com a sua posição
    me() { const d = RU.data(); return { id: d.uid || 'me', name: BB.playerName(BB.profile), baron: BB.profile.selectedBaron, points: d.st.points, trophies: d.st.trophies }; },
    async fetchBoard() {
      const d = RU.data(), t = now(), season = R().seasonId(t);
      let reals = [], above, status = '';
      if (C().configured()) {
        try {
          if (C().loggedIn()) { await RU.ensureAccount(); await RU.sync(); } // lê só depois do envio terminar
          await RU.checkSeason();
          reals = (await C().readSeason(season)).map((r) => ({ id: r.user_id, name: r.name, baron: r.baron, points: r.points, trophies: r.trophies }));
          if (C().loggedIn() && reals.length >= 200 && d.st.points < reals[reals.length - 1].points) above = await C().countAbove(season, d.st.points);
        } catch (e) { lastErr = e; }
      } else RU.checkSeason();
      if (RU.data().pending && C().loggedIn()) status = lastErr && lastErr.status === 0 ? T('rk.offline') : T('rk.pending');
      else if (lastErr && lastErr.status === 0) status = T('rk.offline_short');
      return { board: R().board(t, reals, RU.me(), above), status };
    },
    async load() {
      RU.render(R().board(now(), [], RU.me()), C().loggedIn() ? T('rk.loading') : '');
      const r = await RU.fetchBoard();
      if (BB.ui.current() !== 'ranking') return;
      RU.render(r.board, r.status);
    },

    // ------------------------------------------------------------ sala de espera da Ranqueada
    seasonBanner() {
      const t = now(), season = R().seasonId(t), days = R().daysLeft(t);
      return `<div class="lb-season"><span>⌛ ${T('rk.season', R().seasonNumber(season))}</span><i>·</i><span>${days <= 1 ? T('rk.ends_today') : T('rk.ends', days)}</span></div>`;
    },
    lobby() {
      BB.ui.h.screen('rkLobby', BB.ui.h.topbar(T('rk.title'), true, { fancy: true }) + RU.seasonBanner() + `
        <div class="lb"><div class="gpanel lb-prof" id="lbProf"></div>
          <div class="gpanel lb-army" id="lbArmy"></div></div>
        <div class="lb-go"><img class="lb-pen" src="img/ui/pennant_fleur.webp" alt="">
          <button class="mbtn lb-search" id="lbGoBtn"><img src="img/menu/btn_battle.webp" alt=""><span id="lbGoTxt">${T('rk.search')}</span></button>
          <img class="lb-pen" src="img/ui/pennant_fleur.webp" alt=""></div>`, 'img/ui/bg_ranked.webp');
      BB.ui.h.bindBack('rkLobby', () => BB.ui.show('menu'));
      BB.audio.music('menu');
      const a = RU.checkAbandon(); if (a) RU.showAbandon(a);
      RU.lobbyArmy();
      RU.lobbyProfile(null, C().loggedIn() ? T('rk.loading') : '');
      if (C().configured()) RU.fetchBoard().then((r) => { if (BB.ui.current() === 'rkLobby') RU.lobbyProfile(r.board, r.status); });
    },
    lobbyProfile(board, status) {
      const el = $('#lbProf');
      if (!el) return;
      const d = RU.data(), st = d.st, li = R().league(st.points), nx = R().nextLeague(st.points), p = BB.profile, b = BB.content.balance;
      const lo = R().LEAGUES[li].floor, hi = nx ? R().LEAGUES[nx.index].floor : lo;
      const pct = nx ? Math.round(((st.points - lo) / (hi - lo)) * 100) : 100, logged = C().configured() && C().loggedIn();
      const need = BB.Progress.xpForNext(b, p.accountLevel);
      el.innerHTML = `<div class="lb-head"><div class="lb-av">${BB.Shop.img(BB.Shop.avatarPic(p), 'lb-avatar')}<img class="lb-frame" src="img/ui/frame_round.webp" alt=""></div>
          <div class="lb-who"><h2 class="title">${esc(BB.playerName(p))}</h2>
            <div class="lb-lvrow"><span class="lb-lv"><img src="img/ui/crown_shield.webp" alt=""><b>${p.accountLevel}</b></span>
              <div><small>${T('profile.level', p.accountLevel)}${st.trophies ? ' · 🏆 ' + st.trophies : ''}</small><div class="lb-xp"><i style="width:${(p.xp / need) * 100}%"></i></div></div></div></div></div>
        <div class="lb-league">${RU.leagueImg(li, 'big')}<div><b>${RU.leagueName(li)}</b>
          <div class="lb-pos">${board && board.position ? '#' + board.position.toLocaleString() : '—'} <span>·</span> ${T('rk.points', st.points)}</div></div></div>
        <div class="lb-bar"><i style="width:${pct}%"></i></div><div class="lb-next">${nx ? T('rk.next', nx.need, RU.leagueName(nx.index)) : T('rk.max')}</div>
        <div class="lb-stats">
          <span title="${T('rk.wins')}">${RU.ico('swords')}<b>${st.wins}</b><small>${T('rk.wins')}</small></span>
          <span title="${T('rk.draws')}">${RU.ico('shield')}<b>${st.draws}</b><small>${T('rk.draws')}</small></span>
          <span title="${T('rk.losses')}">${RU.ico('skull')}<b>${st.losses}</b><small>${T('rk.losses')}</small></span>
          <span title="${T('rk.streak_short')}">${RU.ico('fire')}<b>${st.streak}</b><small>${T('rk.streak_short')}</small></span></div>
        <div class="rk-status">${status || ''}</div>
        <div class="lb-foot"><button class="gbtn blue lb-rank" id="lbBoard">${RU.ico('trophy')}<span>${T('rk.ranking')}</span></button>
          <button class="lb-rewards" id="lbRewards"><img src="img/ui/season_chest.webp" alt=""><span>${T('rk.season_rewards')}</span></button></div>`;
      $('#lbGoTxt').textContent = logged ? T('rk.search') : T('rk.login');
      $('#lbGoBtn').onclick = () => {
        if (logged) { RU.play(); return; }
        BB.audio.play('click'); if (!C().configured()) { BB.ui.toast(T('rk.not_configured')); return; } RU.loginModal(() => BB.ui.show('rkLobby'));
      };
      $('#lbBoard').onclick = () => { BB.audio.play('click'); BB.ui.returnTo = 'rkLobby'; BB.ui.show('ranking'); };
      $('#lbRewards').onclick = () => RU.rewardsModal();
    },
    // prêmios da temporada (pela maior liga alcançada) — os mesmos valores pagos na virada
    rewardsModal() {
      BB.audio.play('click');
      const st = RU.data().st, cur = st.maxLeague, ov = document.getElementById('overlay'), m = document.createElement('div');
      m.className = 'modal';
      m.innerHTML = `<div class="gpanel lb-rw"><h2 class="title">${T('rk.season_rewards')}</h2><p class="muted">${T('rk.rewards_text')}</p>
        <div class="lb-rwlist">${R().LEAGUES.map((l, i) => { const r = R().REWARDS[i];
          return `<div class="lb-rwi ${i === cur ? 'cur' : ''} ${i <= cur ? 'got' : ''}">${RU.leagueImg(i)}<div><b>${RU.leagueName(i)}</b><small>${l.floor}+ pts</small></div>
            <span>${RU.ico('coins')} ${r.gold}${r.crystals ? ' ' + RU.ico('gems') + ' ' + r.crystals : ''}</span></div>`; }).join('')}
          <div class="lb-rwi top">${RU.ico('trophy')}<div><b>Top 10</b><small>${T('rk.top10_bonus')}</small></div><span>${RU.ico('coins')} +${R().TOP10.gold} ${RU.ico('gems')} +${R().TOP10.crystals}</span></div></div>
        <div class="acts"><button class="btn gold" data-cancel="1">${T('rk.ok')}</button></div></div>`;
      m.querySelector('button').onclick = () => { BB.audio.play('click'); m.remove(); };
      ov.appendChild(m);
    },
    lobbyArmy() {
      const el = $('#lbArmy'), p = BB.profile, C2 = BB.content, deck = p.decks[p.activeDeck];
      const cs = BB.Shop.equipped(p, 'castle', p.selectedCastle);
      const pick = (id, img, lbl, name) => `<button class="lb-pick" id="${id}"><span class="lb-tile">${img}</span>
          <span class="lb-pn"><small>${lbl}</small><b>${name}</b><em>${RU.ico('refresh')} ${T('rk.change')}</em></span><img class="lb-arrow" src="img/ui/next.webp" alt=""></button>`;
      el.innerHTML = `<div class="lb-sel">
          ${pick('lbBaron', BB.Shop.img(BB.Shop.baronPic(p, p.selectedBaron)), T('ui.barons'), BB.baronName(p.selectedBaron))}
          ${pick('lbCastle', `<img src="img/castle_cards/${p.selectedCastle}.webp" style="${cs && cs.filter ? 'filter:' + cs.filter : ''}" alt="">`, T('ui.castles'), BB.castleName(p.selectedCastle))}</div>
        <div class="lb-decks">${[0, 1, 2].map((i) => `<button class="gbtn ${i === p.activeDeck ? 'gold' : 'navy'}" data-dk="${i}">${RU.ico(i === p.activeDeck ? 'castle' : 'cards')}<span>${esc(BB.deckName(i))}</span></button>`).join('')}
          <button class="gbtn blue" id="lbEdit">${RU.ico('pencil')}<span>${T('rk.edit_deck')}</span></button></div>
        <div class="lb-cards">${deck.map((id) => BB.ui.cardHtml(C2.card(id), BB.Progress.owned(p, id), { level: true })).join('')}</div>`;
      const ret = (scr) => { BB.audio.play('click'); BB.ui.returnTo = 'rkLobby'; BB.ui.show(scr); };
      $('#lbBaron').onclick = () => ret('barons');
      $('#lbCastle').onclick = () => ret('castles');
      $('#lbEdit').onclick = () => ret('deck');
      el.querySelectorAll('[data-dk]').forEach((b) => b.onclick = () => {
        const i = +b.dataset.dk;
        if (BB.DeckRules.validate(p.decks[i], C2, p) !== 'Ok') { BB.ui.toast(T('ui.deck_invalid', C2.balance.deckSize)); return; }
        BB.audio.play('click'); p.activeDeck = i; BB.save(); RU.lobbyArmy();
      });
    },

    screen() {
      const t = now(), season = R().seasonId(t), days = R().daysLeft(t);
      RU._scrolled = false;
      BB.ui.h.screen('ranking', BB.ui.h.topbar(T('rk.ranking'), true, { fancy: true }) + RU.seasonBanner() + `
        <div class="rk"><div class="gpanel rk-left" id="rkLeft"></div>
          <div class="gpanel rk-right"><div class="rk-list" id="rkList"></div><div class="rk-mine" id="rkMine"></div></div></div>`, 'img/ui/bg_ranked.webp');
      BB.ui.h.bindBack('ranking', () => BB.ui.show(BB.ui.backTarget()));
      BB.audio.music('menu');
      const a = RU.checkAbandon(); if (a) RU.showAbandon(a);
      RU.load();
    },
    play() {
      BB.audio.play('click');
      const p = BB.profile;
      if (BB.DeckRules.validate(p.decks[p.activeDeck], BB.content, p) !== 'Ok') { BB.ui.toast(T('ui.deck_invalid', BB.content.balance.deckSize)); return; }
      if (!C().loggedIn()) { RU.loginModal(() => BB.ui.show('ranking')); return; }
      BB.ui.show('matchmaking');
    },

    // ------------------------------------------------------------ busca de adversário e VS
    matchmaking() {
      const d = RU.data(), p = BB.profile;
      RU.rolloverLocal();
      const opp = R().pickOpponent(d.st.points, now(), Math.random);
      let sum = 0; const deck = p.decks[p.activeDeck];
      for (const id of deck) { const o = BB.Progress.owned(p, id); sum += o ? o.level : 1; }
      const ai = R().aiFor(opp.points, sum / deck.length, BB.content.balance.maxCardLevel);
      BB.ui.h.screen('matchmaking', `<div class="mm"><div class="mm-radar"><i></i><b></b></div><h2 class="title" id="mmTxt">${T('rk.searching')}</h2>
        <button class="btn dark small" id="mmCancel">${T('rk.cancel')}</button></div>`);
      const alive = () => BB.ui.current() === 'matchmaking';
      const cancel = () => BB.ui.show('rkLobby');
      BB.ui.h.bindBack('matchmaking', cancel);
      $('#mmCancel').onclick = () => { BB.audio.play('click'); cancel(); };
      BB.audio.music('menu');
      setTimeout(() => {
        if (!alive()) return;
        BB.audio.play('baron');
        $('#mmTxt').innerHTML = T('rk.found') + '<br><span class="mm-name">' + esc(opp.name) + '</span>';
        $('.mm-radar').classList.add('found');
        setTimeout(() => { if (alive()) RU.vs(opp, ai); }, 1000);
      }, 1200 + Math.random() * 1600);
    },
    vs(opp, ai) {
      const d = RU.data(), p = BB.profile;
      const side = (name, baron, points, me) => { const li = R().league(points); return `<div class="vs-side ${me ? 'me' : 'foe'}">${me ? BB.Shop.img(BB.Shop.avatarPic(BB.profile)) : `<img src="${BB.art.baronUrl(baron)}" alt="">`}
        <h2 class="title">${esc(name)}</h2><div>${RU.leagueImg(li)} ${RU.leagueName(li)}</div><b>${T('rk.points', points)}</b><small>${BB.baronName(baron)}</small></div>`; };
      BB.ui.h.screen('matchmaking', `<div class="vs">${side(BB.playerName(p), p.selectedBaron, d.st.points, true)}<div class="vs-mid title">VS</div>${side(opp.name, opp.baron, opp.points, false)}</div>`);
      BB.audio.play('castle');
      setTimeout(() => { if (BB.ui.current() === 'matchmaking') BB.ui.show('battle', { difficulty: ai.difficulty, ranked: { opp, ai } }); }, 2300);
    },

    // ------------------------------------------------------------ resultado
    resultHtml(r) {
      const cls = r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : '';
      return `<div class="rk-res"><span class="rk-delta ${cls}">${r.delta > 0 ? '+' : ''}${T('rk.points', r.delta)}</span>
        <span>${T('rk.total', r.after)}</span><span>${RU.leagueImg(r.leagueAfter)} ${RU.leagueName(r.leagueAfter)}</span>
        ${r.promoted ? `<span class="rk-promo">⬆ ${T('rk.promoted', RU.leagueName(r.leagueAfter))}</span>` : ''}</div>`;
    },
  };

  BB.RankedUI = RU;
  if (BB.ui && BB.ui.addScreen) {
    BB.ui.addScreen('ranking', () => RU.screen());
    BB.ui.addScreen('matchmaking', () => RU.matchmaking());
    BB.ui.addScreen('rkLobby', () => RU.lobby());
  }
  // volta do login do Google
  if (BB.cloud) BB.cloud.onLogin = () => RU.afterLogin(() => BB.ui.show('ranking'));
})(window.BB);

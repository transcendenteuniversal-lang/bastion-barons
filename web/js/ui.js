// Telas do jogo (menus em HTML). Cada tela é redesenhada ao ser exibida.
(function (BB) {
  'use strict';
  const T = (...a) => BB.T(...a);
  const $ = (s, r) => (r || document).querySelector(s);
  const app = () => document.getElementById('app');
  const esc = (s) => BB.esc(s);
  let current = null, currentArgs = null;
  const back = {}; // tela -> função "voltar"

  const ui = {
    current: () => current,

    show(name, args) {
      if (BB.battle) { BB.battle.stop(); BB.battle = null; }
      current = name; currentArgs = args;
      document.getElementById('overlay').innerHTML = '';
      app().innerHTML = '';
      SCREENS[name](args);
      app().querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { BB.audio.play('click'); ui.show(b.dataset.go); }));
    },
    refresh() { ui.show(current, currentArgs); },

    onBack() {
      const ov = document.getElementById('overlay');
      if (ov.firstChild) { const later = ov.querySelector('[data-cancel]'); if (later) later.click(); else ov.innerHTML = ''; return; }
      if (current === 'battle') { if (BB.battle) BB.battle.pause(); return; }
      if (back[current]) back[current]();
      else if (current === 'menu' && window.AndroidBridge && AndroidBridge.exit) AndroidBridge.exit();
    },

    toast(msg, ms) {
      const t = document.getElementById('toast');
      const d = document.createElement('div'); d.textContent = msg; t.appendChild(d);
      while (t.children.length > 3) t.removeChild(t.firstChild);
      setTimeout(() => d.remove(), ms || 1600);
    },

    // botões: [{label, cls, fn}] — o último sem fn funciona como "cancelar"
    modal(title, text, buttons) {
      const ov = document.getElementById('overlay');
      const m = document.createElement('div');
      m.className = 'modal';
      m.innerHTML = `<div class="panel"><h2 class="title">${esc(title)}</h2>${text ? '<p>' + esc(text) + '</p>' : ''}<div class="acts"></div></div>`;
      const acts = m.querySelector('.acts');
      (buttons || [{ label: T('ui.back'), cls: 'dark' }]).forEach((b, i, arr) => {
        const el = document.createElement('button');
        el.className = 'btn ' + (b.cls || '');
        el.textContent = b.label;
        if (i === arr.length - 1) el.dataset.cancel = '1';
        el.onclick = () => { BB.audio.play('click'); m.remove(); if (b.fn) b.fn(); };
        acts.appendChild(el);
      });
      ov.appendChild(m);
    },

    cardHtml(def, owned, o) {
      o = o || {};
      const lock = o.locked ? ' locked' : '';
      return `<div class="card ${def.rarity}${lock}" data-id="${def.id}" ${o.attrs || ''} data-lock="${esc(T('ui.locked'))}">
        <img class="art" src="${BB.art.cardUrl(def)}" alt="">
        <div class="cost">${def.cost}</div>
        ${o.level && owned ? '<div class="lv">' + T('ui.level', owned.level) + '</div>' : ''}
        ${o.up ? '<div class="up">▲</div>' : ''}
        <div class="name">${esc(BB.cardName(def.id))}</div></div>`;
    },

    // menu pequeno sobre a carta tocada
    cardMenu(el, id, extra) {
      ui.closeCardMenu(); BB.audio.play('click');
      const r = el.getBoundingClientRect(), m = document.createElement('div');
      m.className = 'card-menu'; m.id = 'cardMenu';
      const items = [{ label: T('ui.info'), cls: 'blue', fn: () => ui.cardInfo(id) }, ...extra];
      items.forEach((it) => { const b = document.createElement('button'); b.className = 'btn small ' + (it.cls || 'green'); b.textContent = it.label; b.onclick = (e) => { e.stopPropagation(); ui.closeCardMenu(); it.fn(); }; m.appendChild(b); });
      document.body.appendChild(m);
      const mw = m.offsetWidth, mh = m.offsetHeight;
      m.style.left = Math.max(6, Math.min(innerWidth - mw - 6, r.left + r.width / 2 - mw / 2)) + 'px';
      m.style.top = (r.top - mh - 6 > 6 ? r.top - mh - 6 : r.bottom + 6) + 'px';
      setTimeout(() => document.addEventListener('pointerdown', ui._menuAway = (e) => { if (!m.contains(e.target)) ui.closeCardMenu(); }), 0);
    },
    closeCardMenu() { const m = document.getElementById('cardMenu'); if (m) m.remove(); if (ui._menuAway) document.removeEventListener('pointerdown', ui._menuAway); ui._menuAway = null; },

    // janela de informações da carta (estatísticas no nível atual)
    cardInfo(id) {
      const C = BB.content, p = BB.profile, c = C.card(id), o = BB.Progress.owned(p, id), lvl = o ? o.level : 1, mult = C.levelMult(lvl);
      const sp = C.balance.moveSpeedScale || 1, rows = [];
      if (c.isSpell) {
        if (c.spellValue) rows.push(['✨', T('stat.effect'), Math.round(c.spellValue * mult)]);
        if (c.spellRadius) rows.push(['🎯', T('stat.radius'), c.spellRadius]);
        if (c.spellDuration) rows.push(['⏱', T('stat.duration'), c.spellDuration + ' s']);
      } else {
        rows.push(['⚔️', T('stat.damage'), Math.round(c.damage * mult) + (c.attackInterval !== 1 ? ' / ' + c.attackInterval + ' s' : '')], ['❤️', T('stat.hp'), Math.round(c.hp * mult)],
          ['🏹', T('stat.range'), c.range], ['🪶', T('stat.move_speed'), +(c.moveSpeed * sp).toFixed(1)], ['🎯', T('stat.targets'), T('targets.' + c.targets)]);
        if (c.count > 1) rows.push(['👥', T('stat.count'), c.count]);
        if (c.flying) rows.push(['🕊', T('ui.flying'), '✔']);
      }
      const ov = document.getElementById('overlay'), m = document.createElement('div');
      m.className = 'modal';
      m.innerHTML = `<div class="panel card-info"><button class="ci-x">✕</button>
        <h2 class="title">${esc(BB.cardName(id))} ${T('ui.level', lvl)}</h2><div class="ci-rar" style="color:var(--${c.rarity.toLowerCase()})">${T('rarity.' + c.rarity)}${c.role ? ' • ' + esc(c.role) : ''}</div>
        <div class="ci-body"><div class="ci-card">${ui.cardHtml(c, o, { level: false })}</div>
          <div class="ci-stats">${rows.map(([i, k, v]) => `<div class="ci-row"><span class="ci-i">${i}</span><div><small>${esc(k)}</small><b>${esc(String(v))}</b></div></div>`).join('')}</div></div>
        <div class="ci-desc">${esc(T('card.' + id + '.desc'))}</div></div>`;
      const close = () => m.remove();
      m.onclick = (e) => { if (e.target === m) close(); };
      m.querySelector('.ci-x').onclick = () => { BB.audio.play('click'); close(); };
      ov.appendChild(m);
    },

  };

  function topbar(title, backTo) {
    const p = BB.profile;
    return `<div class="topbar">${backTo ? `<button class="btn red small" id="backBtn">‹ ${T('ui.back')}</button>` : ''}<h1 class="title">${esc(title)}</h1>
      <div class="wallet"><span>🪙 ${p.gold}</span><span>💎 ${p.crystals}</span></div></div>`;
  }
  function bindBack(name, fn) {
    back[name] = fn;
    const b = $('#backBtn');
    if (b) b.onclick = () => { BB.audio.play('click'); fn(); };
  }
  const screen = (id, html, bg) => { app().innerHTML = `<div class="screen" id="${id}"><div class="bg" style="background-image:url(${bg || 'img/menu_bg.webp'})"></div>${html}</div>`; };

  const SCREENS = {
    // ------------------------------------------------------------ abertura
    splash() {
      screen('splash', `<img class="logo" src="img/logo.webp" alt="Bastion Barons"><div class="loadbar"><i id="lb"></i></div>
        <div class="center muted" id="lt">${T('ui.loading')}</div><div class="version">v${BB.VERSION.name} • ${BB.content.version}</div>`);
      let k = 0;
      const iv = setInterval(() => {
        k += 0.08;
        const lb = $('#lb');
        if (!lb) return clearInterval(iv);
        lb.style.width = Math.min(100, k * 100) + '%';
        if (k >= 1) { clearInterval(iv); ui.show('menu'); BB.checkUpdate(); }
      }, 90);
    },

    // ------------------------------------------------------------ menu principal
    menu() {
      const p = BB.profile, b = BB.content.balance;
      const need = BB.Progress.xpForNext(b, p.accountLevel);
      screen('menu', `
        <div class="topbar"><div class="profile"><div class="lvl">${p.accountLevel}</div><div><b>${esc(p.playerName)}</b> <span class="muted">(${T('ui.guest')})</span>
          <div class="xpbar"><i style="width:${(p.xp / need) * 100}%"></i></div><small class="muted">${p.xp}/${need} XP</small></div></div><h1></h1>
          <div class="wallet"><span>🪙 ${p.gold}</span><span>💎 ${p.crystals}</span></div></div>
        <div class="main">
          <div class="col"><button class="btn" data-go="barons">${T('ui.barons')}</button><button class="btn" data-go="castles">${T('ui.castles')}</button><button class="btn" data-go="history">${T('ui.history')}</button></div>
          <div class="mid"><img class="logo" src="img/logo.webp" alt="">
            <div class="lineup"><img src="${BB.art.baronUrl(p.selectedBaron)}"><div><b>${BB.baronName(p.selectedBaron)}</b><div class="muted">${BB.castleName(p.selectedCastle)}</div></div></div>
            <button class="btn gold battle-btn" data-go="mode">⚔ ${T('ui.battle')}</button></div>
          <div class="col"><button class="btn" data-go="collection">${T('ui.collection')}</button><button class="btn" data-go="deck">${T('ui.deck')}</button><button class="btn dark" data-go="settings">${T('ui.settings')}</button></div>
        </div>`);
      BB.audio.music('menu');
      back.menu = null;
    },

    // ------------------------------------------------------------ modos
    mode() {
      screen('mode', topbar(T('ui.choose_mode'), true) + `<div class="content"><h2 class="title center" style="font-size:2.4rem;margin:.6rem 0 1.2rem">${T('ui.training')}</h2>
        <div class="choices" style="height:auto">
          <button class="btn green diff" data-d="easy">${T('ui.easy')}<small>${T('mode.easy')}</small></button>
          <button class="btn diff" data-d="normal">${T('ui.normal')}<small>${T('mode.normal')}</small></button>
          <button class="btn red diff" data-d="hard">${T('ui.hard')}<small>${T('mode.hard')}</small></button></div>
        <p class="center muted" style="margin-top:2rem;font-size:1.15rem">${T('ui.pvp_soon')}</p></div>`);
      bindBack('mode', () => ui.show('menu'));
      app().querySelectorAll('[data-d]').forEach((b) => b.onclick = () => {
        BB.audio.play('click');
        const p = BB.profile;
        if (BB.DeckRules.validate(p.decks[p.activeDeck], BB.content, p) !== 'Ok') { ui.toast(T('ui.deck_invalid', BB.content.balance.deckSize)); return; }
        ui.show('battle', { difficulty: b.dataset.d });
      });
    },

    battle(args) {
      app().innerHTML = '';
      BB.battle = new BB.Battle(args.difficulty);
      BB.battle.start();
    },

    // ------------------------------------------------------------ Barões
    barons() {
      const p = BB.profile;
      const items = BB.content.barons.map((b) => {
        const un = BB.Progress.baronUnlocked(p, b), sel = p.selectedBaron === b.id;
        return `<div class="panel choice ${sel ? 'sel' : ''} ${un ? '' : 'locked'}"><img class="portrait" src="${BB.art.baronUrl(b.id)}">
          <h3 class="title">${BB.baronName(b.id)}</h3><div class="sub">${T('baron.' + b.id + '.title')}</div>
          <div class="ab">${T('baron.' + b.id + '.ability')}</div><div class="desc">${T('baron.' + b.id + '.desc')}</div>
          ${!un ? `<div class="lock">${T('ui.locked_level', b.unlockLevel)}</div>` : sel ? `<b style="color:#5fd06d">${T('ui.selected')}</b>` : `<button class="btn green small" data-pick="${b.id}">${T('ui.select')}</button>`}</div>`;
      }).join('');
      screen('barons', topbar(T('ui.barons'), true) + `<div class="content"><div class="choices">${items}</div></div>`);
      bindBack('barons', () => ui.show('menu'));
      app().querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => { BB.audio.play('click'); p.selectedBaron = b.dataset.pick; BB.save(); ui.refresh(); });
    },

    // ------------------------------------------------------------ castelos
    castles() {
      const p = BB.profile;
      const items = BB.content.castles.map((c) => {
        const un = BB.Progress.castleUnlocked(p, c), sel = p.selectedCastle === c.id;
        return `<div class="panel choice ${sel ? 'sel' : ''} ${un ? '' : 'locked'}"><canvas class="portrait" data-castle="${c.id}" width="320" height="320"></canvas>
          <h3 class="title">${BB.castleName(c.id)}</h3><div class="ab">${T('castle.' + c.id + '.ability')}</div><div class="desc">${T('castle.' + c.id + '.desc')}</div>
          ${!un ? `<div class="lock">${T('ui.locked_level', c.unlockLevel)}</div>` : sel ? `<b style="color:#5fd06d">${T('ui.selected')}</b>` : `<button class="btn green small" data-pick="${c.id}">${T('ui.select')}</button>`}</div>`;
      }).join('');
      screen('castles', topbar(T('ui.castles'), true) + `<div class="content"><div class="choices">${items}</div></div>`);
      bindBack('castles', () => ui.show('menu'));
      app().querySelectorAll('[data-castle]').forEach((cv) => drawCastlePreview(cv, BB.content.castle(cv.dataset.castle)));
      app().querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => { BB.audio.play('click'); p.selectedCastle = b.dataset.pick; BB.save(); ui.refresh(); });
    },

    // ------------------------------------------------------------ coleção
    collection(state) {
      const s = state || { rarity: -1, type: 0, cls: '', cost: -1, q: '' };
      const p = BB.profile, C = BB.content;
      const owned = C.collectible.filter((c) => BB.Progress.owned(p, c.id)).length;
      const CLASSES = ['', 'King', 'Paladin', 'Archer', 'Mage', 'Necromancer', 'Orc', 'Assassin', 'Druid', 'Cleric', 'Engineer', 'Barbarian', 'Guardian', 'Beast'];
      screen('collection', topbar(T('ui.collection') + ' • ' + T('ui.owned', owned, C.collectible.length), true) + `
        <div class="filters">
          <button class="btn small" id="fR">${s.rarity < 0 ? T('ui.filter_all') : T('rarity.' + BB.RARITIES[s.rarity])}</button>
          <button class="btn small" id="fT">${[T('ui.type_all'), T('ui.type_troops'), T('ui.type_spells')][s.type]}</button>
          <button class="btn small" id="fC">${s.cls ? T('cls.' + s.cls) : T('ui.class_all')}</button>
          <button class="btn small" id="fK">${T('ui.filter_cost', s.cost < 0 ? T('ui.any') : s.cost >= 7 ? '7+' : s.cost)}</button>
          <input id="fQ" placeholder="${esc(T('ui.search'))}" value="${esc(s.q)}"></div>
        <div class="content"><div class="grid" id="grid"></div></div>`);
      bindBack('collection', () => ui.show('menu'));
      const set = (k, v) => { s[k] = v; BB.audio.play('click'); ui.show('collection', s); };
      $('#fR').onclick = () => set('rarity', s.rarity >= 4 ? -1 : s.rarity + 1);
      $('#fT').onclick = () => set('type', (s.type + 1) % 3);
      $('#fC').onclick = () => set('cls', CLASSES[(CLASSES.indexOf(s.cls) + 1) % CLASSES.length]);
      $('#fK').onclick = () => set('cost', s.cost < 0 ? 1 : s.cost >= 7 ? -1 : s.cost + 1);
      const fill = () => {
        const list = C.collectible.filter((c) =>
          (s.rarity < 0 || c.rarityIndex === s.rarity) && (s.type === 0 || (s.type === 1) === !c.isSpell) && (!s.cls || c.cls === s.cls) &&
          (s.cost < 0 || (s.cost >= 7 ? c.cost >= 7 : c.cost === s.cost)) && (!s.q || BB.cardName(c.id).toLowerCase().includes(s.q.toLowerCase())))
          .sort((a, b) => (!!BB.Progress.owned(p, b.id) - !!BB.Progress.owned(p, a.id)) || a.cost - b.cost || a.id.localeCompare(b.id));
        $('#grid').innerHTML = list.map((c) => {
          const o = BB.Progress.owned(p, c.id);
          return ui.cardHtml(c, o, { level: true, locked: !o, up: o && BB.Progress.canUpgrade(p, C, c.id) });
        }).join('');
        $('#grid').querySelectorAll('.card').forEach((el) => el.onclick = () => { BB.audio.play('click'); ui.show('card', { id: el.dataset.id, from: s }); });
      };
      $('#fQ').oninput = (e) => { s.q = e.target.value; fill(); };
      fill();
    },

    card(args) {
      const C = BB.content, p = BB.profile, b = C.balance, c = C.card(args.id), o = BB.Progress.owned(p, c.id);
      const lvl = o ? o.level : 1, mult = C.levelMult(lvl);
      const st = [[T('stat.cost'), c.cost]];
      if (c.isSpell) { if (c.spellValue) st.push([T('stat.effect'), Math.round(c.spellValue * mult)]); if (c.spellDuration) st.push([T('stat.duration'), c.spellDuration + ' s']); }
      else {
        st.push([T('stat.hp'), Math.round(c.hp * mult)], [T('stat.damage'), Math.round(c.damage * mult)], [T('stat.attack_speed'), c.attackInterval.toFixed(1) + ' s'],
          [T('stat.move_speed'), c.moveSpeed.toFixed(1)], [T('stat.range'), c.range], [T('stat.targets'), T('targets.' + c.targets)]);
        if (c.count > 1) st.push([T('stat.count'), c.count]);
      }
      let lower = `<p class="center" style="color:var(--gold);font-weight:800">${T('ui.how_to_get')}</p>`;
      if (o) {
        if (o.level >= b.maxCardLevel) lower = `<p class="center" style="color:#5fd06d;font-weight:900">${T('ui.max_level')}</p>`;
        else {
          const nc = BB.Progress.copiesRequired(b, o.level), ng = BB.Progress.goldRequired(b, o.level);
          lower = `<div class="bar"><i style="width:${Math.min(100, (o.copies / nc) * 100)}%"></i><span>${T('ui.copies', o.copies, nc)}</span></div>
            <div class="center" style="margin-top:.8rem"><button class="btn ${BB.Progress.canUpgrade(p, C, c.id) ? 'green' : 'dark'}" id="upg">${T('ui.upgrade', ng)}</button></div>`;
        }
      }
      screen('card', topbar(BB.cardName(c.id), true) + `<div class="content"><div class="detail">${ui.cardHtml(c, o, { level: true, locked: !o })}
        <div class="panel info"><div style="color:var(--${c.rarity.toLowerCase()});font-weight:900;font-size:1.3rem">${T('rarity.' + c.rarity)} • ${T('cls.' + c.cls)}${c.flying ? ' • ' + T('ui.flying') : ''}</div>
        <div style="margin-top:.4rem">${T('card.' + c.id + '.desc')}</div>
        ${o ? `<div style="margin-top:.6rem;color:var(--gold);font-weight:900">${T('ui.level', o.level)}</div>` : ''}
        <div class="stats">${st.map(([k, v]) => `<div>${k}: <b>${v}</b></div>`).join('')}</div>${lower}</div></div></div>`);
      bindBack('card', () => ui.show('collection', args.from));
      const up = $('#upg');
      if (up) up.onclick = () => {
        if (BB.Progress.upgrade(p, C, c.id)) { BB.save(); BB.audio.play('victory'); ui.show('card', args); ui.toast(T('ui.upgraded', BB.Progress.owned(p, c.id).level)); }
        else { BB.audio.play('error'); ui.toast(T('ui.cant_upgrade')); }
      };
    },

    // ------------------------------------------------------------ baralho
    deck(state) {
      const p = BB.profile, C = BB.content, size = C.balance.deckSize;
      const s = state || { idx: p.activeDeck, work: p.decks[p.activeDeck].slice() };
      const byCost = (a, b) => C.card(a).cost - C.card(b).cost || BB.cardName(a).localeCompare(BB.cardName(b));
      if (!s.keep) s.work.sort(byCost); // ao entrar na tela: em ordem de mana; nas trocas a carta fica no lugar
      s.keep = false;
      const valid = BB.DeckRules.validate(s.work, C, p) === 'Ok';
      // baralho: cada criatura aparece já invocada, andando sobre um pedestal (feitiços mostram o efeito)
      const slots = s.work.map((id) => {
        const def = C.card(id), o = BB.Progress.owned(p, id);
        return `<div class="ped ${def.rarity}" data-deck="${id}"><canvas width="180" height="150" data-unit="${id}"></canvas><div class="ped-base"></div>
          <div class="cost">${def.cost}</div><div class="ped-lv">${T('ui.level', o ? o.level : 1)}</div><div class="ped-name">${esc(BB.cardName(id))}</div></div>`;
      }).join('') + '<div class="ped empty" data-empty="1"></div>'.repeat(Math.max(0, size - s.work.length));
      const avail = C.collectible.filter((c) => BB.Progress.owned(p, c.id) && !s.work.includes(c.id)).sort((a, b) => byCost(a.id, b.id));
      screen('deck', topbar(T('ui.deck_title', s.idx + 1), true) + `
        <div class="deckinfo"><div class="tabs">${[0, 1, 2].map((i) => `<button class="btn small ${i === s.idx ? 'on' : ''}" data-tab="${i}">${i + 1}</button>`).join('')}</div>
          <b style="flex:1">${T('ui.deck_count', s.work.length, size, BB.DeckRules.averageCost(s.work, C).toFixed(1))}</b>
          <button class="btn green small" id="saveDeck" ${valid ? '' : 'disabled'}>${T('ui.save')}</button></div>
        <div class="deckzone">${slots}</div>
        <div class="content deckcoll"><p class="muted center" style="margin:0 0 .6rem">${T('ui.deck_drag_swap')}</p><div class="grid row1" id="collRow">${avail.map((c) => ui.cardHtml(c, BB.Progress.owned(p, c.id), { level: true, attrs: 'data-coll="' + c.id + '"' })).join('')}</div></div>`);
      bindBack('deck', () => { ui.closeCardMenu(); ui.show('menu'); });
      BB.art.animatePreviews(app());
      const row = $('#collRow');
      if (s.scroll) row.scrollLeft = s.scroll; // a coleção continua no mesmo lugar depois da troca
      const redraw = () => { s.scroll = row.scrollLeft; s.keep = true; ui.closeCardMenu(); ui.show('deck', s); };
      const swap = (inId, outId) => {
        const i = outId ? s.work.indexOf(outId) : -1;
        if (inId && i >= 0) s.work[i] = inId;                          // troca no mesmo lugar
        else if (outId) s.work = s.work.filter((x) => x !== outId);     // só remover
        else if (inId && !s.work.includes(inId)) { if (s.work.length >= size) { BB.audio.play('error'); ui.toast(T('ui.deck_invalid', size)); return; } s.work.push(inId); }
        BB.audio.play('card'); redraw();
      };
      app().querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { BB.audio.play('click'); const i = +b.dataset.tab; ui.closeCardMenu(); ui.show('deck', { idx: i, work: p.decks[i].slice() }); });
      // tocar = menu (Informações / Remover / Adicionar); arrastar a carta da coleção para um pedestal = trocar
      const bindDrag = (el, id, fromDeck) => {
        let st = null, ghost = null;
        el.addEventListener('pointerdown', (e) => { st = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
        el.addEventListener('pointermove', (e) => {
          if (!st || ghost) return;
          const dx = e.clientX - st.x, dy = e.clientY - st.y;
          if (Math.hypot(dx, dy) < 14) return;
          if (!fromDeck && Math.abs(dx) > Math.abs(dy)) { st = null; return; } // deslizou para o lado: rola a coleção
          ui.closeCardMenu();
          const r = el.getBoundingClientRect();
          ghost = el.cloneNode(true); ghost.classList.add('deck-ghost'); ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px';
          document.body.appendChild(ghost); el.classList.add('lifted');
          try { el.setPointerCapture(e.pointerId); } catch (_) {}
        });
        document.addEventListener('pointermove', (e) => {
          if (!ghost) return;
          ghost.style.left = e.clientX - ghost.offsetWidth / 2 + 'px'; ghost.style.top = e.clientY - ghost.offsetHeight * 0.6 + 'px';
          const t = document.elementFromPoint(e.clientX, e.clientY), ped = t && t.closest && t.closest('.ped');
          app().querySelectorAll('.ped.target').forEach((x) => x.classList.remove('target'));
          if (ped && !fromDeck) ped.classList.add('target');
        });
        el.addEventListener('pointerup', (e) => {
          if (ghost) {
            ghost.remove(); ghost = null; el.classList.remove('lifted');
            app().querySelectorAll('.ped.target').forEach((x) => x.classList.remove('target'));
            const t = document.elementFromPoint(e.clientX, e.clientY);
            const ped = t && t.closest && t.closest('.ped'), coll = t && t.closest && t.closest('.deckcoll');
            if (!fromDeck && ped) swap(id, ped.dataset.deck || null);
            else if (fromDeck && coll) swap(null, id);
            st = null; return;
          }
          if (st) ui.cardMenu(el, id, fromDeck ? [{ label: T('ui.remove'), fn: () => swap(null, id) }]
            : s.work.length < size ? [{ label: T('ui.add'), fn: () => swap(id, null) }] : []);
          st = null;
        });
        el.addEventListener('pointercancel', () => { st = null; if (ghost) { ghost.remove(); ghost = null; el.classList.remove('lifted'); } });
      };
      app().querySelectorAll('[data-deck]').forEach((el) => bindDrag(el, el.dataset.deck, true));
      app().querySelectorAll('[data-coll]').forEach((el) => bindDrag(el, el.dataset.coll, false));
      $('#saveDeck').onclick = () => {
        if (BB.DeckRules.validate(s.work, C, p) !== 'Ok') { ui.toast(T('ui.deck_invalid', size)); return; }
        p.decks[s.idx] = s.work.slice(); p.activeDeck = s.idx; BB.save(); BB.audio.play('click'); ui.toast(T('ui.deck_saved'));
      };
    },

    // ------------------------------------------------------------ histórico
    history() {
      const p = BB.profile;
      const rows = p.history.map((r) => {
        const cls = r.result > 0 ? 'win' : r.result < 0 ? 'loss' : 'draw';
        const res = T(r.result > 0 ? 'result.victory' : r.result < 0 ? 'result.defeat' : 'result.draw');
        const d = new Date(r.date);
        return `<div class="hist ${cls}"><b style="width:9rem">${res}</b><span style="flex:1">${BB.baronName(r.baron)} × ${BB.baronName(r.opponentBaron)}</span>
          <span>${Math.round(r.myPct * 100)}% / ${Math.round(r.foePct * 100)}%</span><span>${Math.floor(r.seconds / 60)}:${String(r.seconds % 60).padStart(2, '0')}</span>
          <span class="muted">${T('ui.' + r.mode.replace('training_', ''))}</span><span class="muted">${d.toLocaleDateString()}</span></div>`;
      }).join('');
      screen('history', topbar(T('ui.history'), true) + `<div class="content"><p class="center" style="color:var(--gold);font-weight:800;font-size:1.3rem">
        ${T('history.stats', p.battles, p.wins, p.losses, p.draws, p.bestWinStreak)}</p>${rows || `<p class="center muted">${T('history.empty')}</p>`}</div>`);
      bindBack('history', () => ui.show('menu'));
    },

    // ------------------------------------------------------------ configurações
    settings() {
      const p = BB.profile;
      const pct = (v) => Math.round(v * 100) + '%';
      screen('settings', topbar(T('ui.settings'), true) + `<div class="content"><div class="settings">
        <div class="setrow">${T('settings.name')}<input id="nm" maxlength="16" value="${esc(p.playerName)}"></div>
        <div class="setrow">${T('settings.music')}: ${pct(p.music)}<span><button class="btn small" data-v="music:-1">−</button> <button class="btn small" data-v="music:1">+</button></span></div>
        <div class="setrow">${T('settings.sfx')}: ${pct(p.sfx)}<span><button class="btn small" data-v="sfx:-1">−</button> <button class="btn small" data-v="sfx:1">+</button></span></div>
        <div class="setrow">${T('settings.vibration')}<button class="btn small" id="vib">${p.vibration ? T('ui.on') : T('ui.off')}</button></div>
        <div class="setrow">${T('settings.language')}<button class="btn small" id="lang">${BB.LANGS.find((l) => l.id === BB.lang()).name}</button></div>
        <div class="setrow">${T('settings.privacy')}<button class="btn small dark" id="priv">${T('settings.view')}</button></div>
        <div class="setrow">${T('settings.credits')}<button class="btn small dark" id="cred">${T('settings.view')}</button></div>
        <div class="setrow">${T('settings.reset')}<button class="btn small red" id="reset">${T('settings.reset')}</button></div>
        <p class="muted center">v${BB.VERSION.name} • ID ${p.playerId}</p></div></div>`);
      bindBack('settings', () => ui.show('menu'));
      $('#nm').onchange = (e) => { const v = e.target.value.trim(); if (v.length >= 2) { p.playerName = v.slice(0, 16); BB.save(); } };
      app().querySelectorAll('[data-v]').forEach((b) => b.onclick = () => {
        const [k, d] = b.dataset.v.split(':');
        p[k] = Math.max(0, Math.min(1, Math.round((p[k] + 0.1 * d) * 10) / 10));
        BB.audio.setVolumes(p.music, p.sfx); BB.save(); BB.audio.play('click'); ui.refresh();
      });
      $('#vib').onclick = () => { p.vibration = !p.vibration; BB.save(); BB.vibrate(40); ui.refresh(); };
      $('#lang').onclick = () => {
        const i = BB.LANGS.findIndex((l) => l.id === BB.lang());
        p.language = BB.LANGS[(i + 1) % BB.LANGS.length].id; BB.setLang(p.language); BB.save(); BB.audio.play('click'); ui.refresh();
      };
      $('#priv').onclick = () => ui.modal(T('settings.privacy'), T('settings.privacy_text'));
      $('#cred').onclick = () => ui.modal(T('settings.credits'), T('settings.credits_text'));
      $('#reset').onclick = () => ui.modal(T('settings.reset'), T('settings.reset_confirm'), [
        { label: T('battle.yes'), cls: 'red', fn: () => { BB.Progress.wipe(); BB.profile = BB.Progress.load(BB.content); BB.setLang(BB.detectLang()); ui.show('splash'); } },
        { label: T('battle.no'), cls: 'dark' },
      ]);
    },

    // ------------------------------------------------------------ resultado
    result(a) {
      const C = BB.content, b = C.balance, r = a.rewards;
      const key = a.result > 0 ? 'result.victory' : a.result < 0 ? 'result.defeat' : 'result.draw';
      let card = '';
      if (r.cardId) {
        const def = C.card(r.cardId);
        card = `<div class="reward-card">${ui.cardHtml(def, BB.Progress.owned(BB.profile, def.id), { level: true })}
          <b style="color:var(--${def.rarity.toLowerCase()})">${T(r.newCard ? 'result.new_card' : 'result.card', BB.cardName(def.id), T('rarity.' + def.rarity))}</b></div>`;
      }
      const unl = r.unlocked.map((u) => `<div style="color:#5fd06d;font-weight:800">${T('result.unlocked', u.startsWith('baron:') ? BB.baronName(u.slice(6)) : BB.castleName(u.slice(7)))}</div>`).join('');
      const odds = [0, 1, 2, 3, 4].map((i) => (BB.Progress.rarityChance(b, i) * 100).toFixed(1).replace('.0', '') + '%');
      screen('result', `<h1 class="title big" style="${a.result < 0 ? 'filter:hue-rotate(-40deg) saturate(1.4)' : ''}">${T(key)}</h1>
        <div class="reason">${T('result.reason.' + a.reason)}</div>
        <div class="cols"><div class="panel"><h3 class="title">${T('result.stats')}</h3>
          <div>${T('result.castle_left', Math.round(a.myPct * 100), Math.round(a.foePct * 100))}</div>
          <div>${T('result.cards_played', a.stats.cardsPlayed)}</div><div>${T('result.castle_damage', Math.round(a.stats.damageToCastle))}</div>
          <div>${T('result.units_destroyed', a.stats.unitsDestroyed)}</div></div>
        <div class="panel"><h3 class="title">${T('result.rewards')}</h3><div style="color:var(--gold);font-weight:800">${T('result.gold', r.gold)}</div>
          <div style="color:#8fc8ff;font-weight:800">${T('result.xp', r.xp)}</div>${r.levels ? `<div style="color:#5fd06d;font-weight:800">${T('result.level_up', BB.profile.accountLevel)}</div>` : ''}${unl}${card}
          <div class="odds">${T('result.odds', ...odds, b.pityThreshold)}</div></div></div>
        <div class="actions"><button class="btn green" data-go="menu">${T('result.continue')}</button><button class="btn gold" id="again">⚔ ${T('result.again')}</button></div>`);
      $('#again').onclick = () => { BB.audio.play('click'); ui.show('battle', { difficulty: a.difficulty }); };
      back.result = () => ui.show('menu');
      BB.audio.music('menu');
      if (r.cardId || (r.unlocked && r.unlocked.length)) setTimeout(() => BB.audio.jingle('reward'), 400); // recompensa: brilho mágico
    },
  };

  // ilustração do castelo nas telas de seleção (mesmo estilo do campo)
  const CASTLE_CARDS = ['royal_fortress', 'glacial_fortress', 'draconic_castle', 'sylvan_sanctuary', 'shadow_necropolis'];
  function drawCastlePreview(cv, def) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    if (CASTLE_CARDS.includes(def.id)) { // quadro ilustrado do castelo (moldura dourada própria)
      const im = BB.art.image('img/castle_cards/' + def.id + '.webp');
      const put = () => { g.clearRect(0, 0, W, H); const k = Math.min(W / im.naturalWidth, H / im.naturalHeight); const w = im.naturalWidth * k, h = im.naturalHeight * k; g.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); };
      if (im.complete && im.naturalWidth) put(); else im.addEventListener('load', put, { once: true });
      cv.style.background = 'transparent'; cv.style.border = 'none'; cv.style.boxShadow = 'none';
      return;
    }
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#5fb3f0'); grd.addColorStop(1, '#bfe6ff');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = '#5daa3c'; g.fillRect(0, H * 0.82, W, H * 0.18);
    const art = BB.CASTLES_ART && BB.CASTLES_ART[def.id];
    if (art) { // arte do castelo (vista 3/4), centralizada no quadro
      const im = BB.art.image('img/castles/' + def.id + '.webp');
      const put = () => { const k = Math.min((W * 0.92) / art.w, (H * 0.94) / art.h); g.drawImage(im, (W - art.w * k) / 2, H - art.h * k - H * 0.02, art.w * k, art.h * k); };
      if (im.complete && im.naturalWidth) { put(); return; }
      im.addEventListener('load', put, { once: true });
      return;
    }
    const stone = def.stoneColor, roof = def.roofColor;
    g.fillStyle = stone; g.fillRect(W * 0.15, H * 0.5, W * 0.7, H * 0.33);
    for (const [x, w, h] of [[0.22, 0.16, 0.45], [0.78, 0.16, 0.45], [0.5, 0.24, 0.6]]) {
      const tx = W * x, tw = W * w, top = H * 0.83 - H * h;
      g.fillStyle = stone; g.fillRect(tx - tw / 2, top, tw, H * h);
      g.fillStyle = '#f2b636'; g.fillRect(tx - tw * 0.6, top - 4, tw * 1.2, 8);
      g.fillStyle = roof; g.beginPath(); g.moveTo(tx - tw * 0.62, top - 4); g.lineTo(tx, top - H * h * 0.45); g.lineTo(tx + tw * 0.62, top - 4); g.fill();
      g.fillStyle = '#ffc85a'; g.fillRect(tx - tw * 0.12, top + H * h * 0.2, tw * 0.24, H * h * 0.12);
    }
    g.fillStyle = '#4a3020'; g.fillRect(W * 0.44, H * 0.66, W * 0.12, H * 0.17);
    g.strokeStyle = '#f2b636'; g.lineWidth = 4; g.strokeRect(W * 0.44, H * 0.66, W * 0.12, H * 0.17);
  }

  BB.ui = ui;
})(window.BB);

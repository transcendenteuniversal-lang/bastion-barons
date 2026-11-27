// Tela da loja (abas: Ofertas, Baús, Skins, Cristais) e a comemoração da vitória.
(function (BB) {
  'use strict';
  const T = (...a) => BB.T(...a);
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => BB.esc(s);
  const S = () => BB.Shop;
  const day = () => BB.Progress.today();
  const TABS = ['offers', 'chests', 'skins', 'gems'];
  const TAB_ICO = { offers: 'chest_red', chests: 'chest_blue', skins: 'helmet', gems: 'diamond' };
  const PACK_TAG = ['', '', 'hot', 'best'];
  const PACK_IMG = ['pack1', 'pack2', 'pack3', 'pack4'], PACK_BONUS = [0, 10, 20, 30];
  const sect = (t) => `<div class="sect"><span>${t}</span></div>`;
  const CHEST_ICON = { wood: '<img src="img/ui2/chest_red.webp" alt="">', iron: '<img src="img/ui2/chest_blue.webp" alt="">', royal: '<img src="img/ui2/pack4.webp" alt="">' };
  let tab = 'offers', skinType = 'baron';

  const SU = {
    screen(args) {
      if (args && args.tab) tab = args.tab;
      const p = BB.profile;
      BB.ui.h.screen('shop', BB.ui.h.topbar(T('shop.title'), true) + `
        <div class="sh-tabs">${TABS.map((t) => `<button class="tabb ${t === tab ? 'on' : ''}" data-tab="${t}"><img src="img/ui2/${TAB_ICO[t]}.webp" alt=""><span>${T('shop.tab_' + t)}</span></button>`).join('')}</div>
        <div class="sh-body" id="shBody"></div>`, 'img/ui2/bg_shop.webp');
      BB.ui.h.bindBack('shop', () => BB.ui.show('menu'));
      document.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { BB.audio.play('click'); tab = b.dataset.tab; BB.ui.show('shop'); });
      BB.audio.music('menu');
      SU[tab](p, $('#shBody'));
    },
    refresh() { BB.save(); BB.ui.show('shop'); },
    toast(r) { BB.ui.toast(r === 'NoFunds' ? T('shop.no_funds') : T('rk.error')); BB.audio.play('error'); },

    // ------------------------------------------------------------ ofertas do dia + pacote inicial
    offers(p, el) {
      const d = day(), list = S().offers(p, BB.content, d);
      const now = new Date(), hrs = 24 - now.getHours();
      const st = S().STARTER;
      el.innerHTML = `${sect('<img src="img/ui4/hourglass.webp" alt="">' + T('shop.daily') + ' · ' + T('shop.refresh', hrs))}
        <div class="sh-row of-row">${list.map((o, i) => { const def = BB.content.card(o.id), bought = S().offerBought(p, d, i);
          return `<div class="of-item ${def.rarity} ${bought ? 'sold' : ''}">${i === 1 && !bought ? `<i class="sh-tag hot">${T('shop.hot')}</i>` : ''}
            ${BB.ui.cardHtml(def, BB.Progress.owned(p, o.id), { level: true })}
            <button class="pbtn ${bought ? 'done' : ''}" data-offer="${i}" ${bought ? 'disabled' : ''}>${bought ? '✓ ' + T('shop.bought') : '<img src="img/ui4/coins.webp" alt="">' + o.price}</button></div>`; }).join('')}</div>
        <div class="st-pack"><div class="st-lbl"><img src="img/ui4/laurel.webp" alt=""><span>${T('shop.starter')}</span></div><img class="sh-tag2" src="img/ui4/tag_pct.webp" alt="">
          <img class="st-chest" src="img/ui4/chest_open.webp" alt="">
          <div class="st-items"><span><img src="img/ui4/gems.webp" alt=""><b>${st.crystals}</b></span><i>+</i><span><img src="img/ui4/coins.webp" alt=""><b>${st.gold}</b></span><i>+</i>
            <span><img src="img/cards/fire_dragon.webp" class="st-card" alt=""><b>${T('rarity.Epic')}</b></span><i>+</i><span><img src="img/ui2/t_person.webp" alt=""><b>${T('shop.avatar_short')}</b></span></div>
          <button class="st-buy" disabled><img src="img/ui4/btn_cart.webp" alt=""><span>${st.price}</span><small>${T('shop.soon')}</small></button></div>`;
      el.querySelectorAll('[data-offer]').forEach((b) => b.onclick = () => {
        const r = S().buyOffer(p, BB.content, d, Number(b.dataset.offer));
        if (r === 'Ok') { BB.audio.jingle('reward'); SU.refresh(); } else if (r === 'NoFunds') BB.ui.toast(T('shop.no_gold')); else SU.toast(r);
      });
    },

    // ------------------------------------------------------------ baús (com as chances na tela)
    chests(p, el) {
      const b = BB.content.balance;
      const odds = [0, 1, 2, 3, 4].map((i) => (BB.Progress.rarityChance(b, i) * 100).toFixed(1).replace('.0', '') + '%');
      const IMG = { wood: 'ui2/chest_red', iron: 'ui4/chest_blue', royal: 'ui4/chest_purple' }, TAG = { iron: 'hot', royal: 'best' };
      el.innerHTML = `${sect('<img src="img/ui4/cards.webp" alt="">' + T('shop.tab_chests'))}<div class="sh-row">${S().CHESTS.map((c) => `<div class="ch-card ${c.id}">${TAG[c.id] ? `<i class="sh-tag ${TAG[c.id]}">${T('shop.' + TAG[c.id])}</i>` : ''}
          <div class="ch-glow"></div><img class="ch-img" src="img/${IMG[c.id]}.webp" alt="">
          <h3 class="title">${T('shop.chest_' + c.id)}</h3><div class="ch-n"><img src="img/ui4/cards.webp" alt="">${T('shop.chest_cards', c.cards)}</div>
          <div class="ch-min">${c.minRarity ? T('shop.chest_min' + c.minRarity) : '&nbsp;'}</div>
          <button class="pbtn" data-chest="${c.id}"><img src="img/ui4/${c.cost.gold ? 'coins' : 'gems'}.webp" alt="">${c.cost.gold || c.cost.crystals}</button></div>`).join('')}</div>
        <p class="sh-odds">${T('shop.odds', ...odds)}</p>`;
      el.querySelectorAll('[data-chest]').forEach((btn) => btn.onclick = () => {
        const c = S().chest(btn.dataset.chest);
        if (!S().canPay(p, c.cost)) { BB.ui.toast(c.cost.gold ? T('shop.no_gold') : T('shop.no_funds')); BB.audio.play('error'); return; }
        const ids = S().openChest(p, BB.content, c.id, new BB.Rng(Date.now() & 0x7fffffff));
        BB.save(); SU.reveal(ids, () => BB.ui.show('shop'));
      });
    },
    reveal(ids, after) {
      const ov = document.getElementById('overlay'), m = document.createElement('div');
      m.className = 'modal';
      m.innerHTML = `<div class="panel sh-reveal"><h2 class="title">${T('shop.got')}</h2>
        <div class="sh-cards">${ids.map((id, i) => `<div class="sh-card" style="animation-delay:${i * 0.12}s">${BB.ui.cardHtml(BB.content.card(id), BB.Progress.owned(BB.profile, id), { level: true })}</div>`).join('')}</div>
        <div class="acts"><button class="btn gold" data-cancel="1">${T('rk.ok')}</button></div></div>`;
      m.querySelector('button').onclick = () => { BB.audio.play('click'); m.remove(); if (after) after(); };
      ov.appendChild(m); BB.audio.jingle('reward');
    },

    // ------------------------------------------------------------ skins
    preview(p, sk) {
      if (sk.type === 'baron') return `<img class="sh-pv" src="${sk.src || BB.art.baronUrl(sk.target)}" style="${sk.filter && !sk.src ? 'filter:' + sk.filter : ''}" alt="">`;
      if (sk.type === 'troop') return `<img class="sh-pv" src="${sk.src || BB.art.cardUrl(BB.content.card(sk.target))}" style="${sk.filter && !sk.src ? 'filter:' + sk.filter : ''}" alt="">`;
      if (sk.type === 'castle') return `<canvas class="sh-pv" data-skcastle="${sk.target}" data-filter="${sk.filter || ''}" width="240" height="240"></canvas>`;
      if (sk.type === 'avatar') return `<img class="sh-pv round" src="${sk.src}" alt="">`;
      return `<div class="sh-pv sh-fx ${sk.type}">${sk.fx.map((e) => '<span>' + e + '</span>').join('')}</div>`;
    },
    targetName(sk) {
      if (sk.type === 'baron') return BB.baronName(sk.target);
      if (sk.type === 'castle') return BB.castleName(sk.target);
      if (sk.type === 'troop') return BB.cardName(sk.target);
      return '';
    },
    skins(p, el) {
      const list = S().SKINS.filter((s) => s.type === skinType);
      el.innerHTML = `<div class="sh-chips">${S().TYPES.map((t) => `<button class="chip ${t === skinType ? 'on' : ''}" data-type="${t}">${T('shop.t_' + t)}</button>`).join('')}</div>
        <div class="sh-grid">${list.map((sk) => {
          const own = S().owns(p, sk.id), on = S().isEquipped(p, sk.id), tn = SU.targetName(sk);
          const btn = on ? `<button class="btn green small" data-skin="${sk.id}">${T('shop.in_use')}</button>`
            : own ? `<button class="pbtn blue" data-skin="${sk.id}">${T('shop.use')}</button>`
              : `<button class="pbtn" data-skin="${sk.id}"><img src="img/ui4/gems.webp" alt="">${sk.price}</button>`;
          return `<div class="gpanel sh-skin ${sk.tier}">${SU.preview(p, sk)}<b>${esc(S().name(sk))}</b>
            <small>${T('shop.tier_' + sk.tier)}${tn ? ' · ' + T('shop.for', esc(tn)) : ''}</small>${btn}</div>`; }).join('')}</div>`;
      el.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => { BB.audio.play('click'); skinType = b.dataset.type; BB.ui.show('shop'); });
      el.querySelectorAll('[data-skcastle]').forEach((cv) => { BB.ui.drawCastlePreview(cv, BB.content.castle(cv.dataset.skcastle)); cv.style.filter = cv.dataset.filter; });
      el.querySelectorAll('[data-skin]').forEach((b) => b.onclick = () => {
        const sk = S().skin(b.dataset.skin);
        if (S().owns(p, sk.id)) { BB.audio.play('click'); S().equip(p, sk.id); SU.refresh(); return; }
        if (p.crystals < sk.price) { BB.ui.toast(T('shop.no_funds')); BB.audio.play('error'); return; }
        BB.ui.modal(T('shop.buy'), T('shop.confirm', S().name(sk), sk.price), [
          { label: T('shop.buy'), cls: 'gold', fn: () => { const r = S().buySkin(p, sk.id); if (r === 'Ok') { BB.audio.jingle('reward'); SU.refresh(); } else SU.toast(r); } },
          { label: T('shop.cancel'), cls: 'dark' },
        ]);
      });
    },

    // ------------------------------------------------------------ cristais e ouro
    gems(p, el) {
      el.innerHTML = `${sect(T('shop.gold_title'))}
        <div class="sh-row">${S().GOLD_PACKS.map((g, i) => `<div class="gpanel sh-gold">${i ? `<i class="sh-tag best">${T('shop.best')}</i>` : ''}<img src="img/ui4/${i ? 'coins_big' : 'coins'}.webp" alt=""><b class="title">${g.gold.toLocaleString()}</b>
          <button class="pbtn" data-gold="${g.id}"><img src="img/ui4/gems.webp" alt="">${g.crystals}</button></div>`).join('')}</div>
        ${sect(T('shop.gems_title'))}
        <div class="sh-row">${S().CRYSTAL_PACKS.map((c, i) => `<div class="gpanel sh-pack ${PACK_TAG[i]}">${PACK_TAG[i] ? `<i class="sh-tag ${PACK_TAG[i]}">${T('shop.' + PACK_TAG[i])}</i>` : ''}${PACK_BONUS[i] ? `<i class="bonus">+${PACK_BONUS[i]}%</i>` : ''}
          <img src="img/ui2/${PACK_IMG[i]}.webp" alt=""><b class="title">${c.crystals.toLocaleString()}</b><button class="pbtn green" disabled>${c.price}</button></div>`).join('')}</div>
        <p class="sh-note"><img src="img/ui/info.webp" alt="">${T('shop.real_note')}</p>`;
      el.querySelectorAll('[data-gold]').forEach((b) => b.onclick = () => {
        const r = S().buyGold(p, b.dataset.gold);
        if (r === 'Ok') { BB.audio.jingle('reward'); SU.refresh(); } else SU.toast(r);
      });
    },

    // ------------------------------------------------------------ seletor de skin em cada item (Barão, castelo, carta, perfil)
    thumb(sk, type, target) {
      const p = BB.profile, f = sk && sk.filter && !sk.src ? ' style="filter:' + sk.filter + '"' : '';
      if (type === 'celebration' || type === 'emotes') return `<span class="sk-emo">${sk.fx.slice(0, 3).join('')}</span>`;
      if (type === 'avatar') { const pic = sk ? { src: sk.src, style: '' } : S().baronPic(p, p.selectedBaron); return `<img src="${pic.src}" style="${pic.style}" alt="">`; }
      if (type === 'baron') return `<img src="${sk && sk.src ? sk.src : BB.art.baronUrl(target)}"${f} alt="">`;
      if (type === 'castle') return `<img src="${sk && sk.src ? sk.src : 'img/castle_cards/' + target + '.webp'}"${f} alt="">`;
      return `<img src="${sk && sk.src ? sk.src : BB.art.cardUrl(BB.content.card(target))}"${f} alt="">`;
    },
    pickerHtml(type, target) {
      const p = BB.profile, list = S().forTarget(type, target);
      if (!list.length) return '';
      const cur = S().equipped(p, type, target);
      const opts = (type === 'celebration' || type === 'emotes' ? [] : [null]).concat(list);
      return `<div class="sk-pick" data-type="${type}" data-target="${target || ''}">${opts.map((sk) => {
        const own = !sk || S().owns(p, sk.id), on = sk ? cur === sk : !cur;
        return `<button class="sk-opt ${on ? 'on' : ''} ${own ? '' : 'locked'}" data-sk="${sk ? sk.id : ''}" title="${esc(sk ? S().name(sk) : T('shop.default'))}">
          ${SU.thumb(sk, type, target)}<small>${own ? esc(sk ? S().name(sk) : T('shop.default')) : '💎 ' + sk.price}</small></button>`; }).join('')}</div>`;
    },
    // tocar numa skin que tem: usa; no "Padrão": volta ao normal; numa que não tem: abre a loja nessa categoria
    bindPickers(root, after) {
      (root || document).querySelectorAll('.sk-pick .sk-opt').forEach((b) => b.onclick = (e) => {
        e.stopPropagation();
        const box = b.closest('.sk-pick'), type = box.dataset.type, target = box.dataset.target || null, id = b.dataset.sk, p = BB.profile;
        if (!id) { BB.audio.play('click'); S().unequip(p, type, target); BB.save(); if (after) after(); return; }
        if (!S().owns(p, id)) { BB.audio.play('click'); skinType = type; tab = 'skins'; BB.ui.show('shop'); return; }
        BB.audio.play('click'); S().st(p).equip[type + (target ? ':' + target : '')] = id; BB.save(); if (after) after();
      });
    },

    // ------------------------------------------------------------ perfil (foto, números e "Minhas skins")
    profile(arg) {
      const p = BB.profile, b = BB.content.balance, need = BB.Progress.xpForNext(b, p.accountLevel);
      if (arg && arg.tab) SU.pfTab = arg.tab;
      const ptab = SU.pfTab || 'custom';
      const owned = BB.content.collectible.filter((c) => BB.Progress.owned(p, c.id)).length;
      const mySkins = S().SKINS.filter((sk) => !sk.free && S().owns(p, sk.id)).length;
      const sect = (ico, title, html) => (html ? `<h3 class="pf-h"><img src="img/${ico}.webp" alt="">${title}</h3>${html}` : '');
      const group = (type, items) => `<div class="pf-grp">${items.map((it) => { const h = SU.pickerHtml(type, it.id); return h ? `<div class="pf-g"><div class="pf-tgt">${esc(it.name)}</div>${h}</div>` : ''; }).join('')}</div>`;
      const stat = (ico, k, v) => `<div class="pf-st"><img src="img/${ico}.webp" alt=""><div><small>${k}</small><b>${v}</b></div></div>`;
      let body = '';
      if (ptab === 'custom') body = sect('ui2/stall', T('shop.t_avatar'), SU.pickerHtml('avatar')) + sect('ui2/party', T('shop.t_celebration'), SU.pickerHtml('celebration'))
        + sect('ui2/star', T('shop.t_emotes'), SU.pickerHtml('emotes'))
        + sect('ui2/crown', T('shop.t_baron'), group('baron', BB.content.barons.map((x) => ({ id: x.id, name: BB.baronName(x.id) }))))
        + sect('ui/castle', T('shop.t_castle'), group('castle', BB.content.castles.map((x) => ({ id: x.id, name: BB.castleName(x.id) }))))
        + sect('ui/cards', T('shop.t_troop'), group('troop', [...new Set(S().SKINS.filter((sk) => sk.type === 'troop').map((sk) => sk.target))].map((id) => ({ id, name: BB.cardName(id) }))));
      else if (ptab === 'stats') {
        const H = p.history, rk = BB.RankedUI ? BB.RankedUI.data().st : null;
        const fav = {}; H.forEach((r) => { fav[r.baron] = (fav[r.baron] || 0) + 1; });
        const favB = Object.keys(fav).sort((a, c) => fav[c] - fav[a])[0];
        const winPct = p.battles ? Math.round((p.wins / p.battles) * 100) + '%' : '—';
        const avgT = H.length ? Math.round(H.reduce((a, r) => a + (r.seconds || 0), 0) / H.length) : 0;
        body = `<div class="pf-stats2">${stat('ui2/i_battles', T('profile.battles'), p.battles)}${stat('ui2/i_wins', T('profile.wins'), p.wins)}${stat('ui2/i_swords_red', T('profile.losses'), p.losses)}
          ${stat('ui2/i_draws', T('rk.draws'), p.draws)}${stat('ui2/crown_laurel', T('profile.win_rate'), winPct)}${stat('ui/fire', T('profile.best_streak'), p.bestWinStreak)}
          ${stat('ui2/hourglass', T('profile.avg_time'), avgT ? Math.floor(avgT / 60) + ':' + String(avgT % 60).padStart(2, '0') : '—')}${stat('ui2/crown', T('profile.fav_baron'), favB ? BB.baronName(favB) : '—')}
          ${rk ? stat('ui2/mode_ranked', T('profile.ranked_pts'), rk.points) + stat('ui2/trophy', T('rk.trophies'), rk.trophies) : ''}</div>`;
      } else body = `<div class="pf-soon"><img src="img/ui2/trophy_laurel.webp" alt=""><h3 class="title">${T('profile.tab_ach')}</h3><p>${T('ui.coming_soon')}</p></div>`;
      const TABS = [['custom', 'ui2/t_person'], ['stats', 'ui2/t_chart'], ['ach', 'ui2/t_laurel'], ['settings', 'ui2/t_gear']];
      BB.ui.h.screen('profile', BB.ui.h.topbar(T('profile.title'), true, { logo: true }) + `<div class="pf">
        <div class="gpanel pf-left"><div class="pf-av">${S().img(S().avatarPic(p), 'pf-avatar')}<img class="pf-frame" src="img/ui/frame_round.webp" alt=""></div>
          <h2 class="title pf-name">${esc(BB.playerName(p))}</h2><div class="pf-lv"><img src="img/ui2/crown_laurel.webp" alt="">${T('profile.level', p.accountLevel)}</div>
          <div class="lb-xp pf-xp"><i style="width:${(p.xp / need) * 100}%"></i></div><small class="muted">${p.xp} / ${need} XP</small>
          <div class="pf-tiles">${stat('ui2/i_battles', T('profile.battles'), p.battles)}${stat('ui2/trophy', T('profile.wins'), p.wins)}${stat('ui2/cancel', T('profile.losses'), p.losses)}
            ${stat('ui/fire', T('profile.best_streak'), p.bestWinStreak)}${stat('ui/cards', T('profile.cards'), owned + ' / ' + BB.content.collectible.length)}${stat('ui2/helmet', T('profile.skins'), mySkins + ' / ' + S().SKINS.filter((sk) => !sk.free).length)}</div>
          <button class="ibtn gold pf-more" id="pfShop"><img src="img/ui2/stall.webp" alt="">${T('profile.more_skins')}</button></div>
        <div class="gpanel pf-right"><div class="pf-tabs">${TABS.map(([t, ic]) => `<button class="tabb ${t === ptab ? 'on' : ''}" data-pt="${t}"><img src="img/${ic}.webp" alt=""><span>${T('profile.tab_' + t)}</span></button>`).join('')}</div>
          <div class="pf-body">${body}</div></div></div>`, 'img/ui2/bg_court.webp');
      BB.ui.h.bindBack('profile', () => BB.ui.show('menu'));
      $('#pfShop').onclick = () => { BB.audio.play('click'); tab = 'skins'; BB.ui.show('shop'); };
      document.querySelectorAll('[data-pt]').forEach((x) => x.onclick = () => {
        BB.audio.play('click');
        if (x.dataset.pt === 'settings') { BB.ui.show('settings'); return; }
        SU.pfTab = x.dataset.pt; BB.ui.show('profile');
      });
      const keep = () => { const sc = document.querySelector('.pf-body'), y = sc ? sc.scrollTop : 0; BB.ui.show('profile'); const n = document.querySelector('.pf-body'); if (n) n.scrollTop = y; };
      SU.bindPickers(document.getElementById('profile'), keep);
    },

    // ------------------------------------------------------------ comemoração da vitória (skin escolhida)
    celebrate() {
      const sk = S().equipped(BB.profile, 'celebration');
      if (!sk) return;
      const box = document.createElement('div'); box.className = 'celebrate';
      for (let i = 0; i < 38; i++) {
        const e = document.createElement('span');
        e.textContent = sk.fx[i % sk.fx.length];
        e.style.left = Math.random() * 100 + '%';
        e.style.animationDelay = (Math.random() * 1.6).toFixed(2) + 's';
        e.style.animationDuration = (2.2 + Math.random() * 1.4).toFixed(2) + 's';
        e.style.fontSize = (1.6 + Math.random() * 2.2).toFixed(1) + 'rem';
        box.appendChild(e);
      }
      document.body.appendChild(box);
      setTimeout(() => box.remove(), 5200);
    },
  };

  BB.ShopUI = SU;
  if (BB.ui && BB.ui.addScreen) { BB.ui.addScreen('shop', (a) => SU.screen(a)); BB.ui.addScreen('profile', (a) => SU.profile(a)); }
})(window.BB);

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
      const st = S().STARTER, sk = S().skin(st.skin);
      el.innerHTML = `${sect(T('shop.daily') + ' · ' + T('shop.refresh', hrs))}
        <div class="sh-row">${list.map((o, i) => { const def = BB.content.card(o.id), bought = S().offerBought(p, d, i);
          return `<div class="gpanel sh-item">${BB.ui.cardHtml(def, BB.Progress.owned(p, o.id), { level: true })}
            <button class="btn ${bought ? 'dark' : 'gold'} small" data-offer="${i}" ${bought ? 'disabled' : ''}>${bought ? T('shop.bought') : '🪙 ' + o.price}</button></div>`; }).join('')}</div>
        <div class="gpanel sh-starter"><div class="sh-big"><img src="img/ui2/pack4.webp" alt=""></div><div><h3 class="title">${T('shop.starter')}</h3>
          <p>${T('shop.starter_text', st.crystals, st.gold, esc(S().name(sk)))}</p></div>
          <button class="btn gold" disabled>${st.price} · ${T('shop.soon')}</button></div>`;
      el.querySelectorAll('[data-offer]').forEach((b) => b.onclick = () => {
        const r = S().buyOffer(p, BB.content, d, Number(b.dataset.offer));
        if (r === 'Ok') { BB.audio.jingle('reward'); SU.refresh(); } else if (r === 'NoFunds') BB.ui.toast(T('shop.no_gold')); else SU.toast(r);
      });
    },

    // ------------------------------------------------------------ baús (com as chances na tela)
    chests(p, el) {
      const b = BB.content.balance;
      const odds = [0, 1, 2, 3, 4].map((i) => (BB.Progress.rarityChance(b, i) * 100).toFixed(1).replace('.0', '') + '%');
      el.innerHTML = `${sect(T('shop.tab_chests'))}<div class="sh-row">${S().CHESTS.map((c) => `<div class="gpanel sh-chest"><div class="sh-big">${CHEST_ICON[c.id]}</div>
          <h3 class="title">${T('shop.chest_' + c.id)}</h3><div>${T('shop.chest_cards', c.cards)}</div>
          <div class="muted">${c.minRarity ? T('shop.chest_min' + c.minRarity) : '&nbsp;'}</div>
          <button class="btn gold" data-chest="${c.id}">${T('shop.open')} · ${c.cost.gold ? '🪙 ' + c.cost.gold : '💎 ' + c.cost.crystals}</button></div>`).join('')}</div>
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
      el.innerHTML = `<div class="sh-chips">${S().TYPES.map((t) => `<button class="btn small ${t === skinType ? '' : 'dark'}" data-type="${t}">${T('shop.t_' + t)}</button>`).join('')}</div>
        <div class="sh-grid">${list.map((sk) => {
          const own = S().owns(p, sk.id), on = S().isEquipped(p, sk.id), tn = SU.targetName(sk);
          const btn = on ? `<button class="btn green small" data-skin="${sk.id}">${T('shop.in_use')}</button>`
            : own ? `<button class="btn small" data-skin="${sk.id}">${T('shop.use')}</button>`
              : `<button class="btn gold small" data-skin="${sk.id}">💎 ${sk.price}</button>`;
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
        <div class="sh-row">${S().GOLD_PACKS.map((g, i) => `<div class="gpanel sh-gold"><img src="img/ui2/${i ? 'coins_big' : 'coins'}.webp" alt=""><b class="title">${g.gold.toLocaleString()}</b>
          <button class="ibtn gold" data-gold="${g.id}"><img src="img/ui2/diamond.webp" alt="">${g.crystals}</button></div>`).join('')}</div>
        ${sect(T('shop.gems_title'))}
        <div class="sh-row">${S().CRYSTAL_PACKS.map((c, i) => `<div class="gpanel sh-pack">${PACK_BONUS[i] ? `<i class="bonus">+${PACK_BONUS[i]}%</i>` : ''}
          <img src="img/ui2/${PACK_IMG[i]}.webp" alt=""><b class="title">${c.crystals.toLocaleString()}</b><button class="ibtn" disabled>${c.price}</button></div>`).join('')}</div>
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
    profile() {
      const p = BB.profile, b = BB.content.balance, need = BB.Progress.xpForNext(b, p.accountLevel);
      const owned = BB.content.collectible.filter((c) => BB.Progress.owned(p, c.id)).length;
      const mySkins = S().SKINS.filter((sk) => !sk.free && S().owns(p, sk.id)).length;
      const sect = (title, html) => (html ? `<h3 class="title pf-h">${title}</h3>${html}` : '');
      const group = (type, items) => items.map((it) => { const h = SU.pickerHtml(type, it.id); return h ? `<div class="pf-tgt">${esc(it.name)}</div>${h}` : ''; }).join('');
      BB.ui.h.screen('profile', BB.ui.h.topbar(T('profile.title'), true) + `<div class="pf">
        <div class="panel pf-left">${S().img(S().avatarPic(p), 'pf-avatar')}<h2 class="title">${esc(BB.playerName(p))}</h2>
          <div>${T('profile.level', p.accountLevel)}</div><div class="xpbar"><i style="width:${(p.xp / need) * 100}%"></i></div><small class="muted">${p.xp}/${need} XP</small>
          <div class="pf-stats">${[[T('profile.battles'), p.battles], [T('profile.wins'), p.wins], [T('profile.losses'), p.losses], [T('profile.best_streak'), p.bestWinStreak],
            [T('profile.cards'), owned + '/' + BB.content.collectible.length], [T('profile.skins'), mySkins + '/' + S().SKINS.filter((sk) => !sk.free).length]]
            .map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>
          <button class="btn gold small" data-go="shop">🛒 ${T('profile.more_skins')}</button></div>
        <div class="panel pf-right"><h2 class="title">${T('profile.my_skins')}</h2>
          ${sect(T('shop.t_avatar'), SU.pickerHtml('avatar'))}
          ${sect(T('shop.t_celebration'), SU.pickerHtml('celebration'))}
          ${sect(T('shop.t_emotes'), SU.pickerHtml('emotes'))}
          ${sect(T('shop.t_baron'), group('baron', BB.content.barons.map((x) => ({ id: x.id, name: BB.baronName(x.id) }))))}
          ${sect(T('shop.t_castle'), group('castle', BB.content.castles.map((x) => ({ id: x.id, name: BB.castleName(x.id) }))))}
          ${sect(T('shop.t_troop'), group('troop', [...new Set(S().SKINS.filter((sk) => sk.type === 'troop').map((sk) => sk.target))].map((id) => ({ id, name: BB.cardName(id) }))))}
        </div></div>`);
      BB.ui.h.bindBack('profile', () => BB.ui.show('menu'));
      document.querySelectorAll('#profile [data-go]').forEach((x) => x.onclick = () => { BB.audio.play('click'); tab = 'skins'; BB.ui.show('shop'); });
      const keep = () => { const sc = document.querySelector('.pf-right'), y = sc ? sc.scrollTop : 0; BB.ui.show('profile'); const n = document.querySelector('.pf-right'); if (n) n.scrollTop = y; };
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
  if (BB.ui && BB.ui.addScreen) { BB.ui.addScreen('shop', (a) => SU.screen(a)); BB.ui.addScreen('profile', () => SU.profile()); }
})(window.BB);

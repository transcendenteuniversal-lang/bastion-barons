// Tela da loja (abas: Ofertas, Baús, Skins, Cristais) e a comemoração da vitória.
(function (BB) {
  'use strict';
  const T = (...a) => BB.T(...a);
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => BB.esc(s);
  const S = () => BB.Shop;
  const day = () => BB.Progress.today();
  const TABS = ['offers', 'chests', 'skins', 'gems'];
  const CHEST_ICON = { wood: '📦', iron: '🧰', royal: '👑' };
  let tab = 'offers', skinType = 'baron';

  const SU = {
    screen(args) {
      if (args && args.tab) tab = args.tab;
      const p = BB.profile;
      BB.ui.h.screen('shop', BB.ui.h.topbar(T('shop.title'), true) + `
        <div class="sh-tabs">${TABS.map((t) => `<button class="btn small ${t === tab ? 'gold' : 'dark'}" data-tab="${t}">${T('shop.tab_' + t)}</button>`).join('')}</div>
        <div class="sh-body" id="shBody"></div>`);
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
      el.innerHTML = `<h2 class="title sh-h">${T('shop.daily')} <small>${T('shop.refresh', hrs)}</small></h2>
        <div class="sh-row">${list.map((o, i) => { const def = BB.content.card(o.id), bought = S().offerBought(p, d, i);
          return `<div class="panel sh-item">${BB.ui.cardHtml(def, BB.Progress.owned(p, o.id), { level: true })}
            <button class="btn ${bought ? 'dark' : 'gold'} small" data-offer="${i}" ${bought ? 'disabled' : ''}>${bought ? T('shop.bought') : '🪙 ' + o.price}</button></div>`; }).join('')}</div>
        <div class="panel sh-starter"><div class="sh-big">🎁</div><div><h3 class="title">${T('shop.starter')}</h3>
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
      el.innerHTML = `<div class="sh-row">${S().CHESTS.map((c) => `<div class="panel sh-chest"><div class="sh-big">${CHEST_ICON[c.id]}</div>
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
          return `<div class="panel sh-skin ${sk.tier}">${SU.preview(p, sk)}<b>${esc(S().name(sk))}</b>
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
      el.innerHTML = `<h2 class="title sh-h">${T('shop.gold_title')}</h2>
        <div class="sh-row">${S().GOLD_PACKS.map((g) => `<div class="panel sh-chest"><div class="sh-big">🪙</div><h3 class="title">${g.gold.toLocaleString()}</h3>
          <button class="btn gold" data-gold="${g.id}">💎 ${g.crystals}</button></div>`).join('')}</div>
        <h2 class="title sh-h">${T('shop.gems_title')}</h2>
        <div class="sh-row">${S().CRYSTAL_PACKS.map((c) => `<div class="panel sh-chest"><div class="sh-big">💎</div><h3 class="title">${c.crystals.toLocaleString()}</h3>
          <button class="btn dark" disabled>${c.price}</button></div>`).join('')}</div>
        <p class="sh-odds">${T('shop.real_note')}</p>`;
      el.querySelectorAll('[data-gold]').forEach((b) => b.onclick = () => {
        const r = S().buyGold(p, b.dataset.gold);
        if (r === 'Ok') { BB.audio.jingle('reward'); SU.refresh(); } else SU.toast(r);
      });
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
  if (BB.ui && BB.ui.addScreen) BB.ui.addScreen('shop', (a) => SU.screen(a));
})(window.BB);

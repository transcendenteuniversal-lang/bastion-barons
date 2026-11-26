// Loja: catálogo, preços e regras de compra (sem tela). Itens só visuais (skins) não mudam a força de nada.
// Skins de modelo usam a arte do jogo com outra cor ("filter"); quando chegar a arte definitiva, basta
// preencher "src" (imagem) e, para Barões, "sheet" (folha de animação) no item do catálogo.
(function (BB) {
  'use strict';
  const N = (pt, en) => ({ pt, en });
  const PRICE = { common: 150, epic: 400, legendary: 900 };
  const AVATAR_PRICE = { common: 100, epic: 250, legendary: 500 };

  const SKINS = [
    // ---- Barões (retrato + boneco na sacada)
    { id: 'baron_bastion_gold', type: 'baron', target: 'rei_bastion', tier: 'legendary', name: N('Rei Bastion Dourado', 'Golden King Bastion'), filter: 'sepia(.6) saturate(1.8) brightness(1.1) hue-rotate(-10deg)' },
    { id: 'baron_elara_winter', type: 'baron', target: 'elara', tier: 'epic', name: N('Elara do Inverno', 'Winter Elara'), filter: 'hue-rotate(160deg) saturate(1.2)' },
    { id: 'baron_thorg_lava', type: 'baron', target: 'thorg', tier: 'epic', name: N('Thorg de Lava', 'Lava Thorg'), filter: 'saturate(1.7) contrast(1.15) brightness(.9) hue-rotate(-12deg)' },
    { id: 'baron_malachar_emerald', type: 'baron', target: 'malachar', tier: 'epic', name: N('Malachar Esmeralda', 'Emerald Malachar'), filter: 'hue-rotate(100deg) saturate(1.3)' },
    { id: 'baron_eldrin_storm', type: 'baron', target: 'eldrin', tier: 'legendary', name: N('Eldrin da Tempestade', 'Storm Eldrin'), filter: 'hue-rotate(220deg) saturate(1.4) brightness(1.05)' },
    // ---- Castelos
    { id: 'castle_royal_shadow', type: 'castle', target: 'royal_fortress', tier: 'epic', name: N('Fortaleza Real Sombria', 'Shadow Royal Fortress'), filter: 'brightness(.75) saturate(1.3) hue-rotate(200deg)' },
    { id: 'castle_glacial_aurora', type: 'castle', target: 'glacial_fortress', tier: 'epic', name: N('Fortaleza Glacial Aurora', 'Aurora Glacial Fortress'), filter: 'hue-rotate(55deg) saturate(1.25)' },
    { id: 'castle_draconic_obsidian', type: 'castle', target: 'draconic_castle', tier: 'legendary', name: N('Castelo Dracônico Obsidiana', 'Obsidian Draconic Castle'), filter: 'grayscale(.5) brightness(.8) contrast(1.3)' },
    { id: 'castle_sylvan_autumn', type: 'castle', target: 'sylvan_sanctuary', tier: 'common', name: N('Santuário Outonal', 'Autumn Sanctuary'), filter: 'sepia(.55) hue-rotate(-25deg) saturate(1.7)' },
    { id: 'castle_necropolis_gold', type: 'castle', target: 'shadow_necropolis', tier: 'legendary', name: N('Necrópole Dourada', 'Golden Necropolis'), filter: 'sepia(.7) saturate(1.6) brightness(1.15)' },
    // ---- Tropas (boneco na batalha + arte da carta)
    { id: 'troop_knight_gold', type: 'troop', target: 'royal_knight', tier: 'common', name: N('Cavaleiro Dourado', 'Golden Knight'), filter: 'sepia(1) saturate(2.6) hue-rotate(-12deg) brightness(1.12)' },
    { id: 'troop_orc_forest', type: 'troop', target: 'red_orc', tier: 'common', name: N('Orc da Floresta', 'Forest Orc'), filter: 'hue-rotate(100deg)' },
    { id: 'troop_archer_night', type: 'troop', target: 'elven_archer', tier: 'epic', name: N('Arqueira Noturna', 'Night Archer'), filter: 'hue-rotate(220deg) brightness(.9)' },
    { id: 'troop_golem_crystal', type: 'troop', target: 'stone_golem', tier: 'epic', name: N('Golem de Cristal', 'Crystal Golem'), filter: 'hue-rotate(180deg) saturate(2) brightness(1.15)' },
    { id: 'troop_dragon_shadow', type: 'troop', target: 'fire_dragon', tier: 'legendary', name: N('Dragão Sombrio', 'Shadow Dragon'), filter: 'hue-rotate(250deg) saturate(1.2) brightness(.85)' },
    { id: 'troop_phoenix_blue', type: 'troop', target: 'phoenix', tier: 'legendary', name: N('Fênix Azul', 'Blue Phoenix'), filter: 'hue-rotate(190deg) saturate(1.3)' },
    // ---- Foto de perfil (avatar)
    { id: 'avatar_troll', type: 'avatar', tier: 'common', name: N('Troll da Montanha', 'Mountain Troll'), src: 'img/cards/mountain_troll.webp' },
    { id: 'avatar_griffin', type: 'avatar', tier: 'common', name: N('Grifo Real', 'Royal Griffin'), src: 'img/cards/royal_griffin.webp' },
    { id: 'avatar_necromancer', type: 'avatar', tier: 'epic', name: N('Necromante', 'Necromancer'), src: 'img/cards/necromancer.webp' },
    { id: 'avatar_demon', type: 'avatar', tier: 'epic', name: N('Demônio Infernal', 'Infernal Demon'), src: 'img/cards/infernal_demon.webp' },
    { id: 'avatar_dragon', type: 'avatar', tier: 'legendary', name: N('Dragão de Fogo', 'Fire Dragon'), src: 'img/cards/fire_dragon.webp' },
    { id: 'avatar_phoenix', type: 'avatar', tier: 'legendary', name: N('Fênix', 'Phoenix'), src: 'img/cards/phoenix.webp' },
    // ---- Comemoração do Barão (na vitória)
    { id: 'cel_confetti', type: 'celebration', tier: 'common', free: true, name: N('Confetes', 'Confetti'), fx: ['🎉', '🎊', '✨'] },
    { id: 'cel_crowns', type: 'celebration', tier: 'common', name: N('Chuva de Coroas', 'Crown Rain'), fx: ['👑', '💰', '✨'] },
    { id: 'cel_fireworks', type: 'celebration', tier: 'common', name: N('Fogos de Artifício', 'Fireworks'), fx: ['🎆', '🎇', '✨'] },
    { id: 'cel_dragon', type: 'celebration', tier: 'epic', name: N('Fúria do Dragão', 'Dragon Fury'), fx: ['🔥', '🐉', '💥'] },
    { id: 'cel_frost', type: 'celebration', tier: 'epic', name: N('Nevasca Real', 'Royal Blizzard'), fx: ['❄️', '💎', '✨'] },
    { id: 'cel_souls', type: 'celebration', tier: 'legendary', name: N('Dança das Almas', 'Soul Dance'), fx: ['💀', '👻', '🔮'] },
    // ---- Emotes (balões na partida)
    { id: 'emo_default', type: 'emotes', tier: 'common', free: true, name: N('Clássicos', 'Classic'), fx: ['👍', '😃', '😠', '😱', '👑'] },
    { id: 'emo_kingdom', type: 'emotes', tier: 'common', name: N('Reino', 'Kingdom'), fx: ['👑', '🏰', '⚔️', '🛡️', '🎉'] },
    { id: 'emo_dragon', type: 'emotes', tier: 'common', name: N('Dragões', 'Dragons'), fx: ['🐉', '🔥', '😤', '💥', '🥚'] },
    { id: 'emo_haunted', type: 'emotes', tier: 'epic', name: N('Assombrado', 'Haunted'), fx: ['💀', '👻', '🦇', '😈', '🕸️'] },
  ];
  for (const s of SKINS) s.price = s.free ? 0 : (s.type === 'avatar' ? AVATAR_PRICE : PRICE)[s.tier];

  const S = {
    SKINS, PRICE, AVATAR_PRICE,
    TYPES: ['baron', 'castle', 'troop', 'avatar', 'celebration', 'emotes'],
    // baús: cartas sorteadas com as chances normais; o último sai com a raridade mínima garantida
    CHESTS: [
      { id: 'wood', cost: { gold: 250 }, cards: 3, minRarity: 0 },
      { id: 'iron', cost: { gold: 800 }, cards: 6, minRarity: 1 },
      { id: 'royal', cost: { crystals: 150 }, cards: 10, minRarity: 2 },
    ],
    GOLD_PACKS: [{ id: 'gold_s', crystals: 100, gold: 1000 }, { id: 'gold_l', crystals: 450, gold: 5000 }],
    // dinheiro real (Google Play Billing) — modelo: ainda não à venda
    CRYSTAL_PACKS: [{ id: 'cr_80', crystals: 80, price: 'R$ 4,90' }, { id: 'cr_500', crystals: 500, price: 'R$ 24,90' },
      { id: 'cr_1200', crystals: 1200, price: 'R$ 49,90' }, { id: 'cr_2800', crystals: 2800, price: 'R$ 99,90' }],
    STARTER: { id: 'starter', price: 'R$ 4,90', crystals: 150, gold: 2000, epicCards: 1, skin: 'avatar_dragon' },
    OFFER_PRICE: [60, 180, 600, 1800, 4000], // ouro por cópia, por raridade
    REAL_MONEY: false,

    skin(id) { return SKINS.find((s) => s.id === id) || null; },
    name(s) { return (s.name && (s.name[BB.lang ? BB.lang() : 'pt'] || s.name.pt)) || s.id; },
    st(p) {
      if (!p.shop || typeof p.shop !== 'object') p.shop = {};
      const sh = p.shop;
      if (!Array.isArray(sh.owned)) sh.owned = [];
      if (!sh.equip || typeof sh.equip !== 'object') sh.equip = {};
      if (!sh.offers || typeof sh.offers !== 'object') sh.offers = { day: '', bought: [] };
      return sh;
    },
    owns(p, id) { const s = S.skin(id); return !!s && (s.free || S._tester || S.st(p).owned.includes(id)); },
    // contas de teste (todas as skins liberadas): só o código SHA-256 do e-mail fica no jogo, nunca o e-mail
    TESTERS: ['038af17a8e8b545e9547aaac6d35d608d98f92a05bb47142805ecb58e10f2510'],
    _tester: false,
    checkTester() {
      const mail = BB.cloud && BB.cloud.loggedIn() ? String(BB.cloud.email() || '').trim().toLowerCase() : '';
      S._tester = !!mail && S.TESTERS.includes(S.sha256(mail));
      return S._tester;
    },
    sha256(str) {
      const K = [], H = [], isP = (n) => { for (let f = 2; f * f <= n; f++) if (n % f === 0) return false; return true; };
      const fr = (x) => ((x - Math.floor(x)) * 4294967296) | 0;
      for (let n = 2, k = 0; k < 64; n++) if (isP(n)) { if (k < 8) H[k] = fr(Math.pow(n, 1 / 2)); K[k++] = fr(Math.pow(n, 1 / 3)); }
      const bytes = unescape(encodeURIComponent(str)).split('').map((c) => c.charCodeAt(0));
      const l = bytes.length * 8; bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
      for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (l >>> (i * 8)) & 255);
      const r = (x, n) => (x >>> n) | (x << (32 - n));
      for (let o = 0; o < bytes.length; o += 64) {
        const w = [];
        for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
        for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (r(a, 7) ^ r(a, 18) ^ (a >>> 3)) + w[i - 7] + (r(b, 17) ^ r(b, 19) ^ (b >>> 10))) | 0; }
        let [a, b, c, d, e, f, g, h] = H;
        for (let i = 0; i < 64; i++) {
          const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
          const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
          h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        [a, b, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) | 0; });
      }
      return H.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
    },
    slot(s) { return s.type + (s.target ? ':' + s.target : ''); },
    // skin em uso para um tipo (e alvo: Barão, castelo ou carta); comemoração e emotes têm padrão grátis
    equipped(p, type, target) {
      const id = S.st(p).equip[type + (target ? ':' + target : '')];
      if (id && S.owns(p, id)) return S.skin(id);
      if (type === 'celebration') return S.skin('cel_confetti');
      if (type === 'emotes') return S.skin('emo_default');
      return null;
    },
    isEquipped(p, id) { const s = S.skin(id); return !!s && S.equipped(p, s.type, s.target) === s; },
    equip(p, id) {
      if (!S.owns(p, id)) return 'NotOwned';
      const s = S.skin(id), sh = S.st(p), k = S.slot(s);
      if (sh.equip[k] === id && !s.free) delete sh.equip[k]; // tocar de novo volta ao visual padrão
      else sh.equip[k] = id;
      return 'Ok';
    },
    unequip(p, type, target) { delete S.st(p).equip[type + (target ? ':' + target : '')]; },
    forTarget(type, target) { return SKINS.filter((s) => s.type === type && (!target || s.target === target)); },
    canPay(p, cost) { return (p.gold || 0) >= (cost.gold || 0) && (p.crystals || 0) >= (cost.crystals || 0); },
    pay(p, cost) { if (!S.canPay(p, cost)) return false; p.gold -= cost.gold || 0; p.crystals -= cost.crystals || 0; return true; },
    buySkin(p, id) {
      const s = S.skin(id);
      if (!s) return 'Unknown';
      if (S.owns(p, id)) return 'Owned';
      if (!S.pay(p, { crystals: s.price })) return 'NoFunds';
      S.st(p).owned.push(id);
      S.equip(p, id);
      return 'Ok';
    },

    // ---- aplicação no jogo
    // skins do jogador (lado 0) para a batalha; o adversário usa o visual padrão
    battleSkins(p, match) {
      const me = match.players[0], unit = {};
      for (const sk of SKINS) if (sk.type === 'troop' && S.isEquipped(p, sk.id)) unit[sk.target] = sk;
      return { baron: [S.equipped(p, 'baron', me.baron.id), null], castle: [S.equipped(p, 'castle', me.castle.id), null], unit: [unit, {}] };
    },
    // retrato do Barão com a skin em uso: { src, style }
    baronPic(p, baronId) {
      const sk = S.equipped(p, 'baron', baronId);
      return { src: sk && sk.src ? sk.src : BB.art.baronUrl(baronId), style: sk && sk.filter && !sk.src ? 'filter:' + sk.filter : '' };
    },
    // foto de perfil: avatar comprado ou, por padrão, o retrato do Barão escolhido
    avatarPic(p) {
      const sk = S.equipped(p, 'avatar');
      return sk ? { src: sk.src, style: '' } : S.baronPic(p, p.selectedBaron);
    },
    img(pic, cls, attrs) { return '<img class="' + (cls || '') + '" ' + (attrs || '') + ' src="' + pic.src + '" style="' + pic.style + '" alt="">'; },
    cardFilter(p, cardId) { const sk = S.equipped(p, 'troop', cardId); return sk && sk.filter ? sk.filter : ''; },

    // ---- ofertas do dia: 3 cartas que trocam a cada 24 h (iguais o dia todo para o mesmo jogador)
    hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return h >>> 0; },
    offers(p, content, day) {
      const pool = content.collectible.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
      const out = [];
      for (let k = 0; out.length < 3 && k < 50; k++) {
        const c = pool[S.hash(day + '|' + p.playerId + '|' + k) % pool.length];
        if (!out.includes(c.id) && c.rarityIndex <= 3) out.push(c.id);
      }
      return out.map((id) => ({ id, price: S.OFFER_PRICE[content.card(id).rarityIndex] }));
    },
    buyOffer(p, content, day, i) {
      const sh = S.st(p);
      if (sh.offers.day !== day) sh.offers = { day, bought: [] };
      if (sh.offers.bought.includes(i)) return 'Bought';
      const o = S.offers(p, content, day)[i];
      if (!o) return 'Unknown';
      if (!S.pay(p, { gold: o.price })) return 'NoFunds';
      const owned = BB.Progress.owned(p, o.id);
      if (owned) owned.copies++; else p.cards.push({ id: o.id, level: 1, copies: 0 });
      sh.offers.bought.push(i);
      return 'Ok';
    },
    offerBought(p, day, i) { const sh = S.st(p); return sh.offers.day === day && sh.offers.bought.includes(i); },

    // ---- baús
    chest(id) { return S.CHESTS.find((c) => c.id === id) || null; },
    openChest(p, content, id, rng) {
      const c = S.chest(id);
      if (!c) return null;
      if (!S.pay(p, c.cost)) return null;
      const ids = [];
      for (let i = 0; i < c.cards; i++) {
        let cid = BB.Progress.rollCard(p, content, rng);
        if (i === c.cards - 1 && !ids.concat(cid).some((x) => content.card(x).rarityIndex >= c.minRarity)) {
          for (let k = 0; k < 200 && content.card(cid).rarityIndex < c.minRarity; k++) cid = BB.Progress.rollCard(p, content, rng);
        }
        const o = BB.Progress.owned(p, cid);
        if (o) o.copies++; else p.cards.push({ id: cid, level: 1, copies: 0 });
        ids.push(cid);
      }
      return ids;
    },
    buyGold(p, packId) {
      const g = S.GOLD_PACKS.find((x) => x.id === packId);
      if (!g) return 'Unknown';
      if (!S.pay(p, { crystals: g.crystals })) return 'NoFunds';
      p.gold += g.gold;
      return 'Ok';
    },
  };
  BB.Shop = S;
})(window.BB = window.BB || {});

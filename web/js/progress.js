// Perfil do jogador e progressão (XP, desbloqueios, evolução de cartas, recompensas). Salvo no aparelho.
(function (BB) {
  'use strict';
  const KEY = 'bb_profile_v1';
  // armazenamento: Data Module da CrazyGames quando disponível, senão localStorage (testes no Node: memória)
  const mem = {};
  const st = () => (typeof window !== 'undefined' && window.BB && window.BB.platform ? window.BB.platform.storage
    : (typeof localStorage !== 'undefined' ? { get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v), remove: (k) => localStorage.removeItem(k) }
      : { get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { mem[k] = v; }, remove: (k) => { delete mem[k]; } }));

  const P = {
    owned(p, id) { return p.cards.find((c) => c.id === id) || null; },

    create(content) {
      const b = content.balance;
      const p = {
        saveVersion: 1, playerId: Math.random().toString(36).slice(2) + Date.now().toString(36), playerName: 'Barão', isGuest: true,
        gold: 100, crystals: 0, xp: 0, accountLevel: 1,
        battles: 0, wins: 0, losses: 0, draws: 0, winStreak: 0, bestWinStreak: 0,
        selectedBaron: b.starterBaron, selectedCastle: b.starterCastle, activeDeck: 0,
        decks: [0, 1, 2].map(() => b.starterDeck.slice()),
        cards: b.starterCards.filter((id) => content.cards[id]).map((id) => ({ id, level: 1, copies: 0 })),
        pity: 0, language: '', music: 0.6, sfx: 0.8, vibration: true, history: [], seenHelp: false, tutorialDone: false, daily: { last: '', streak: 0 }, firstWinDay: '',
      };
      return P.repair(p, content);
    },

    repair(p, content) {
      const b = content.balance;
      // campos ausentes em saves antigos recebem o valor padrão
      const num = (k, d) => { if (typeof p[k] !== 'number' || !isFinite(p[k])) p[k] = d; };
      num('gold', 100); num('crystals', 0); num('xp', 0); num('accountLevel', 1); num('pity', 0);
      num('battles', 0); num('wins', 0); num('losses', 0); num('draws', 0); num('winStreak', 0); num('bestWinStreak', 0);
      num('music', 0.6); num('sfx', 0.8);
      if (typeof p.vibration !== 'boolean') p.vibration = true;
      if (typeof p.tutorialDone !== 'boolean') p.tutorialDone = p.battles > 0;
      if (!p.daily || typeof p.daily !== 'object') p.daily = { last: '', streak: 0 };
      if (typeof p.firstWinDay !== 'string') p.firstWinDay = '';
      if (typeof p.playerName !== 'string' || p.playerName.trim().length < 2) p.playerName = 'Barão';
      if (!Array.isArray(p.cards)) p.cards = [];
      if (!Array.isArray(p.decks)) p.decks = [];
      if (!Array.isArray(p.history)) p.history = [];
      p.cards = p.cards.filter((o) => o && content.cards[o.id] && !content.cards[o.id].token);
      for (const o of p.cards) o.level = Math.max(1, Math.min(b.maxCardLevel, o.level | 0));
      for (const id of b.starterCards) if (!P.owned(p, id)) p.cards.push({ id, level: 1, copies: 0 });
      // modo de teste (balance.testUnlockAll): todas as cartas liberadas; desligar antes do lançamento
      if (b.testUnlockAll) for (const c of content.collectible) if (!P.owned(p, c.id)) p.cards.push({ id: c.id, level: 1, copies: 0 });
      while (p.decks.length < 3) p.decks.push(b.starterDeck.slice());
      p.decks = p.decks.map((d) => (BB.DeckRules.validate(d, content, p) === 'Ok' ? d : b.starterDeck.slice()));
      p.activeDeck = Math.max(0, Math.min(2, p.activeDeck | 0));
      p.accountLevel = Math.max(1, p.accountLevel | 0);
      if (!content.baronById[p.selectedBaron] || !P.baronUnlocked(p, content.baronById[p.selectedBaron])) p.selectedBaron = b.starterBaron;
      if (!content.castleById[p.selectedCastle] || !P.castleUnlocked(p, content.castleById[p.selectedCastle])) p.selectedCastle = b.starterCastle;
      return p;
    },

    load(content) {
      try {
        const raw = st().get(KEY);
        if (raw) { const p = JSON.parse(raw); if (p && p.playerId) return P.repair(p, content); }
      } catch (e) {
        try { st().set(KEY + '_corrupt', st().get(KEY) || ''); } catch (e2) { /* sem armazenamento */ }
      }
      const p = P.create(content);
      P.save(p);
      return p;
    },
    save(p) { try { st().set(KEY, JSON.stringify(p)); } catch (e) { /* armazenamento indisponível */ } },
    wipe() { try { st().remove(KEY); } catch (e) { /* nada */ } },

    baronUnlocked(p, b) { return !!(BB.content && BB.content.balance.testUnlockAll) || p.accountLevel >= (b.unlockLevel || 1); },
    castleUnlocked(p, c) { return !!(BB.content && BB.content.balance.testUnlockAll) || p.accountLevel >= (c.unlockLevel || 1); },
    xpForNext(b, level) { return b.xpBase + b.xpPerLevel * (Math.max(1, level) - 1); },

    addXp(p, content, amount, unlocked) {
      const b = content.balance;
      let gained = 0;
      p.xp += Math.max(0, amount);
      while (p.xp >= P.xpForNext(b, p.accountLevel)) {
        p.xp -= P.xpForNext(b, p.accountLevel);
        p.accountLevel++; gained++;
        for (const x of content.barons) if (x.unlockLevel === p.accountLevel) unlocked.push('baron:' + x.id);
        for (const x of content.castles) if (x.unlockLevel === p.accountLevel) unlocked.push('castle:' + x.id);
      }
      return gained;
    },

    copiesRequired(b, level) { const a = b.upgradeCopies; return a[Math.max(0, Math.min(a.length - 1, level - 1))]; },
    goldRequired(b, level) { const a = b.upgradeGold; return a[Math.max(0, Math.min(a.length - 1, level - 1))]; },
    canUpgrade(p, content, id) {
      const o = P.owned(p, id), b = content.balance;
      return !!o && o.level < b.maxCardLevel && o.copies >= P.copiesRequired(b, o.level) && p.gold >= P.goldRequired(b, o.level);
    },
    upgrade(p, content, id) {
      if (!P.canUpgrade(p, content, id)) return false;
      const o = P.owned(p, id), b = content.balance;
      p.gold -= P.goldRequired(b, o.level);
      o.copies -= P.copiesRequired(b, o.level);
      o.level++;
      return true;
    },

    rarityChance(b, i) { const t = b.rarityWeights.reduce((s, x) => s + x, 0); return t > 0 ? b.rarityWeights[i] / t : 0; },

    // Sorteio com probabilidades exibidas ao jogador e proteção contra azar (Épica+ garantida após N-1 sem uma)
    rollCard(p, content, rng) {
      const w = content.balance.rarityWeights;
      const pity = p.pity >= content.balance.pityThreshold - 1;
      const start = pity ? 2 : 0;
      let total = 0;
      for (let i = start; i < w.length; i++) total += w[i];
      let roll = rng.range(0, Math.max(1, total)), rarity = start;
      for (let i = start; i < w.length; i++) { if (roll < w[i]) { rarity = i; break; } roll -= w[i]; }
      let pool = [];
      for (let r = rarity; r >= 0 && !pool.length; r--) pool = content.collectible.filter((c) => c.rarityIndex === r);
      const chosen = pool[rng.range(0, pool.length)];
      p.pity = chosen.rarityIndex >= 2 ? 0 : p.pity + 1;
      return chosen.id;
    },

    today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); },
    // recompensa diária: volta todo dia e a sequência aumenta (7 dias); pular um dia reinicia
    DAILY: [{ gold: 50 }, { gold: 80 }, { gold: 120, card: 1 }, { gold: 150 }, { gold: 200, crystals: 5 }, { gold: 250, card: 2 }, { gold: 400, crystals: 15, card: 3 }],
    dailyAvailable(p) { return p.tutorialDone && p.daily.last !== P.today(); },
    claimDaily(p, content, rng) {
      if (!P.dailyAvailable(p)) return null;
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yesterday = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();
      p.daily.streak = p.daily.last === yesterday ? (p.daily.streak % 7) + 1 : 1;
      p.daily.last = P.today();
      const r = Object.assign({ day: p.daily.streak, cards: [] }, P.DAILY[p.daily.streak - 1]);
      p.gold += r.gold || 0; p.crystals += r.crystals || 0;
      for (let i = 0; i < (r.card || 0); i++) { const id = P.rollCard(p, content, rng), o = P.owned(p, id); if (o) o.copies++; else p.cards.push({ id, level: 1, copies: 0 }); r.cards.push(id); }
      return r;
    },

    // próxima recompensa diária (para "volte amanhã")
    dailyNext(p) { const day = (p.daily.streak % 7) + 1; return Object.assign({ day }, P.DAILY[day - 1]); },
    // próximo Barão/castelo a desbloquear e quantas vitórias faltam (null se tudo já liberado)
    nextUnlock(p, content) {
      const b = content.balance;
      if (b.testUnlockAll) return null;
      const items = content.barons.map((x) => ({ type: 'baron', id: x.id, level: x.unlockLevel || 1 }))
        .concat(content.castles.map((x) => ({ type: 'castle', id: x.id, level: x.unlockLevel || 1 })))
        .filter((x) => x.level > p.accountLevel);
      if (!items.length) return null;
      const level = Math.min(...items.map((x) => x.level));
      let xp = -p.xp;
      for (let l = p.accountLevel; l < level; l++) xp += P.xpForNext(b, l);
      return { level, items: items.filter((x) => x.level === level), xp: Math.max(0, xp), wins: Math.max(1, Math.ceil(Math.max(0, xp) / Math.max(1, b.winXp))) };
    },

    applyResult(p, content, result, rng, record) {
      const b = content.balance;
      const r = { gold: 0, xp: 0, cardId: null, newCard: false, levels: 0, unlocked: [] };
      p.battles++;
      if (result > 0) { p.wins++; p.winStreak++; p.bestWinStreak = Math.max(p.bestWinStreak, p.winStreak); r.gold = b.winGold; r.xp = b.winXp; }
      else if (result === 0) { p.draws++; p.winStreak = 0; r.gold = b.drawGold; r.xp = b.drawXp; }
      else { p.losses++; p.winStreak = 0; r.gold = b.lossGold; r.xp = b.lossXp; }
      if (result > 0 && p.firstWinDay !== P.today()) { p.firstWinDay = P.today(); r.firstWin = true; r.gold *= 2; r.xp *= 2; } // 1ª vitória do dia vale o dobro
      p.gold += r.gold;
      if (result > 0) {
        r.cardId = P.rollCard(p, content, rng);
        const o = P.owned(p, r.cardId);
        if (o) o.copies++; else { p.cards.push({ id: r.cardId, level: 1, copies: 0 }); r.newCard = true; }
      }
      r.levels = P.addXp(p, content, r.xp, r.unlocked);
      if (record) { p.history.unshift(record); p.history.length = Math.min(p.history.length, 50); }
      return r;
    },
  };

  BB.Progress = P;
})(typeof window !== 'undefined' ? (window.BB = window.BB || {}) : (global.BB = global.BB || {}));

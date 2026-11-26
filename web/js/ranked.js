// Ranqueada: pontos, ligas, temporadas, 100 jogadores simulados, multidão abaixo do Top 100 e escolha de adversário.
// Lógica pura (sem tela e sem internet): roda igual no navegador, no app e nos testes (node tools/sim-test.js).
// Tudo que depende de data usa UTC, então todos os aparelhos calculam o mesmo ranking.
(function (BB) {
  'use strict';

  const DAY = 86400000, HOUR = 3600000;
  const BARONS = ['rei_bastion', 'elara', 'thorg', 'malachar', 'eldrin'];

  const R = {
    // ---------------------------------------------------------------- pontuação
    WIN: 20, LOSS: -12, DRAW: 3,
    BONUS_STEP: 20, BONUS_MAX: 10,     // +1 a cada 20 pts que o adversário tem a mais (máx. +10)
    STREAK_FROM: 3, STREAK_BONUS: 5,   // +5 a partir da 3ª vitória seguida

    // 6 ligas com piso de pontos (proteção: quem alcança uma liga não cai abaixo do piso na temporada)
    LEAGUES: [
      { id: 'palisade', floor: 0, icon: '🪵', img: 'wood' },
      { id: 'stone_tower', floor: 300, icon: '🗼', img: 'stone' },
      { id: 'iron_fortress', floor: 700, icon: '⚔️', img: 'iron' },
      { id: 'silver_bastion', floor: 1200, icon: '🛡️', img: 'league_silver' },
      { id: 'golden_citadel', floor: 1800, icon: '👑', img: 'league_gold' },
      { id: 'barons_throne', floor: 2500, icon: '🐉', img: 'league_crown' },
    ],
    // prêmio na virada pela maior liga alcançada (só itens do jogo) e bônus do Top 10
    REWARDS: [{ gold: 100 }, { gold: 200 }, { gold: 350 }, { gold: 500, crystals: 5 }, { gold: 800, crystals: 20 }, { gold: 1200, crystals: 50 }],
    TOP10: { gold: 500, crystals: 30 },

    league(points) { let i = 0; for (let k = 0; k < R.LEAGUES.length; k++) if (points >= R.LEAGUES[k].floor) i = k; return i; },
    floorOf(league) { return R.LEAGUES[Math.max(0, Math.min(R.LEAGUES.length - 1, league))].floor; },
    nextLeague(points) { const i = R.league(points); return i + 1 < R.LEAGUES.length ? { index: i + 1, need: R.LEAGUES[i + 1].floor - points } : null; },

    // pontos de uma partida. result: 1 vitória, 0 empate, -1 derrota (desistir/abandonar = derrota)
    matchDelta(result, myPoints, oppPoints, streakBefore) {
      if (result > 0) {
        const bonus = Math.min(R.BONUS_MAX, Math.floor(Math.max(0, oppPoints - myPoints) / R.BONUS_STEP));
        const streak = (streakBefore || 0) + 1 >= R.STREAK_FROM ? R.STREAK_BONUS : 0;
        return R.WIN + bonus + streak;
      }
      return result < 0 ? R.LOSS : R.DRAW;
    },

    newState(season) {
      return { season, points: 0, maxLeague: 0, streak: 0, wins: 0, losses: 0, draws: 0, trophies: 0, prevSeason: '', prevPoints: 0 };
    },

    // aplica o resultado de uma partida ao estado (muda o estado e devolve o resumo para a tela final)
    applyMatch(st, result, oppPoints) {
      const before = st.points, leagueBefore = R.league(before);
      const raw = R.matchDelta(result, before, oppPoints, st.streak);
      st.points = Math.max(R.floorOf(st.maxLeague), before + raw, 0);
      if (result > 0) { st.wins++; st.streak++; } else if (result < 0) { st.losses++; st.streak = 0; } else { st.draws++; st.streak = 0; }
      const leagueAfter = R.league(st.points);
      const promoted = leagueAfter > st.maxLeague;
      st.maxLeague = Math.max(st.maxLeague, leagueAfter);
      return { delta: st.points - before, raw, before, after: st.points, leagueBefore, leagueAfter, promoted };
    },

    // ---------------------------------------------------------------- temporadas (uma por mês, UTC)
    seasonId(t) { const d = new Date(t); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); },
    seasonIndex(id) { const [y, m] = id.split('-').map(Number); return y * 12 + (m - 1); },
    seasonFromIndex(i) { return Math.floor(i / 12) + '-' + String((i % 12) + 1).padStart(2, '0'); },
    seasonStart(id) { const i = R.seasonIndex(id); return Date.UTC(Math.floor(i / 12), i % 12, 1); },
    seasonEnd(id) { return R.seasonStart(R.seasonFromIndex(R.seasonIndex(id) + 1)); },
    prevSeason(id) { return R.seasonFromIndex(R.seasonIndex(id) - 1); },
    daysLeft(t) { return Math.max(0, Math.ceil((R.seasonEnd(R.seasonId(t)) - t) / DAY)); },
    seasonNumber(id) { return Math.max(1, R.seasonIndex(id) - R.seasonIndex(R.FIRST_SEASON) + 1); },
    FIRST_SEASON: '2026-11',
    LAUNCH: Date.UTC(2026, 10, 24),

    // virada de temporada: pontos pela metade (por temporada que passou), prêmio pela maior liga e troféu do Top 10.
    // finalRank(season, points) devolve a colocação final na temporada antiga (bots + jogadores reais + você).
    rollover(st, now, finalRank) {
      const cur = R.seasonId(now);
      if (!st.season) { Object.assign(st, R.newState(cur)); return null; }
      if (st.season === cur) return null;
      const old = st.season, oldPoints = st.points, played = st.wins + st.losses + st.draws > 0;
      const rank = played && finalRank ? finalRank(old, oldPoints) : 0;
      const top10 = rank > 0 && rank <= 10;
      const base = R.REWARDS[st.maxLeague] || R.REWARDS[0];
      const reward = played ? {
        season: old, league: st.maxLeague, points: oldPoints, rank, top10,
        gold: (base.gold || 0) + (top10 ? R.TOP10.gold : 0), crystals: (base.crystals || 0) + (top10 ? R.TOP10.crystals : 0),
      } : null;
      let pts = oldPoints;
      for (let i = R.seasonIndex(old); i < R.seasonIndex(cur); i++) pts = Math.floor(pts / 2);
      const trophies = st.trophies + (top10 ? 1 : 0);
      Object.assign(st, R.newState(cur), { points: pts, maxLeague: R.league(pts), trophies, prevSeason: old, prevPoints: oldPoints });
      return reward;
    },

    // ---------------------------------------------------------------- números determinísticos (iguais em todo aparelho)
    hash(...xs) {
      let h = 0x811c9dc5 ^ 0x2f6b;
      for (const x of xs) { h ^= x >>> 0; h = Math.imul(h, 0x01000193); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; }
      h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    },

    // ---------------------------------------------------------------- os 100 jogadores simulados
    BOT_NAMES: [
      'Lord_Hammer', 'mateus2009', 'pixel.knight', 'DragaoNegroBR', 'ana.arqueira', 'KingOfLanes', 'xX_Orc_Xx', 'Valquiria77', 'sir.lancelot', 'Barao_Pedro',
      'ElfaSombria', 'castle_crusher', 'Lucas_RJ', 'nightowl.gg', 'Gandolfo', 'Bruna_Rush', 'TheIronWall', 'Kaio2011', 'mago.supremo', 'Hunter_Elf',
      'Rafa.Thorg', 'ShadowMalachar', 'Juju_Arrow', 'Vitor_PT', 'drako.fire', 'TormentaArcana', 'leo_castelo', 'Ironclad99', 'Mila.Mage', 'Zeus_Barao',
      'gabi.gamer', 'NecroKing', 'TrollMaster', 'joao_lanceiro', 'FrostByte', 'Sofia_Elara', 'BigAxe_Thorg', 'paladino.br', 'Kenji_Ninja', 'Dama_de_Ferro',
      'Diego2008', 'reidascartas', 'HeitorX', 'luna.fenix', 'OrcRage', 'Bastion_Fan', 'caio.games', 'GriffinRider', 'MariaFuria', 'Edu_Mago',
      'Klaus_DE', 'ana_belle', 'DarkPaladin', 'Pedrinho_BR', 'skull.crusher', 'Yuki_Frost', 'Thiago.Rei', 'FenrirWolf', 'bia.bastiao', 'Matador_ES',
      'Henrique_88', 'SilverArrow', 'Davi.Dragao', 'Nico_Knight', 'golemzinho', 'Larissa_LoL', 'EldrinFan', 'Wolfgang', 'Alice.Arcana', 'Biel_Castle',
      'Raven.Queen', 'MrBalista', 'Enzo2010', 'tiago.troll', 'Vale_Elfa', 'Sombra_Viva', 'Max_Power', 'carol.cartas', 'Arthur.Pendragon', 'Nina_Necro',
      'Pablo_MX', 'IceDragon_', 'beto.barbaro', 'KnightRiderBR', 'Isa.Fenix', 'GuerreiroAnao', 'Felipe_SP', 'TheLastBaron', 'Manu_Magia', 'Rocco_IT',
      'samuel.sombra', 'Victory_Lane', 'Hugo_Hammer', 'Lia.Ladina', 'CrownTaker', 'Otto_Orc', 'Gui_Gamer', 'FlameWarden', 'Tati.Thorg', 'Bruno_Bastion',
    ],
    _ranks: {}, _trophies: {},
    bot(i) { return { id: 'bot' + i, name: R.BOT_NAMES[i], baron: BARONS[Math.floor(R.hash(i, 7) * BARONS.length)], bot: true }; },

    // ordem da temporada: talento fixo (60%) + variação da temporada (40%)
    botRanks(season) {
      if (R._ranks[season]) return R._ranks[season];
      const s = R.seasonIndex(season);
      const order = R.BOT_NAMES.map((_, i) => ({ i, score: 0.6 * R.hash(i, 1) + 0.4 * R.hash(i, s, 2) })).sort((a, b) => b.score - a.score);
      const ranks = []; order.forEach((o, r) => { ranks[o.i] = r; });
      return (R._ranks[season] = ranks);
    },
    // meta final pela colocação: 1º ≈ 2.800, 100º ≈ 700
    botTarget(rank) { return 700 + 2100 * Math.pow(1 - rank / (R.BOT_NAMES.length - 1), 1.15); },
    botPoints(i, t) {
      const season = R.seasonId(t), s = R.seasonIndex(season), start = R.seasonStart(season), end = R.seasonEnd(season);
      const f = Math.max(0, Math.min(1, (t - start) / (end - start)));
      const target = R.botTarget(R.botRanks(season)[i]);
      const begin = target * (0.45 + 0.1 * R.hash(i, s, 3));          // começa com cerca de metade da meta
      const pace = 0.45 + 1.6 * R.hash(i, s, 4);                       // ritmo próprio: <1 sobe cedo, >1 sobe no fim
      const hourly = (R.hash(i, Math.floor(t / HOUR), 5) * 2 - 1) * 12;
      const daily = (R.hash(i, Math.floor(t / DAY), 6) * 2 - 1) * 30;
      return Math.max(0, Math.round(begin + (target - begin) * Math.pow(f, pace) + hourly + daily));
    },
    // troféus de temporadas passadas: vezes que o bot terminou no Top 10 entre os bots (últimas 12 temporadas)
    botTrophies(i, season) {
      const key = season;
      if (!R._trophies[key]) {
        const cur = R.seasonIndex(season), counts = new Array(R.BOT_NAMES.length).fill(0);
        for (let s = cur - 12; s < cur; s++) {
          const end = R.seasonEnd(R.seasonFromIndex(s)) - 1;
          R.BOT_NAMES.map((_, k) => ({ k, p: R.botPoints(k, end) })).sort((a, b) => b.p - a.p).slice(0, 10).forEach((o) => counts[o.k]++);
        }
        R._trophies[key] = counts;
      }
      return R._trophies[key][i];
    },
    bots(t) {
      const season = R.seasonId(t);
      return R.BOT_NAMES.map((_, i) => Object.assign(R.bot(i), { points: R.botPoints(i, t), trophies: R.botTrophies(i, season) }));
    },

    // ---------------------------------------------------------------- multidão abaixo do Top 100
    crowdSize(t) { return Math.min(6000, 1400 + Math.max(0, Math.floor((t - R.LAUNCH) / DAY)) * 9); },
    crowdAbove(points, cutoff, total) {
      if (points >= cutoff || cutoff <= 0) return 0;
      return Math.round(total * Math.pow((cutoff - points) / cutoff, 2.5));
    },

    // ranking exibido: bots + jogadores reais + você, ordenado; posição completa (com a multidão)
    // reals: [{ id, name, baron, points, trophies }] da nuvem (sem você). me: { id, name, baron, points, trophies }
    board(t, reals, me, realsAbove) {
      const bots = R.bots(t);
      const cutoff = Math.min(...bots.map((b) => b.points));
      const realList = (reals || []).filter((r) => !me || r.id !== me.id);
      const others = bots.concat(realList);
      const list = others.slice();
      if (me) list.push(Object.assign({ me: true }, me));
      list.sort((a, b) => b.points - a.points || (a.me ? -1 : b.me ? 1 : 0));
      let position = 0;
      if (me) {
        const botsAbove = bots.filter((o) => o.points > me.points).length;
        const realAbove = typeof realsAbove === 'number' ? realsAbove : realList.filter((o) => o.points > me.points).length;
        const above = botsAbove + realAbove;
        position = 1 + above + R.crowdAbove(me.points, cutoff, R.crowdSize(t));
      }
      const top = list.slice(0, 100).map((e, k) => Object.assign({ pos: k + 1, league: R.league(e.points) }, e));
      return { top, position, cutoff, crowd: R.crowdSize(t), inTop: !!top.find((e) => e.me) };
    },

    // colocação final de uma temporada já encerrada (para o troféu do Top 10)
    finalRank(season, points, realsFinal) {
      const end = R.seasonEnd(season) - 1;
      let above = 0;
      for (let i = 0; i < R.BOT_NAMES.length; i++) if (R.botPoints(i, end) > points) above++;
      for (const r of realsFinal || []) if (r.points > points) above++;
      const cutoff = Math.min(...R.BOT_NAMES.map((_, i) => R.botPoints(i, end)));
      return 1 + above + R.crowdAbove(points, cutoff, R.crowdSize(end));
    },

    // ---------------------------------------------------------------- adversário
    CROWD_A: ['Shadow', 'Iron', 'Dark', 'Fire', 'Ice', 'Storm', 'Wolf', 'Royal', 'Night', 'Golden', 'Lobo', 'Rei', 'Mago', 'Fogo', 'Dragao', 'Cavaleiro', 'Lord', 'Sir', 'Lady', 'Baron'],
    CROWD_B: ['Knight', 'Slayer', 'Hunter', 'Blade', 'Arrow', 'Fang', 'Heart', 'Crown', 'Mage', 'Guard', 'Negro', 'Bravo', 'Sombrio', 'Veloz', 'Feroz', 'Real', 'King', 'Rider', 'Storm', 'Axe'],
    CROWD_W: ['pedro', 'ana', 'lucas', 'maria', 'joao', 'bia', 'gabriel', 'julia', 'rafael', 'sofia', 'tom', 'emma', 'liam', 'noah', 'mia', 'leo', 'nina', 'max', 'lara', 'theo'],
    crowdName(rnd) {
      const pick = (a) => a[Math.floor(rnd() * a.length)];
      const n = Math.floor(rnd() * 4);
      if (n === 0) return pick(R.CROWD_A) + pick(R.CROWD_B) + (rnd() < 0.5 ? Math.floor(rnd() * 99) : '');
      if (n === 1) return pick(R.CROWD_W) + '.' + pick(R.CROWD_B).toLowerCase();
      if (n === 2) return pick(R.CROWD_W) + '_' + pick(R.CROWD_A).toLowerCase() + (2000 + Math.floor(rnd() * 13));
      return pick(R.CROWD_A) + '_' + pick(R.CROWD_W) + Math.floor(rnd() * 999);
    },
    // longe do Top 100: alguém da multidão com pontos parecidos; perto: um dos 6 bots com pontos mais próximos
    pickOpponent(myPoints, t, rnd) {
      rnd = rnd || Math.random;
      const bots = R.bots(t);
      const cutoff = Math.min(...bots.map((b) => b.points));
      if (myPoints < cutoff - 150) {
        const points = Math.max(0, Math.round(myPoints + (rnd() * 2 - 1) * 40));
        return { name: R.crowdName(rnd), baron: BARONS[Math.floor(rnd() * BARONS.length)], points, league: R.league(points), crowd: true };
      }
      const near = bots.sort((a, b) => Math.abs(a.points - myPoints) - Math.abs(b.points - myPoints)).slice(0, 6);
      const o = near[Math.floor(rnd() * near.length)];
      return { name: o.name, baron: o.baron, points: o.points, league: R.league(o.points), trophies: o.trophies, bot: true };
    },
    // dificuldade pela liga do adversário + nível das cartas do jogador (Trono: cartas 1 nível acima)
    aiFor(oppPoints, playerLevel, maxLevel) {
      const li = R.league(oppPoints);
      const difficulty = li <= 1 ? 'easy' : li <= 3 ? 'normal' : 'hard';
      const level = Math.max(1, Math.min(maxLevel || 99, Math.round(playerLevel || 1) + (li >= 5 ? 1 : 0)));
      return { difficulty, level, strongDeck: li >= 5 };
    },
  };

  BB.Ranked = R;
})(window.BB = window.BB || {});

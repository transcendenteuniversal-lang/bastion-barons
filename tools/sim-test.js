// Testes das regras do jogo (combate, energia, baralho, Barões, castelos, vitória, IA, progressão).
// Uso: node tools/sim-test.js
global.window = global;
const path = require('path');
for (const f of ['data', 'strings', 'sim', 'ai', 'progress']) require(path.join(__dirname, '..', 'web', 'js', f + '.js'));
const BB = global.BB;
const content = new BB.Content(BB.CONTENT);
content.balance.testUnlockAll = false; // os testes conferem as regras normais de desbloqueio
let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('  FALHOU  ' + name + '\n        ' + (e && e.message)); }
}
function assert(c, msg) { if (!c) throw new Error(msg || 'asserção falhou'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' esperado ' + JSON.stringify(b) + ', obtido ' + JSON.stringify(a)); }
function near(a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new Error((msg || '') + ' esperado ~' + b + ', obtido ' + a); }

function newMatch(o = {}) {
  const deck = content.balance.starterDeck.slice();
  const m = new BB.Match(content, {
    seed: o.seed || 42,
    players: [
      { baronId: o.baron0 || 'rei_bastion', castleId: o.castle0 || 'royal_fortress', deck: deck.slice() },
      { baronId: o.baron1 || 'rei_bastion', castleId: o.castle1 || 'royal_fortress', deck: deck.slice() },
    ],
  });
  m.recordEvents = false;
  return m;
}
const run = (m, s) => { const n = Math.round(s / m.dt); for (let i = 0; i < n && !m.over; i++) m.step(); };
function force(m, player, id) { const h = m.players[player].deck.hand; let i = h.indexOf(id); if (i < 0) { h[0] = id; i = 0; } return i; }
const play = (m, player, id, lane) => m.execute({ type: 'play', player, hand: force(m, player, id), cardId: id, lane });

console.log('Conteúdo');
test('32 cartas colecionáveis (24 tropas + 8 feitiços), 5 Barões, 3 castelos', () => {
  eq(content.collectible.length, 32); eq(content.collectible.filter((c) => !c.isSpell).length, 24);
  eq(content.barons.length, 5); eq(content.castles.length, 3);
});
test('todas as cartas, Barões e castelos têm textos em pt e en', () => {
  for (const lang of ['pt', 'en']) {
    const S = BB.STRINGS[lang];
    for (const c of content.allCards) assert(S['card.' + c.id + '.name'], lang + ' ' + c.id);
    for (const b of content.barons) assert(S['baron.' + b.id + '.ability'], b.id);
    for (const k of content.castles) assert(S['castle.' + k.id + '.ability'], k.id);
  }
});
test('conteúdo inválido é rejeitado', () => {
  let threw = false;
  try { new BB.Content({ balance: content.balance, cards: [{ id: 'x', type: 'Troop', rarity: 'Nope', cost: 3, hp: 1 }], barons: [], castles: [] }); } catch (e) { threw = true; }
  assert(threw);
});

console.log('Baralho e energia');
test('baralho exige 14 cartas únicas, colecionáveis e possuídas', () => {
  const d = content.balance.starterDeck.slice();
  eq(BB.DeckRules.validate(d, content), 'Ok');
  eq(BB.DeckRules.validate(d.slice(0, 13), content), 'WrongSize');
  const dup = d.slice(); dup[1] = dup[0]; eq(BB.DeckRules.validate(dup, content), 'Duplicate');
  const tok = d.slice(); tok[0] = 'skeleton'; eq(BB.DeckRules.validate(tok, content), 'NotCollectible');
  const p = BB.Progress.create(content); const no = d.slice(); no[0] = 'phoenix';
  eq(BB.DeckRules.validate(no, content, p), 'NotOwned');
});
test('carta jogada vai para o fim da fila e a próxima entra na mão', () => {
  const m = newMatch(); const dk = m.players[0].deck;
  const next = dk.next, played = dk.hand[2]; dk.play(2);
  eq(dk.hand[2], next); eq(dk.queue[dk.queue.length - 1], played);
});
test('energia regenera e para no máximo', () => {
  const m = newMatch(); const e0 = m.players[0].energy; run(m, 2); assert(m.players[0].energy > e0); run(m, 60); near(m.players[0].energy, 10, 1e-6);
});
test('sem energia suficiente a carta é recusada', () => {
  const m = newMatch(); m.players[0].energy = 0; eq(m.execute({ type: 'play', player: 0, hand: 0, lane: 1 }), 'NotEnoughEnergy'); eq(m.units.length, 0);
});
test('energia em dobro no último minuto', () => { const m = newMatch(); run(m, 121); assert(m.doubleEnergy); });
test('comandos inválidos são recusados', () => {
  const m = newMatch();
  eq(m.execute({ type: 'play', player: 0, hand: 0, lane: 3 }), 'InvalidLane');
  eq(m.execute({ type: 'play', player: 0, hand: 9, lane: 0 }), 'InvalidHandIndex');
  eq(m.execute({ type: 'play', player: 0, hand: 0, cardId: 'xyz', lane: 0 }), 'CardMismatch');
  eq(m.execute({ type: 'play', player: 5, hand: 0, lane: 0 }), 'InvalidPlayer');
});

console.log('Combate');
test('tropa nasce, avança e ataca o castelo inimigo', () => {
  const m = newMatch(); m.players[0].energy = 10;
  eq(play(m, 0, 'royal_knight', 1), 'Ok');
  const u = m.units[0], x0 = u.x; run(m, 3); assert(u.x > x0, 'avança'); run(m, 40);
  assert(m.players[1].castleHp < m.players[1].castleMaxHp, 'castelo inimigo recebe dano');
});
test('tropas lutam apenas na mesma rota', () => {
  const m = newMatch(); const k = content.card('royal_knight');
  const a = m.spawnUnit(0, k, 0, 48, 1), b = m.spawnUnit(1, k, 0, 50, 1), c = m.spawnUnit(1, k, 2, 50, 1);
  run(m, 5); assert(a.hp < a.maxHp && b.hp < b.maxHp); near(c.hp, c.maxHp, 0.01);
});
test('corpo a corpo terrestre não atinge voadores', () => {
  const m = newMatch();
  const k = m.spawnUnit(0, content.card('royal_knight'), 1, 50, 1), g = m.spawnUnit(1, content.card('royal_griffin'), 1, 50.5, 1);
  g.stun = 100; run(m, 4); near(g.hp, g.maxHp, 0.01); assert(k.x > 50);
});
test('golem ignora tropas e vai ao castelo', () => {
  const m = newMatch();
  const g = m.spawnUnit(0, content.card('stone_golem'), 1, 50, 1), e = m.spawnUnit(1, content.card('royal_knight'), 1, 51, 1);
  e.stun = 100; run(m, 3); near(e.hp, e.maxHp, 0.01); assert(g.x > 50);
});
test('fênix renasce uma vez', () => {
  const m = newMatch(); const f = m.spawnUnit(0, content.card('phoenix'), 1, 50, 1);
  m.applyDamage(f, 99999, 1); assert(f.hp > 0); near(f.hp, f.maxHp * 0.5, 1); m.applyDamage(f, 99999, 1); assert(f.hp <= 0);
});
test('aura do paladino reduz dano', () => {
  const m = newMatch();
  const a = m.spawnUnit(0, content.card('royal_knight'), 0, 30, 1), b = m.spawnUnit(0, content.card('royal_knight'), 2, 30, 1);
  m.spawnUnit(0, content.card('paladin'), 0, 31, 1); m.applyDamage(a, 100, 1); m.applyDamage(b, 100, 1); assert(a.hp > b.hp);
});
test('bola de fogo causa dano e congelamento paralisa', () => {
  const m = newMatch(); const t = m.spawnUnit(1, content.card('red_orc'), 1, 60, 1);
  m.players[0].energy = 10; eq(play(m, 0, 'fireball', 1), 'Ok'); assert(t.hp < t.maxHp);
  m.players[0].energy = 10; eq(play(m, 0, 'freeze', 1), 'Ok'); assert(t.stun > 0);
});
test('invocação esquelética cria 4 esqueletos temporários', () => {
  const m = newMatch(); m.players[0].energy = 10; play(m, 0, 'skeleton_summon', 2);
  eq(m.units.filter((u) => u.def.id === 'skeleton' && u.lane === 2).length, 4);
  run(m, 30); eq(m.units.filter((u) => u.def.id === 'skeleton' && u.owner === 0).length, 0);
});
test('engenheiro anão constrói torre', () => {
  const m = newMatch(); m.players[0].energy = 10; play(m, 0, 'dwarf_engineer', 0);
  assert(m.units.some((u) => u.def.id === 'dwarf_turret'));
});

console.log('Barões e castelos');
test('poder do Barão só ativa quando carregado', () => {
  const m = newMatch({ baron0: 'eldrin' });
  eq(m.execute({ type: 'baron', player: 0, lane: 1 }), 'NotReady');
  const e = m.spawnUnit(1, content.card('royal_knight'), 1, 60, 1); e.stun = 1000;
  m.players[0].baronCharge = 999; eq(m.execute({ type: 'baron', player: 0, lane: 1 }), 'Ok');
  assert(e.hp < e.maxHp); assert(!m.baronReady(m.players[0]));
});
test('os 5 poderes dos Barões funcionam', () => {
  for (const b of content.barons) {
    const m = newMatch({ baron0: b.id });
    m.spawnUnit(0, content.card('royal_knight'), 1, 40, 1); m.spawnUnit(0, content.card('royal_knight'), 1, 41, 1);
    const e = m.spawnUnit(1, content.card('red_orc'), 1, 70, 1); e.stun = 1000;
    m.players[0].baronCharge = b.chargeSeconds;
    eq(m.execute({ type: 'baron', player: 0, lane: 1 }), 'Ok', b.id);
    if (b.ability === 'OrcFury' || b.ability === 'RoyalCommand') assert(m.players[0].mods.length > 0, b.id);
    run(m, 4);
    if (b.ability === 'ArmyOfDead') assert(m.units.some((u) => u.def.id === 'skeleton'), b.id);
    if (b.ability === 'ArcaneStorm' || b.ability === 'ElvenRain') assert(e.hp < e.maxHp, b.id);
  }
});
test('Escudo Imperial absorve dano do castelo', () => {
  const m = newMatch(); m.players[0].castleCooldown = 0;
  eq(m.execute({ type: 'castle', player: 0, lane: 0 }), 'Ok');
  const hp = m.players[0].castleHp; m.damageCastle(0, 300, 1); near(m.players[0].castleHp, hp, 0.01);
  eq(m.execute({ type: 'castle', player: 0, lane: 0 }), 'NotReady');
});
test('Tempestade de Gelo desacelera inimigos da rota', () => {
  const m = newMatch({ castle0: 'glacial_fortress' }); m.players[0].castleCooldown = 0;
  const slow = m.spawnUnit(1, content.card('royal_knight'), 0, 70, 1), normal = m.spawnUnit(1, content.card('royal_knight'), 2, 70, 1);
  eq(m.execute({ type: 'castle', player: 0, lane: 0 }), 'Ok'); run(m, 3); assert(slow.x > normal.x);
});
test('Sopro do Dragão causa dano na rota', () => {
  const m = newMatch({ castle0: 'draconic_castle' }); m.players[0].castleCooldown = 0;
  const e = m.spawnUnit(1, content.card('red_orc'), 2, 70, 1);
  eq(m.execute({ type: 'castle', player: 0, lane: 2 }), 'Ok'); assert(e.hp < e.maxHp);
});

console.log('Vitória e derrota');
test('vitória ao destruir o castelo', () => {
  const m = newMatch(); m.damageCastle(1, 1e6, 0); m.step(); assert(m.over); eq(m.winner, 0); eq(m.endReason, 'CastleDestroyed');
});
test('fim do tempo: vence maior vida do castelo; igual = empate', () => {
  const m = newMatch(); m.damageCastle(0, 100, 1); run(m, 181); eq(m.winner, 1); eq(m.endReason, 'TimeoutHp');
  const d = newMatch(); run(d, 181); eq(d.winner, -1); eq(d.endReason, 'Draw');
});
test('rendição dá a vitória ao adversário', () => {
  const m = newMatch(); m.surrender(0); eq(m.winner, 1); eq(m.execute({ type: 'baron', player: 0, lane: 0 }), 'MatchOver');
});
test('simulação determinística com a mesma semente', () => {
  const sim = (seed) => {
    const m = newMatch({ seed }); const a = new BB.AI(m, 0, 'normal', seed + 1), b = new BB.AI(m, 1, 'hard', seed + 2);
    for (let i = 0; i < 2000 && !m.over; i++) { a.tick(); b.tick(); m.step(); }
    return JSON.stringify([m.players[0].castleHp, m.players[1].castleHp, m.units.length, m.tick]);
  };
  eq(sim(7), sim(7));
});

console.log('IA');
for (const d of ['easy', 'normal', 'hard']) {
  test('IA ' + d + ' joga partidas completas', () => {
    for (let s = 1; s <= 3; s++) {
      const B = content.barons, C = content.castles;
      const m = newMatch({ seed: s, baron0: B[s % 5].id, castle0: C[s % 3].id, baron1: B[(s + 2) % 5].id, castle1: C[(s + 1) % 3].id });
      const a = new BB.AI(m, 0, d, s), b = new BB.AI(m, 1, 'normal', s + 99);
      let g = 0; while (!m.over && g++ < 10000) { a.tick(); b.tick(); m.step(); }
      assert(m.over, 'terminou'); assert(a.issued > 3, 'jogou cartas (' + a.issued + ')');
    }
  });
}
test('IA difícil vence a fácil na maioria das partidas', () => {
  let hardWins = 0, easyWins = 0;
  for (let s = 1; s <= 20; s++) {
    const m = newMatch({ seed: s * 13 });
    const h = new BB.AI(m, s % 2, 'hard', s), e = new BB.AI(m, 1 - (s % 2), 'easy', s + 5);
    while (!m.over) { h.tick(); e.tick(); m.step(); }
    if (m.winner === s % 2) hardWins++; else if (m.winner === 1 - (s % 2)) easyWins++;
  }
  console.log('        difícil ' + hardWins + ' x ' + easyWins + ' fácil');
  assert(hardWins > easyWins);
});

console.log('Progressão');
test('perfil novo tem baralho válido e só os Barões iniciais', () => {
  const p = BB.Progress.create(content);
  eq(BB.DeckRules.validate(p.decks[0], content, p), 'Ok');
  assert(BB.Progress.baronUnlocked(p, content.baron('elara'))); assert(!BB.Progress.baronUnlocked(p, content.baron('eldrin')));
});
test('evoluir consome cópias e ouro', () => {
  const p = BB.Progress.create(content); const o = BB.Progress.owned(p, 'royal_knight');
  assert(!BB.Progress.canUpgrade(p, content, 'royal_knight'));
  o.copies = 2; p.gold = 100; assert(BB.Progress.upgrade(p, content, 'royal_knight'));
  eq(o.level, 2); eq(o.copies, 0); eq(p.gold, 100 - content.balance.upgradeGold[0]);
});
test('recompensa de vitória e desbloqueio por nível', () => {
  const p = BB.Progress.create(content); const g = p.gold;
  const r = BB.Progress.applyResult(p, content, 1, new BB.Rng(3), { result: 1 });
  eq(p.gold, g + content.balance.winGold); assert(r.cardId); eq(p.wins, 1); eq(p.history.length, 1);
  const un = []; BB.Progress.addXp(p, content, 10000, un); assert(un.includes('baron:eldrin'));
});
test('proteção contra azar garante Épica ou melhor', () => {
  const p = BB.Progress.create(content); p.pity = content.balance.pityThreshold - 1;
  const id = BB.Progress.rollCard(p, content, new BB.Rng(1));
  assert(content.card(id).rarityIndex >= 2); eq(p.pity, 0);
});
test('chances de raridade somam 100%', () => {
  let s = 0; for (let i = 0; i < 5; i++) s += BB.Progress.rarityChance(content.balance, i); near(s, 1, 1e-9);
});
test('save corrompido é reparado', () => {
  const p = BB.Progress.create(content); p.decks[0] = ['invalid']; p.selectedBaron = 'nope'; p.cards.push({ id: 'skeleton' });
  BB.Progress.repair(p, content);
  eq(BB.DeckRules.validate(p.decks[0], content, p), 'Ok'); eq(p.selectedBaron, 'rei_bastion'); assert(!BB.Progress.owned(p, 'skeleton'));
});

console.log('\n' + passed + ' passaram, ' + failed + ' falharam');
process.exit(failed ? 1 : 0);

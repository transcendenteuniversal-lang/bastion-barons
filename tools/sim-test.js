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
test('37 cartas colecionáveis (29 tropas + 8 feitiços), 5 Barões, 3 castelos', () => {
  eq(content.collectible.length, 37); eq(content.collectible.filter((c) => !c.isSpell).length, 29);
  eq(content.barons.length, 5); eq(content.castles.length, 5);
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
test('mão começa com 4, compra 1 a cada intervalo e para em 6', () => {
  const m = newMatch(); const dk = m.players[0].deck;
  eq(dk.hand.length, content.balance.handStart);
  run(m, content.balance.drawInterval + 0.1); eq(dk.hand.length, content.balance.handStart + 1);
  run(m, 60); eq(dk.hand.length, content.balance.handMax);
});
test('carta jogada sai da mão e vai para o fim do baralho; descarte libera espaço', () => {
  const m = newMatch(); const dk = m.players[0].deck; m.players[0].energy = 10;
  const id = dk.hand[0]; const n = dk.hand.length;
  eq(m.execute({ type: 'play', player: 0, hand: 0, cardId: id, lane: 1 }), 'Ok');
  eq(dk.hand.length, n - 1); eq(dk.queue[dk.queue.length - 1], id);
  const d = dk.hand[0];
  eq(m.execute({ type: 'discard', player: 0, hand: 0, cardId: d }), 'Ok');
  eq(dk.hand.length, n - 2); eq(dk.queue[dk.queue.length - 1], d);
});
test('energia começa em 1 e o máximo cresce com o tempo até 10', () => {
  const m = newMatch(); eq(m.players[0].energy, 1); eq(m.energyCap, content.balance.maxEnergyStart);
  run(m, 20); assert(m.energyCap > content.balance.maxEnergyStart); assert(m.players[0].energy <= m.energyCap + 1e-9);
  run(m, 80); eq(m.energyCap, 10);
});
test('invocação: até a tropa mais avançada em qualquer rota (até o meio); na frente de inimigo avançado', () => {
  const m = newMatch(); const k = content.card('royal_knight');
  eq(m.deployX(0, 1), m.spawnX(0));
  near(m.deployX(0, 1, 40, k), m.spawnX(0), 1e-9);              // sem tropas: só na base
  m.spawnUnit(0, k, 2, 30, 1);                                   // tropa avançada em outra rota
  near(m.deployX(0, 1, 40, k), 30, 1e-9);                        // vale para as 3 rotas
  near(m.deployX(0, 0, 20, k), 20, 1e-9);                        // pode soltar antes do limite
  m.spawnUnit(0, k, 2, 80, 1); near(m.deployX(0, 1, 90, k), m.L / 2, 1e-9); // até o meio
  m.spawnUnit(1, k, 1, 25, 1);                                   // inimigo avançado na rota 1
  near(m.deployX(0, 1, 45, k), 25 - m.bodyR(k) - 3, 1e-9);       // entra na frente dele
  m.players[0].energy = 10; const h = m.players[0].deck.hand; h[0] = 'royal_knight';
  eq(m.execute({ type: 'play', player: 0, hand: 0, cardId: 'royal_knight', lane: 0, x: 22 }), 'Ok');
  near(m.units[m.units.length - 1].x, 22, 1e-9);
});
test('a mana enche mais rápido com o tempo', () => {
  const a = newMatch(); a.players[0].energy = 0; a.step(); const e1 = a.players[0].energy;
  const b = newMatch(); run(b, 100); b.players[0].energy = 0; b.step(); assert(b.players[0].energy > e1 * 1.3);
});
test('tropas param de frente, sem atravessar o inimigo', () => {
  const m = newMatch(); const k = content.card('royal_knight');
  const a = m.spawnUnit(0, k, 0, 40, 1), b = m.spawnUnit(1, k, 0, 60, 1);
  run(m, 6); assert(b.x - a.x >= m.bodyR(k) * 2 - 0.01, 'distância ' + (b.x - a.x));
});
test('energia regenera e para no máximo', () => {
  const m = newMatch(); const e0 = m.players[0].energy; run(m, 2); assert(m.players[0].energy > e0); run(m, 90); near(m.players[0].energy, 10, 1e-6);
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
  const k = m.spawnUnit(0, content.card('royal_knight'), 1, 50, 1), g = m.spawnUnit(1, content.card('vampire_bat'), 1, 50.5, 1);
  g.stun = 100; run(m, 4); near(g.hp, g.maxHp, 0.01); assert(k.x > 50);
});
test('golem ignora tropas e vai ao castelo', () => {
  const m = newMatch();
  const g = m.spawnUnit(0, content.card('stone_golem'), 1, 50, 1), e = m.spawnUnit(1, content.card('royal_knight'), 1, 51, 1);
  e.stun = 100; run(m, 3); near(e.hp, e.maxHp, 0.01); assert(g.x > 50);
});
test('fênix renasce uma vez no começo da rota, maior e mais forte', () => {
  const m = newMatch(); const f = m.spawnUnit(0, content.card('phoenix'), 1, 50, 1); const d0 = f.damage;
  m.applyDamage(f, 99999, 1); assert(f.hp > 0); near(f.hp, f.maxHp, 1); near(f.x, m.spawnX(0), 0.01); eq(f.size, 2); near(f.damage, d0 * 2, 0.01);
  m.applyDamage(f, 99999, 1); assert(f.hp <= 0);
});
test('cúpula do paladino: só leva dano de quem está dentro', () => {
  const m = newMatch();
  const a = m.spawnUnit(0, content.card('royal_knight'), 0, 30, 1); m.spawnUnit(0, content.card('paladin'), 0, 31, 1);
  const far = m.spawnUnit(1, content.card('royal_archer'), 0, 60, 1), near_ = m.spawnUnit(1, content.card('barbarian'), 0, 33, 1);
  m.applyDamage(a, 100, 1, far); near(a.hp, a.maxHp, 0.01); m.applyDamage(a, 100, 1, near_); assert(a.hp < a.maxHp);
});
test('habilidades: empurrão, congelar, lobos nas 3 rotas, troca de rota, necromante, demônio', () => {
  let m = newMatch(); const k = m.spawnUnit(0, content.card('royal_knight'), 1, 40, 1), t = m.spawnUnit(1, content.card('stone_guardian'), 1, 44, 1);
  k.deploy = t.deploy = 0; k.attackCd = 0; t.stun = 99; m.step(); near(t.x, 47, 0.01);
  m = newMatch(); const d = m.spawnUnit(0, content.card('ice_dragon'), 1, 40, 1), v = m.spawnUnit(1, content.card('barbarian'), 1, 45, 1);
  d.deploy = v.deploy = 0; d.attackCd = 0; m.step(); assert(v.stun > 1);
  m = newMatch(); m.players[0].energy = 10; eq(play(m, 0, 'war_wolf', 1), 'Ok'); eq(new Set(m.units.map((u) => u.lane)).size, 3);
  m = newMatch(); const e = m.spawnUnit(0, content.card('elven_archer'), 1, 40, 1); e.deploy = 0; m.spawnUnit(1, content.card('barbarian'), 1, 48, 1).deploy = 9; m.step(); assert(e.lane !== 1 && e.hopped);
  m = newMatch(); const n = m.spawnUnit(0, content.card('necromancer'), 1, 20, 1), b = m.spawnUnit(1, content.card('barbarian'), 1, 60, 1);
  m.applyDamage(b, 99999, 0); m.units = m.units.filter((u) => u.hp > 0); assert(m.units.some((u) => u.owner === 0 && u.def.id === 'skeleton'));
  m = newMatch(); const o = m.spawnUnit(1, content.card('red_orc'), 1, 60, 1); const dm = m.spawnUnit(0, content.card('infernal_demon'), 1, 20, 1);
  eq(o.def.id, 'skeleton'); m.applyDamage(dm, 99999, 1); eq(o.def.id, 'red_orc');
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

test('Caçador de Goblins: dobro de dano contra Goblin; Morcego recupera vida', () => {
  const m = newMatch();
  const h = m.spawnUnit(0, content.card('goblin_hunter'), 0, 40, 1), g = m.spawnUnit(1, content.card('goblin_gunner'), 0, 45, 1), k = m.spawnUnit(1, content.card('royal_knight'), 1, 45, 1);
  g.maxHp = g.hp = 2000; m.attack(h, g, 1); m.attack(h, k, 1);
  { const dh = content.card('goblin_hunter').damage; near(g.maxHp - g.hp, dh * 2, 0.01); near(k.maxHp - k.hp, dh, 0.01); }
  const b = m.spawnUnit(0, content.card('vampire_bat'), 2, 40, 1); b.hp = 100;
  const t = m.spawnUnit(1, content.card('stone_golem'), 2, 41, 1); m.attack(b, t, 1); near(b.hp, 133, 0.01);
});
console.log('Barões e castelos');
test('poder do Barão só ativa quando carregado', () => {
  const m = newMatch({ baron0: 'eldrin' });
  eq(m.execute({ type: 'baron', player: 0, lane: 1 }), 'NotReady');
  const e = m.spawnUnit(1, content.card('royal_knight'), 1, 60, 1); 
  m.players[0].baronCharge = 999; eq(m.execute({ type: 'baron', player: 0, lane: 1 }), 'Ok');
  assert(e.stun >= 4 - 1e-6); assert(!m.baronReady(m.players[0]));
});
test('os 5 poderes dos Barões funcionam', () => {
  for (const b of content.barons) {
    const m = newMatch({ baron0: b.id });
    m.spawnUnit(0, content.card('royal_knight'), 1, 40, 1); m.spawnUnit(0, content.card('royal_knight'), 1, 41, 1);
    const e = m.spawnUnit(1, content.card('red_orc'), 1, 70, 1); if (b.ability !== 'ArcaneStorm') e.stun = 1000;
    m.players[0].baronCharge = b.chargeSeconds;
    eq(m.execute({ type: 'baron', player: 0, lane: 1 }), 'Ok', b.id);
    if (b.ability === 'ArcaneStorm') near(e.stun, b.duration, 0.01);
    if (b.ability === 'OrcFury' || b.ability === 'RoyalCommand') assert(m.players[0].mods.length > 0, b.id);
    run(m, 4);
    if (b.ability === 'ArmyOfDead') assert(m.units.some((u) => u.def.id === 'skeleton'), b.id);
    if (b.ability === 'ElvenRain') assert(e.hp < e.maxHp, b.id);
  }
});
test('Escudo Imperial absorve dano do castelo', () => {
  const m = newMatch(); m.players[0].castleCooldown = 0;
  eq(m.execute({ type: 'castle', player: 0, lane: 0 }), 'Ok');
  const hp = m.players[0].castleHp; m.damageCastle(0, 300, 1); near(m.players[0].castleHp, hp, 0.01);
  eq(m.execute({ type: 'castle', player: 0, lane: 0 }), 'NotReady');
});
test('Bênção da Floresta cura castelo e tropas aliadas', () => {
  const m = newMatch({ castle0: 'sylvan_sanctuary' }); m.players[0].castleCooldown = 0;
  const u = m.spawnUnit(0, content.card('royal_knight'), 1, 20, 1); u.hp = u.maxHp * 0.2;
  m.players[0].castleHp -= 500; const hp = m.players[0].castleHp;
  eq(m.execute({ type: 'castle', player: 0, lane: 0 }), 'Ok');
  near(m.players[0].castleHp, hp + 350, 0.01); near(u.hp, u.maxHp * 0.5, 0.01);
});
test('Dreno de Almas causa dano na rota e cura o castelo', () => {
  const m = newMatch({ castle0: 'shadow_necropolis' }); m.players[0].castleCooldown = 0;
  const a = m.spawnUnit(1, content.card('royal_knight'), 0, 70, 1), b = m.spawnUnit(1, content.card('royal_knight'), 2, 70, 1);
  m.players[0].castleHp -= 1000; const hp = m.players[0].castleHp, ha = a.hp, hb = b.hp;
  eq(m.execute({ type: 'castle', player: 0, lane: 0 }), 'Ok');
  near(a.hp, ha - 220, 0.01); near(b.hp, hb, 0.01); near(m.players[0].castleHp, hp + 220 * 0.6, 0.01);
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
  for (let s = 1; s <= 40; s++) {
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

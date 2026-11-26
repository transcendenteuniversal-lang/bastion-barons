// Testes das regras do jogo (combate, energia, baralho, Barões, castelos, vitória, IA, progressão).
// Uso: node tools/sim-test.js
global.window = global;
const path = require('path');
for (const f of ['data', 'strings', 'sim', 'ai', 'progress', 'ranked', 'shop']) require(path.join(__dirname, '..', 'web', 'js', f + '.js'));
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
test('40 cartas colecionáveis (31 tropas + 9 feitiços), 5 Barões, 5 castelos', () => {
  eq(content.collectible.length, 40); eq(content.collectible.filter((c) => !c.isSpell).length, 31);
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
  m.applyDamage(f, 99999, 1); assert(f.hp > 0); near(f.hp, f.maxHp, 1); near(f.x, m.spawnX(0), 0.01); eq(f.size, 1.5); near(f.damage, d0 * 2, 0.01);
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
  k.deploy = t.deploy = 0; k.attackCd = 0; t.stun = 99; run(m, 0.5); near(t.x, 47, 0.01);
  m = newMatch(); const d = m.spawnUnit(0, content.card('ice_dragon'), 1, 40, 1), v = m.spawnUnit(1, content.card('barbarian'), 1, 45, 1);
  d.deploy = v.deploy = 0; d.attackCd = 0; run(m, 0.5); assert(v.stun > 0.5);
  m = newMatch(); m.players[0].energy = 10; eq(play(m, 0, 'war_wolf', 1), 'Ok'); eq(new Set(m.units.map((u) => u.lane)).size, 3);
  m = newMatch(); const e = m.spawnUnit(0, content.card('elven_archer'), 1, 40, 1); e.deploy = 0; m.spawnUnit(1, content.card('barbarian'), 1, 44, 1).deploy = 9; m.step(); assert(e.lane !== 1 && e.hopped);
  m = newMatch(); const n = m.spawnUnit(0, content.card('necromancer'), 1, 20, 1), b = m.spawnUnit(1, content.card('barbarian'), 1, 60, 1);
  m.applyDamage(b, 99999, 0); m.units = m.units.filter((u) => u.hp > 0); assert(m.units.some((u) => u.owner === 0 && u.def.id === 'skeleton'));
  m = newMatch(); const o = m.spawnUnit(1, content.card('red_orc'), 1, 60, 1); const dm = m.spawnUnit(0, content.card('infernal_demon'), 1, 20, 1);
  eq(o.def.id, 'skeleton'); near(o.hp / o.maxHp, 1, 1e-6); o.hp = o.maxHp * 0.5; m.applyDamage(dm, 99999, 1); eq(o.def.id, 'red_orc'); near(o.hp / o.maxHp, 0.5, 1e-6);
  m = newMatch(); const tr = m.spawnUnit(0, content.card('mountain_troll'), 1, 40, 1), a1 = m.spawnUnit(1, content.card('stone_guardian'), 1, 45, 1), a2 = m.spawnUnit(1, content.card('stone_guardian'), 1, 47, 1);
  tr.deploy = 0; tr.attackCd = 0; a1.stun = a2.stun = 99; run(m, 0.5); near(a1.x, 45, 0.01); for (let i = 0; i < 10; i++) m.step(); assert(a1.x > 90 && a2.x > 90, 'troll arremessa em área depois do golpe');
});
test('bola de fogo causa dano e congelamento paralisa', () => {
  const m = newMatch(); const t = m.spawnUnit(1, content.card('red_orc'), 1, 60, 1);
  m.players[0].energy = 10; eq(play(m, 0, 'fireball', 1), 'Ok'); m.processDelayedAll(); assert(t.hp < t.maxHp);
  m.players[0].energy = 10; eq(play(m, 0, 'freeze', 1), 'Ok'); assert(t.stun > 0);
});
test('invocação esquelética cria 5 esqueletos temporários', () => {
  const m = newMatch(); m.players[0].energy = 10; play(m, 0, 'skeleton_summon', 2);
  eq(m.units.filter((u) => u.def.id === 'skeleton' && u.lane === 2).length, 5);
  run(m, 30); eq(m.units.filter((u) => u.def.id === 'skeleton' && u.owner === 0).length, 0);
});
test('engenheiro anão constrói torre', () => {
  const m = newMatch(); m.players[0].energy = 10; play(m, 0, 'dwarf_engineer', 0);
  assert(m.units.some((u) => u.def.id === 'dwarf_turret'));
});

test('Duende da Balista atinge de muito longe; Morcego recupera vida', () => {
  const m = newMatch();
  const h = m.spawnUnit(0, content.card('goblin_hunter'), 0, 20, 1), k = m.spawnUnit(1, content.card('royal_knight'), 0, 75, 1);
  h.deploy = 0; k.stun = 99; eq(m.findTarget(h), k);
  const b = m.spawnUnit(0, content.card('vampire_bat'), 2, 40, 1); b.hp = 100;
  const t = m.spawnUnit(1, content.card('stone_golem'), 2, 41, 1); m.attack(b, t, 1); near(b.hp, 100 + content.card('vampire_bat').damage * 0.3, 0.01);
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
  a.stun = b.stun = 99; eq(m.execute({ type: 'castle', player: 0, lane: 0 }), 'Ok'); m.processDelayedAll();
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
  eq(m.execute({ type: 'castle', player: 0, lane: 2 }), 'Ok'); m.processDelayedAll(); assert(e.hp < e.maxHp);
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
  const lvGold = r.levelRewards.reduce((s, x) => s + x.gold, 0);
  eq(p.gold, g + content.balance.winGold * 2 + lvGold); assert(r.firstWin, '1ª vitória do dia vale o dobro'); assert(r.cardId); eq(p.wins, 1); eq(p.history.length, 1);
  const g2 = p.gold; const r2 = BB.Progress.applyResult(p, content, 1, new BB.Rng(4), null); eq(p.gold, g2 + content.balance.winGold + r2.levelRewards.reduce((s, x) => s + x.gold, 0));
  const un = []; BB.Progress.addXp(p, content, 10000, un); assert(un.includes('baron:eldrin'));
});
test('recompensa diária: uma por dia, sequência de 7 dias', () => {
  const p = BB.Progress.create(content); p.tutorialDone = true; const g = p.gold;
  assert(BB.Progress.dailyAvailable(p)); const r = BB.Progress.claimDaily(p, content, new BB.Rng(5));
  eq(r.day, 1); eq(p.gold, g + BB.Progress.DAILY[0].gold); assert(!BB.Progress.dailyAvailable(p)); eq(BB.Progress.claimDaily(p, content, new BB.Rng(5)), null);
  const y = new Date(); y.setDate(y.getDate() - 1); p.daily.last = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();
  eq(BB.Progress.claimDaily(p, content, new BB.Rng(6)).day, 2);
});
test('trilha de níveis: ouro em todo nível, carta a cada 3, baú e cristais a cada 5', () => {
  const p = BB.Progress.create(content); const g = p.gold, c = p.crystals, n = p.cards.reduce((s, o) => s + 1 + o.copies, 0);
  const rw = []; BB.Progress.addXp(p, content, BB.Progress.xpForNext(content.balance, 1) + BB.Progress.xpForNext(content.balance, 2) + BB.Progress.xpForNext(content.balance, 3) + BB.Progress.xpForNext(content.balance, 4), [], new BB.Rng(9), rw);
  eq(p.accountLevel, 5); eq(rw.length, 4); eq(p.gold - g, rw.reduce((s, x) => s + x.gold, 0)); eq(p.crystals - c, 20);
  eq(p.cards.reduce((s, o) => s + 1 + o.copies, 0) - n, 1 + 3, 'cartas (nível 3 + baú do nível 5)');
  eq(BB.Progress.levelReward(30).crystals, 200);
});
test('baú de vitórias: 3 cartas a cada 5 vitórias', () => {
  const p = BB.Progress.create(content); let chest = null;
  for (let i = 0; i < 5; i++) { const r = BB.Progress.applyResult(p, content, 1, new BB.Rng(20 + i), null); if (r.chest) chest = { i, n: r.chest.length }; }
  assert(chest && chest.i === 4 && chest.n === 3, JSON.stringify(chest)); eq(p.chestWins, 0);
  BB.Progress.applyResult(p, content, -1, new BB.Rng(1), null); eq(p.chestWins, 0, 'derrota não conta');
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

console.log('Ranqueada');
{
  const R = BB.Ranked;
  const T0 = Date.UTC(2026, 11, 10, 12);
  test('pontos: vitória +20, bônus por adversário mais forte (máx. +10), derrota -12, empate +3', () => {
    eq(R.matchDelta(1, 500, 500, 0), 20);
    eq(R.matchDelta(1, 500, 620, 0), 26);
    eq(R.matchDelta(1, 500, 539, 0), 21);
    eq(R.matchDelta(1, 500, 2000, 0), 30);
    eq(R.matchDelta(1, 500, 300, 0), 20);
    eq(R.matchDelta(-1, 500, 900, 5), -12);
    eq(R.matchDelta(0, 500, 500, 2), 3);
  });
  test('sequência: +5 a partir da 3ª vitória seguida; derrota zera', () => {
    const st = R.newState('2026-12');
    eq(R.applyMatch(st, 1, 0).delta, 20); eq(R.applyMatch(st, 1, 0).delta, 20); eq(R.applyMatch(st, 1, 0).delta, 25);
    eq(st.streak, 3); R.applyMatch(st, -1, 0); eq(st.streak, 0); eq(R.applyMatch(st, 1, 0).delta, 20);
    eq(st.wins, 4); eq(st.losses, 1);
  });
  test('ligas: pisos 0/300/700/1200/1800/2500 e textos em pt e en', () => {
    eq(R.league(0), 0); eq(R.league(299), 0); eq(R.league(300), 1); eq(R.league(1199), 2); eq(R.league(2500), 5); eq(R.league(9000), 5);
    for (const lang of ['pt', 'en']) for (const l of R.LEAGUES) assert(BB.STRINGS[lang]['league.' + l.id], lang + ' ' + l.id);
  });
  test('proteção de liga: quem alcança a liga não cai abaixo do piso', () => {
    const st = Object.assign(R.newState('2026-12'), { points: 295, streak: 0 });
    const r = R.applyMatch(st, 1, 295); assert(r.promoted, 'subiu'); eq(st.maxLeague, 1); eq(st.points, 315);
    R.applyMatch(st, -1, 0); eq(st.points, 303); R.applyMatch(st, -1, 0); eq(st.points, 300); R.applyMatch(st, -1, 0); eq(st.points, 300);
    const z = R.newState('2026-12'); R.applyMatch(z, -1, 0); eq(z.points, 0);
  });
  test('temporada mensal em UTC', () => {
    eq(R.seasonId(Date.UTC(2026, 11, 31, 23, 59)), '2026-12'); eq(R.seasonId(Date.UTC(2027, 0, 1, 0, 0)), '2027-01');
    eq(R.seasonEnd('2026-12'), Date.UTC(2027, 0, 1)); eq(R.prevSeason('2027-01'), '2026-12');
    eq(R.daysLeft(Date.UTC(2026, 11, 30, 12)), 2);
  });
  test('virada: pontos pela metade, prêmio pela maior liga, Top 10 ganha troféu', () => {
    const st = Object.assign(R.newState('2026-12'), { points: 1250, maxLeague: 4, wins: 30, losses: 10, trophies: 1 });
    const rw = R.rollover(st, Date.UTC(2027, 0, 2), () => 7);
    eq(rw.season, '2026-12'); eq(rw.league, 4); assert(rw.top10); eq(rw.gold, R.REWARDS[4].gold + R.TOP10.gold); eq(rw.crystals, R.REWARDS[4].crystals + R.TOP10.crystals);
    eq(st.season, '2027-01'); eq(st.points, 625); eq(st.maxLeague, 1); eq(st.trophies, 2); eq(st.prevPoints, 1250); eq(st.prevSeason, '2026-12'); eq(st.wins, 0);
    eq(R.rollover(st, Date.UTC(2027, 0, 3), () => 1), null, 'mesma temporada');
    const idle = R.newState('2026-11'); idle.points = 400; eq(R.rollover(idle, Date.UTC(2027, 0, 2)), null, 'sem partidas: sem prêmio'); eq(idle.points, 100);
  });
  test('bots: 100 nomes únicos e pontos iguais em qualquer aparelho (determinísticos)', () => {
    eq(R.BOT_NAMES.length, 100); eq(new Set(R.BOT_NAMES).size, 100);
    const a = R.bots(T0).map((b) => b.points).join(), b = R.bots(T0).map((x) => x.points).join(); eq(a, b);
    assert(R.botPoints(3, T0) !== R.botPoints(3, T0 + 2 * 3600000) || R.botPoints(5, T0) !== R.botPoints(5, T0 + 2 * 3600000), 'oscila com o tempo');
  });
  test('bots: fim da temporada ~2.800 no 1º e ~700 no 100º; começam perto da metade', () => {
    const end = R.bots(R.seasonEnd('2026-12') - 1).map((b) => b.points).sort((x, y) => y - x);
    near(end[0], 2800, 60); near(end[99], 700, 60);
    const start = R.bots(R.seasonStart('2026-12') + 3600000).map((b) => b.points).sort((x, y) => y - x);
    assert(start[0] > 1100 && start[0] < 1800, 'topo no começo ' + start[0]);
  });
  test('bots: a ordem muda entre temporadas e alguns têm troféus', () => {
    const top = (s) => R.bots(R.seasonEnd(s) - 1).sort((x, y) => y.points - x.points).slice(0, 10).map((b) => b.name).join();
    assert(top('2026-12') !== top('2027-01'));
    assert(R.bots(T0).some((b) => b.trophies > 0));
  });
  test('multidão: 0 pontos fica bem abaixo do Top 100; acima do corte não há multidão acima', () => {
    const b0 = R.board(T0, [], { id: 'me', name: 'Eu', points: 0 });
    assert(b0.position > 1000, 'posição ' + b0.position); assert(!b0.inTop);
    eq(R.crowdAbove(900, 700, 1400), 0); eq(R.crowdAbove(0, 700, 1400), 1400); eq(R.crowdAbove(350, 700, 1400), Math.round(1400 * Math.pow(0.5, 2.5)));
    const hi = R.board(T0, [], { id: 'me', name: 'Eu', points: 5000 }); eq(hi.position, 1); assert(hi.inTop); eq(hi.top[0].me, true);
  });
  test('ranking junta jogadores reais e conta quem está acima de você', () => {
    const reals = [{ id: 'r1', name: 'Real1', points: 99999 }, { id: 'me', name: 'Eu', points: 1 }];
    const b = R.board(T0, reals, { id: 'me', name: 'Eu', points: 4000 });
    eq(b.position, 2); eq(b.top[0].name, 'Real1'); eq(b.top.filter((e) => e.me).length, 1); eq(b.top.length, 100);
  });
  test('adversário: multidão quando longe do Top 100; um dos 6 bots mais próximos quando perto', () => {
    let k = 0; const rnd = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
    const far = R.pickOpponent(50, T0, rnd); assert(far.crowd && far.name); assert(Math.abs(far.points - 50) <= 40);
    const near6 = R.bots(T0).sort((a, b) => Math.abs(a.points - 1500) - Math.abs(b.points - 1500)).slice(0, 6).map((b) => b.name);
    for (let i = 0; i < 20; i++) { const o = R.pickOpponent(1500, T0, rnd); assert(o.bot && near6.includes(o.name), o.name); }
  });
  test('dificuldade acompanha a liga do adversário e o nível do jogador', () => {
    eq(R.aiFor(100, 1, 9).difficulty, 'easy'); eq(R.aiFor(800, 2, 9).difficulty, 'normal'); eq(R.aiFor(1900, 3, 9).difficulty, 'hard');
    const top = R.aiFor(2600, 3, 9); eq(top.level, 4); assert(top.strongDeck); eq(R.aiFor(2600, 9, 9).level, 9);
  });
}

console.log('Loja');
{
  const S = BB.Shop;
  test('catálogo: 6 tipos de skin, todas com preço e nome em pt/en, alvos válidos', () => {
    for (const t of S.TYPES) assert(S.SKINS.some((s) => s.type === t), t);
    eq(new Set(S.SKINS.map((s) => s.id)).size, S.SKINS.length, 'ids únicos');
    for (const s of S.SKINS) {
      assert(s.free || s.price > 0, s.id); assert(s.name.pt && s.name.en, s.id);
      if (s.type === 'baron') assert(content.baronById[s.target], s.id);
      if (s.type === 'castle') assert(content.castleById[s.target], s.id);
      if (s.type === 'troop') assert(content.cards[s.target], s.id);
    }
  });
  test('comprar skin gasta cristais, equipa e não compra duas vezes', () => {
    const p = BB.Progress.create(content); p.crystals = 1000;
    eq(S.buySkin(p, 'baron_thorg_lava'), 'Ok'); eq(p.crystals, 1000 - S.PRICE.epic);
    eq(S.equipped(p, 'baron', 'thorg').id, 'baron_thorg_lava'); eq(S.buySkin(p, 'baron_thorg_lava'), 'Owned');
    eq(S.equip(p, 'baron_thorg_lava'), 'Ok'); eq(S.equipped(p, 'baron', 'thorg'), null, 'tocar de novo volta ao padrão');
    p.crystals = 10; eq(S.buySkin(p, 'baron_eldrin_storm'), 'NoFunds'); eq(p.crystals, 10);
    eq(S.equip(p, 'avatar_phoenix'), 'NotOwned');
  });
  test('comemoração e emotes têm padrão grátis', () => {
    const p = BB.Progress.create(content);
    eq(S.equipped(p, 'celebration').id, 'cel_confetti'); eq(S.equipped(p, 'emotes').fx.length, 5);
    p.crystals = 500; S.buySkin(p, 'emo_dragon'); eq(S.equipped(p, 'emotes').id, 'emo_dragon');
  });
  test('ofertas do dia: 3 cartas fixas no dia, compra uma vez cada', () => {
    const p = BB.Progress.create(content); p.gold = 10000;
    const a = S.offers(p, content, '2026-11-26'), b = S.offers(p, content, '2026-11-26');
    eq(a.length, 3); eq(JSON.stringify(a), JSON.stringify(b)); assert(JSON.stringify(a) !== JSON.stringify(S.offers(p, content, '2026-11-27')), 'muda no dia seguinte');
    const g = p.gold; eq(S.buyOffer(p, content, '2026-11-26', 0), 'Ok'); eq(p.gold, g - a[0].price); eq(S.buyOffer(p, content, '2026-11-26', 0), 'Bought');
    assert(BB.Progress.owned(p, a[0].id));
  });
  test('baús: número de cartas, preço e raridade mínima garantida', () => {
    for (const c of S.CHESTS) for (let k = 0; k < 30; k++) {
      const p = BB.Progress.create(content); p.gold = 5000; p.crystals = 500;
      const ids = S.openChest(p, content, c.id, new BB.Rng(100 + k));
      eq(ids.length, c.cards); assert(ids.some((id) => content.card(id).rarityIndex >= c.minRarity), c.id + ' sem a raridade garantida');
      eq(p.gold, 5000 - (c.cost.gold || 0)); eq(p.crystals, 500 - (c.cost.crystals || 0));
    }
    const pobre = BB.Progress.create(content); pobre.gold = 0; eq(S.openChest(pobre, content, 'wood', new BB.Rng(1)), null);
  });
  test('trocar cristais por ouro', () => {
    const p = BB.Progress.create(content); p.crystals = 100; const g = p.gold;
    eq(S.buyGold(p, 'gold_s'), 'Ok'); eq(p.gold, g + 1000); eq(p.crystals, 0); eq(S.buyGold(p, 'gold_s'), 'NoFunds');
  });
}

console.log('\n' + passed + ' passaram, ' + failed + ' falharam');
process.exit(failed ? 1 : 0);

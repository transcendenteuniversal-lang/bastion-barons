// Teste da loja no navegador: abas, compra, equipar, skin na batalha e comemoração da vitória.
// Uso: node tools/shop-browser-test.js <pasta-de-capturas>
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = process.argv[2] || 'screenshots-shop';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const ok = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('  ok  ' + m); };
  const ev = (f, a) => page.evaluate(f, a);
  const shot = (n) => page.screenshot({ path: path.join(out, n + '.png') });
  await page.goto('file://' + path.join(__dirname, '..', 'web', 'index.html'));
  await page.waitForSelector('#coach', { timeout: 15000 });
  await ev(() => { BB.battle.tut.end(); BB.battle.stop(); const p = BB.profile; p.gold = 3000; p.crystals = 5000; p.daily.last = BB.Progress.today(); BB.ui.show('menu'); });
  await page.waitForTimeout(500);
  ok(await page.$('[data-go=shop]'), 'botão Loja no menu');
  await page.click('[data-go=shop]'); await page.waitForTimeout(500); await shot('01-ofertas');
  const g0 = await ev(() => BB.profile.gold);
  await page.click('[data-offer="0"]'); await page.waitForTimeout(400);
  ok((await ev(() => BB.profile.gold)) < g0, 'comprou a oferta do dia com ouro');
  await page.click('[data-tab=chests]'); await page.waitForTimeout(400); await shot('02-baus');
  await page.click('[data-chest=iron]'); await page.waitForTimeout(700); await shot('03-bau-aberto');
  ok((await page.$$('.sh-card')).length === 6, 'baú de ferro: 6 cartas reveladas');
  await page.click('.sh-reveal .btn'); await page.waitForTimeout(300);
  await page.click('[data-tab=skins]'); await page.waitForTimeout(400); await shot('04-skins-baroes');
  await page.click('[data-skin=baron_bastion_gold]'); await page.waitForTimeout(300); await page.click('.modal .btn.gold'); await page.waitForTimeout(400);
  ok(await ev(() => BB.Shop.isEquipped(BB.profile, 'baron_bastion_gold')), 'comprou e equipou a skin do Rei Bastion');
  for (const [t, id] of [['castle', 'castle_royal_shadow'], ['troop', 'troop_knight_gold'], ['avatar', 'avatar_dragon'], ['celebration', 'cel_fireworks'], ['emotes', 'emo_kingdom']]) {
    await page.click('[data-type=' + t + ']'); await page.waitForTimeout(350); await shot('05-skins-' + t);
    await page.click('[data-skin=' + id + ']'); await page.waitForTimeout(250); await page.click('.modal .btn.gold'); await page.waitForTimeout(350);
    ok(await ev((i) => BB.Shop.isEquipped(BB.profile, i), id), 'comprou e equipou ' + id);
  }
  await page.click('[data-tab=gems]'); await page.waitForTimeout(400); await shot('06-cristais');
  await ev(() => BB.ui.show('menu')); await page.waitForTimeout(500); await shot('07-menu-avatar');
  ok((await ev(() => document.querySelector('.topbar .avatar').getAttribute('src'))).includes('fire_dragon'), 'foto de perfil no menu');
  // batalha com as skins (Fortaleza Real + Rei Bastion são os iniciais)
  await ev(() => BB.ui.show('battle', { difficulty: 'easy' })); await page.waitForTimeout(1200);
  const sk = await ev(() => { const s = BB.renderer.skinSet; return { baron: s.baron[0] && s.baron[0].id, castle: s.castle[0] && s.castle[0].id, knight: !!s.unit[0].royal_knight, foe: s.baron[1] }; });
  ok(sk.baron === 'baron_bastion_gold' && sk.castle === 'castle_royal_shadow' && sk.knight && !sk.foe, 'skins aplicadas só no seu lado da batalha');
  ok((await ev(() => [...document.querySelectorAll('#emotes [data-e]')].map((e) => e.dataset.e).join(''))) === '👑🏰⚔️🛡️🎉', 'pacote de emotes na partida');
  await ev(() => { const m = BB.battle.match; m.spawnUnit(0, BB.content.card('royal_knight'), 1, 30, 1); }); await page.waitForTimeout(1500); await shot('08-batalha-skins');
  await ev(() => { const m = BB.battle.match; m.damageCastle(1, m.players[1].castleHp + 1, 0, 1); }); await page.waitForTimeout(1300);
  ok(await page.$('.celebrate'), 'comemoração da vitória aparece'); await shot('09-comemoracao');
  console.log(errors.length ? 'ERROS:\n' + errors.join('\n') : 'sem erros no console');
  await b.close(); process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(1); });

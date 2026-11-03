// Teste no navegador: abre o jogo como celular (toque), navega pelos menus, joga uma batalha e tira capturas.
// Uso: node tools/browser-test.js <pasta-de-saida>
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = process.argv[2] || 'screenshots';
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: Number(process.env.VW || 860), height: Number(process.env.VH || 400) }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const shot = (n) => page.screenshot({ path: path.join(out, n + '.png') });
  const wait = (ms) => page.waitForTimeout(ms);

  await page.goto('file://' + path.join(__dirname, '..', 'web', 'index.html'));
  await wait(600); await shot('01-abertura');
  await wait(1400); await shot('02-menu');

  await page.tap('[data-go=barons]'); await wait(300); await shot('03-baroes');
  await page.tap('#backBtn');
  await page.tap('[data-go=castles]'); await wait(300); await shot('04-castelos');
  await page.tap('#backBtn');
  await page.tap('[data-go=collection]'); await wait(400); await shot('05-colecao');
  await page.tap('#grid .card'); await wait(300); await shot('06-carta');
  await page.tap('#backBtn'); await page.tap('#backBtn');
  await page.tap('[data-go=deck]'); await wait(400); await shot('07-baralho');
  await page.tap('#backBtn');

  // batalha
  await page.tap('[data-go=mode]'); await wait(300); await shot('08-modos');
  await page.tap('[data-d=normal]'); await wait(500); await shot('09-ajuda');
  await page.tap('.modal .btn'); await wait(300);

  // centro de cada rota em pixels de tela (coordenadas da arte da arena)
  const lanes = await page.evaluate(() => BB.ARENA.lanes.map((l) => ({ x: BB.renderer.X(830), y: BB.renderer.Y(l.y) })));
  const drag = async (slot, to, shotName) => {
    const c = await page.$('#slot' + slot + ' .card'); const b = await c.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 }); if (shotName) { await wait(100); await shot(shotName); }
    await page.mouse.up();
  };
  // arrastar carta até a rota do meio
  const card = await page.$('#slot0 .card');
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(lanes[1].x, lanes[1].y, { steps: 6 });
  await wait(100); await shot('10-arrastando');
  await page.mouse.up();
  // tocar sem arrastar não invoca; arrastar até a rota de cima invoca
  await wait(1500);
  const before = await page.evaluate(() => BB.battle.match.players[0].stats.cardsPlayed);
  await page.tap('#slot1 .card'); await wait(100); await page.tap('canvas#field', { position: lanes[0] });
  if ((await page.evaluate(() => BB.battle.match.players[0].stats.cardsPlayed)) !== before) errors.push('tocar carta + rota não deveria invocar');
  await page.evaluate(() => { BB.battle.match.players[0].energy = 10; });
  await drag(1, lanes[0]);
  await wait(5000); await shot('11-batalha');
  // poder do Barão e do castelo (forçando carga)
  await page.evaluate(() => { const p = BB.battle.match.players[0]; p.baronCharge = 999; p.castleCooldown = 0; p.energy = 10; });
  const dragEl = async (sel, to) => { const b = await (await page.$(sel)).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up(); await wait(100); };
  await page.tap('#baronBtn'); await wait(100);
  if ((await page.evaluate(() => BB.battle.match.players[0].stats.baronUses)) !== 0) errors.push('tocar no poder não deveria usar');
  await dragEl('#baronBtn', lanes[1]);
  await dragEl('#castleBtn', lanes[1]);
  for (let i = 0; i < 3; i++) { await page.evaluate(() => { BB.battle.match.players[0].energy = 10; }); await drag(i, lanes[i]); await wait(150); }
  await wait(250); await shot('12-poderes');
  await wait(6000); await shot('13-combate');
  const mid = await page.evaluate(() => ({ units: BB.battle.match.units.length, played: BB.battle.match.players[0].stats.cardsPlayed, baron: BB.battle.match.players[0].stats.baronUses, castle: BB.battle.match.players[0].stats.castleUses }));

  // pausa
  await page.tap('#pauseBtn'); await wait(200); await shot('14-pausa');
  await page.tap('.modal .btn.green'); await wait(200);

  // acelera até o fim com o jogador controlado por IA
  await page.evaluate(() => {
    const m = BB.battle.match; const me = new BB.AI(m, 0, 'hard', 3);
    for (let i = 0; i < 20 * 400 && !m.over; i++) { me.tick(); BB.battle.ai.tick(); m.step(); }
  });
  await wait(1200); await shot('15-fim');
  await wait(3000); await shot('16-resultado');
  const end = await page.evaluate(() => ({ screen: BB.ui.current(), battles: BB.profile.battles, history: BB.profile.history.length }));
  await page.tap('[data-go=menu]'); await wait(300);
  // segunda batalha: o HUD (cartas e botões) tem que aparecer de novo
  await page.tap('[data-go=mode]'); await wait(300);
  await page.tap('[data-d=normal]'); await wait(500);
  if (await page.$('.modal .btn')) { await page.tap('.modal .btn'); await wait(300); }
  await wait(800); await shot('16b-segunda-batalha');
  const second = await page.evaluate(() => {
    const h = document.getElementById('hud'); const cs = getComputedStyle(h);
    return { cls: h.className, visible: cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.5,
      slotVisible: getComputedStyle(document.getElementById('slot0')).visibility !== 'hidden' };
  });
  if (!second.visible || !second.slotVisible) errors.push('HUD sumiu na segunda batalha: ' + JSON.stringify(second));
  await page.evaluate(() => { BB.battle.stop(); BB.ui.show('menu'); });
  await wait(300);
  await page.tap('[data-go=history]'); await wait(300); await shot('17-historico');
  await page.tap('#backBtn');
  await page.tap('[data-go=settings]'); await wait(300); await shot('18-config');
  await page.tap('#lang'); await wait(200); await shot('19-ingles');

  console.log(JSON.stringify({ mid, end, second }, null, 0));
  console.log(errors.length ? 'ERROS:\n' + errors.join('\n') : 'sem erros no console');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();

// Teste das skins fora da loja: perfil clicável com "Minhas skins", seletor nas telas de Barões, Castelos e na carta,
// e a conta de teste (todas as skins liberadas pelo login). Uso: node tools/skins-browser-test.js <pasta>
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = process.argv[2] || 'screenshots-skins';
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
  await ev(() => { BB.battle.tut.end(); BB.battle.stop(); BB.profile.daily.last = BB.Progress.today(); BB.ui.show('menu'); });
  await page.waitForTimeout(400);
  ok(!(await ev(() => BB.Shop.owns(BB.profile, 'baron_thorg_lava'))), 'conta comum não tem skins pagas');
  // perfil clicável
  await page.click('#profileBtn'); await page.waitForTimeout(500); await shot('01-perfil-comum');
  ok(await ev(() => BB.ui.current() === 'profile'), 'tocar no perfil abre a tela de Perfil');
  ok((await page.$$('.sk-opt.locked')).length > 0, 'skins que não tem aparecem bloqueadas');
  await page.click('.sk-pick[data-type=avatar] .sk-opt.locked'); await page.waitForTimeout(400);
  ok(await ev(() => BB.ui.current() === 'shop'), 'tocar numa bloqueada abre a Loja');
  // conta de teste: e-mail do dono logado -> tudo liberado
  await ev(() => { BB.cloud.saveSession({ access_token: 'x', refresh_token: 'y', expires_at: 9999999999, user: { id: 'u1', email: 'TranscendenteUniversal@gmail.com' } }); BB.Shop.checkTester(); BB.ui.show('profile'); });
  await page.waitForTimeout(500); await shot('02-perfil-teste');
  ok(await ev(() => BB.Shop._tester && BB.Shop.owns(BB.profile, 'baron_thorg_lava')), 'conta de teste com todas as skins');
  ok((await page.$$('.sk-opt.locked')).length === 0, 'nada bloqueado na conta de teste');
  await page.click('.sk-pick[data-type=avatar] [data-sk=avatar_phoenix]'); await page.waitForTimeout(400);
  ok(await ev(() => BB.Shop.isEquipped(BB.profile, 'avatar_phoenix')), 'trocou a foto de perfil no Perfil');
  // Barões
  await ev(() => BB.ui.show('barons')); await page.waitForTimeout(500);
  await page.click('.sk-pick[data-target=rei_bastion] [data-sk=baron_bastion_gold]'); await page.waitForTimeout(400); await shot('03-baroes');
  ok(await ev(() => BB.Shop.isEquipped(BB.profile, 'baron_bastion_gold')), 'escolheu a skin direto na tela de Barões');
  await page.click('.sk-pick[data-target=rei_bastion] [data-sk=""]'); await page.waitForTimeout(300);
  ok(await ev(() => !BB.Shop.equipped(BB.profile, 'baron', 'rei_bastion')), '"Padrão" volta ao visual normal');
  // Castelos
  await ev(() => BB.ui.show('castles')); await page.waitForTimeout(500);
  await page.click('.sk-pick[data-target=royal_fortress] [data-sk=castle_royal_shadow]'); await page.waitForTimeout(500); await shot('04-castelos');
  ok(await ev(() => BB.Shop.isEquipped(BB.profile, 'castle_royal_shadow')), 'escolheu a skin direto na tela de Castelos');
  // carta (Baralho): seletor na janela da carta, sem reordenar o baralho
  await ev(() => BB.ui.show('deck')); await page.waitForTimeout(500);
  const order0 = await ev(() => [...document.querySelectorAll('#app .card')].map((c) => c.dataset.id).join());
  await ev(() => BB.ui.cardInfo('royal_knight')); await page.waitForTimeout(300);
  await page.click('.card-info [data-sk=troop_knight_gold]'); await page.waitForTimeout(400); await shot('05-carta');
  ok(await ev(() => BB.Shop.isEquipped(BB.profile, 'troop_knight_gold')), 'escolheu a skin da tropa na janela da carta');
  ok(order0 === (await ev(() => [...document.querySelectorAll('#app .card')].map((c) => c.dataset.id).join())), 'o baralho não mudou de ordem');
  // sair da conta: volta ao normal
  await ev(() => { BB.cloud.signOut(); BB.Shop.checkTester(); });
  ok(!(await ev(() => BB.Shop.owns(BB.profile, 'baron_thorg_lava'))), 'ao sair da conta de teste as skins pagas voltam a ser da Loja');
  console.log(errors.length ? 'ERROS:\n' + errors.join('\n') : 'sem erros no console');
  await b.close(); process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(1); });

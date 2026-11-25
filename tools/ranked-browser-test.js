// Teste da Ranqueada no navegador com uma nuvem simulada (imita o Supabase e as regras de supabase/ranked.sql):
// login por e-mail, partida ranqueada, envio recusado e reenvio, abandono, virada de temporada e tela em pé.
// Uso: node tools/ranked-browser-test.js <pasta-de-capturas>
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = process.argv[2] || 'screenshots-ranked';
fs.mkdirSync(out, { recursive: true });

const MOCK = 'https://mock.supabase.test';
const UID = '11111111-1111-1111-1111-111111111111';
// ---------------------------------------------------------------- nuvem simulada
const db = {
  rows: new Map(), offset: 0, reject: 0, log: [],
  clock() { return Date.now() + this.offset; },
};
const SEASON = (() => { const d = new Date(); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); })();
for (const [id, name, pts] of [['22222222-0000-0000-0000-000000000001', 'RealHero', 99999], ['22222222-0000-0000-0000-000000000002', 'RealRookie', 5]]) {
  db.rows.set(id, { user_id: id, name, baron: 'elara', season: SEASON, points: pts, max_league: 0, streak: 0, wins: 0, losses: 0, draws: 0, trophies: 0, prev_season: '', prev_points: 0, updated_at: 0 });
}
function guard(op, oldR, n) {
  if (db.reject > 0) { db.reject--; return 'recusado pelo teste'; }
  if (op === 'INSERT') { if (n.points > 40) return 'linha nova com no maximo 40 pontos'; return null; }
  const el = (db.clock() - oldR.updated_at) / 1000;
  if (n.season === oldR.season) {
    if (n.points > oldR.points) {
      if (el < 20) return 'gravacao rapida demais';
      if (n.points - oldR.points > 40 * Math.max(1, Math.floor(el / 40))) return 'pontos demais';
    }
    if (n.trophies !== oldR.trophies) return 'trofeu';
  } else {
    if (n.points > Math.floor(oldR.points / 2) + 40) return 'pontos demais na virada';
    if (n.trophies > oldR.trophies + 1) return 'trofeus';
  }
  return null;
}
function filterRows(q) {
  let rows = [...db.rows.values()];
  for (const [k, v] of q.entries()) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    if (k === 'or') { const m = v.match(/season\.eq\.([\d-]+),prev_season\.eq\.([\d-]+)/); rows = rows.filter((r) => r.season === m[1] || r.prev_season === m[2]); continue; }
    const [op, val] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)];
    rows = rows.filter((r) => op === 'eq' ? String(r[k]) === val : op === 'neq' ? String(r[k]) !== val : op === 'gt' ? r[k] > Number(val) : true);
  }
  if ((q.get('order') || '').startsWith('points.desc')) rows.sort((a, b) => b.points - a.points);
  return rows.slice(0, Number(q.get('limit') || 1000));
}
async function handle(route) {
  const req = route.request(), u = new URL(req.url()), m = req.method();
  const json = (status, body, headers) => route.fulfill({ status, contentType: 'application/json', headers: Object.assign({ 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' }, headers || {}), body: JSON.stringify(body) });
  if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  const auth = (req.headers().authorization || '').replace('Bearer ', '');
  db.log.push(m + ' ' + u.pathname);
  if (u.pathname === '/auth/v1/otp') return json(200, {});
  if (u.pathname === '/auth/v1/verify') { const b = JSON.parse(req.postData()); return b.token === '123456' ? json(200, { access_token: 'tok-' + UID, refresh_token: 'r', expires_in: 3600, user: { id: UID, email: b.email } }) : json(403, { msg: 'Token has expired or is invalid' }); }
  if (u.pathname === '/auth/v1/user') return json(200, { id: UID, email: 'teste@exemplo.com' });
  if (u.pathname === '/rest/v1/ranked_players') {
    const me = auth === 'tok-' + UID ? UID : null;
    if (m === 'GET') {
      const rows = filterRows(u.searchParams);
      if ((req.headers().prefer || '').includes('count=exact')) return json(200, rows.slice(0, 1), { 'content-range': '0-0/' + rows.length });
      return json(200, rows);
    }
    const body = JSON.parse(req.postData());
    if (!me || body.user_id !== me) return json(403, { message: 'new row violates row-level security policy' });
    if (m === 'POST') {
      if (db.rows.has(me)) return json(409, { message: 'duplicate key value violates unique constraint' });
      const err = guard('INSERT', null, body); if (err) return json(400, { message: 'ranked: ' + err });
      db.rows.set(me, Object.assign({}, body, { updated_at: db.clock() })); return json(201, [db.rows.get(me)]);
    }
    if (m === 'PATCH') {
      const old = db.rows.get(me); if (!old) return json(200, []);
      const n = Object.assign({}, old, body), err = guard('UPDATE', old, n); if (err) return json(400, { message: 'ranked: ' + err });
      n.updated_at = db.clock(); db.rows.set(me, n); return json(200, [n]);
    }
  }
  return json(404, { message: 'not found ' + u.pathname });
}

// ---------------------------------------------------------------- roteiro
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
  await ctx.route(MOCK + '/**', handle);
  await ctx.addInitScript((url) => { window.BB = window.BB || {}; window.BB.CLOUD_CONFIG = { url, anonKey: 'anon-key' }; }, MOCK);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  const shot = (n) => page.screenshot({ path: path.join(out, n + '.png') });
  const wait = (ms) => page.waitForTimeout(ms);
  const ev = (fn, a) => page.evaluate(fn, a);
  const ok = (c, msg) => { if (!c) throw new Error('FALHOU: ' + msg); console.log('  ok  ' + msg); };
  const row = () => db.rows.get(UID);

  await page.goto('file://' + path.join(__dirname, '..', 'web', 'index.html'));
  await page.waitForSelector('#coach', { timeout: 15000 });
  await ev(() => { BB.battle.tut.end(); BB.battle.stop(); BB.ui.show('mode'); });
  await wait(400);
  ok(await page.$('#rankedBtn'), 'botão da Ranqueada na escolha de modo');
  await page.tap('#rankedBtn'); await wait(1200); await shot('01-ranking-sem-conta');
  ok(await page.$('#rkLogin'), 'sem conta: ranking visível com botão Entrar');
  const pos0 = await ev(() => document.querySelector('.rk-big').textContent);
  ok(/#1[.,]?\d{3}/.test(pos0.replace(/\s/g, '')), 'com 0 pontos a posição fica lá embaixo (' + pos0.trim() + ')');
  ok((await page.$$('.rk-row')).length === 100, 'lista mostra o Top 100');

  // login por e-mail
  await page.tap('#rkLogin'); await wait(300); await shot('02-login');
  await page.tap('#rkE'); await page.fill('#rkMail', 'teste@exemplo.com'); await page.tap('#rkSend'); await wait(400);
  await page.fill('#rkCode', '000000'); await page.tap('#rkOk'); await wait(400);
  ok(!(await ev(() => BB.cloud.loggedIn())), 'código errado não entra');
  await page.fill('#rkCode', '123456'); await page.tap('#rkOk'); await wait(600);
  ok(await page.$('#rkNick'), 'depois do login pede o apelido');
  await page.fill('#rkNick', 'BaraoTeste'); await page.tap('#rkSave'); await wait(1500);
  ok(row() && row().points === 0 && row().name === 'BaraoTeste', 'linha nova criada na nuvem com INSERT (0 pts)');
  await shot('03-ranking-logado');
  ok(await page.$('#rkPlay'), 'logado: botão Jogar Ranqueada');

  // partida ranqueada (vitória), com envio recusado e reenvio depois
  db.offset += 60000; db.reject = 2;
  await page.tap('#rkPlay'); await wait(500); await shot('04-procurando');
  await page.waitForSelector('.vs', { timeout: 5000 }); await wait(400); await shot('05-vs');
  const oppName = await ev(() => document.querySelector('.vs-side.foe h2').textContent);
  await page.waitForFunction(() => BB.battle && BB.battle.ranked, null, { timeout: 5000 }); await wait(800);
  const hudName = await ev(() => document.querySelector('.hb-name.foe').textContent);
  ok(hudName === oppName, 'nome do adversário no lugar da IA (' + oppName + ')');
  ok(await ev(() => !!BB.profile.ranked.inProgress), 'partida marcada como em andamento');
  await shot('06-partida');
  await ev(() => { const m = BB.battle.match; m.damageCastle(1, m.players[1].castleHp + 1, 0, 1); });
  await page.waitForSelector('#result', { timeout: 12000 }); await wait(900); await shot('07-resultado');
  const res = await ev(() => document.querySelector('.rk-delta').textContent);
  ok(/\+\s?2\d|\+\s?30/.test(res), 'vitória: ' + res);
  ok(await ev(() => BB.profile.ranked.pending === true && !BB.profile.ranked.inProgress), 'envio recusado: pontos guardados no aparelho');
  ok(row().points === 0, 'nuvem ainda sem os pontos (recusado)');
  await page.tap('#rkBoard'); await wait(1500);
  ok(await ev(() => BB.profile.ranked.pending === true), '2ª tentativa também recusada (fica pendente)');
  await shot('08-ranking-pendente');
  await ev(() => BB.ui.show('ranking')); await wait(1500);
  const local = await ev(() => BB.profile.ranked.st.points);
  ok(row().points === local && local >= 20, 'reenvio ao abrir o ranking: nuvem com ' + row().points + ' pts (UPDATE)');
  ok(db.log.filter((l) => l.startsWith('POST /rest')).length === 1, 'só 1 INSERT; o resto foi UPDATE (sem upsert)');
  await shot('09-ranking-enviado');

  // abandono: fecha o jogo no meio da partida
  db.offset += 60000;
  const before = await ev(() => BB.profile.ranked.st.points);
  await page.tap('#rkPlay'); await page.waitForFunction(() => BB.battle && BB.battle.ranked, null, { timeout: 8000 }); await wait(500);
  await page.reload(); await wait(2500);
  await page.waitForSelector('.rk-modal', { timeout: 6000 }); await shot('10-abandono');
  const after = await ev(() => BB.profile.ranked.st.points);
  ok(after === Math.max(0, before - 12) || after < before, 'abandono conta como derrota (' + before + ' → ' + after + ')');
  await page.tap('.rk-modal .btn'); await wait(300);

  // virada de temporada: prêmio com janela que só fecha no OK
  db.offset += 60000;
  const gold0 = await ev(() => BB.profile.gold);
  await ev(() => { const R = BB.Ranked, cur = R.seasonId(Date.now()); BB.Ranked.clock = () => R.seasonEnd(cur) + 3600000; BB.ui.show('ranking'); });
  await page.waitForSelector('#rkReward', { timeout: 6000 }); await wait(400); await shot('11-premio-temporada');
  await ev(() => BB.ui.toast('teste: um aviso qualquer')); await wait(2000);
  ok(await page.$('#rkReward'), 'janela de prêmio continua aberta (só fecha no OK)');
  const st = await ev(() => BB.profile.ranked.st);
  ok(st.points === Math.floor(after / 2) && st.prevPoints === after, 'virada: pontos pela metade (' + after + ' → ' + st.points + ')');
  ok((await ev(() => BB.profile.gold)) > gold0, 'prêmio em ouro entregue');
  await page.tap('#rkReward .btn'); await wait(1500);
  ok(!(await page.$('#rkReward')) && row().season === st.season, 'nuvem recebeu a virada (' + row().season + ')');

  // em pé
  await page.setViewportSize({ width: 412, height: 860 }); await wait(700); await shot('12-ranking-em-pe');
  ok(await ev(() => getComputedStyle(document.getElementById('rotate')).display === 'none'), 'ranking funciona com o celular em pé');

  // link do e-mail (ou volta do Google): o endereço chega com #access_token e a conta entra
  await ev(() => BB.cloud.signOut());
  ok(!(await ev(() => BB.cloud.loggedIn())), 'saiu da conta');
  const okLink = await ev((uid) => BB.cloud.handleRedirect('com.bastionbarons.game://auth#access_token=tok-' + uid + '&refresh_token=r&expires_in=3600&token_type=bearer'), UID);
  ok(okLink && (await ev(() => BB.cloud.userId())) === UID, 'link de login do e-mail entra na conta');
  ok(db.log.some((l) => l === 'POST /auth/v1/otp'), 'pedido de e-mail de login enviado');

  console.log(errors.length ? 'ERROS:\n' + errors.join('\n') : 'sem erros no console');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(1); });

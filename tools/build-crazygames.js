// Gera a versão para a CrazyGames (HTML5): inglês, SDK v3 (Data Module para salvar o progresso),
// sem o atualizador do app, progressão real (sem desbloquear tudo) e só as imagens que o jogo usa.
// Uso: node tools/build-crazygames.js   →   dist/crazygames/ e dist/bastion-barons-crazygames.zip
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'web');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'crazygames');
const ZIP = path.join(DIST, 'bastion-barons-crazygames.zip');

// imagens de img/units que o jogo realmente carrega (lido do próprio jogo no navegador)
async function usedUnitImages() {
  const b = await chromium.launch();
  const pg = await b.newPage();
  await pg.goto('file://' + path.join(SRC, 'index.html'));
  await pg.waitForFunction(() => window.BB && BB.content && BB.unitSrc, null, { timeout: 15000 });
  const fxKeys = new Set();
  for (const f of fs.readdirSync(path.join(SRC, 'js'))) {
    for (const m of fs.readFileSync(path.join(SRC, 'js', f), 'utf8').matchAll(/['"`](fx_[a-z0-9_]+)['"`]/g)) fxKeys.add(m[1]);
  }
  const list = await pg.evaluate((keys) => {
    const out = new Set(), seen = new Set();
    const walk = (o, d) => {
      if (o == null || d > 7) return;
      if (typeof o === 'string') { if (o.includes('img/units/')) out.add(o); return; }
      if (typeof o !== 'object' || seen.has(o) || o instanceof Node) return;
      seen.add(o);
      for (const k of Object.keys(o)) { try { walk(o[k], d + 1); } catch (e) { /* nada */ } }
    };
    walk(BB, 0);
    for (const c of BB.content.allCards) out.add(BB.unitSrc(c.id));
    for (const x of BB.content.barons) out.add(BB.unitSrc(x.id));
    for (const k of Object.keys(BB.FX || {}).concat(keys)) out.add(BB.fxSrc(k));
    return [...out];
  }, [...fxKeys]);
  await b.close();
  return new Set(list.map((s) => s.split('img/units/')[1].split('?')[0]));
}

(async () => {
  const used = await usedUnitImages();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  let kept = 0, dropped = 0;
  fs.cpSync(SRC, OUT, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(SRC, src).split(path.sep).join('/');
      if (rel === 'js/update.js') return false; // atualizador do APK Android
      if (rel.startsWith('img/units/') && rel.endsWith('.webp')) {
        if (used.has(rel.slice('img/units/'.length))) { kept++; return true; }
        dropped++; return false;
      }
      return true;
    },
  });

  // index.html: inglês, SDK da CrazyGames antes da camada de plataforma, sem update.js
  const idxPath = path.join(OUT, 'index.html');
  let html = fs.readFileSync(idxPath, 'utf8');
  html = html.replace(/<html[^>]*>/, '<html lang="en">');
  html = html.replace(/\s*<script src="js\/update\.js[^"]*"><\/script>/, '');
  const sdk = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n  <script>window.BB = window.BB || {}; BB.FORCE_LANG = \'en\';</script>\n  ';
  if (!/<script src="js\/platform\.js/.test(html)) throw new Error('platform.js não encontrado no index.html');
  html = html.replace(/<script src="js\/platform\.js/, sdk + '<script src="js/platform.js');
  fs.writeFileSync(idxPath, html);

  // progressão real: nada desbloqueado de graça
  const dataPath = path.join(OUT, 'js', 'data.js');
  const data = fs.readFileSync(dataPath, 'utf8').replace(/"testUnlockAll":\s*true/, '"testUnlockAll": false');
  if (!/"testUnlockAll": false/.test(data)) throw new Error('testUnlockAll não encontrado em data.js');
  fs.writeFileSync(dataPath, data);

  fs.rmSync(ZIP, { force: true });
  execFileSync('zip', ['-qr9', ZIP, '.'], { cwd: OUT });
  const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
  console.log(`imagens de tropas: ${kept} mantidas, ${dropped} removidas`);
  console.log(`zip: ${ZIP} (${mb(fs.statSync(ZIP).size)})`);
})().catch((e) => { console.error(e); process.exit(1); });

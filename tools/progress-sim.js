// Simula a progressão de um jogador (sem tela): quantos dias/partidas até cada marco.
// Uso: node tools/progress-sim.js [partidas por dia] [chance de vitória] [jogadores]
global.window = global;
const path = require('path');
for (const f of ['data', 'sim', 'progress']) require(path.join(__dirname, '..', 'web', 'js', f + '.js'));
const BB = global.BB, P = BB.Progress;
const content = new BB.Content(BB.CONTENT); content.balance.testUnlockAll = false;
const perDay = Number(process.argv[2] || 10), winP = Number(process.argv[3] || 0.5), N = Number(process.argv[4] || 200);
const marks = { 'Thorg (nível 3)': (p) => p.accountLevel >= 3, 'Malachar (nível 6)': (p) => p.accountLevel >= 6, 'Eldrin (nível 9)': (p) => p.accountLevel >= 9,
  'todos os castelos (nível 10)': (p) => p.accountLevel >= 10, '30 de 40 cartas': (p) => p.cards.length >= 30, 'todas as 40 cartas': (p) => p.cards.length >= 40,
  '1ª carta no nível 5': (p) => p.cards.some((c) => c.level >= 5), 'nível 30': (p) => p.accountLevel >= 30 };
const res = {}; for (const k in marks) res[k] = [];
let day = 0; P.today = () => 'd' + day;
for (let n = 0; n < N; n++) {
  const rng = new BB.Rng(1000 + n), p = P.create(content); p.tutorialDone = true;
  const got = {};
  for (day = 0; day < 400 && Object.keys(got).length < Object.keys(marks).length; day++) {
    P.claimDaily(p, content, rng);
    for (let m = 0; m < perDay; m++) {
      P.applyResult(p, content, rng.next() < winP ? 1 : -1, rng, null);
      // evolui a carta que der (como um jogador faria)
      for (const c of p.cards) while (P.canUpgrade(p, content, c.id)) P.upgrade(p, content, c.id);
      for (const k in marks) if (!got[k] && marks[k](p)) { got[k] = 1; res[k].push({ day: day + 1, matches: day * perDay + m + 1 }); }
    }
  }
}
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
console.log(`${perDay} partidas/dia (~${perDay * 3} min), ${Math.round(winP * 100)}% de vitórias, ${N} jogadores simulados (mediana):`);
for (const k in marks) { const a = res[k]; const d = med(a.map((x) => x.day)), m = med(a.map((x) => x.matches));
  console.log('  ' + k.padEnd(30) + (a.length < N / 2 ? '  não chega em 400 dias' : `  dia ${String(d).padStart(3)}  (${m} partidas, ~${Math.round(m * 3 / 60)} h de jogo)`)); }

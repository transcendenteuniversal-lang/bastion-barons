// Simulação de balanceamento: muitas partidas IA x IA com baralhos aleatórios.
// Mostra a taxa de vitória de cada carta (quando está no baralho) e quantas vezes foi jogada.
// Uso: node tools/balance-sim.js [partidas=600]
global.window = global;
for (const f of ['data', 'strings', 'sim', 'ai']) require('../web/js/' + f + '.js');
const C = new BB.Content(BB.CONTENT), N = +process.argv[2] || 600, P = BB.STRINGS.pt;
const ids = C.collectible.map((c) => c.id), stat = {};
for (const id of ids) stat[id] = { in: 0, win: 0, played: 0 };
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const pick = () => { const a = ids.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, C.balance.deckSize); };
const res = {}; let dur = 0;
for (let n = 0; n < N; n++) {
  const d = [pick(), pick()], B = C.barons.map((b) => b.id), K = C.castles.map((k) => k.id);
  const m = new BB.Match(C, { seed: n + 1, players: [0, 1].map((i) => ({ baronId: B[(n + i * 2) % 5], castleId: K[(n * 3 + i) % 5], deck: d[i] })) });
  m.recordEvents = true;
  const ai = [new BB.AI(m, 0, 'hard', n), new BB.AI(m, 1, 'hard', n + 999)];
  while (!m.over) { ai[0].tick(); ai[1].tick(); m.step(); for (const e of m.drainEvents()) if (e.type === 'CardPlayed' && stat[e.id]) stat[e.id].played++; }
  res[m.endReason] = (res[m.endReason] || 0) + 1; dur += m.time;
  for (let i = 0; i < 2; i++) for (const id of d[i]) { stat[id].in++; if (m.winner === i) stat[id].win++; }
}
const rows = ids.map((id) => ({ id, nome: P['card.' + id + '.name'], custo: C.card(id).cost, vitoria: stat[id].in ? stat[id].win / stat[id].in : 0, jogadas: stat[id].played / Math.max(1, stat[id].in) }))
  .sort((a, b) => b.vitoria - a.vitoria);
console.log('fim:', JSON.stringify(res), 'duração média', Math.round(dur / N) + 's');
for (const r of rows) console.log((r.nome || r.id).padEnd(26), String(r.custo).padStart(2), (r.vitoria * 100).toFixed(1).padStart(6) + '%', r.jogadas.toFixed(2).padStart(6));
if (process.argv[3]) require('fs').writeFileSync(process.argv[3], JSON.stringify(rows));

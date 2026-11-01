# Arquitetura — BASTION BARONS

## Camadas
| Arquivo | Papel | Depende de |
|---|---|---|
| `web/js/data.js` | Conteúdo e balanceamento (cartas, Barões, castelos, economia) | — |
| `web/js/sim.js` | Regras puras: `Content`, `Match`, `DeckState`, `DeckRules`, `Rng` | data |
| `web/js/ai.js` | IA (`BB.AI`) | sim |
| `web/js/progress.js` | Perfil, XP, desbloqueios, evolução, recompensas, salvamento local | sim |
| `web/js/render.js` | Canvas: cenário, castelos, Barões, tropas, efeitos (só lê o estado) | sim, art |
| `web/js/battle.js` | Laço de 20 ticks/s, entrada por toque/arraste, HUD, fim de partida | todos |
| `web/js/ui.js` | Menus em HTML | todos |
| `android/` | Activity com WebView, ponte JavaScript (vibrar, abrir link, sair) | — |

`sim.js`, `ai.js` e `progress.js` não usam o navegador: rodam no Node, nos testes, e poderão rodar no servidor.

## Fluxo da partida
```
toque/arraste ─► comando {type, player, hand, cardId, lane} ─► Match.validate ─► Match.execute
IA.tick() ─────► comando ─────────────────────────────────────┘
relógio fixo (20 Hz) ─► Match.step() ─► eventos ─► Renderer (efeitos), sons, vibração
```
- Toda mudança de estado passa por comando validado (energia, mão, rota, recarga, limite de tropas). Comandos inválidos são recusados.
- Mesma semente + mesmos comandos = mesma partida (testado). Isso permite replays e verificação no servidor.

## Plano do PvP (Fase 5)
- Servidor Nakama com *match handler* autoritativo em TypeScript ou Node, **usando o mesmo `sim.js`**.
- O cliente envia comandos. O servidor executa `Match.step` a 20 Hz e envia snapshots e eventos (~10 Hz). O cliente interpola.
- Validação de energia, cartas e resultado só no servidor. Reconexão por snapshot completo. `forfeitByDisconnect` se o jogador não voltar.
- Anti-cheat: limite de comandos por segundo, log de recusas, replays (semente + comandos).

## Economia (Fase 6)
No modo online, as recompensas e evoluções passam a ser calculadas no servidor (`progress.js` roda lá). As compras pela Google Play têm o recibo validado no servidor antes de creditar.

# Arquitetura — BASTION BARONS

## 1. Módulos (assemblies)

| Assembly | Depende de | Responsabilidade |
|---|---|---|
| `BastionBarons.Core` (`noEngineReferences: true`) | — | Regras puras: conteúdo (`ContentDatabase`), partida (`Match`), baralho (`DeckState`, `DeckRules`), IA (`AiController`), progressão/economia (`Progression`, `PlayerProfile`), RNG determinístico |
| `BastionBarons.Game` | Core, UnityEngine.UI | Cliente: bootstrap (`GameApp`), navegação (`Router`/`ScreenBase`), telas, HUD, visual 3D, áudio, salvamento local, localização, qualidade |
| `BastionBarons.Editor` | Core, Game | `ProjectSetup` (cena, materiais, Player Settings Android) e `BuildScript` (APK/AAB) |
| `BastionBarons.Tests.EditMode` | Core, Game, NUnit | Testes automatizados |

Como o Core não depende da Unity, ele pode ser compilado num servidor .NET. Assim, a lógica que decide o resultado da partida fica num único lugar.

## 2. Fluxo da partida

```
 entrada (toque) ──► Command ──► Match.Validate ──► Match.Execute ──► estado
                                                            │
 IA (AiController.Tick) ──► Command ───────────────────────┘
 relógio fixo (20 Hz) ──► Match.Step ──► SimEvents ──► BattleRunner (efeitos, sons, animações)
                                     └──► estado ──► UnitView/CastleView/HUD (só leitura)
```

- A visualização **nunca** altera o estado. Ela só lê `Match` e consome eventos.
- Todas as mudanças passam por `Command`. É exatamente isso que o servidor vai receber dos clientes.
- O `Match` é determinístico para a mesma semente e a mesma sequência de comandos (há teste para isso).

## 3. Dados e balanceamento

`Resources/Data/content.json` guarda todas as cartas, Barões, castelos e o `balance` (energia, duração, vida do castelo, custos de evolução, chances de raridade, recompensas). O `ContentDatabase` valida o arquivo e rejeita conteúdo inválido com a lista de erros.
`ContentLoader.Load()` dá prioridade a `persistentDataPath/content_override.json`, que poderá ser baixado do servidor ou do painel admin. Assim dá para rebalancear sem publicar uma nova versão do app. Num PvP, o servidor usa a mesma versão de conteúdo e rejeita clientes com versão diferente.

## 4. Plano do multiplayer (Fase 5)

- **Servidor:** Nakama com *authoritative match handler*. Duas opções:
  1. Serviço de partidas em .NET que referencia `BastionBarons.Core` (mesmo código do cliente), orquestrado pelo Nakama via matchmaker e RPC (recomendado, para não duplicar as regras);
  2. Porta das regras para o runtime TypeScript ou Go do Nakama (exige manter duas implementações e testes de paridade).
- **Protocolo:** o cliente envia `Command` (`PlayCard{handIndex, cardId, lane}`, `Baron{lane}`, `CastlePower{lane}`) com número de sequência. O servidor roda `Match.Step` a 20 Hz e transmite snapshots e eventos a ~10 Hz. O cliente interpola.
- **Validação:** energia, mão, recarga e limites são verificados no servidor (`Match.Validate`). O resultado é calculado só no servidor.
- **Reconexão:** o servidor guarda o `Match` por N segundos. Ao voltar, o cliente recebe um snapshot completo. Se não voltar, `Match.ForfeitByDisconnect` encerra a partida.
- **Anti-cheat:** limite de comandos por segundo, log de comandos rejeitados, detecção de padrões impossíveis, replays guardados (semente + comandos).
- **Persistência:** perfil, inventário e economia no Postgres (via Nakama storage e wallet). O perfil local atual será migrado no primeiro login.

## 5. Economia (Fase 6)

Toda concessão de recurso em modo online passa por RPC no servidor (`Progression.*` roda lá). Compras via Google Play Billing com o recibo validado no servidor (Play Developer API) antes de creditar. A loja vende apenas cosméticos, passe e recursos, sem poder exclusivo.

## 6. Cliente

- Sem prefabs obrigatórios. Telas e mundo são montados por código. Para trocar a arte, basta colocar o prefab ou a textura no caminho convencionado (ver ASSETS.md).
- `Router` destrói e recria cada tela, o que simplifica a troca de idioma.
- Entrada: toque/arraste na carta e soltar na rota (ou tocar na carta e depois na rota). Raycast contra `LaneTag`.

# Registro do projeto — BASTION BARONS

Última atualização: 2026-11-01 · Versão de conteúdo: `0.1.0`

## 1. Resumo por fase

| Fase | Situação | Observações |
|---|---|---|
| 1 Fundação | **Feito** | Projeto Unity 6, Android configurado via `ProjectSetup`, menu, campo de 3 rotas, 2 castelos, energia, cartas, tropas, combate automático |
| 2 Barões e castelos | **Feito** (arte provisória) | 5 Barões e 3 castelos com poderes funcionando, animações procedurais, telas de seleção |
| 3 Conteúdo | **Parcial** | 32 cartas, coleção, baralho de 14 (3 baralhos salvos), evolução, raridades e recompensa de carta por vitória. **Baús: pendentes** |
| 4 IA | **Parcial** | IA em 3 dificuldades, offline, modo Treinamento. **Tutorial guiado: pendente** |
| 5 Multiplayer | **Não iniciado** | Arquitetura preparada: simulação autoritativa em `Core` sem dependência da Unity. Ver ARCHITECTURE.md §4 |
| 6 Economia e social | **Não iniciado** | Loja, Google Play Billing, clãs, amigos, missões, passe, temporadas, eventos |
| 7 Polimento | **Não iniciado** | Arte 3D definitiva, animações Mecanim, URP, áudio final, otimização (pooling) |
| 8 Lançamento | **Parcial** | Script de build de APK e AAB, ícone, textos da loja (Marketing/). Falta: keystore, capturas, trailer |

## 2. Funcionalidades implementadas

- Simulação determinística em ticks fixos (20 Hz) com comandos validados (`Match.Execute`): energia, mão, rota, limite de tropas e recarga de poderes. Comandos inválidos são rejeitados, não corrigidos.
- 24 tropas com habilidades: área, aura de proteção, invocação periódica, renascimento, lentidão ao atacar, regeneração, cura, construção de torre e "ataca só castelos". Unidades voadoras e alvos terrestres, aéreos ou só castelo.
- 8 feitiços: dano em área, congelamento, cura, relâmpago nos 3 mais fortes, escudo, veneno, chuva de flechas e invocação.
- O castelo também se defende sozinho, atirando na unidade inimiga mais próxima.
- Vitória ao destruir o castelo. Quando o tempo acaba: (1) vence quem tem maior % de vida no castelo; (2) depois, maior valor de tropas destruídas; (3) senão, empate. Rendição também encerra a partida.
- IA (Fácil/Normal/Difícil) que lê a ameaça de cada rota, defende, contra-ataca unidades voadoras, usa feitiços em grupos de inimigos e decide quando usar o poder do Barão e do castelo. Ela usa as mesmas validações do jogador.
- Perfil local: ouro, cristais (campo existe, sem fonte de obtenção até a loja), XP, nível, coleção, 3 baralhos, histórico das últimas 50 partidas e estatísticas.
- Evolução de cartas (+8% de atributos por nível, até o nível 10) com custo em cópias e ouro configurável.
- Recompensa de carta: chances visíveis na tela de resultado (Comum 60% · Rara 27% · Épica 10% · Lendária 2,5% · Mítica 0,5%). Uma Épica ou melhor é garantida após 9 vitórias seguidas sem obter uma.
- Localização com tabelas externas (pt-BR, en). Nenhum texto de interface fica fixo no código.
- Qualidade gráfica com 3 perfis (30/60 FPS), área segura para telas 19.5:9 e 20:9 e câmera que se ajusta à proporção da tela.
- Conteúdo substituível por arquivo baixado (`content_override.json`), pronto para rebalanceamento remoto.

## 3. Funcionalidades pendentes (sem botão na interface até existirem)

- PvP online (matchmaking, servidor autoritativo, reconexão, anti-cheat), ranqueada, ligas e troféus, sala privada.
- Contas (criar conta, login, recuperar senha, vincular Google). Hoje o jogador entra como visitante.
- Loja, Google Play Billing e validação de recibos no servidor. Nenhuma compra é simulada.
- Baús e animação de abertura, missões diárias e semanais, conquistas, passe de temporada, temporadas, eventos.
- Clãs, amigos, chat, denúncias e bloqueio.
- Emotes na batalha, tutorial guiado, skins e personalização.
- Idiomas es, fr e de.
- Painel administrativo web.
- Arte 3D definitiva, animações Mecanim, URP, Addressables, áudio final e pooling de objetos.

## 4. Testes

- 34 testes EditMode em `Assets/BastionBarons/Tests/EditMode/CoreTests.cs`.
- **Atenção:** os testes e o projeto foram escritos num ambiente sem Unity e sem compilador C#, então **ainda não foram compilados nem executados**. O primeiro passo ao abrir o projeto é rodar o Test Runner e corrigir eventuais erros de compilação.
- Validado neste ambiente: o JSON de conteúdo (32 cartas colecionáveis, baralho inicial com 14 cartas únicas que o jogador possui) e a existência de todas as chaves de localização usadas literalmente no código.

## 5. Erros conhecidos e riscos

- Projeto ainda não aberto no editor. Possíveis erros de compilação ainda não detectados.
- Os valores de câmera e HUD foram calculados para 16:9 e 20:9, mas ainda precisam de ajuste visual no aparelho.
- O pipeline de renderização é o Built-in. A migração para URP está planejada para a Fase 7, e o código de materiais já suporta os dois.
- O balanceamento dos números iniciais ainda não foi testado jogando.

## 6. Dependências externas

| Dependência | Uso | Situação |
|---|---|---|
| Unity 6 (6000.0 LTS) + Android Build Support | Motor e build | Necessário localmente |
| com.unity.ugui, com.unity.test-framework | UI e testes | Já no `Packages/manifest.json` |
| GameCI (GitHub Actions) | Testes e build em CI | Workflow manual: `.github/workflows/unity-ci.yml` |
| Nakama (ou equivalente) | PvP, contas, ranking, clãs | Fase 5, não integrado |
| Google Play Billing + Play Developer API | Compras e validação de recibos | Fase 6, não integrado |

## 7. Credenciais necessárias (ainda não fornecidas)

- `UNITY_LICENSE`, `UNITY_EMAIL`, `UNITY_PASSWORD`: secrets do GitHub para a CI.
- Keystore de upload Android: `BB_KEYSTORE_PATH`, `BB_KEYSTORE_PASS`, `BB_KEY_ALIAS`, `BB_KEY_PASS`.
- Conta Google Play Console (taxa única), service account da Play Developer API (Fase 6).
- Servidor Nakama: host, server key, chave HTTP de runtime (Fase 5).

## 8. Arquivos gerados nesta etapa

Veja a árvore no README. Principais: `Scripts/Core/*.cs` (simulação, IA, progressão), `Scripts/Game/**` (cliente), `Scripts/Editor/*.cs` (configuração e build), `Resources/Data/content.json`, `Resources/Localization/*.json`, `Tests/EditMode/CoreTests.cs`, `docs/*`, `Marketing/*`.

## 9. Como compilar

Veja `docs/BUILD.md`.

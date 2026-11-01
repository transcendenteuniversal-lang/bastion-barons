# Registro do projeto — BASTION BARONS

Última atualização: 2026-11-01

## Mudança de tecnologia
A primeira versão era um projeto Unity 6 (ainda está no histórico do git, no commit `f8f3270`). Ela foi trocada por **HTML5 Canvas + JavaScript empacotado em WebView**, o mesmo modelo do Rift Rumble. Os motivos:
- não exige instalar o Unity;
- o jogo pode ser testado de verdade antes de cada entrega (testes no Node e partida jogada no navegador);
- o GitHub gera o APK e publica a atualização automaticamente;
- as regras (`sim.js`) poderão rodar sem mudanças no servidor PvP (Node/Nakama TypeScript).

## Situação por fase
| Fase | Situação |
|---|---|
| 1 Fundação | **Feito**: campo de 3 rotas, 2 castelos, energia, cartas, tropas, combate automático, menus |
| 2 Barões e castelos | **Feito**: 5 Barões e 3 castelos com poderes e animações (arte dos Barões vinda do banner oficial) |
| 3 Conteúdo | **Parcial**: 32 cartas, coleção, 3 baralhos de 14, evolução, raridades, carta por vitória. Faltam os baús |
| 4 IA | **Parcial**: 3 dificuldades e modo Treinamento offline; tela "Como jogar" na primeira batalha. Falta o tutorial guiado passo a passo |
| 5 Multiplayer | Não iniciado. Plano em ARCHITECTURE.md |
| 6 Economia e social | Não iniciado |
| 7 Polimento | Parcial: animações procedurais, efeitos e sons gerados. Falta arte própria para algumas cartas e unidades animadas |
| 8 Lançamento | Parcial: APK e Release automáticos, ícone, textos da loja. Falta AAB assinado com a chave de upload da Google Play |

## Testes realizados (executados de verdade)
- `node tools/sim-test.js`: **37 de 37 passaram**. Cobrem conteúdo, baralho, energia, comandos inválidos, combate por rota, voadores, golem, fênix, aura, feitiços, torre do engenheiro, os 5 poderes dos Barões, os 3 poderes dos castelos, vitória, desempate, rendição, determinismo, IA nas 3 dificuldades (a Difícil venceu a Fácil em 19 de 20) e progressão.
- `node tools/browser-test.js`: passa por todas as telas, arrasta e toca cartas, usa os poderes, pausa, termina a partida, confere resultado e histórico e troca o idioma. **Nenhum erro no console.**
- Balanceamento: em 40 partidas IA × IA, 10 terminaram com castelo destruído e 30 por vida no fim do tempo. Duração média de 173 s.
- `./tools/build-apk.sh`: APK de 1,2 MB, assinado e validado com `apksigner verify`.
- Ainda **não testado num celular físico** por mim. É o próximo passo, com você.

## Pendente
- PvP online, contas, ranking e ligas, sala privada, clãs, amigos, chat
- Loja e Google Play Billing (sem compras simuladas), baús, missões, conquistas, passe de temporada, eventos
- Emotes, tutorial guiado, skins
- Espanhol, francês e alemão
- Painel administrativo
- AAB para a Google Play (exige a chave de upload nos Secrets)
- Tropas animadas em corpo inteiro (hoje são medalhões com a ilustração da carta)
- Os custos e as raridades na arte da coleção diferem de alguns valores do jogo (`web/js/data.js`). O jogo mostra os seus próprios valores por cima da arte

## Credenciais
- Nenhuma é necessária para o APK de teste, porque a chave de desenvolvimento está em `android/`.
- Para a Google Play: chave de upload (keystore) nos Secrets do repositório, mais a conta na Play Console.

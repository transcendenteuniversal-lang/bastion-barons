# Ativos de arte e áudio

## Arte oficial já incluída
| Arquivo | Uso |
|---|---|
| `Assets/BastionBarons/Resources/Art/logo.png` | Logo nas telas de abertura e no menu |
| `Assets/BastionBarons/Resources/Art/app_icon.png` | Ícone do app (configurado pelo `ProjectSetup`) |
| `Assets/BastionBarons/Resources/Art/splash_bg.png` | Fundo dos menus |
| `Marketing/Store/banner_barons.png` | Banner promocional dos 5 Barões |
| `Art/Reference/battle_mockup.png` | Referência do layout da batalha (HUD seguido no código) |
| `Art/Reference/screens_overview.png` | Referência visual das telas |

## Provisórios → onde substituir (sem alterar código)
| O quê | Provisório atual | Caminho para colocar a arte final |
|---|---|---|
| Ilustração de carta | Cor da classe + iniciais | `Resources/Art/Cards/<id>.png` (ex.: `fire_dragon.png`) |
| Modelo 3D de unidade | Primitivas (`UnitModels`) | Prefab em `Resources/Models/Units/<id>.prefab` |
| Modelo do Barão | Primitivas (`BaronView`) | `Resources/Models/Barons/<id>.prefab` |
| Modelo do castelo | Primitivas (`CastleView`) | `Resources/Models/Castles/<id>.prefab` |
| Sons e músicas | Síntese procedural original (`AudioService`) | `Resources/Audio/<id>.wav/.ogg`: `click, card, spawn, sword, bow, magic, explosion, dragon, castle_hit, death, baron, victory, defeat, music_menu, music_battle` |
| Fonte medieval | LegacyRuntime + contorno dourado | Trocar `Ui.Font` por uma fonte licenciada |

Os ids das cartas, Barões e castelos estão em `Resources/Data/content.json`.
Com a arte definitiva, migrar para Addressables (Fase 7) para reduzir memória e o tamanho inicial do download.

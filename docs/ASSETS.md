# Arte e áudio

## De onde vem a arte
`tools/prepare-art.py` recorta e otimiza a arte enviada (`art/source/`) para `web/img/`:
- **Cartas:** as 32 ilustrações da coleção oficial (`art/source/cards_32.png`). Só a ilustração é recortada, sem o nome e o custo, para que os textos continuem traduzíveis.
- **Arena:** `art/source/arena.png`, com a sacada onde fica o Barão e as molduras do HUD.
- **Barões:** os retratos do banner oficial dos 5 Barões.
- **Logo:** com fundo transparente, para a abertura e o menu.
- **Ícone do app:** em todos os tamanhos do Android.

## Provisórios (substituir quando houver arte própria)
| Item | Hoje | Como substituir |
|---|---|---|
| Torre Anã (invocada pelo Engenheiro, não é carta) | Emblema gerado | Salvar `web/img/cards/dwarf_turret.webp` e tirar o id de `NO_ART` (`web/js/art.js`) |
| Esqueleto (invocado) | Recorte do mockup da batalha | Ilustração própria em `web/img/cards/skeleton.webp` |
| Arena | Arte oficial `art/source/arena.png` (o HUD é encaixado nas molduras dela) | Trocar a imagem mantendo as mesmas molduras; posições em `BB.ARENA` (`web/js/render.js`) |
| Tropas em campo | Medalhão redondo com a ilustração da carta | Sprites animados por personagem (como no Rift Rumble), em `web/img/units/<id>/` |
| Música e efeitos | Gerados pelo próprio jogo (Web Audio) | Arquivos de áudio licenciados |

Os ids das cartas estão em `web/js/data.js`.

# Arte e áudio

## De onde vem a arte
`tools/prepare-art.py` recorta e otimiza a arte enviada (`art/source/`) para `web/img/`:
- **Cartas:** as 32 ilustrações da coleção oficial (`art/source/cards_32.png`). Só a ilustração é recortada, sem o nome e o custo, para que os textos continuem traduzíveis.
- **Arena:** `art/source/arena.png`, com a sacada onde fica o Barão e as molduras do HUD.
- **Barões:** os retratos do banner oficial dos 5 Barões.
- **Logo:** com fundo transparente, para a abertura e o menu.
- **Ícone do app:** em todos os tamanhos do Android.

## Tropas animadas
`tools/extract-units.py` lê os vídeos de 6 s (fundo verde ou magenta), remove o fundo e monta `web/img/units/<id>.webp` (linha 1 = andar, linha 2 = ataque), com as medidas em `web/js/sprites.js`. Os vídeos numerados seguem a ordem dos prompts (001 = Cavaleiro Real … 026 = Esqueleto). Cópias comprimidas ficam em `art/source/units/`.

## Provisórios (substituir quando houver arte própria)
| Item | Hoje | Como substituir |
|---|---|---|
| Torre Anã (invocada pelo Engenheiro, não é carta) | Emblema gerado | Salvar `web/img/cards/dwarf_turret.webp` e tirar o id de `NO_ART` (`web/js/art.js`) |
| Esqueleto (invocado) | Recorte do mockup da batalha | Ilustração própria em `web/img/cards/skeleton.webp` |
| Arena | Arte oficial `art/source/arena.png` (o HUD é encaixado nas molduras dela) | Trocar a imagem mantendo as mesmas molduras; posições em `BB.ARENA` (`web/js/render.js`) |
| Tropas em campo | **Animadas** a partir dos vídeos (andar + atacar) para as tropas que já têm vídeo; as outras usam o medalhão da carta | Gerar o vídeo com o prompt da tropa e rodar `tools/extract-units.py --import <vídeos>` |
| Música e efeitos | Gerados pelo próprio jogo (Web Audio) | Arquivos de áudio licenciados |

Os ids das cartas estão em `web/js/data.js`.

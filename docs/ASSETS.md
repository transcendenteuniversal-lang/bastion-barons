# Arte e áudio

## De onde vem a arte
`tools/prepare-art.py` recorta e otimiza a arte enviada (`art/source/`) para `web/img/`:
- **Cartas:** as 8 ilustrações da barra de cartas do mockup e os personagens do campo de batalha do mockup.
- **Barões:** os retratos do banner oficial dos 5 Barões.
- **Logo:** com fundo transparente, para a abertura e o menu.
- **Ícone do app:** em todos os tamanhos do Android.

## Provisórios (substituir quando houver arte própria)
| Item | Hoje | Como substituir |
|---|---|---|
| Dragão de Gelo, Troll, Demônio, Fênix | Variações de cor do dragão e do orc do mockup | Salvar `web/img/cards/<id>.webp` (256×256) e tirar a variação de `prepare-art.py` |
| Bárbaro, Assassino, Guerreiro Anão, Lanceiro, Ent, Clériga, Engenheiro, Torre Anã, Relâmpago, Escudo Arcano, Veneno, Chuva de Flechas, Cura Divina | Emblema gerado com ícone | Salvar `web/img/cards/<id>.webp` e incluir o id em `HAS_ART` (`web/js/art.js`) |
| Tropas em campo | Medalhão redondo com a ilustração da carta | Sprites animados por personagem (como no Rift Rumble), em `web/img/units/<id>/` |
| Música e efeitos | Gerados pelo próprio jogo (Web Audio) | Arquivos de áudio licenciados |

Os ids das cartas estão em `web/js/data.js`.

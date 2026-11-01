# Design de jogo — números iniciais

Todos os valores ficam em `web/js/data.js` e podem ser ajustados sem mexer na lógica.

## Partida

- Duração: 180 s · energia inicial 5 · máximo 10 · regeneração 0.36/s (dobra nos últimos 60 s)
- Vida dos castelos: 3000 (igual para todos; os castelos diferem só no poder) · defesa automática 45 de dano/s, alcance 16
- Rota com 100 unidades de comprimento · tempo de mobilização das tropas 0.8 s · limite de 40 unidades por jogador
- Baralho de 14 cartas, mão de 4. A carta jogada volta para o fim da fila
- Vitória: destruir o castelo. Quando o tempo acaba: maior % de vida no castelo → mais valor de tropas destruídas → empate

## Cartas

| Carta | Raridade | Classe | Custo | Vida | Dano | Interv. | Veloc. | Alcance | Alvo | Habilidade |
|---|---|---|---|---|---|---|---|---|---|---|
| Cavaleiro Real | Comum | Rei | 3 | 620 | 75 | 1.1 | 5 | 1.5 | Terrestre | Unidade equilibrada de vida e dano. |
| Paladino | Rara | Paladino | 4 | 800 | 60 | 1.2 | 4.5 | 1.5 | Terrestre | Aura protetora: aliados próximos recebem 25% menos dano. |
| Bárbaro | Comum | Bárbaro | 3 | 480 | 110 | 1.0 | 5.5 | 1.5 | Terrestre | Golpes corpo a corpo devastadores. |
| Orc Vermelho | Rara | Orc | 4 | 900 | 95 | 1.3 | 4.5 | 1.5 | Terrestre | Força bruta e grande resistência. |
| Assassino Sombrio | Épica | Assassino | 3 | 320 | 140 | 0.8 | 8.5 | 1.5 | Terrestre | Muito rápido, ataques velozes e letais. |
| Guardião de Pedra | Rara | Guardião | 5 | 1600 | 50 | 1.5 | 3 | 1.5 | Terrestre | Tanque de altíssima resistência. |
| Guerreiro Anão | Comum | Guardião | 4 | 850 | 100 | 1.4 | 4 | 1.5 | Terrestre | Combatente pesado e confiável. |
| Lanceiro Real | Comum | Guardião | 3 | 520 | 85 | 1.2 | 5 | 3 | Terrestre e aéreo | Alcance intermediário; atinge alvos aéreos. |
| Arqueira Élfica | Rara | Arqueiro | 3 | 300 | 70 | 1.0 | 5 | 14 | Terrestre e aéreo | Precisão de longo alcance. |
| Arqueiro Real | Comum | Arqueiro | 2 | 260 | 55 | 1.1 | 5 | 12 | Terrestre e aéreo | Ataque à distância barato. |
| Mago Arcano | Épica | Mago | 4 | 340 | 120 | 1.6 | 4.5 | 11 | Terrestre e aéreo | Dano mágico em pequena área. |
| Feiticeira Sombria | Épica | Mago | 5 | 380 | 90 | 1.8 | 4.5 | 10 | Terrestre e aéreo | Magia sombria em grande área. |
| Necromante | Lendária | Necromante | 5 | 420 | 60 | 1.6 | 4 | 10 | Terrestre e aéreo | Invoca 2 esqueletos a cada 6 segundos. |
| Atirador Goblin | Comum | Arqueiro | 2 | 220 | 35 | 0.5 | 6 | 10 | Terrestre e aéreo | Disparos rápidos e baratos. |
| Dragão de Fogo | Lendária | Criatura | 6 | 1100 | 110 | 1.5 | 4 | 6 | Terrestre e aéreo (voa) | Criatura aérea com sopro de fogo em área. |
| Dragão de Gelo | Épica | Criatura | 5 | 950 | 70 | 1.4 | 4 | 6 | Terrestre e aéreo (voa) | Aéreo; seus ataques deixam inimigos 40% mais lentos. |
| Fênix | Mítica | Criatura | 5 | 600 | 90 | 1.2 | 5.5 | 5 | Terrestre e aéreo (voa) | Aérea; renasce uma vez com 50% da vida. |
| Golem de Pedra | Épica | Guardião | 7 | 2600 | 140 | 2.0 | 2.5 | 1.5 | Somente castelos | Tanque colossal que só ataca castelos. |
| Troll das Montanhas | Rara | Bárbaro | 5 | 1300 | 130 | 1.6 | 3.5 | 1.5 | Terrestre | Força física imensa. |
| Grifo Real | Rara | Criatura | 4 | 550 | 85 | 1.0 | 7 | 1.5 | Terrestre e aéreo (voa) | Atacante aéreo veloz. |
| Ent Guardião | Épica | Druida | 6 | 1800 | 80 | 1.6 | 2.5 | 1.5 | Terrestre | Regenera vida continuamente. |
| Demônio Infernal | Mítica | Bárbaro | 7 | 1400 | 220 | 1.5 | 4 | 1.5 | Terrestre | Dano altíssimo em área curta. |
| Clériga Real | Rara | Clériga | 3 | 380 | 30 | 1.2 | 4.5 | 6 | Terrestre e aéreo | Cura aliados próximos a cada 2 segundos. |
| Engenheiro Anão | Épica | Engenheiro | 4 | 400 | 40 | 1.0 | 4 | 3 | Terrestre | Constrói uma torre de defesa ao entrar em campo. |
| Bola de Fogo | Comum | Mago | 4 | — | — | — | — | — | — | Dano em área na frente inimiga; atinge castelos. |
| Congelamento | Épica | Mago | 4 | — | — | — | — | — | — | Paralisa inimigos na área por 3 segundos. |
| Cura Divina | Rara | Clériga | 3 | — | — | — | — | — | — | Cura todas as suas tropas na rota. |
| Relâmpago | Épica | Mago | 5 | — | — | — | — | — | — | Atinge os 3 inimigos mais fortes da rota. |
| Escudo Arcano | Rara | Mago | 3 | — | — | — | — | — | — | Escudo de 300 em todas as suas tropas da rota. |
| Veneno | Rara | Druida | 3 | — | — | — | — | — | — | Dano contínuo por 6 segundos. |
| Chuva de Flechas | Comum | Arqueiro | 3 | — | — | — | — | — | — | Dano em todos os inimigos da rota. |
| Invocação Esquelética | Comum | Necromante | 3 | — | — | — | — | — | — | Invoca 4 esqueletos temporários. |

## Barões

| Barão | Habilidade | Recarga | Rota? | Desbloqueio | Efeito |
|---|---|---|---|---|---|
| Rei Bastion | Comando Real | 35 s | não | nível 1 | Todas as tropas aliadas ganham +30% de dano e +20% de velocidade por 8s. |
| Elara | Chuva Élfica | 30 s | sim | nível 1 | 8 rajadas de flechas atingem todos os inimigos da rota escolhida. |
| Thorg | Fúria Orc | 30 s | sim | nível 2 | Tropas aliadas na rota ganham +60% de dano e +25% de velocidade de ataque por 8s. |
| Malachar | Exército dos Mortos | 35 s | sim | nível 3 | Invoca 5 esqueletos na rota escolhida. |
| Eldrin | Tempestade Arcana | 40 s | sim | nível 4 | Explosão de 380 de dano em todos os inimigos da rota. |

O Barão fica junto ao castelo, não tem vida e não pode ser atacado. O poder carrega com o tempo, de forma independente da energia.

## Castelos

| Castelo | Poder | Recarga (1ª ativação) | Desbloqueio | Efeito |
|---|---|---|---|---|
| Fortaleza Real | Escudo Imperial | 50 s (20 s) | nível 1 | Escudo de 600 pontos no castelo por 10s. |
| Fortaleza Glacial | Tempestade de Gelo | 50 s (20 s) | nível 2 | Inimigos da rota ficam 50% mais lentos por 6s. |
| Castelo Dracônico | Sopro do Dragão | 50 s (20 s) | nível 3 | 300 de dano em todos os inimigos da rota. |

## Progressão

- Vitória: +60 ouro, +40 XP e 1 carta · Empate: +25 ouro, +20 XP · Derrota: +15 ouro, +15 XP
- XP para o próximo nível: 100 + 60 × (nível − 1)
- Evolução (nível n → n+1): cópias [2, 4, 8, 15, 25, 40, 60, 90, 130] · ouro [20, 50, 120, 250, 500, 900, 1500, 2500, 4000] · +8% de vida e dano por nível (máximo 10)
- Chances de raridade (pesos [600, 270, 100, 25, 5]), com Épica ou melhor garantida a cada 10 cartas
- A IA de treino usa o nível médio do baralho do jogador, sem bônus.

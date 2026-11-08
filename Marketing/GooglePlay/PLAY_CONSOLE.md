# Google Play Console — Bastion Barons

## 1. Criar app
| Campo | Resposta |
|---|---|
| Nome do app | Bastion Barons |
| Idioma padrão | Português (Brasil) – pt-BR |
| App ou jogo | Jogo |
| Gratuito ou pago | Gratuito |
| Declarações | Marcar as duas (políticas do programa e leis de exportação dos EUA) |

**Nome do pacote:** `com.bastionbarons.game`
Ele vem dentro do AAB. A Play lê o nome do pacote no primeiro envio e ele **nunca mais pode ser trocado**.

## 2. Assinatura do app
- Use a **Assinatura de apps do Google Play** (Play App Signing), que é o padrão. O Google guarda a chave final do app.
- O arquivo `bastionbarons-upload.jks` é a sua **chave de upload** (alias `upload`).
- Certificado da chave de upload:
  - SHA-256: `33:92:49:71:C5:06:88:9A:BE:31:AB:5C:87:23:96:CA:9F:B7:E9:77:63:D6:95:3C:B6:F9:6C:CA:DF:EB:C4:09`
  - SHA-1: `FC:07:B2:49:B9:DB:D2:7F:69:90:ED:AD:30:C3:A5:A5:26:90:D4:23`

## 3. Ficha principal da loja (pt-BR)
**Nome (até 30):**
```
Bastion Barons
```

**Descrição curta (até 80):**
```
Comande um Barão, monte seu baralho e destrua o castelo inimigo em 3 rotas!
```

**Descrição completa (até 4000):**
```
Defenda seu castelo e destrua o do inimigo em batalhas de estratégia em tempo real!

Bastion Barons mistura coleção de cartas com estratégia em 3 rotas. Escolha seu Barão, monte seu baralho e coloque cavaleiros, arqueiras élficas, necromantes, dragões e feitiços poderosos no campo de batalha. Suas tropas avançam e lutam sozinhas, mas é você quem decide onde e quando jogar cada carta.

⚔️ TRÊS ROTAS, DECISÕES RÁPIDAS
Leia o campo de batalha e responda cada ataque na rota certa.

👑 CINCO BARÕES LENDÁRIOS
Rei Bastion, Elara, Thorg, Malachar e Eldrin comandam do alto do castelo, cada um com um poder único: Comando Real, Chuva Élfica, Fúria Orc, Exército dos Mortos e Tempestade Arcana.

🏰 CINCO CASTELOS COM PODERES
Escudo Imperial, Tempestade de Gelo, Sopro do Dragão, Bênção da Floresta e Dreno de Almas.

🃏 42 CARTAS PARA COLECIONAR E EVOLUIR
De esqueletos baratos a dragões lendários e a Fênix mítica, em 5 raridades.

📈 PROGRESSO QUE RECOMPENSA
Ganhe ouro, XP e cartas novas a cada vitória e suba de nível para desbloquear Barões e castelos. As chances de cada raridade aparecem no jogo.

🎁 RECOMPENSA DIÁRIA
Prêmios que crescem a cada dia que você volta, e a primeira vitória do dia vale em dobro.

🎓 APRENDA JOGANDO
Um tutorial rápido ensina tudo já na primeira batalha.

🤖 JOGUE OFFLINE
Treine contra a IA em três dificuldades: Fácil, Normal e Difícil. Sem anúncios e sem compras.
```

**Gráficos:**
| Campo | Arquivo |
|---|---|
| Ícone do app (512×512) | `icone_512.png` |
| Imagem de destaque (1024×500) | `imagem_destaque_1024x500.jpg` |
| Capturas de tela do telefone (2 a 8) | `captura_1_batalha.jpg` … `captura_6_vitoria.jpg` (1920×1080) |
| Tablet 7" e 10" | Opcional: as mesmas capturas servem |
| Vídeo (YouTube) | Opcional |

## 4. Configurações da loja
| Campo | Resposta |
|---|---|
| Categoria | Jogos → Estratégia |
| Tags (até 5) | Estratégia, Cartas, Defesa de torre, Fantasia, Medieval |
| E-mail de contato | **seu e-mail de suporte** (fica público na loja) |
| Site | Opcional (pode deixar vazio) |
| Telefone | Opcional |

## 5. Conteúdo do app (Política → Conteúdo do app)
| Item | Resposta |
|---|---|
| Política de privacidade (URL) | `https://github.com/transcendenteuniversal-lang/bastion-barons/blob/main/docs/PRIVACY.md` |
| Acesso ao app | Toda a funcionalidade está disponível sem restrições (não precisa de login) |
| Anúncios | Não, meu app não contém anúncios |
| Público-alvo | 13–15, 16–17 e 18+ (marcar só essas faixas) |
| Atrai crianças sem querer? | Não |
| Segurança dos dados: coleta ou compartilha dados? | **Não** (nenhum tipo de dado) |
| Exclusão de conta | Não se aplica: o app não tem contas |
| App do governo | Não |
| Recursos financeiros | Meu app não oferece recursos financeiros |
| Saúde | Meu app não tem recursos de saúde |
| App de notícias | Não |
| Permissões sensíveis | Nenhuma (só Internet e Vibração, que são normais) |
| Recursos de IA generativa no app | Não (as artes foram feitas com IA, mas o app não gera conteúdo com IA) |

**Questionário de classificação (IARC):**
| Pergunta | Resposta |
|---|---|
| Categoria | Jogo |
| Violência | Sim: fantasia/desenho, personagens não realistas, sem sangue, sem desmembramento |
| Violência contra humanos realistas | Não |
| Medo/terror | Leve: esqueletos e demônios em estilo de desenho |
| Sexualidade / nudez | Não |
| Linguagem imprópria | Não |
| Drogas, álcool, tabaco | Não |
| Jogos de azar com dinheiro real | Não |
| Jogos de azar simulados | Não (cartas ganhas por vitória, sem compra) |
| Interação entre usuários, chat ou compartilhamento | Não |
| Compartilha localização | Não |
| Compras digitais | Não |

Resultado esperado: Livre/10+ no Brasil (ClassInd), PEGI 7, ESRB Everyone 10+.

## 6. Preço e países
- Gratuito.
- Países: todos, ou só o Brasil para começar.

## 7. Lançamento
1. **Teste interno:** envie `BastionBarons-1.0.120.aab`, adicione seu e-mail como testador e instale pelo link.
2. **Teste fechado:** contas pessoais criadas depois de novembro de 2023 precisam de **12 testadores por 14 dias seguidos** antes de liberar a produção.
3. **Produção:** depois do teste fechado, peça o acesso à produção na Play Console.

**Notas da versão (pt-BR):**
```
Primeira versão de Bastion Barons!
- 5 Barões, 5 castelos e 42 cartas
- Tutorial na primeira batalha
- Recompensa diária e vitória do dia em dobro
```

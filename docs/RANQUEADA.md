# Ranqueada: como funciona, como ligar e como testar

## Como os pontos funcionam
| Resultado | Pontos |
|---|---|
| Vitória | +20 |
| Adversário com mais pontos | +1 a cada 20 pts a mais que você (máx. +10) |
| 3ª vitória seguida em diante | +5 |
| Derrota, desistência ou fechar o jogo no meio | −12 |
| Empate (tempo acabou com tudo igual) | +3 |

- **Ligas:** Paliçada de Madeira (0), Torre de Pedra (300), Fortaleza de Ferro (700), Bastião de Prata (1200), Cidadela de Ouro (1800) e Trono dos Barões (2500).
- **Proteção de liga:** quem alcança uma liga não cai abaixo do piso dela na temporada.
- **Temporada:** vai do dia 1 até o fim do mês, em UTC. Na virada:
  - os pontos caem pela metade;
  - o prêmio vem pela maior liga alcançada: ouro, e cristais a partir do Bastião;
  - o Top 10 ganha um troféu 🏆 e um bônus.
- **Bots:** 100 jogadores simulados, com pontos calculados pela data. Todo aparelho vê o mesmo ranking, sem servidor.
- **Multidão:** começa com cerca de 1.400 jogadores abaixo do Top 100 e cresce um pouco por dia.

As regras ficam em `web/js/ranked.js`; os testes, em `tools/sim-test.js` (seção "Ranqueada").

## Passo a passo para ligar a nuvem (Supabase)

### 1. Criar o projeto
1. Entre em https://supabase.com e crie uma conta (pode ser com o Google).
2. Clique em **New project**, dê o nome `bastion-barons` e escolha uma senha forte para o banco (guarde-a). Em Region, use **South America (São Paulo)**.
3. Espere uns 2 minutos até o projeto ficar pronto.

### 2. Criar a tabela e as regras
1. No menu da esquerda, abra **SQL Editor → New query**.
2. Abra o arquivo `supabase/ranked.sql` do projeto, copie tudo e cole.
3. Clique em **Run**. Deve aparecer "Success. No rows returned".

### 3. Ligar o login por e-mail (código de 6 dígitos)
1. Vá em **Authentication → Sign In / Providers → Email** e deixe **Enable Email provider** ligado.
2. Vá em **Authentication → Emails → Templates → Magic Link** e troque o texto do e-mail por:
   ```
   <h2>Seu código do Bastion Barons</h2>
   <p>Digite este código no jogo: <b>{{ .Token }}</b></p>
   ```
   Assim o e-mail traz o código em vez de um link.
3. O e-mail grátis do Supabase manda poucos e-mails por hora. Quando houver muitos jogadores, configure um SMTP próprio em **Authentication → Emails → SMTP Settings**, por exemplo o Resend ou o Brevo, que têm plano grátis.

### 4. Ligar o login com Google
1. No **Google Cloud Console** (https://console.cloud.google.com), use o mesmo projeto da Play Console ou crie um.
2. Vá em **APIs e serviços → Tela de permissão OAuth** e preencha o nome do app e o e-mail de suporte.
3. Vá em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth** e escolha o tipo **Aplicativo da Web**.
4. Em **URIs de redirecionamento autorizados**, coloque `https://SEU-PROJETO.supabase.co/auth/v1/callback`. O endereço aparece no Supabase em **Authentication → Sign In / Providers → Google**.
5. Copie o **ID do cliente** e a **chave secreta** para o Supabase, em **Authentication → Sign In / Providers → Google**, e ligue o provedor.
6. No Supabase, vá em **Authentication → URL Configuration → Redirect URLs** e adicione:
   - `com.bastionbarons.game://auth` (volta para o app Android);
   - o endereço onde a versão web estiver hospedada, se houver.

### 5. Colocar o endereço no jogo
1. No Supabase, vá em **Project Settings → API** e copie a **Project URL** e a chave **anon public**.
2. Me mande as duas (a chave anon é pública, pode mandar no chat). Eu coloco em `web/js/cloud-config.js` e gero a versão nova.

> Nunca mande a chave **service_role**: essa é secreta.

## Como testar

### Sem nuvem (automático)
```bash
node tools/sim-test.js
node tools/ranked-browser-test.js capturas-ranqueada
```
O segundo teste simula o Supabase e passa por:
- login por e-mail, com código errado e certo, e escolha do apelido;
- partida ranqueada até a vitória;
- envio recusado duas vezes e reenvio ao abrir o ranking;
- abandono da partida (fechar no meio conta como derrota);
- virada de temporada, com a janela que só fecha no OK;
- ranking com o celular em pé.

As capturas ficam na pasta indicada.

### Regras do banco (Postgres local)
```bash
psql -f supabase/ranked-test.sql
```
Confere 12 casos:
- linha nova com no máximo 40 pontos;
- gravar a linha de outra pessoa é recusado;
- limite de 40 pontos a cada 40 segundos;
- upsert recusado, por isso o jogo usa INSERT e UPDATE;
- regras da virada de temporada;
- leitura liberada para todos;
- gravação bloqueada para quem não está logado.

### Com o Supabase de verdade
1. Instale a versão nova, abra **Batalha → RANQUEADA → Entrar** e entre com e-mail ou Google.
2. Jogue uma partida. No Supabase, em **Table Editor → ranked_players**, sua linha aparece com os pontos.
3. Jogue outra partida com o celular em **modo avião**. O ranking mostra "Sem conexão". Tire do modo avião, abra o ranking de novo e confira no Table Editor que os pontos chegaram.
4. Comece uma partida ranqueada e feche o app no meio. Ao abrir de novo, aparece "Partida abandonada" com −12.
5. Teste do bloqueio: no Table Editor, edite seus pontos para +500. O banco recusa a mudança, porque está limitado a 40 a cada 40 segundos.

## Antes de publicar na Google Play
O jogo passa a coletar **e-mail, apelido e pontos da Ranqueada**. Atualize na Play Console:
- **Segurança dos dados:**
  - **Coletados:** "Endereço de e-mail" (gerenciamento de conta) e "Outros conteúdos gerados pelo usuário: apelido" (funcionalidade do app);
  - **Criptografia em trânsito:** sim;
  - **Exclusão de dados:** o usuário pode pedir.
- **Exclusão de conta:** dentro do jogo, em Ranqueada → Apagar conta. Como link da web, use a política de privacidade, que já explica como apagar.
- **Política de privacidade:** o arquivo `docs/PRIVACY.md` já foi atualizado.

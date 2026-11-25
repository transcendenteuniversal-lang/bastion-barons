# Envio automático para a Google Play

## Como funciona
1. A cada mudança no jogo enviada ao GitHub, o workflow **Play Store** gera o AAB, assina com a chave de upload e envia para o **teste interno**.
2. Você recebe a atualização pela Play, no celular cadastrado como testador interno, e testa.
3. Aprovado, o workflow **Play Store - Produção** leva a mesma versão do teste interno para a **produção**, que passa pela revisão do Google. Ele roda de duas formas:
   - você clica em Actions → Play Store - Produção → Run workflow;
   - eu envio uma tag `producao-...`.

As notas da versão vêm de `release-notes/pt-BR.txt` e `release-notes/en-US.txt`.

## Configuração (uma vez só)

### 1. Conta de serviço no Google Cloud
1. Abra https://console.cloud.google.com/projectselector2/apis/library/androidpublisher.googleapis.com, escolha o projeto **Bastion Barons** e clique em **Ativar** (Google Play Android Developer API).
2. Abra https://console.cloud.google.com/iam-admin/serviceaccounts e clique em **Criar conta de serviço**.
   - Nome: `play-publisher`.
   - Clique em **Criar e continuar** e depois em **Concluir**. Não precisa dar papel nenhum.
3. Clique na conta criada, vá em **Chaves → Adicionar chave → Criar nova chave → JSON → Criar**.
   - Um arquivo `.json` é baixado. **Guarde-o e não mande para ninguém.**
4. Copie o e-mail da conta de serviço, no formato `play-publisher@....iam.gserviceaccount.com`.

### 2. Dar acesso na Play Console
1. Abra https://play.google.com/console → **Usuários e permissões** → **Convidar novos usuários**.
2. Cole o e-mail da conta de serviço.
3. Em **Permissões do app**, adicione o **Bastion Barons** e marque:
   - **Lançar apps para canais de teste**;
   - **Lançar para produção, excluir dispositivos e usar o Play App Signing**;
   - **Ver informações do app e baixar relatórios em massa**.
4. Clique em **Convidar usuário**. A conta de serviço não precisa aceitar o convite.

### 3. Testadores do teste interno
1. Abra **Testar e lançar → Teste interno → Testadores**.
2. Crie uma lista com o seu e-mail e salve.
3. Copie o **link de participação** e abra no celular para virar testador.

### 4. Segredos no GitHub
Abra https://github.com/transcendenteuniversal-lang/bastion-barons/settings/secrets/actions e, para cada linha da tabela, clique em **New repository secret**:

| Name | Secret (valor) |
|---|---|
| `UPLOAD_KEYSTORE_B64` | todo o texto do arquivo `UPLOAD_KEYSTORE_B64.txt` |
| `UPLOAD_KS_PASS` | o texto do arquivo `UPLOAD_KS_PASS.txt` (a senha da chave de upload) |
| `PLAY_SERVICE_ACCOUNT_JSON` | todo o conteúdo do arquivo `.json` da conta de serviço |

### 5. Testar
1. Abra https://github.com/transcendenteuniversal-lang/bastion-barons/actions/workflows/playstore.yml → **Run workflow**.
2. Em uns 5 minutos, o passo "Enviar para o teste interno" mostra `Enviado para o TESTE INTERNO: versão 1.0.xxx`.
3. A versão aparece na Play Console em Teste interno.

## Problemas comuns
- **"The caller does not have permission":** o convite da conta de serviço na Play Console ainda não valeu (pode levar algumas horas) ou faltou alguma permissão do passo 2.
- **"APK specifies a version code that has already been used":** essa versão já foi enviada. Qualquer mudança nova gera um número maior.
- **"Google Play Android Developer API has not been used":** falta o passo 1.1.

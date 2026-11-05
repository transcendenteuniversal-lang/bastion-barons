# Build e publicação

## Automático (GitHub Actions)
`.github/workflows/apk.yml` roda a cada push no `main` que mexe em `web/`, `android/` ou `tools/`:
1. `node tools/sim-test.js`: se algum teste falhar, nada é publicado;
2. compila `release/BastionBarons.apk` com `tools/build-apk.sh` (sem Gradle);
3. publica o Release `v<número de commits>` com o APK.

O app instalado consulta `releases/latest` e oferece a atualização.

## Local (Linux)
```bash
sudo apt-get install android-sdk-platform-23 aapt apksigner zipalign dalvik-exchange
./tools/build-apk.sh
```

## Assinatura
- O APK de teste é assinado com `android/bastionbarons-dev.keystore` (senha `bastionbarons`). Essa chave fica no repositório de propósito, para que toda versão tenha a mesma assinatura e atualize por cima da anterior. **Não use essa chave na Google Play.**
- Google Play: rode o workflow **Play Store** (Actions → Play Store → Run workflow). Ele gera `BastionBarons.aab` (API alvo 36, sem o atualizador próprio) e o publica no Release de pré-lançamento `play-store`.
  - Se os Secrets `UPLOAD_KEYSTORE_B64` (a chave `.jks` em base64) e `UPLOAD_KS_PASS` existirem, o AAB já sai assinado.
  - Sem eles, assine na mão com a chave de upload (alias `upload`), que **nunca** vai para o repositório:
    `jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore bastionbarons-upload.jks BastionBarons.aab upload`
  - Cada envio à Play precisa de um código de versão maior que o anterior (ele é o número de commits).

## Arte
Depois de trocar arquivos em `art/source/`:
```bash
python3 tools/prepare-art.py
```

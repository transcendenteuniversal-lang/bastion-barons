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
- Para a Google Play: gere uma chave de upload própria, guarde-a nos Secrets do repositório e gere um AAB. Isso fica para a Fase 8.

## Arte
Depois de trocar arquivos em `art/source/`:
```bash
python3 tools/prepare-art.py
```

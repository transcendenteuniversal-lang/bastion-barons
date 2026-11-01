# Compilação e publicação

## Requisitos
- Unity 6 (6000.0 LTS) com Android Build Support (SDK, NDK e OpenJDK pelo Hub)

## Primeira abertura
O `ProjectSetup` roda sozinho (ou pelo menu **Bastion Barons → Configurar Projeto**) e:
- cria `Assets/Scenes/Main.unity` e a adiciona ao Build Settings;
- cria os materiais base em `Resources/Materials` (garante que os shaders entrem no build);
- define `com.bastionbarons.game`, IL2CPP, ARM64+ARMv7, API mínima 24, orientação paisagem e ícone.

## Testes
Window → General → Test Runner → EditMode → Run All.
Pela linha de comando:
```
Unity -batchmode -projectPath . -runTests -testPlatform EditMode -testResults results.xml
```

## APK de teste
Menu **Bastion Barons → Build → Android APK (teste)**, ou:
```
Unity -batchmode -quit -projectPath . -executeMethod BastionBarons.EditorTools.BuildScript.BuildApkCli
```
Saída: `Builds/Android/BastionBarons.apk`. Para instalar: `adb install -r Builds/Android/BastionBarons.apk`.

## AAB para a Google Play
1. Gere a keystore de upload (guarde-a fora do repositório):
   ```
   keytool -genkey -v -keystore bastion-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias bastion
   ```
2. Exporte as variáveis `BB_KEYSTORE_PATH`, `BB_KEYSTORE_PASS`, `BB_KEY_ALIAS`, `BB_KEY_PASS`, `BB_VERSION_NAME` e `BB_VERSION_CODE`.
3. Rode `BuildAabCli` (ou use o menu). Saída: `Builds/Android/BastionBarons.aab`.
4. No Play Console, ative o Play App Signing e envie o AAB para uma faixa de teste interno.

## CI (GitHub Actions)
`.github/workflows/unity-ci.yml` (disparo manual). Configure os secrets `UNITY_LICENSE`, `UNITY_EMAIL` e `UNITY_PASSWORD` (veja a documentação do GameCI sobre ativação de licença).

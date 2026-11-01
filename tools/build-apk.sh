#!/usr/bin/env bash
# Gera release/BastionBarons.apk sem Gradle, usando as ferramentas do Android SDK.
# No Ubuntu/Debian:  sudo apt-get install android-sdk-platform-23 aapt apksigner zipalign dalvik-exchange
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
DX="${DX:-$(ls /usr/lib/android-sdk/build-tools/*/dx 2>/dev/null | head -1)}"
KEYSTORE="${KEYSTORE:-$ROOT/android/bastionbarons-dev.keystore}"
KS_PASS="${KS_PASS:-bastionbarons}"
BUILD="$ROOT/build/android"
OUT="$ROOT/release/BastionBarons.apk"
# versão: número de commits (sobe a cada commit) ou VERSION_CODE do ambiente
VERSION_CODE="${VERSION_CODE:-$(git -C "$ROOT" rev-list --count HEAD 2>/dev/null || echo 1)}"
VERSION_NAME="1.0.$VERSION_CODE"
MANIFEST="$BUILD/AndroidManifest.xml"

rm -rf "$BUILD"
mkdir -p "$BUILD/gen" "$BUILD/obj" "$BUILD/assets" "$BUILD/dex" "$ROOT/release"

echo "> Copiando o jogo para assets"
cp -r "$ROOT/web/." "$BUILD/assets/"
echo "window.BB = window.BB || {}; BB.VERSION = { code: $VERSION_CODE, name: '$VERSION_NAME' };" > "$BUILD/assets/js/version.js"
sed -e "s/@VERSION_CODE@/$VERSION_CODE/" -e "s/@VERSION_NAME@/$VERSION_NAME/" "$ROOT/android/AndroidManifest.xml" > "$MANIFEST"
echo "> Versão $VERSION_NAME (código $VERSION_CODE)"

echo "> Gerando R.java"
aapt package -f -m -J "$BUILD/gen" -M "$MANIFEST" -S "$ROOT/android/res" -I "$ANDROID_JAR"

echo "> Compilando Java"
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -d "$BUILD/obj" \
  $(find "$ROOT/android/src" "$BUILD/gen" -name '*.java')

echo "> Convertendo para DEX"
"$DX" --dex --output="$BUILD/dex/classes.dex" "$BUILD/obj"

echo "> Empacotando APK"
aapt package -f -M "$MANIFEST" -S "$ROOT/android/res" -A "$BUILD/assets" \
  -I "$ANDROID_JAR" -F "$BUILD/unsigned.apk"
(cd "$BUILD/dex" && aapt add "$BUILD/unsigned.apk" classes.dex > /dev/null)

echo "> Alinhando e assinando"
zipalign -f -p 4 "$BUILD/unsigned.apk" "$BUILD/aligned.apk"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -alias bastionbarons -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" -dname "CN=Bastion Barons Dev" > /dev/null 2>&1
fi
apksigner sign --v4-signing-enabled false --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" --out "$OUT" "$BUILD/aligned.apk"
apksigner verify "$OUT"
echo "> Pronto: $OUT ($(du -h "$OUT" | cut -f1))"

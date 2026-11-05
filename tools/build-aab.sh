#!/usr/bin/env bash
# Gera release/BastionBarons.aab para a Google Play (Android App Bundle), sem Gradle.
# Precisa do Android SDK (ANDROID_HOME) com platforms/android-36 e build-tools (aapt2, d8),
# e do bundletool (BUNDLETOOL=caminho do .jar). O GitHub Actions (ubuntu-24.04) já tem o SDK.
# Assinatura com a chave de upload: UPLOAD_KEYSTORE (arquivo), UPLOAD_KS_PASS e UPLOAD_KEY_ALIAS.
# Sem a chave, gera o AAB sem assinatura (a Play recusa; serve só para conferir).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
TARGET_SDK="${TARGET_SDK:-36}"
ANDROID_JAR="${ANDROID_JAR:-$SDK/platforms/android-$TARGET_SDK/android.jar}"
BT="${BUILD_TOOLS:-$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)}"
BUNDLETOOL="${BUNDLETOOL:?defina BUNDLETOOL com o caminho do bundletool.jar}"
BUILD="$ROOT/build/aab"
OUT="$ROOT/release/BastionBarons.aab"
VERSION_CODE="${VERSION_CODE:-$(git -C "$ROOT" rev-list --count HEAD 2>/dev/null || echo 1)}"
VERSION_NAME="1.0.$VERSION_CODE"
MANIFEST="$BUILD/AndroidManifest.xml"

rm -rf "$BUILD"
mkdir -p "$BUILD/gen" "$BUILD/obj" "$BUILD/assets" "$BUILD/dex" "$BUILD/module" "$ROOT/release"

echo "> Copiando o jogo para assets (versão da loja: sem o atualizador próprio)"
cp -r "$ROOT/web/." "$BUILD/assets/"
rm -f "$BUILD/assets/js/update.js"
sed -i '/js\/update\.js/d' "$BUILD/assets/index.html"
echo "window.BB = window.BB || {}; BB.VERSION = { code: $VERSION_CODE, name: '$VERSION_NAME', store: 'play' };" > "$BUILD/assets/js/version.js"

# manifesto da loja: API alvo exigida pela Play e paisagem mantida em tablets no Android 16
sed -e "s/@VERSION_CODE@/$VERSION_CODE/" -e "s/@VERSION_NAME@/$VERSION_NAME/" \
    -e "s/android:targetSdkVersion=\"[0-9]*\"/android:targetSdkVersion=\"$TARGET_SDK\"/" \
    -e 's#</application>#    <property android:name="android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY" android:value="true" />\n    </application>#' \
    "$ROOT/android/AndroidManifest.xml" > "$MANIFEST"
echo "> Versão $VERSION_NAME (código $VERSION_CODE), API alvo $TARGET_SDK"

echo "> Recursos (aapt2, formato proto)"
"$BT/aapt2" compile --dir "$ROOT/android/res" -o "$BUILD/res.zip"
"$BT/aapt2" link --proto-format -o "$BUILD/base.apk" -I "$ANDROID_JAR" --manifest "$MANIFEST" \
  -A "$BUILD/assets" --java "$BUILD/gen" --auto-add-overlay "$BUILD/res.zip"

echo "> Compilando Java"
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -d "$BUILD/obj" \
  $(find "$ROOT/android/src" "$BUILD/gen" -name '*.java')

echo "> DEX (d8)"
"$BT/d8" --release --min-api 24 --lib "$ANDROID_JAR" --output "$BUILD/dex" $(find "$BUILD/obj" -name '*.class')

echo "> Montando o módulo base"
(cd "$BUILD/module" && unzip -q "$BUILD/base.apk")
mkdir -p "$BUILD/module/manifest" "$BUILD/module/dex"
mv "$BUILD/module/AndroidManifest.xml" "$BUILD/module/manifest/"
cp "$BUILD/dex/classes.dex" "$BUILD/module/dex/"
(cd "$BUILD/module" && zip -qr "$BUILD/base.zip" .)

echo "> Gerando o AAB"
rm -f "$OUT"
java -jar "$BUNDLETOOL" build-bundle --modules="$BUILD/base.zip" --output="$OUT"

if [ -n "${UPLOAD_KEYSTORE:-}" ]; then
  echo "> Assinando com a chave de upload"
  jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$UPLOAD_KEYSTORE" \
    -storepass "$UPLOAD_KS_PASS" -keypass "$UPLOAD_KS_PASS" "$OUT" "${UPLOAD_KEY_ALIAS:-upload}" > /dev/null
  jarsigner -verify "$OUT" | tail -1
else
  echo "! AAB sem assinatura (defina UPLOAD_KEYSTORE para assinar)"
fi
echo "> Pronto: $OUT ($(du -h "$OUT" | cut -f1))"

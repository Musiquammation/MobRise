#!/bin/bash

set -e

# Racine du projet (le script vit dans scripts/)
cd "$(dirname "$0")/.."

# Gradle 8.14 ne supporte pas Java 25 : on force un JDK 21 par défaut.
export JAVA_HOME="${JAVA_HOME_ANDROID:-/usr/lib/jvm/java-21-openjdk-amd64}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"

OUT_DIR="release"
KEYSTORE="android/release.keystore"
KEYSTORE_PROPS="android/keystore.properties"
KEY_ALIAS="mobrise"

if [ ! -f "$KEYSTORE_PROPS" ]; then
	if [ -f "$KEYSTORE" ]; then
		echo "Erreur : $KEYSTORE existe mais $KEYSTORE_PROPS est absent." >&2
		echo "Recrée $KEYSTORE_PROPS avec le mot de passe de la keystore." >&2
		exit 1
	fi

	echo "==> Generating release keystore"
	PASSWORD="$(openssl rand -base64 24 | tr -d '/+=')"
	"$JAVA_HOME/bin/keytool" -genkeypair -v \
		-keystore "$KEYSTORE" \
		-storetype PKCS12 \
		-alias "$KEY_ALIAS" \
		-keyalg RSA -keysize 4096 \
		-validity 10000 \
		-storepass "$PASSWORD" -keypass "$PASSWORD" \
		-dname "CN=MobRise, O=Musiquammation"

	cat > "$KEYSTORE_PROPS" <<EOF
storeFile=release.keystore
storePassword=$PASSWORD
keyAlias=$KEY_ALIAS
keyPassword=$PASSWORD
EOF
	chmod 600 "$KEYSTORE" "$KEYSTORE_PROPS"
	echo "    Keystore : $KEYSTORE"
	echo "    Identifiants : $KEYSTORE_PROPS"
	echo "    !! Sauvegarde ces deux fichiers hors du repo : sans eux, impossible de publier des mises à jour."
fi

echo "==> Web build"
npm run build

echo "==> Capacitor synchronization"
npx cap sync android

echo "==> Android AAB build"
(cd android && ./gradlew bundleRelease)

echo "==> Copying the AAB to $OUT_DIR/"
mkdir -p "$OUT_DIR"
cp android/app/build/outputs/bundle/release/app-release.aab "$OUT_DIR/app-release.aab"

echo "==> Verifying signature"
"$JAVA_HOME/bin/jarsigner" -verify "$OUT_DIR/app-release.aab" > /dev/null \
	&& echo "    AAB signé"

echo "==> Build completed"
echo "AAB: $OUT_DIR/app-release.aab"

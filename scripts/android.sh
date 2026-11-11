#!/bin/bash
# Build l'app en debug, l'installe et la lance sur le téléphone branché en USB.
# Usage : scripts/android.sh            (premier appareil détecté)
#         ANDROID_SERIAL=xxx scripts/android.sh

set -e

# Racine du projet (le script vit dans scripts/)
cd "$(dirname "$0")/.."

# Gradle 8.14 ne supporte pas Java 25 : on force un JDK 21 par défaut.
export JAVA_HOME="${JAVA_HOME_ANDROID:-/usr/lib/jvm/java-21-openjdk-amd64}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
ADB="${ADB:-$(command -v adb || echo "$ANDROID_HOME/platform-tools/adb")}"

APP_ID="com.musiquammation.mobrise"
APK="android/app/build/outputs/apk/debug/app-debug.apk"

echo "==> Looking for a device"
if [ -z "$ANDROID_SERIAL" ]; then
	ANDROID_SERIAL="$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
fi
if [ -z "$ANDROID_SERIAL" ]; then
	echo "Erreur : aucun téléphone détecté. Branche-le en USB et active le débogage USB." >&2
	"$ADB" devices >&2
	exit 1
fi
export ANDROID_SERIAL
echo "    Device : $ANDROID_SERIAL"

echo "==> Web build"
npm run build

echo "==> Capacitor synchronization"
npx cap sync android

echo "==> Android icons"
scripts/gen-icons.sh

echo "==> Android debug build"
(cd android && ./gradlew assembleDebug)

echo "==> Installing on the phone"
"$ADB" install -r "$APK"

echo "==> Launching the app"
"$ADB" shell am force-stop "$APP_ID"
"$ADB" shell am start -n "$APP_ID/.MainActivity" > /dev/null

echo "==> Done"

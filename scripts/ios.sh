#!/bin/bash
# Build l'app iOS et la lance sur un iPhone branché ou un simulateur (macOS + Xcode requis).
# Usage : scripts/ios.sh              (Capacitor demande la cible)
#         IOS_TARGET=<id> scripts/ios.sh   (id donné par `npx cap run ios --list`)
#         scripts/ios.sh --open       (ouvre le projet dans Xcode au lieu de lancer)

set -e

cd "$(dirname "$0")/.."

if [ "$(uname)" != "Darwin" ]; then
	echo "Erreur : le build iOS nécessite macOS avec Xcode installé." >&2
	exit 1
fi
if ! command -v xcodebuild > /dev/null; then
	echo "Erreur : Xcode introuvable (installe-le depuis l'App Store, puis 'sudo xcode-select -s /Applications/Xcode.app')." >&2
	exit 1
fi

echo "==> Web build"
npm run build

if [ ! -d ios ]; then
	echo "==> Creating the iOS project"
	npx cap add ios
fi

echo "==> Capacitor synchronization"
npx cap sync ios

echo "==> iOS icon"
scripts/gen-icons-ios.sh

echo "==> Info.plist tweaks"
PLIST="ios/App/App/Info.plist"
PB=/usr/libexec/PlistBuddy
set_plist() { # clé type valeur
	"$PB" -c "Set :$1 $3" "$PLIST" 2> /dev/null || "$PB" -c "Add :$1 $2 $3" "$PLIST"
}
# Plein écran : pas de barre d'état par-dessus le jeu, pas de split-view sur iPad.
set_plist UIStatusBarHidden bool true
set_plist UIViewControllerBasedStatusBarAppearance bool false
set_plist UIRequiresFullScreen bool true

if [ "$1" = "--open" ]; then
	npx cap open ios
	exit 0
fi

echo "==> Build & launch"
if [ -n "$IOS_TARGET" ]; then
	npx cap run ios --target "$IOS_TARGET"
else
	npx cap run ios
fi

echo "==> Done"

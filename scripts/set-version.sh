#!/bin/bash
# Usage : scripts/set-version.sh [x.y.z]
# Définit versionName et incrémente versionCode dans android/app/build.gradle.

set -e

cd "$(dirname "$0")/.."

GRADLE="android/app/build.gradle"

CURRENT_NAME="$(sed -nE 's/^\s*versionName "([^"]*)".*/\1/p' "$GRADLE")"
CURRENT_CODE="$(sed -nE 's/^\s*versionCode ([0-9]+).*/\1/p' "$GRADLE")"

if [ -z "$CURRENT_CODE" ]; then
	echo "Erreur : versionCode introuvable dans $GRADLE" >&2
	exit 1
fi

echo "Version actuelle : $CURRENT_NAME (code $CURRENT_CODE)"

VERSION="$1"
if [ -z "$VERSION" ]; then
	read -rp "Nouvel identifiant de version (ex. 1.3.2) : " VERSION
fi

if ! [[ "$VERSION" =~ ^[0-9]+(\.[0-9]+)*$ ]]; then
	echo "Erreur : version invalide « $VERSION » (attendu : 1.3.2)" >&2
	exit 1
fi

NEW_CODE=$((CURRENT_CODE + 1))

sed -i -E \
	-e "s/^(\s*versionCode )[0-9]+/\1$NEW_CODE/" \
	-e "s/^(\s*versionName )\"[^\"]*\"/\1\"$VERSION\"/" \
	"$GRADLE"

# Garde package.json synchronisé (sans toucher au lockfile)
sed -i -E "0,/\"version\": \"[^\"]*\"/s//\"version\": \"$VERSION\"/" package.json

echo "Nouvelle version : $VERSION"
echo "Code de version  : $NEW_CODE"

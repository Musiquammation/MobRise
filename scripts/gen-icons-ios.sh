#!/bin/bash
# Génère l'icône iOS (1024×1024, sans transparence) à partir de resources/icon.png.
# Le dossier ios/ n'est pas versionné : à relancer après chaque `cap add`/sync.
# Usage : scripts/gen-icons-ios.sh [dossier appiconset]
# Nécessite ImageMagick (magick ou convert).

set -e
cd "$(dirname "$0")/.."

SRC="resources/icon.png"
SET="${1:-ios/App/App/Assets.xcassets/AppIcon.appiconset}"
BG_COLOR="#6A3FD6"
IM="$(command -v magick || command -v convert || true)"

if [ -z "$IM" ]; then
	echo "Erreur : ImageMagick introuvable (brew install imagemagick)." >&2
	exit 1
fi
if [ ! -d "$SET" ]; then
	echo "Erreur : $SET introuvable (lance d'abord 'npx cap add ios')." >&2
	exit 1
fi

echo "==> Generating iOS icon from $SRC"
# L'App Store refuse les icônes avec canal alpha : on aplatit sur la couleur de fond.
"$IM" "$SRC" -resize 1024x1024 -background "$BG_COLOR" -alpha remove -alpha off -strip "$SET/AppIcon-512@2x.png"

cat > "$SET/Contents.json" <<JSON
{
  "images" : [
    {
      "filename" : "AppIcon-512@2x.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
JSON

echo "    Icon written to $SET"

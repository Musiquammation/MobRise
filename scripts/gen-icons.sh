#!/bin/bash
# Génère les icônes Android (mipmaps) à partir de resources/icon.png.
# Le dossier android/ n'est pas versionné : à relancer après chaque `cap add`/sync.
# Usage : scripts/gen-icons.sh [dossier res]   (défaut : android/app/src/main/res)
# Nécessite ImageMagick (magick ou convert).

set -e
cd "$(dirname "$0")/.."

SRC="resources/icon.png"
RES="${1:-android/app/src/main/res}"
BG_COLOR="#6A3FD6"
IM="$(command -v magick || command -v convert)"

if [ -z "$IM" ]; then
	echo "Erreur : ImageMagick introuvable (magick/convert)." >&2
	exit 1
fi
if [ ! -d "$RES" ]; then
	echo "Erreur : $RES introuvable (lance d'abord 'npx cap add android')." >&2
	exit 1
fi

echo "==> Generating Android icons from $SRC"
# densité : taille legacy (48dp) / taille foreground adaptive (108dp)
for entry in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
	IFS=: read -r dpi size fg <<< "$entry"
	dir="$RES/mipmap-$dpi"
	mkdir -p "$dir"
	"$IM" "$SRC" -resize "${size}x${size}" -strip "$dir/ic_launcher.png"
	"$IM" "$SRC" -resize "${size}x${size}" -strip \
		\( -size "${size}x${size}" xc:none -fill white -draw "circle $((size/2)),$((size/2)) $((size/2)),0" \) \
		-alpha set -compose DstIn -composite "$dir/ic_launcher_round.png"
	# Icône adaptive : l'image remplit tout le calque (108dp), le launcher la recadre.
	"$IM" "$SRC" -resize "${fg}x${fg}" -strip "$dir/ic_launcher_foreground.png"
done

mkdir -p "$RES/values"
cat > "$RES/values/ic_launcher_background.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$BG_COLOR</color>
</resources>
XML

echo "    Icons written to $RES"

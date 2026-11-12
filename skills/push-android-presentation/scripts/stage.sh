#!/usr/bin/env bash
# Copies the Play listing images from dist/android-presentation into an upload
# folder with a timestamp suffix. Play's asset library keeps old files under
# their original name, so every push needs distinct file names.
#
# Usage: stage.sh <out-dir>   (run from the project root)
set -euo pipefail
SRC=dist/android-presentation
OUT=${1:?usage: stage.sh <out-dir>}
T=$(date +%Y%m%d-%H%M)

[ -f "$SRC/icon-512.png" ] || { echo "missing $SRC (run the android-presentation skill first)" >&2; exit 1; }
rm -rf "$OUT"; mkdir -p "$OUT/phone" "$OUT/tablet-7in" "$OUT/tablet-10in"
cp "$SRC/icon-512.png" "$OUT/icon-512-$T.png"
cp "$SRC/feature-graphic-1024x500.png" "$OUT/feature-graphic-$T.png"
for d in phone tablet-7in tablet-10in; do
  # Play takes at most 8 screenshots per slot: upload 01..08.
  for f in "$SRC/$d"/0[1-8]-*.png; do
    cp "$f" "$OUT/$d/$(basename "$f" .png)-$T.png"
  done
done
echo "suffix: -$T"
find "$OUT" -type f | sort

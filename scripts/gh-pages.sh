#!/bin/bash
# Build le jeu et le publie sur la branche gh-pages (https://musiquammation.github.io/MobRise/).
# gh-pages contient le build (dist/) + privacy.html. Seul env.js y diffère de master :
# il garde sa version gh-pages (base "/MobRise/"), dont on met juste à jour la version affichée.
# Usage : scripts/gh-pages.sh        (build et publie le commit courant)

set -e

cd "$(dirname "$0")/.."

BRANCH="gh-pages"
REMOTE="origin"

if [ -n "$(git status --porcelain)" ]; then
	echo "Erreur : il y a des modifications non commitées, commite-les d'abord." >&2
	git status --short >&2
	exit 1
fi

VERSION="$(node -p 'require("./package.json").version')"
COMMIT="$(git rev-parse --short HEAD)"
DATE="$(date +%Y-%m-%d)"
FULL_VERSION="$VERSION ($COMMIT, $DATE)"

echo "==> Web build ($FULL_VERSION)"
npm run build

echo "==> Preparing $BRANCH"
git fetch "$REMOTE" "$BRANCH"
TMP="$(mktemp -d)"
trap 'git worktree remove --force "$TMP" 2> /dev/null || true; rm -rf "$TMP"' EXIT
git worktree add --detach "$TMP" "$REMOTE/$BRANCH" > /dev/null

# On garde l'env.js de gh-pages (s'il existe) et privacy.html ; le reste est remplacé par le build.
KEEP_ENV="$(mktemp)"
if [ -f "$TMP/env.js" ]; then cp "$TMP/env.js" "$KEEP_ENV"; else rm -f "$KEEP_ENV"; fi

find "$TMP" -mindepth 1 -maxdepth 1 ! -name .git ! -name privacy.html -exec rm -rf {} +
cp -R dist/. "$TMP/"
touch "$TMP/.nojekyll"

if [ -f "$KEEP_ENV" ]; then
	mv "$KEEP_ENV" "$TMP/env.js"
else
	echo "Erreur : env.js absent de $BRANCH (il doit définir base \"/MobRise/\")." >&2
	exit 1
fi
sed -i.bak -E "s/version: \"[^\"]*\"/version: \"$FULL_VERSION\"/" "$TMP/env.js" && rm -f "$TMP/env.js.bak"

echo "==> Commit & push"
git -C "$TMP" add -A
if git -C "$TMP" diff --cached --quiet; then
	echo "    Rien à publier."
	exit 0
fi
git -C "$TMP" commit -q -m "Deploy $FULL_VERSION"
git -C "$TMP" push "$REMOTE" "HEAD:$BRANCH"

echo "==> Done : https://musiquammation.github.io/MobRise/ (quelques minutes pour la mise en ligne)"

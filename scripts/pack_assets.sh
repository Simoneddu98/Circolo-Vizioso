#!/bin/zsh
# Comprime i glb di build/ e li copia nel gioco. Uso: zsh scripts/pack_assets.sh
set -e
cd "$(dirname "$0")/.."
T=$(mktemp -d)
G() { npx --yes @gltf-transform/cli@4 "$@" 2>&1 | grep -v "quantize: Skipping" || true; }
G resize build/circolo.glb $T/c1.glb --width 1024 --height 1024
G webp $T/c1.glb $T/c2.glb --quality 85
G meshopt $T/c2.glb circolo-game/assets/circolo.glb
G meshopt build/hands.glb circolo-game/assets/hands.glb
cp build/circolo_collision.glb circolo-game/assets/
# versione degli asset (?v= negli URL): il browser non riusa copie vecchie dopo una nuova pubblicazione
H=$(cat circolo-game/assets/circolo.glb circolo-game/assets/hands.glb circolo-game/assets/circolo_collision.glb | md5 -q | cut -c1-10)
printf "// Generato da scripts/pack_assets.sh: cambia a ogni nuova versione degli asset, così il browser non usa copie vecchie.\nexport const ASSET_VERSION = '%s';\n" "$H" > circolo-game/src/version.js
rm -rf $T
ls -la circolo-game/assets

#!/bin/zsh
# Sito statico pronto da pubblicare: sito/ (nel repository: su Vercel "Root Directory" = sito, preset "Other",
# nessun comando di build; su Netlify publish = sito) e la stessa cartella in consegna/netlify-circolo da trascinare
# su https://app.netlify.com/drop. Copia pagina, codice, asset compressi e three.js dal gioco, poi controlla che non manchi
# niente (tutti i file importati o caricati esistono, con maiuscole e minuscole esatte: Netlify le distingue).
# Uso: zsh scripts/build_netlify.sh
set -e
cd "$(dirname "$0")/.."
OUT=sito
mkdir -p $OUT
rsync -a --delete --exclude '.DS_Store' circolo-game/src/ $OUT/src/
rsync -a --delete --exclude '.DS_Store' --exclude 'partita.mp4' circolo-game/assets/ $OUT/assets/
rsync -a --delete --exclude '.DS_Store' circolo-game/vendor/ $OUT/vendor/
cp circolo-game/index.html $OUT/index.html
touch $OUT/.nojekyll
cat > $OUT/netlify.toml <<'TOML'
# Sito statico: nessun comando di build. Trascina questa cartella su https://app.netlify.com/drop
[build]
  publish = "."
  command = ""

# I glb hanno la versione nell'URL (?v=, src/version.js): si possono tenere in cache a lungo; il logo un giorno.
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=86400"
[[headers]]
  for = "/assets/*.glb"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

# Pagina e codice: sempre ricontrollati, così una nuova pubblicazione si vede subito
[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"
[[headers]]
  for = "/src/*"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"

[[headers]]
  for = "/*.glb"
  [headers.values]
    Content-Type = "model/gltf-binary"
TOML
cat > $OUT/vercel.json <<'JSON'
{
  "cleanUrls": false,
  "headers": [
    { "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=86400" }] },
    { "source": "/assets/(.*)\\.glb", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/src/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] },
    { "source": "/", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] },
    { "source": "/(.*)\\.glb", "headers": [{ "key": "Content-Type", "value": "model/gltf-binary" }] }
  ]
}
JSON
python3 scripts/check_site.py $OUT
rsync -a --delete $OUT/ consegna/netlify-circolo/
du -sh $OUT

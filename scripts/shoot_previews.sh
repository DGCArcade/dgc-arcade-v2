#!/usr/bin/env bash
set -e
DIR="/home/ubuntu/dgc-arcade-v2/email-previews"
OUT="$DIR/png"
mkdir -p "$OUT"
cd "$DIR"
for f in *.html; do
  [ "$f" = "_mail-bundle.mjs" ] && continue
  name="${f%.html}"
  chromium --headless=new --no-sandbox --hide-scrollbars \
    --window-size=640,1400 \
    --default-background-color=00000000 \
    --screenshot="$OUT/$name.png" \
    --virtual-time-budget=2500 \
    "file://$DIR/$f" >/dev/null 2>&1 || echo "FAIL $f"
  echo "shot $name"
done
echo "ALL DONE -> $OUT"

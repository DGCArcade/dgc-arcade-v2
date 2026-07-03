#!/bin/bash

REPO_DIR="$(dirname "$0")/dgc-arcade-v2"

cd "$REPO_DIR" || { echo "ERROR: Could not find $REPO_DIR"; exit 1; }

git config user.email "replit-agent@dgcarcade.dev"
git config user.name "Replit Agent"

REMOTE_URL="https://$GITHUB_TOKEN@github.com/DGCArcade/dgc-arcade-v2.git"
if git remote | grep -q '^origin$'; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

echo "Auto-push watcher started for DGC Arcade v2"
echo "Watching for changes every 30 seconds..."

while true; do
  if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$TIMESTAMP] Changes detected — committing and pushing..."
    git add -A
    git commit -m "Auto-save: $TIMESTAMP"
    git push origin HEAD 2>&1
    if [ $? -eq 0 ]; then
      echo "[$TIMESTAMP] Pushed successfully."
    else
      echo "[$TIMESTAMP] Push failed. Will retry next cycle."
    fi
  else
    echo "[$(date '+%H:%M:%S')] No changes."
  fi
  sleep 30
done

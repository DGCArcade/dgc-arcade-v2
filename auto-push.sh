#!/bin/bash

REPO_DIR="/home/runner/workspace"

cd "$REPO_DIR" || { echo "ERROR: Could not cd to workspace"; exit 1; }

git config user.email "replit-agent@dgcarcade.dev"
git config user.name "Replit Agent"
git remote set-url origin "https://$GITHUB_TOKEN@github.com/DGCArcade/dgc-arcade-v2.git"

# Clear any stuck rebase state from previous runs
git rebase --abort 2>/dev/null || true

echo "Auto-push watcher started for DGC Arcade v2"
echo "Watching for changes in $REPO_DIR every 30 seconds..."

while true; do
  if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$TIMESTAMP] Changes detected — committing..."
    git add -A
    git commit -m "Auto-save: $TIMESTAMP"

    echo "[$TIMESTAMP] Pushing to GitHub (force)..."
    git push --force origin HEAD:main 2>&1
    if [ $? -eq 0 ]; then
      echo "[$TIMESTAMP] Successfully pushed to GitHub."
    else
      echo "[$TIMESTAMP] Push failed. Will retry next cycle."
    fi
  else
    echo "[$(date '+%H:%M:%S')] No changes."
  fi
  sleep 30
done

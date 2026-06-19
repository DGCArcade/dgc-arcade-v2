#!/bin/bash
# Push current main branch to GitHub origin
# Requires GITHUB_TOKEN env var to be set
set -e

if [ -z "$GITHUB_TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN is not set"
  exit 1
fi

cd /home/runner/workspace

git --no-optional-locks status
echo ""
echo "Pushing to origin main..."
git push https://DGC4:${GITHUB_TOKEN}@github.com/DGC4/dgc-arcade-v2.git HEAD:main
echo "Done — pushed to github.com/DGC4/dgc-arcade-v2"

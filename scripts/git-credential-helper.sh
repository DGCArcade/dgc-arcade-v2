#!/bin/sh
# Git credential helper — reads GITHUB_TOKEN from env
# Used by git push to authenticate with GitHub
if [ "$1" = "get" ]; then
  echo "protocol=https"
  echo "host=github.com"
  echo "username=DGC4"
  echo "password=${GITHUB_TOKEN}"
fi

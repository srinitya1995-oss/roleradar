#!/usr/bin/env bash
# Add GitHub remote and push main. Usage: ./scripts/setup-github-remote.sh https://github.com/USER/REPO.git
set -e
if [ -z "$1" ]; then
  echo "Usage: $0 <repo-url>"
  echo "Example: $0 https://github.com/YOUR_USERNAME/roleradar.git"
  exit 1
fi
cd "$(dirname "$0")/.."
git remote add origin "$1" 2>/dev/null || git remote set-url origin "$1"
git push -u origin main

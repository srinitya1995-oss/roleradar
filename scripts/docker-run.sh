#!/usr/bin/env bash
# Build and run Role Radar in Docker (app + agent). Run from project root.
set -e
cd "$(dirname "$0")/.."
echo "Building image (this can take 1-3 min, you'll see layer output below)..."
docker build --progress=plain -t roleradar .
echo "Stopping existing container (if any)..."
docker rm -f roleradar 2>/dev/null || true
echo "Starting container..."
docker run -d -p 3000:3000 \
  -v "$(pwd)/roleradar.db:/app/roleradar.db" \
  --env-file .env \
  --name roleradar \
  roleradar
echo "Done. App: http://localhost:3000  |  Logs: docker logs -f roleradar"

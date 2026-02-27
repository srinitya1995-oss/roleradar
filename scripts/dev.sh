#!/usr/bin/env sh
# Raise open-file limit to avoid "EMFILE: too many open files" during dev
ulimit -n 10240 2>/dev/null || true
exec npx next dev --hostname 127.0.0.1 --webpack "$@"

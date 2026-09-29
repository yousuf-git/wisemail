#!/usr/bin/env bash
# Start a single-node replica set (rs0) on 127.0.0.1:27017 for local development.
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${MONGO_PORT:-27017}"
DBPATH=".data/mongo"

if [ -x /opt/mongo/mongod ]; then
  MONGOD=/opt/mongo/mongod
elif command -v mongod >/dev/null 2>&1; then
  MONGOD="$(command -v mongod)"
else
  echo "mongod not found (looked for /opt/mongo/mongod and PATH)" >&2
  exit 1
fi

mkdir -p "$DBPATH"

if ! (echo > "/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  "$MONGOD" --dbpath "$DBPATH" --port "$PORT" --bind_ip 127.0.0.1 --replSet rs0 \
    --fork --logpath "$DBPATH/mongod.log" >/dev/null
  echo "mongod started on 127.0.0.1:$PORT (log: $DBPATH/mongod.log)"
else
  echo "mongod already listening on 127.0.0.1:$PORT"
fi

MONGO_PORT="$PORT" pnpm exec tsx scripts/init-replset.ts

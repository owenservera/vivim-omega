#!/bin/sh
# Determinism drill: re-derive indexes from the event log and diff.
set -e
cd "$(dirname "$0")/.."
python3 src/query.py --rebuild-indexes --check
python3 tools/hash.py --check MANIFEST.json
echo "pantrylog: verify ok"

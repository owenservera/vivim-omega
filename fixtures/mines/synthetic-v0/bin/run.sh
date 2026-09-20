#!/bin/sh
# pantrylog CLI — thin shell over python3 -m src.main
set -e
cd "$(dirname "$0")/.."
exec python3 -m src.main "$@"

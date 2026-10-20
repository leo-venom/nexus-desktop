#!/usr/bin/env bash
# NEXUS GAME — abre o app com o Chromium embutido (Electron).
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON="$DIR/node_modules/.bin/electron"

if [ ! -x "$ELECTRON" ]; then
  echo "Electron não encontrado em $DIR/node_modules." >&2
  echo "Instale com: npm --prefix \"$DIR\" install" >&2
  exit 1
fi

export ELECTRON_OZONE_PLATFORM_HINT="${ELECTRON_OZONE_PLATFORM_HINT:-auto}"
exec "$ELECTRON" --disable-gpu "$DIR" "$@"

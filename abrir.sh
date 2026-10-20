#!/usr/bin/env bash
# NEXUS GAME — abre o app no navegador.
# Sobe o serve.py (proxy local) se ainda não estiver rodando e abre a página.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-8790}"
URL="http://127.0.0.1:$PORT/"

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 "$URL" 2>/dev/null || true)"
if [ "$code" != "200" ]; then
  setsid python3 "$DIR/serve.py" "$PORT" </dev/null >/tmp/nexus-game.log 2>&1 &
  for _ in $(seq 1 50); do
    sleep 0.1
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 "$URL" 2>/dev/null || true)"
    [ "$code" = "200" ] && break
  done
fi

if [ "$code" = "200" ]; then
  xdg-open "$URL" >/dev/null 2>&1 &
else
  echo "Falha ao iniciar o servidor. Veja /tmp/nexus-game.log" >&2
  exit 1
fi

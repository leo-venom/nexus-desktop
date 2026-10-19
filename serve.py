#!/usr/bin/env python3
"""
NEXUS-DESKTOP — servidor local.

Serve `web/` e faz proxy de APIs compatíveis com OpenAI em `/_proxy?url=...`
(o navegador fala com 127.0.0.1:8790, então não há CORS).

Uso:
    python3 serve.py            # porta 8790
    python3 serve.py 9000       # outra porta
"""
import http.server
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8790


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        # sem cache: garante que um reload pegue o JS/HTML atualizados
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def is_proxy(self):
        # aceita /_proxy (raiz) ou .../_proxy (app servido em subpasta)
        path = urllib.parse.urlparse(self.path).path
        return path.endswith("/_proxy")

    def do_GET(self):
        if self.is_proxy():
            self.proxy("GET")
            return
        super().do_GET()

    def do_POST(self):
        if self.is_proxy():
            self.proxy("POST")
            return
        self.send_error(404, "not found")

    def proxy(self, method):
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        target = (query.get("url") or [""])[0]
        if not target.startswith(("http://", "https://")):
            self.send_error(400, "parametro url invalido")
            return

        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None

        req = urllib.request.Request(target, data=body, method=method)
        for header in ("Authorization", "Content-Type", "Accept"):
            value = self.headers.get(header)
            if value:
                req.add_header(header, value)

        try:
            with urllib.request.urlopen(
                req, timeout=600, context=ssl.create_default_context()
            ) as resp:
                self.send_response(resp.status)
                self.send_header(
                    "Content-Type", resp.headers.get("Content-Type", "application/json")
                )
                self.end_headers()
                while True:
                    chunk = resp.read(4096)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_header(
                "Content-Type", e.headers.get("Content-Type", "application/json")
            )
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:  # noqa: BLE001
            self.send_error(502, "proxy: %s" % e)


def main():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("NEXUS-DESKTOP em http://127.0.0.1:%d/  (proxy: /_proxy)" % PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

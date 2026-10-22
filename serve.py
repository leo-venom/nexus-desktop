#!/usr/bin/env python3
"""
NEXUS GAME — servidor local.

Serve `web/` e faz proxy de APIs compatíveis com OpenAI em `/_proxy?url=...`
(o navegador fala com 127.0.0.1:8790, então não há CORS).

Uso:
    python3 serve.py            # porta 8790
    python3 serve.py 9000       # outra porta
"""
import http.server
import ipaddress
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

_BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(_BASE, "web")
FONTS_DIR = os.path.join(_BASE, "fontes")
FONT_EXT = (".ttf", ".otf", ".woff", ".woff2")
FONT_TYPES = {".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2"}

# --- Mídia do projeto (imagens/ e sons/) ------------------------------------
# A IA recebe a lista de arquivos e referencia por caminho relativo
# ("imagens/fundo.jpg", "sons/tiro.mp3"). O HTML salvo embute a mídia usada.
IMAGES_DIR = os.path.join(_BASE, "imagens")
SOUNDS_DIR = os.path.join(_BASE, "sons")
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif", ".bmp")
SOUND_EXT = (".mp3", ".ogg", ".wav", ".m4a", ".flac", ".opus", ".aac", ".weba")
MEDIA_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".avif": "image/avif", ".bmp": "image/bmp",
    ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav",
    ".m4a": "audio/mp4", ".flac": "audio/flac", ".opus": "audio/ogg",
    ".aac": "audio/aac", ".weba": "audio/webm",
}
MEDIA_KINDS = {
    "imagens": (IMAGES_DIR, IMAGE_EXT, "images"),
    "sons": (SOUNDS_DIR, SOUND_EXT, "sounds"),
}
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8790

# --- Proteção do /_proxy contra SSRF ----------------------------------------
# A página gerada pela IA roda em iframe sandbox: não lê a resposta, mas pode
# disparar requisições cegas para a rede interna. Faixas privadas/link-local/
# metadata ficam bloqueadas; loopback segue liberado (LM Studio, Ollama etc.).
# Resolução DNS não é validada (risco residual conhecido).
_BLOCKED_HOSTS = {
    "metadata",
    "metadata.google.internal",
    "instance-data",
    "metadata.azure.com",
}


def _host_blocked(host):
    h = (host or "").strip().lower()
    if h.startswith("[") and h.endswith("]"):
        h = h[1:-1]
    if not h:
        return True
    if h in _BLOCKED_HOSTS:
        return True
    if h == "localhost":
        return False
    try:
        ip = ipaddress.ip_address(h)
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    if ip.is_loopback:
        return False
    return not ip.is_global


def _target_blocked(target):
    try:
        parts = urllib.parse.urlparse(target)
    except ValueError:
        return True
    if parts.scheme not in ("http", "https"):
        return True
    return _host_blocked(parts.hostname)


class _AllowlistedRedirect(urllib.request.HTTPRedirectHandler):
    max_redirections = 4

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if _target_blocked(newurl):
            raise urllib.error.HTTPError(
                newurl, code, "redirecionamento bloqueado pelo proxy", headers, fp
            )
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(
    urllib.request.HTTPSHandler(context=ssl.create_default_context()),
    _AllowlistedRedirect(),
)


def _media_items(dirpath, exts, prefix):
    """Lista os arquivos de mídia da pasta com nome, tamanho e URL codificada."""
    items = []
    try:
        names = sorted(os.listdir(dirpath))
    except FileNotFoundError:
        return items
    for fn in names:
        if fn.startswith("."):
            continue
        ext = os.path.splitext(fn)[1].lower()
        if ext not in exts:
            continue
        full = os.path.join(dirpath, fn)
        if not os.path.isfile(full):
            continue
        try:
            size = os.path.getsize(full)
        except OSError:
            size = 0
        items.append({
            "file": fn,
            "name": os.path.splitext(fn)[0],
            "ext": ext,
            "size": size,
            "url": prefix + urllib.parse.quote(fn),
        })
    return items


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

    def is_fonts(self):
        path = urllib.parse.urlparse(self.path).path
        return path == "/fontes" or path.startswith("/fontes/")

    def serve_fonts(self):
        """`/fontes/` lista os TTF da pasta do projeto; `/fontes/<arquivo>` entrega o arquivo."""
        path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path)

        if path in ("/fontes", "/fontes/"):
            items = []
            try:
                for fn in sorted(os.listdir(FONTS_DIR)):
                    if fn.startswith(".") or not fn.lower().endswith(FONT_EXT):
                        continue
                    items.append({
                        "file": fn,
                        "family": os.path.splitext(fn)[0],
                        "ext": os.path.splitext(fn)[1].lower(),
                        "url": "/fontes/" + urllib.parse.quote(fn),
                    })
            except FileNotFoundError:
                pass
            data = json.dumps({"fonts": items}, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
            return

        if path.endswith("/fonts.css"):
            """Gera CSS com @font-face para cada fonte da pasta."""
            lines = []
            try:
                for fn in sorted(os.listdir(FONTS_DIR)):
                    if fn.startswith(".") or not fn.lower().endswith(FONT_EXT):
                        continue
                    fam = os.path.splitext(fn)[0].replace('"', '')
                    ext = "opentype" if fn.lower().endswith(".otf") else "truetype"
                    lines.append('@font-face{font-family:"%s";src:url("/fontes/%s") format("%s");font-display:swap}' % (fam, urllib.parse.quote(fn), ext))
            except FileNotFoundError:
                pass
            css = "\n".join(lines)
            data = css.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/css; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
            return

        name = os.path.basename(path)
        full = os.path.join(FONTS_DIR, name)
        if not name.lower().endswith(FONT_EXT) or not os.path.isfile(full):
            self.send_error(404, "fonte nao encontrada")
            return
        try:
            with open(full, "rb") as fh:
                data = fh.read()
        except OSError as e:  # noqa: BLE001
            self.send_error(500, "fonte: %s" % e)
            return
        self.send_response(200)
        self.send_header("Content-Type", FONT_TYPES.get(os.path.splitext(name)[1].lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        # iframe do app tem origem opaca: precisa de CORS liberado pra carregar a fonte
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.end_headers()
        self.wfile.write(data)

    def is_media(self):
        path = urllib.parse.urlparse(self.path).path
        for kind in MEDIA_KINDS:
            if path == "/" + kind or path.startswith("/" + kind + "/"):
                return True
        return path.rstrip("/") == "/midia"

    def _send_json(self, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.end_headers()
        self.wfile.write(data)

    def serve_media(self):
        """`/midia` lista imagens+sons; `/imagens/` e `/sons/` listam e entregam."""
        path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path)

        if path.rstrip("/") == "/midia":
            self._send_json({
                "images": _media_items(IMAGES_DIR, IMAGE_EXT, "/imagens/"),
                "sounds": _media_items(SOUNDS_DIR, SOUND_EXT, "/sons/"),
            })
            return

        kind = path.lstrip("/").split("/", 1)[0]
        dirpath, exts, key = MEDIA_KINDS[kind]

        if path in ("/" + kind, "/" + kind + "/"):
            self._send_json({key: _media_items(dirpath, exts, "/" + kind + "/")})
            return

        name = os.path.basename(path)
        full = os.path.join(dirpath, name)
        if os.path.splitext(name)[1].lower() not in exts or not os.path.isfile(full):
            self.send_error(404, "midia nao encontrada")
            return
        try:
            with open(full, "rb") as fh:
                data = fh.read()
        except OSError as e:  # noqa: BLE001
            self.send_error(500, "midia: %s" % e)
            return
        self.send_response(200)
        self.send_header("Content-Type", MEDIA_TYPES.get(os.path.splitext(name)[1].lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        # iframe do app tem origem opaca: precisa de CORS liberado pra carregar a mídia
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.is_proxy():
            self.proxy("GET")
            return
        if self.is_fonts():
            self.serve_fonts()
            return
        if self.is_media():
            self.serve_media()
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
        if _target_blocked(target):
            self.send_error(403, "destino nao permitido (rede interna)")
            return

        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None

        req = urllib.request.Request(target, data=body, method=method)
        for header in ("Authorization", "Content-Type", "Accept"):
            value = self.headers.get(header)
            if value:
                req.add_header(header, value)

        try:
            with _OPENER.open(req, timeout=600) as resp:
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
        except (BrokenPipeError, ConnectionResetError):
            return  # cliente já desconectou (timeout/cancelamento)
        except Exception as e:  # noqa: BLE001
            try:
                self.send_error(502, "proxy: %s" % e)
            except (BrokenPipeError, ConnectionResetError):
                pass  # cliente já foi embora


def main():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("NEXUS GAME em http://127.0.0.1:%d/  (proxy: /_proxy)" % PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

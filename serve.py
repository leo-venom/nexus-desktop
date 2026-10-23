#!/usr/bin/env python3
"""
NEXUS GAME — servidor local.

Serve `web/`, proxy de APIs em `/_proxy` e API de projetos em `/_api/saves/*`.

Uso:
    python3 serve.py            # porta 8790
    python3 serve.py 9000       # outra porta
"""
import http.server
import base64
import binascii
import http.client
import ipaddress
import json
import os
import shutil
import socket
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

_BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(_BASE, "web")
FONTS_DIR = os.path.join(_BASE, "fontes")
SALVOS_DIR = os.path.abspath(os.environ.get("NEXUS_SALVOS_DIR", os.path.join(_BASE, "salvos")))
FONT_EXT = (".ttf", ".otf", ".woff", ".woff2")
FONT_TYPES = {".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2"}

# --- Mídia do projeto ---------------------------------------------------------
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
PORT = int(os.environ.get("NEXUS_PORT", sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8790))

def _valid_save_name(value):
    if not isinstance(value, str) or not value or len(value) > 80:
        return False
    if value.startswith(".") or ".." in value or any(c in value for c in ("/", "\\", "\0")):
        return False
    if value.lower() in {"assets", "_backups", "index.html", "meta.json"}:
        return False
    return all(c.isalnum() or c in " _().-" for c in value)

def _save_path(name, create=False):
    if not _valid_save_name(name):
        return None
    if os.path.lexists(SALVOS_DIR):
        if os.path.islink(SALVOS_DIR) or not os.path.isdir(SALVOS_DIR):
            return None
    else:
        os.makedirs(SALVOS_DIR, exist_ok=True)
    root = os.path.realpath(SALVOS_DIR)
    full = os.path.join(root, name)
    if os.path.commonpath((root, os.path.abspath(full))) != root:
        return None
    if os.path.lexists(full):
        if os.path.islink(full) or not os.path.isdir(full):
            return None
    elif create:
        os.mkdir(full)
    else:
        return None
    return full

def _safe_asset_parts(value):
    if not isinstance(value, str) or "\0" in value:
        return None
    parts = value.replace("\\", "/").split("/")
    if not parts or parts[0] != "assets" or any(not p or p in (".", "..") or p.startswith(".") for p in parts):
        return None
    return parts

def _safe_asset_path(project, parts, create=False):
    root = os.path.realpath(project)
    current = root
    for part in parts[:-1]:
        current = os.path.join(current, part)
        if os.path.lexists(current):
            if os.path.islink(current) or not os.path.isdir(current):
                raise ValueError("caminho de asset invalido")
        elif create:
            os.mkdir(current)
        else:
            return None
    result = os.path.abspath(os.path.join(root, *parts))
    if os.path.commonpath((root, result)) != root:
        raise ValueError("caminho de asset invalido")
    if os.path.lexists(result) and (os.path.islink(result) or not os.path.isfile(result)):
        raise ValueError("destino de asset invalido")
    return result

def _regular_file_or_missing(path):
    if not os.path.lexists(path):
        return True
    return not os.path.islink(path) and os.path.isfile(path)

def _tree_has_symlink(root):
    """Return True when any directory entry below root is a symlink."""
    if os.path.islink(root):
        return True
    for current, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            if os.path.islink(os.path.join(current, name)):
                return True
    return False

def _same_local_origin(handler):
    host_header = handler.headers.get("Host", "")
    try:
        host_name = (urllib.parse.urlsplit("http://" + host_header).hostname or "").lower()
    except ValueError:
        host_name = ""
    if handler.headers.get("X-Nexus-Local-Request") == "1" and host_name in ("127.0.0.1", "localhost", "::1"):
        return True
    site = (handler.headers.get("Sec-Fetch-Site") or "").lower()
    if site and site not in ("same-origin", "none"):
        return False
    origin = handler.headers.get("Origin")
    if not origin:
        return site in ("same-origin", "none")
    try:
        parsed = urllib.parse.urlsplit(origin)
        host = host_header
        expected = urllib.parse.urlsplit("http://" + host)
        return (parsed.scheme, parsed.netloc.lower()) == (expected.scheme, expected.netloc.lower()) and \
            (expected.hostname or "").lower() in ("127.0.0.1", "localhost", "::1")
    except (ValueError, TypeError):
        return False

# --- Proteção SSRF ------------------------------------------------------------
_BLOCKED_HOSTS = {
    "metadata", "metadata.google.internal", "instance-data",
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

def _checked_create_connection(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None):
    host, port = address
    normalized = host.strip("[]").lower()
    local_allowed = normalized in ("localhost", "127.0.0.1", "::1")
    try:
        answers = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise urllib.error.URLError(exc)
    candidates = []
    for family, socktype, proto, canonname, sockaddr in answers:
        ip = ipaddress.ip_address(sockaddr[0].split("%", 1)[0])
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        if ip.is_loopback and not local_allowed:
            raise urllib.error.URLError("destino resolvido para loopback nao permitido")
        if normalized == "localhost" and not ip.is_loopback:
            raise urllib.error.URLError("localhost resolveu para destino nao-local")
        if isinstance(ip, ipaddress.IPv6Address):
            value = int(ip)
            if (value >> 112) == 0x2002 or (value >> 96) == 0x20010db8 or (value >> 105) == 0x10008:
                raise urllib.error.URLError("faixa ipv6 especial bloqueada")
            if ip in ipaddress.ip_network("64:ff9b::/96"):
                raise urllib.error.URLError("nat64 bloqueado")
        if not ip.is_loopback and not ip.is_global:
            raise urllib.error.URLError("destino resolvido para rede nao permitida")
        candidates.append((family, socktype, proto, sockaddr))
    if not candidates:
        raise urllib.error.URLError("host sem enderecos validos")
    last_error = None
    for family, socktype, proto, sockaddr in candidates:
        sock = socket.socket(family, socktype, proto)
        try:
            if timeout is not socket._GLOBAL_DEFAULT_TIMEOUT:
                sock.settimeout(timeout)
            if source_address:
                sock.bind(source_address)
            sock.connect(sockaddr)
            return sock
        except OSError as exc:
            last_error = exc
            sock.close()
    raise urllib.error.URLError(last_error or "conexao falhou")

class _PinnedHTTPConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = _checked_create_connection((self.host, self.port), self.timeout, self.source_address)
        if self._tunnel_host:
            self._tunnel()

class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def connect(self):
        self.sock = _checked_create_connection((self.host, self.port), self.timeout, self.source_address)
        if self._tunnel_host:
            self._tunnel()
        self.sock = self._context.wrap_socket(self.sock, server_hostname=self.host)

class _PinnedHTTPHandler(urllib.request.HTTPHandler):
    def http_open(self, req):
        return self.do_open(_PinnedHTTPConnection, req)

class _PinnedHTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        return self.do_open(_PinnedHTTPSConnection, req, context=self._context, check_hostname=self._check_hostname)

def _target_blocked(target):
    try:
        parts = urllib.parse.urlparse(target)
    except ValueError:
        return True
    if parts.scheme not in ("http", "https"):
        return True
    if parts.username is not None or parts.password is not None:
        return True
    return _host_blocked(parts.hostname)

class _AllowlistedRedirect(urllib.request.HTTPRedirectHandler):
    max_redirections = 4
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if _target_blocked(newurl):
            raise urllib.error.HTTPError(newurl, code, "redirecionamento bloqueado", headers, fp)
        old = urllib.parse.urlsplit(req.full_url)
        new = urllib.parse.urlsplit(newurl)
        if (old.scheme.lower(), old.netloc.lower()) != (new.scheme.lower(), new.netloc.lower()):
            req.remove_header("Authorization")
            req.remove_header("Proxy-Authorization")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

_OPENER = urllib.request.build_opener(
    _PinnedHTTPHandler(),
    _PinnedHTTPSHandler(context=ssl.create_default_context()),
    _AllowlistedRedirect(),
)

def _media_items(dirpath, exts, prefix):
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
        items.append({
            "file": fn, "name": os.path.splitext(fn)[0],
            "ext": ext, "size": os.path.getsize(full),
            "url": prefix + urllib.parse.quote(fn),
        })
    return items

# =============================================================================
# API de projetos salvos
# =============================================================================

def _api_saves_list():
    """GET /_api/saves → lista todos os projetos com nome, data, tamanho."""
    projetos = []
    try:
        nomes = sorted(os.listdir(SALVOS_DIR))
    except FileNotFoundError:
        return projetos
    for nome in nomes:
        pasta = os.path.join(SALVOS_DIR, nome)
        if os.path.islink(pasta) or not os.path.isdir(pasta) or not _valid_save_name(nome):
            continue
        idx = os.path.join(pasta, "index.html")
        meta = os.path.join(pasta, "meta.json")
        size = os.path.getsize(idx) if os.path.isfile(idx) else 0
        modified = os.path.getmtime(idx) if os.path.isfile(idx) else 0
        p = {"name": nome, "size": size, "modified": int(modified * 1000)}
        if os.path.isfile(meta):
            try:
                with open(meta) as f:
                    m = json.load(f)
                    p["prompt"] = m.get("prompt", "")
            except Exception:
                pass
        projetos.append(p)
    projetos.sort(key=lambda x: x["modified"], reverse=True)
    return projetos

def _api_saves_read(nome):
    """GET /_api/saves/<nome>/index.html → devolve o HTML."""
    path = _save_path(nome)
    if not path:
        return None, 400
    index_path = os.path.join(path, "index.html")
    if os.path.islink(index_path) or not os.path.isfile(index_path):
        return None, 404
    try:
        with open(index_path, encoding="utf-8") as f:
            return f.read(), 200
    except OSError:
        return None, 500

def _api_saves_read_asset(nome, subpath):
    """GET /_api/saves/<nome>/assets/<path> → devolve arquivo binário."""
    project = _save_path(nome)
    parts = _safe_asset_parts(subpath.replace("\\", "/"))
    if not project or not parts:
        return None, 400, None
    try:
        path = _safe_asset_path(project, parts)
    except ValueError:
        return None, 400, None
    if not path or os.path.islink(path):
        return None, 404, None
    if not os.path.isfile(path):
        return None, 404, None
    try:
        with open(path, "rb") as f:
            data = f.read()
        ext = os.path.splitext(path)[1].lower()
        mime = MEDIA_TYPES.get(ext, "application/octet-stream")
        return data, 200, mime
    except OSError:
        return None, 500, None

def _api_saves_save(nome, body):
    """POST /_api/saves/<nome> → salva index.html + meta.json + assets."""
    if not _valid_save_name(nome):
        return {"ok": False, "error": "nome invalido"}, 400
    if not isinstance(body, dict) or not isinstance(body.get("html"), str):
        return {"ok": False, "error": "html invalido"}, 400
    if len(body["html"].encode("utf-8")) > 32 * 1024 * 1024:
        return {"ok": False, "error": "html excede limite"}, 413
    prepared_assets = []
    total_asset_bytes = 0
    assets = body.get("assets", {})
    if not isinstance(assets, dict):
        return {"ok": False, "error": "assets invalidos"}, 400
    for asset_path, asset_data in assets.items():
        parts = _safe_asset_parts(asset_path)
        if not parts:
            return {"ok": False, "error": "caminho de asset invalido"}, 400
        if isinstance(asset_data, str):
            payload = asset_data.split(",", 1)[-1]
        elif isinstance(asset_data, dict):
            payload = str(asset_data.get("base64", asset_data.get("data", ""))).split(",", 1)[-1]
        else:
            return {"ok": False, "error": "asset invalido"}, 400
        try:
            decoded = base64.b64decode(payload, validate=True)
        except (binascii.Error, ValueError):
            return {"ok": False, "error": "asset base64 invalido"}, 400
        if len(decoded) > 6 * 1024 * 1024:
            return {"ok": False, "error": "asset excede limite"}, 413
        total_asset_bytes += len(decoded)
        if total_asset_bytes > 20 * 1024 * 1024:
            return {"ok": False, "error": "assets excedem limite"}, 413
        prepared_assets.append((parts, decoded))
    try:
        pasta = _save_path(nome, create=True)
        if not pasta:
            return {"ok": False, "error": "destino invalido"}, 400

        # --- Backup automático: salva o index.html atual antes de substituir ---
        import shutil as _shutil
        idx_atual = os.path.join(pasta, "index.html")
        if not _regular_file_or_missing(idx_atual):
            return {"ok": False, "error": "index.html invalido"}, 400
        if os.path.isfile(idx_atual):
            from datetime import datetime as _dt
            ts = _dt.now().strftime("%Y%m%d_%H%M%S")
            bk_dir = os.path.join(pasta, "_backups", ts)
            os.makedirs(bk_dir, exist_ok=True)
            _shutil.copy2(idx_atual, os.path.join(bk_dir, "index.html"))
            # Salva meta do backup
            bk_meta = {"restored_from": ts, "prompt": body.get("prompt", ""),
                       "date": body.get("date", ""), "timestamp": ts}
            with open(os.path.join(bk_dir, "meta.json"), "w") as f:
                json.dump(bk_meta, f)
            # Assets também são copiados se existirem
            assets_dir = os.path.join(pasta, "assets")
            if os.path.islink(assets_dir):
                return {"ok": False, "error": "assets invalido"}, 400
            if os.path.isdir(assets_dir):
                if _tree_has_symlink(assets_dir):
                    return {"ok": False, "error": "assets contem symlink"}, 400
                bk_assets = os.path.join(bk_dir, "assets")
                _shutil.copytree(assets_dir, bk_assets, dirs_exist_ok=True)

        # Salva index.html
        html = body.get("html", "")
        index_file = os.path.join(pasta, "index.html")
        meta_file = os.path.join(pasta, "meta.json")
        if not _regular_file_or_missing(meta_file):
            return {"ok": False, "error": "meta.json invalido"}, 400
        with open(index_file, "w", encoding="utf-8") as f:
            f.write(html)
        # Salva assets se vierem no body
        for parts, decoded in prepared_assets:
            asset_full = _safe_asset_path(pasta, parts, create=True)
            flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
            if hasattr(os, "O_NOFOLLOW"):
                flags |= os.O_NOFOLLOW
            fd = os.open(asset_full, flags, 0o600)
            try:
                with os.fdopen(fd, "wb") as f:
                    f.write(decoded)
            except Exception:
                try:
                    os.close(fd)
                except OSError:
                    pass
                raise
        # Salva meta.json
        meta = {"prompt": body.get("prompt", ""), "date": body.get("date", ""),
                "modified": int(os.path.getmtime(os.path.join(pasta, "index.html")) * 1000)}
        with open(meta_file, "w", encoding="utf-8") as f:
            json.dump(meta, f)
        return {"ok": True, "name": nome}, 200
    except OSError as e:
        return {"ok": False, "error": str(e)}, 500

def _api_saves_delete(nome):
    """DELETE /_api/saves/<nome> → remove a pasta inteira."""
    if not _valid_save_name(nome):
        return {"ok": False, "error": "nome invalido"}, 400
    path = os.path.join(os.path.realpath(SALVOS_DIR), nome)
    if os.path.islink(path) or not os.path.isdir(path):
        return {"ok": False, "error": "nao encontrado"}, 404
    try:
        shutil.rmtree(path)
        return {"ok": True}, 200
    except OSError as e:
        return {"ok": False, "error": str(e)}, 500

def _api_saves_rename(nome, novo_nome):
    """POST /_api/saves/<nome>/rename → renomeia a pasta."""
    if not _valid_save_name(nome) or not _valid_save_name(novo_nome):
        return {"ok": False, "error": "nome invalido"}, 400
    root = os.path.realpath(SALVOS_DIR)
    src = os.path.join(root, nome)
    dst = os.path.join(root, novo_nome)
    if os.path.islink(src) or not os.path.isdir(src):
        return {"ok": False, "error": "nao encontrado"}, 404
    if os.path.exists(dst):
        return {"ok": False, "error": "ja existe"}, 409
    try:
        os.rename(src, dst)
        return {"ok": True, "name": novo_nome}, 200
    except OSError as e:
        return {"ok": False, "error": str(e)}, 500

def _api_saves_duplicate(nome):
    """POST /_api/saves/<nome>/duplicate → copia a pasta com sufixo."""
    if not _valid_save_name(nome):
        return {"ok": False, "error": "nome invalido"}, 400
    src = _save_path(nome)
    if not src:
        return {"ok": False, "error": "nao encontrado"}, 404
    import re
    dst_name = nome + "-copia"
    # Se ja existir -copia, -copia2, -copia3...
    if os.path.lexists(os.path.join(SALVOS_DIR, dst_name)):
        n = 2
        while os.path.lexists(os.path.join(SALVOS_DIR, nome + "-copia" + str(n))):
            n += 1
        dst_name = nome + "-copia" + str(n)
    dst = os.path.join(SALVOS_DIR, dst_name)
    try:
        if _tree_has_symlink(src):
            return {"ok": False, "error": "projeto contem symlink"}, 400
        shutil.copytree(src, dst, symlinks=False)
        return {"ok": True, "name": dst_name}, 200
    except OSError as e:
        return {"ok": False, "error": str(e)}, 500

# =============================================================================

class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _send_json(self, obj, status=200):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.end_headers()
        self.wfile.write(data)

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length < 0 or length > 64 * 1024 * 1024:
            raise ValueError("corpo excede limite")
        if length:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        return {}

    # --- rotas ---

    def is_proxy(self):
        return urllib.parse.urlparse(self.path).path.endswith("/_proxy")

    def is_fonts(self):
        p = urllib.parse.urlparse(self.path).path
        return p == "/fontes" or p.startswith("/fontes/")

    def is_media(self):
        p = urllib.parse.urlparse(self.path).path
        for kind in MEDIA_KINDS:
            if p == "/" + kind or p.startswith("/" + kind + "/"):
                return True
        return p.rstrip("/") == "/midia"

    def is_api(self):
        return urllib.parse.urlparse(self.path).path.startswith("/_api/")

    def serve_api(self):
        method = self.command
        path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path).rstrip("/")
        parts = path.split("/")

        # /_api/saves
        if path == "/_api/saves" and method == "GET":
            return self._send_json(_api_saves_list())

        # /_api/saves/<nome>/...
        if len(parts) >= 4 and parts[1] == "_api" and parts[2] == "saves":
            nome = urllib.parse.unquote(parts[3])
            if not _valid_save_name(nome):
                return self._send_json({"ok": False, "error": "nome invalido"}, 400)
            if method in ("POST", "DELETE") and not _same_local_origin(self):
                return self._send_json({"ok": False, "error": "origem nao permitida"}, 403)

            if len(parts) == 4:
                # /_api/saves/<nome>
                if method == "POST":
                    try:
                        body = self._read_body()
                    except (ValueError, json.JSONDecodeError) as exc:
                        return self._send_json({"ok": False, "error": "JSON invalido"}, 400)
                    r, status = _api_saves_save(nome, body)
                    return self._send_json(r, status)
                if method == "DELETE":
                    r, status = _api_saves_delete(nome)
                    return self._send_json(r, status)
                return self.send_error(405)

            # /_api/saves/<nome>/rename
            if len(parts) == 5 and parts[4] == "rename" and method == "POST":
                try:
                    body = self._read_body()
                except (ValueError, json.JSONDecodeError):
                    return self._send_json({"ok": False, "error": "JSON invalido"}, 400)
                novo = body.get("name", "")
                r, status = _api_saves_rename(nome, novo)
                return self._send_json(r, status)

            # /_api/saves/<nome>/duplicate
            if len(parts) == 5 and parts[4] == "duplicate" and method == "POST":
                r, status = _api_saves_duplicate(nome)
                return self._send_json(r, status)

            if len(parts) >= 5 and parts[4] == "index.html" and method == "GET":
                # /_api/saves/<nome>/index.html
                html, status = _api_saves_read(nome)
                if status == 200:
                    data = html.encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(data)))
                    self.send_header("Cross-Origin-Resource-Policy", "same-origin")
                    self.end_headers()
                    self.wfile.write(data)
                else:
                    self.send_error(status)
                return

            if len(parts) >= 6 and parts[4] == "assets" and method == "GET":
                # /_api/saves/<nome>/assets/<path>
                subpath = "/".join(parts[4:])
                data, status, mime = _api_saves_read_asset(nome, subpath)
                if status == 200 and data is not None:
                    self.send_response(200)
                    self.send_header("Content-Type", mime or "application/octet-stream")
                    self.send_header("Content-Length", str(len(data)))
                    self.send_header("Cross-Origin-Resource-Policy", "same-origin")
                    self.end_headers()
                    self.wfile.write(data)
                else:
                    self.send_error(status)
                return

            # --- Backups ---
            if len(parts) >= 6 and parts[4] == "_backups":
                ts = parts[5]
                safe = nome
                if not __import__("re").fullmatch(r"(?:\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}|\d{8}_\d{6})", ts):
                    return self.send_error(400, "backup invalido")
                bk_dir = os.path.join(SALVOS_DIR, safe, "_backups", ts)

                if len(parts) == 7 and parts[6] == "index.html":
                    # /_api/saves/<nome>/_backups/<ts>/index.html
                    if method == "GET":
                        idx = os.path.join(bk_dir, "index.html")
                        if os.path.islink(bk_dir) or os.path.islink(idx) or not os.path.isfile(idx):
                            return self.send_error(404)
                        with open(idx) as f:
                            data = f.read().encode("utf-8")
                        self.send_response(200)
                        self.send_header("Content-Type", "text/html; charset=utf-8")
                        self.send_header("Content-Length", str(len(data)))
                        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
                        self.end_headers()
                        self.wfile.write(data)
                        return

                if len(parts) == 7 and parts[6] == "restore" and method == "POST":
                    # /_api/saves/<nome>/_backups/<ts>/restore → copia backup de volta
                    idx_bk = os.path.join(bk_dir, "index.html")
                    if os.path.islink(bk_dir) or os.path.islink(idx_bk) or not os.path.isfile(idx_bk):
                        return self._send_json({"ok": False, "error": "backup nao encontrado"}, 404)
                    pasta = os.path.join(SALVOS_DIR, safe)
                    import shutil
                    shutil.copy2(idx_bk, os.path.join(pasta, "index.html"))
                    # Restaura assets se existirem no backup
                    bk_assets = os.path.join(bk_dir, "assets")
                    if os.path.islink(bk_assets):
                        return self._send_json({"ok": False, "error": "assets de backup invalidos"}, 400)
                    if os.path.isdir(bk_assets):
                        dst_assets = os.path.join(pasta, "assets")
                        if os.path.isdir(dst_assets):
                            shutil.rmtree(dst_assets)
                        shutil.copytree(bk_assets, dst_assets)
                    return self._send_json({"ok": True, "name": safe, "restored_from": ts})
                return self.send_error(404)

            # Listar backups: /_api/saves/<nome>/backups
            if len(parts) >= 5 and parts[4] == "backups" and method == "GET" and len(parts) == 5:
                safe = nome
                bk_root = os.path.join(SALVOS_DIR, safe, "_backups")
                backups = []
                try:
                    for bk_name in sorted(os.listdir(bk_root), reverse=True):
                        bk_dir = os.path.join(bk_root, bk_name)
                        if os.path.islink(bk_dir) or not os.path.isdir(bk_dir):
                            continue
                        idx = os.path.join(bk_dir, "index.html")
                        modified = os.path.getmtime(idx) if os.path.isfile(idx) else 0
                        size = os.path.getsize(idx) if os.path.isfile(idx) else 0
                        backups.append({
                            "timestamp": bk_name,
                            "modified": int(modified * 1000),
                            "size": size,
                        })
                except FileNotFoundError:
                    pass
                return self._send_json(backups)

        return self.send_error(404)

    # --- dispatch ---

    def do_GET(self):
        if self.is_proxy():
            return self.proxy("GET")
        if self.is_api():
            return self.serve_api()
        if self.is_fonts():
            return self.serve_fonts()
        if self.is_media():
            return self.serve_media()
        super().do_GET()

    def do_POST(self):
        if self.is_proxy():
            return self.proxy("POST")
        if self.is_api():
            return self.serve_api()
        self.send_error(404)

    def do_DELETE(self):
        if self.is_api():
            return self.serve_api()
        self.send_error(404)

    # --- fontes ---

    def serve_fonts(self):
        path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path)
        if path in ("/fontes", "/fontes/"):
            items = []
            try:
                for fn in sorted(os.listdir(FONTS_DIR)):
                    if fn.startswith(".") or not fn.lower().endswith(FONT_EXT):
                        continue
                    items.append({"file": fn, "family": os.path.splitext(fn)[0],
                                  "ext": os.path.splitext(fn)[1].lower(),
                                  "url": "/fontes/" + urllib.parse.quote(fn)})
            except FileNotFoundError:
                pass
            return self._send_json({"fonts": items})
        # ... fonts.css e arquivos (mantido)
        if path.endswith("/fonts.css"):
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
            data = "\n".join(lines).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/css; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cross-Origin-Resource-Policy", "same-origin")
            self.end_headers()
            self.wfile.write(data)
            return
        name = os.path.basename(path)
        full = os.path.join(FONTS_DIR, name)
        if not name.lower().endswith(FONT_EXT) or not os.path.isfile(full):
            return self.send_error(404)
        try:
            with open(full, "rb") as fh:
                data = fh.read()
        except OSError as e:
            return self.send_error(500, str(e))
        self.send_response(200)
        self.send_header("Content-Type", FONT_TYPES.get(os.path.splitext(name)[1].lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.end_headers()
        self.wfile.write(data)

    # --- mídia ---

    def serve_media(self):
        path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path)
        if path.rstrip("/") == "/midia":
            return self._send_json({
                "images": _media_items(IMAGES_DIR, IMAGE_EXT, "/imagens/"),
                "sounds": _media_items(SOUNDS_DIR, SOUND_EXT, "/sons/"),
            })
        kind = path.lstrip("/").split("/", 1)[0]
        dirpath, exts, key = MEDIA_KINDS[kind]
        if path in ("/" + kind, "/" + kind + "/"):
            return self._send_json({key: _media_items(dirpath, exts, "/" + kind + "/")})
        name = os.path.basename(path)
        full = os.path.join(dirpath, name)
        if os.path.splitext(name)[1].lower() not in exts or not os.path.isfile(full):
            return self.send_error(404)
        try:
            with open(full, "rb") as fh:
                data = fh.read()
        except OSError as e:
            return self.send_error(500, str(e))
        self.send_response(200)
        self.send_header("Content-Type", MEDIA_TYPES.get(os.path.splitext(name)[1].lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.end_headers()
        self.wfile.write(data)

    # --- proxy ---

    def proxy(self, method):
        if not _same_local_origin(self):
            return self.send_error(403, "origem nao permitida")
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        target = (query.get("url") or [""])[0]
        if not target.startswith(("http://", "https://")):
            return self.send_error(400, "parametro url invalido")
        if _target_blocked(target):
            return self.send_error(403, "destino bloqueado")
        length = int(self.headers.get("Content-Length") or 0)
        if length < 0 or length > 32 * 1024 * 1024:
            return self.send_error(413, "corpo excede limite")
        body = self.rfile.read(length) if length else None
        req = urllib.request.Request(target, data=body, method=method)
        for header in ("Authorization", "Content-Type", "Accept"):
            value = self.headers.get(header)
            if value:
                req.add_header(header, value)
        try:
            with _OPENER.open(req, timeout=600) as resp:
                self.send_response(resp.status)
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
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
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as e:
            try:
                self.send_error(502, "proxy: %s" % e)
            except (BrokenPipeError, ConnectionResetError):
                pass


def main():
    os.makedirs(SALVOS_DIR, exist_ok=True)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("NEXUS GAME em http://127.0.0.1:%d/  (proxy: /_proxy | api: /_api/saves)" % PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == "__main__":
    main()

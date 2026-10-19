# Validação — NEXUS-DESKTOP 1.3.0

Registro dos testes executados em **2026-10-18** (Linux, Chromium 152 headless via
REA/Playwright, Node 26.8.1, Python 3.14).

## Matriz de testes

| # | Teste | Como | Resultado |
| --- | --- | --- | --- |
| 1 | Sintaxe JS | `node --check` nos 8 arquivos | OK |
| 2 | `html-builder` | smoke (prompt, extração, decoração, páginas, quirks) | OK |
| 3 | `ai-client` | servidor HTTP local: SSE, progresso, fallback 4xx, `/models`, erros | OK |
| 4 | `applyEdits` | unit: patch, array puro, `find` ausente, CRLF, `looksLikeDocument` | OK |
| 5 | Welcome | Chromium headless: título animado (halo + linha), sem cubo/textos | OK |
| 6 | Configurações | abrir ⚙, preencher endpoint/chave/modelo, salvar | OK |
| 7 | Geração E2E | API fake (SSE) → página renderizada, status `✓ N KB • Xs • modelo • ↑p ↓c` | OK |
| 8 | **Refino cirúrgico** | patch JSON: página manteve `marker-a` + parágrafo; só título mudou | OK (↓8 tok) |
| 9 | Fallback de patch inválido | 3 chamadas (patch → inválido → documento completo) | OK |
| 10 | Proxy/CORS | OpenAI via `/_proxy` na raiz e em `/app/_proxy` | OK (401 relayado) |
| 11 | Paths | 13 assets = 200; vendor; `APP_BASE` raiz/subpasta | OK |
| 12 | Bridge `postMessage` | sonda: `setInput=chip-teste` recebido no shell | OK |
| 13 | Launcher | `py_compile`, `bash -n abrir.sh`, `desktop-file-validate` | OK |
| 14 | Cache | `Cache-Control: no-store` no HTML/JS | OK |
| 15 | Barra superior única | render headless: marca/sessão/status/VU/KB/SALVAR/ABRIR na mesma linha | OK |
| 16 | Prompt no topo (Enter envia) | render headless + Enter sem botão: requisição enviada; ⚙ no canto direito; sem barra inferior | OK |

## Evidências principais

**Refino envia a página atual** (log do modelo fake):

```
REQ#1 | editMode=false | userHead="primeira pagina"
REQ#2 | editMode=true  | userHead="Current page (the HTML document currently displayed on screen):…"
```

**Edição cirúrgica** (DOM final após “mude o título para A2”):

```html
<title>Pagina A2</title>
<h1 id="marker-a">Pagina A2</h1>
<p>conteudo original</p>   <!-- preservado -->
```

**Fallback** (patch inválido):

```
REQ#1 editMode=false → REQ#2 editMode=true (inválido) → REQ#3 editMode=false (documento completo) → OK
```

**CORS** (curl): `POST /v1/chat/completions` da OpenAI não traz
`Access-Control-Allow-Origin`; o proxy local relayou a resposta (401) e o app mostrou a
mensagem real da API.

## Como reproduzir

```bash
cd "/home/leo/Documents/Obsidian Vault/01_Projeto/nexus-desktop"

# 1) sintaxe + utilitários
for f in web/js/*.js; do node --check "$f"; done
python3 -m py_compile serve.py
bash -n abrir.sh
desktop-file-validate NEXUS-DESKTOP.desktop

# 2) aplicar edições (unit)
node /tmp/opencode/smoke-edits.js

# 3) subir o app
python3 serve.py        # ou duplo clique em NEXUS-DESKTOP.desktop

# 4) no navegador: ⚙ → endpoint/chave/modelo → salvar → gerar → editar algo pequeno
#    (o status deve mostrar poucos tokens de saída; o resto da página fica igual)
```

## Limitações conhecidas

- Abrir por `file://` não chama a API (CORS do navegador) — use o atalho/`serve.py`.
- File System Access é exclusivo do Chromium; nos demais, IndexedDB + download.
- **Criação** devolve o documento completo (por design). **Refino** é cirúrgico; se o
  modelo não devolver um patch aplicável, o app refaz a chamada com o prompt base
  (documento completo) — custo extra só nesse caso.

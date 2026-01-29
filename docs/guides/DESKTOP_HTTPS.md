# Desktop HTTPS (Required for Web → Desktop MCP)

Modern Chrome blocks HTTPS → `http://localhost` by default. To allow the web app
to talk to the desktop backend, run the desktop server over HTTPS with a trusted
local certificate.

## 1) Generate a local cert (mkcert)

Install mkcert, then:

```bash
mkcert -install
mkcert localhost 127.0.0.1
```

This produces two files (example):
- `localhost+1.pem` (cert)
- `localhost+1-key.pem` (key)

## 2) Configure the desktop app

Set these in the desktop app environment:

```bash
HTTPS_PORT=3848
HTTPS_CERT_PATH=/path/to/localhost+1.pem
HTTPS_KEY_PATH=/path/to/localhost+1-key.pem
# Optional:
# HTTPS_CA_PATH=/path/to/rootCA.pem
```

## 3) Configure the web app

In Vercel (or `.env`):

```bash
VITE_REQUIRE_DESKTOP=true
VITE_DESKTOP_HTTPS_URL=https://localhost:3848
```

## 4) Verify

```bash
curl -k https://localhost:3848/api/desktop/health
```

You should see a JSON response with `ok: true`.

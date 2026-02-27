# Kanban-MCP på hal.rdy.nu — åtgärder & driftanteckning (2026-02-26)

## Mål
Få **kanban-mcp web-ui + API** att fungera via **nginx reverse proxy** på `https://hal.rdy.nu`, där backend endast lyssnar på loopback.

## Ändringar i kanban-mcp (repo)
### 1) Web-server: port/host via env + CORS via env
Fil: `web-server/src/web-server.ts`

- Default host: `127.0.0.1` (endast lokalt på VPS)
- Default port: **3000** (matchar nginx `proxy_pass`)
- Nya/standard env:
  - `MCP_KANBAN_WEB_HOST` (default `127.0.0.1`)
  - `MCP_KANBAN_WEB_PORT` (default **`3000`**)
  - `MCP_KANBAN_WEB_CORS_ORIGINS` (CSV). Default: `http://localhost:8221,http://127.0.0.1:8221`
    - Viktigt i prod: sätt till `https://hal.rdy.nu`

CORS-implementation:
- Tillåter requests utan `Origin` (t.ex. curl/server-to-server)
- Om `Origin` finns: måste matcha listan → annars fel (tidigare gav detta 500 med text `CORS origin not allowed`)

### 2) Statics: web-ui build
Web-servern serverar statics från `web-ui/dist`.

Bygg vid behov:
```bash
npm ci --prefix web-ui
npm run build --prefix web-ui
```

## Build/run-kommandon som användes
### Bygg
```bash
# DB (viktigt pga better-sqlite3 native binding)
npm ci --prefix shared/db
npm run build --prefix shared/db

# Web-server
npm ci --prefix web-server
npm run build --prefix web-server

# Web-ui
npm ci --prefix web-ui
npm run build --prefix web-ui
```

### Start (prod via nginx)
```bash
MCP_KANBAN_DB_FOLDER_PATH=/home/patrick/.openclaw/projects/db \
MCP_KANBAN_WEB_HOST=127.0.0.1 \
MCP_KANBAN_WEB_PORT=3000 \
MCP_KANBAN_WEB_CORS_ORIGINS="https://hal.rdy.nu" \
npm run start --prefix web-server
```

Obs:
- `MCP_KANBAN_DB_FOLDER_PATH` pekar på DB-foldern under `~/.openclaw/projects/db`.

## Nginx (hal.rdy.nu)
Konfig låg i `/etc/nginx/sites-available/kanbn` (symlink till sites-enabled).

### Proxy
- HTTPS vhost proxy: `proxy_pass http://127.0.0.1:3000;`

### Websocket/upgrade-header (rekommenderad justering)
För att bara sätta `Connection: upgrade` när klienten ber om det:

1) Lägg i `http {}` (nginx.conf eller conf.d):
```nginx
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}
```

2) I `location /`:
```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
```

### Symptom & fix: 500 via domän
- `curl https://hal.rdy.nu/api/boards` utan Origin kunde ge 200.
- Browser gav 500 pga Origin `https://hal.rdy.nu` → CORS block.

Fix:
- Starta web-servern med `MCP_KANBAN_WEB_CORS_ORIGINS="https://hal.rdy.nu"`.

## Process/drift
- Backend lyssnar på `127.0.0.1:3000`.
- Om porten är upptagen: `EADDRINUSE`.
- Snabbcheck:
```bash
curl -fsS http://127.0.0.1:3000/ >/dev/null && echo OK
curl -fsS http://127.0.0.1:3000/api/boards
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

## Skydd/åtkomst
Vi diskuterade två alternativ för att låsa ned `hal.rdy.nu` på nginx-nivå:

1) **Basic Auth** (enklast)
- `htpasswd` → `auth_basic` + `auth_basic_user_file` i `location /`

2) **mTLS (client certificates)** (mest “ssh-nyckel-likt”)
- `ssl_client_certificate ...` + `ssl_verify_client on` i server-blocket

(Inget av detta har applicerats i denna anteckning — endast plan/rekommendation.)

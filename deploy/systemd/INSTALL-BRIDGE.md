# Installera kanban-mcp web (port 3000) + kanban-agent-bridge

Detta sätter upp:
- `kanban-mcp-web.service` (Fastify UI/API på `127.0.0.1:3000`)
- `kanban-agent-bridge.service` (eventdriven worker för tasks tilldelade `AGENT`)

Ingen nginx krävs för denna setup.

## Förutsättningar

- Ubuntu/Debian-lik host med `systemd`
- Node.js installerat (`node` och `npm` i PATH)
- OpenClaw Gateway körs lokalt (default: `http://127.0.0.1:18789`)

## 1) Klona repo och bygg artefakter

```bash
git clone https://github.com/HALFab/kanban-mcp.git
cd kanban-mcp

npm ci --prefix shared/db
npm run build --prefix shared/db

npm ci --prefix web-ui
npm run build --prefix web-ui

npm ci --prefix web-server
npm run build --prefix web-server
```

> `web-server` serverar `web-ui/dist`, därför byggs båda.

## 2) Lägg env-filer i /etc

```bash
sudo cp deploy/systemd/kanban-agent-bridge.env /etc/kanban-agent-bridge.env
sudo cp deploy/systemd/kanban-mcp-web.env /etc/kanban-mcp-web.env
sudo chown root:root /etc/kanban-agent-bridge.env /etc/kanban-mcp-web.env
sudo chmod 600 /etc/kanban-agent-bridge.env /etc/kanban-mcp-web.env
```

Sätt hooks-token i bridge-env:

```bash
sudoedit /etc/kanban-agent-bridge.env
# Lägg till/rätta:
# OPENCLAW_HOOKS_TOKEN=...
```

## 3) Justera paths vid behov

Templates använder default-path:
- repo: `/home/patrick/.openclaw/projects/kanban-mcp`
- DB-folder: `/home/patrick/.openclaw/projects/db`
- inbox: `/home/patrick/.openclaw/kanban-inbox`

Om du kör från annan sökväg, uppdatera:
- `deploy/systemd/kanban-mcp-web.service`
- `deploy/systemd/kanban-agent-bridge.service`
- `/etc/kanban-mcp-web.env`
- `/etc/kanban-agent-bridge.env`

## 4) Installera systemd-enheter

```bash
sudo cp deploy/systemd/kanban-mcp-web.service /etc/systemd/system/
sudo cp deploy/systemd/kanban-agent-bridge.service /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now kanban-mcp-web.service
sudo systemctl enable --now kanban-agent-bridge.service
```

## 5) Verifiera

```bash
systemctl --no-pager --full status kanban-mcp-web.service
systemctl --no-pager --full status kanban-agent-bridge.service
journalctl -u kanban-mcp-web.service -n 100 --no-pager
journalctl -u kanban-agent-bridge.service -n 100 --no-pager
```

Snabbtest API:

```bash
curl -fsS http://127.0.0.1:3000/api/boards
```

## Förväntat beteende

- Web UI/API svarar på `http://127.0.0.1:3000`
- Endast event där assignee går till `AGENT` triggar bridge
- Ingen chattnotis för kanban-arbete (`deliver: false`)
- Agenten instrueras att uppdatera task-content och sätta assignee tillbaka till `USER` när klar

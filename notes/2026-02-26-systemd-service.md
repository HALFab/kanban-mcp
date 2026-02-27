# kanban-mcp web-server som systemd service (2026-02-26)

## Problem
När `kanban-mcp-web.service` startades fick vi fel av typen:

> `kanban-mcp-web.service: Changing to the requested working directory failed: Permission denied`

Orsak:
- I servicefilen var hardening satt till `ProtectHome=true`.
- `ProtectHome=true` gör att `/home` blockeras för tjänsten → systemd kan inte `chdir` till `WorkingDirectory=/home/patrick/...`.

## Åtgärd
Ändrade hardening i servicefilen:
- `ProtectHome=true` → `ProtectHome=read-only`

Kommentar i filen:
- Om man vill ha `ProtectHome=true` framöver bör appen flyttas till t.ex. `/opt/kanban-mcp` (eller liknande) så WorkingDirectory inte ligger under `/home`.

## Filer
Template-filer i repo:
- `deploy/systemd/kanban-mcp-web.service`
- `deploy/systemd/kanban-mcp-web.env`

## Install/uppdatera på host
```bash
sudo cp /home/patrick/.openclaw/projects/kanban-mcp/deploy/systemd/kanban-mcp-web.env /etc/kanban-mcp-web.env
sudo chmod 600 /etc/kanban-mcp-web.env
sudo chown root:root /etc/kanban-mcp-web.env

sudo cp /home/patrick/.openclaw/projects/kanban-mcp/deploy/systemd/kanban-mcp-web.service /etc/systemd/system/kanban-mcp-web.service
sudo systemctl daemon-reload
sudo systemctl restart kanban-mcp-web

sudo systemctl status kanban-mcp-web --no-pager
journalctl -u kanban-mcp-web -n 80 --no-pager
```

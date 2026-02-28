#!/usr/bin/env node

/**
 * kanban-agent-bridge
 *
 * Watches a kanban-mcp inbox directory for events, and triggers OpenClaw isolated runs
 * when tasks are assigned to AGENT.
 *
 * Event source: @kanban-mcp/db writes JSON files when MCP_KANBAN_INBOX_DIR is set.
 *
 * This bridge ONLY triggers on `task.assignee.changed` where assignee becomes AGENT.
 */

import fs from "fs";
import path from "path";

const INBOX_DIR = mustEnv("MCP_KANBAN_INBOX_DIR");
const PROCESSED_DIR = process.env.MCP_KANBAN_INBOX_PROCESSED_DIR || path.join(INBOX_DIR, "processed");
const FAILED_DIR = process.env.MCP_KANBAN_INBOX_FAILED_DIR || path.join(INBOX_DIR, "failed");

const KANBAN_API_BASE = process.env.MCP_KANBAN_API_BASE_URL || "http://127.0.0.1:3000/api";

const OPENCLAW_BASE = process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:18789";
const OPENCLAW_HOOKS_TOKEN = mustEnv("OPENCLAW_HOOKS_TOKEN");
const OPENCLAW_AGENT_ID = process.env.OPENCLAW_AGENT_ID || "main";

const BRIDGE_NAME = process.env.KANBAN_BRIDGE_NAME || "Kanban";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function ensureDirs() {
  fs.mkdirSync(INBOX_DIR, { recursive: true });
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  fs.mkdirSync(FAILED_DIR, { recursive: true });
}

async function httpJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = json?.error || json?.message || text || `HTTP ${res.status}`;
    const err = new Error(`${res.status} ${res.statusText}: ${msg}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function fetchTask(taskId) {
  return httpJson(`${KANBAN_API_BASE}/tasks/${taskId}`);
}

async function fetchBoard(boardId) {
  return httpJson(`${KANBAN_API_BASE}/boards/${boardId}`);
}

function buildAgentMessage({ event, boardData, task }) {
  const board = boardData?.board;
  const columns = boardData?.columns || [];

  const projectHint = extractProjectHint(board?.goal || "");

  const locationHint = [
    board?.name ? `Board: ${board.name}` : null,
    board?.id ? `BoardId: ${board.id}` : null,
    projectHint ? `Project: ${projectHint}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const instructions = `Du är en agent som arbetar via kanban-mcp.\n\nMÅL: Läs kortet, utför uppgiften, och skriv all återkoppling på själva kortet (uppdatera task.content). När du är klar (eller behöver input), sätt assignee tillbaka till USER.\n\nVIKTIGT:\n- Kontexten är projektet som kortet ligger på. Använd Board.goal och ev. 'Project:'-raden som projektindikator.\n- Jobba bara på tasks där assignee=AGENT.\n- Undvik loop: när du uppdaterar kortet, ändra inte assignee om du inte är klar.\n\nKanban API (loopback):\n- GET  ${KANBAN_API_BASE}/tasks/:taskId\n- PUT  ${KANBAN_API_BASE}/tasks/:taskId   { content }\n- PUT  ${KANBAN_API_BASE}/tasks/:taskId/assignee { assignee, reason }\n\nRekommenderad struktur när du skriver tillbaka (append i slutet):\n\n## Agentens arbete (YYYY-MM-DD HH:mm)\n- Status:\n- Vad jag gjorde:\n- Resultat:\n- Frågor/blockers:\n- Nästa steg:\n`;

  const columnNames = columns
    .map((c) => `${c.name} (id=${c.id})`) 
    .join(", ");

  return [
    `${BRIDGE_NAME}: Nytt AGENT-kort tilldelat`,
    locationHint,
    columnNames ? `Columns: ${columnNames}` : null,
    "",
    `TaskId: ${task.id}`,
    `Title: ${task.title}`,
    `Assignee: ${task.assignee}`,
    "",
    "--- TASK CONTENT ---",
    task.content,
    "--- END TASK CONTENT ---",
    "",
    instructions,
    "",
    `Event: ${event.eventType} (${event.ts})`,
  ]
    .filter((x) => x !== null)
    .join("\n");
}

function extractProjectHint(goal) {
  // Convention: include a line like "Project: <slug>" in board.goal.
  const m = goal.match(/\bProject\s*:\s*([a-z0-9][a-z0-9\-_/]*)/i);
  return m ? m[1] : null;
}

async function triggerOpenClawAgentRun(message) {
  const url = `${OPENCLAW_BASE}/hooks/agent`;
  const payload = {
    message,
    name: BRIDGE_NAME,
    agentId: OPENCLAW_AGENT_ID,
    wakeMode: "now",
    deliver: false,
    thinking: "low",
    timeoutSeconds: 600,
  };

  await httpJson(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${OPENCLAW_HOOKS_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
}

function safeMove(src, destDir) {
  const base = path.basename(src);
  const dest = path.join(destDir, base);
  try {
    fs.renameSync(src, dest);
  } catch {
    // Fallback: copy+unlink
    try {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    } catch {
      // ignore
    }
  }
}

async function handleEventFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const event = JSON.parse(raw);

  // Only trigger when assignee became AGENT.
  if (event.eventType !== "task.assignee.changed") return "ignored";
  if (event.assignee !== "AGENT") return "ignored";
  if (event.beforeAssignee === "AGENT") return "ignored";

  // Fetch up-to-date context.
  const task = await fetchTask(event.taskId);
  const boardData = event.boardId ? await fetchBoard(event.boardId) : null;

  const message = buildAgentMessage({ event, boardData, task });
  await triggerOpenClawAgentRun(message);

  return "triggered";
}

function listInboxJsonFiles() {
  return fs
    .readdirSync(INBOX_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(INBOX_DIR, f));
}

async function drainOnce() {
  const files = listInboxJsonFiles();
  for (const f of files) {
    try {
      const result = await handleEventFile(f);
      safeMove(f, PROCESSED_DIR);
      if (process.env.KANBAN_BRIDGE_LOG === "1") {
        console.log(`[bridge] ${result}: ${path.basename(f)}`);
      }
    } catch (err) {
      if (process.env.KANBAN_BRIDGE_LOG === "1") {
        console.error(`[bridge] failed: ${path.basename(f)}:`, err?.message || err);
      }
      safeMove(f, FAILED_DIR);
    }
  }
}

async function main() {
  ensureDirs();

  // Initial drain in case files exist.
  await drainOnce();

  // Watch for new files using fs.watch (inotify-backed on Linux).
  fs.watch(INBOX_DIR, { persistent: true }, async (_eventType, filename) => {
    if (!filename) return;
    if (!filename.endsWith(".json")) return;

    // Small delay to allow writer to finish.
    setTimeout(() => {
      drainOnce().catch(() => {});
    }, 50);
  });

  if (process.env.KANBAN_BRIDGE_LOG === "1") {
    console.log(`[bridge] watching ${INBOX_DIR}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

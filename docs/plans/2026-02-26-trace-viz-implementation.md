# trace-viz Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a real-time Claude Code session visualizer with a synthwave-styled TUI HUD, web dashboard (Winamp-style visualizer + D3 agent topology + analytics), and shareable session artifacts (PNG card + HTML snapshot).

**Architecture:** A Bun daemon receives events from Claude Code hooks via HTTP POST and broadcasts via WebSocket to both an Ink TUI HUD and a React/Vite web dashboard. Events are persisted as JSONL for replay and artifact export. Four preset dashboard layouts (Vibe / Balanced / Mission Control / Debrief) with per-panel fullscreen on double-click.

**Tech Stack:** Bun, TypeScript, Ink (TUI), Vite + React (web), D3.js (agent topology), Canvas 2D API (visualizer), html2canvas (PNG artifact export)

---

### Task 1: Install Bun + Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`

**Step 1: Install Bun**

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

Expected: prints Bun version (1.x)

**Step 2: Initialize Bun project**

```bash
cd /home/john/trace-visualizer
bun init -y
```

**Step 3: Install all dependencies**

```bash
bun add ink react d3 html2canvas
bun add -d typescript @types/react @types/d3 @types/html2canvas vite @vitejs/plugin-react
```

**Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "paths": {
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": ["src/**/*", "vite.config.ts"]
}
```

**Step 5: Create `vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/web',
  build: { outDir: '../../dist/web' },
  server: { port: 5173 },
});
```

**Step 6: Update `package.json` scripts and bin**

Replace the scripts section:

```json
{
  "name": "trace-viz",
  "version": "0.1.0",
  "type": "module",
  "bin": { "trace-viz": "./dist/cli/index.js" },
  "scripts": {
    "dev:daemon": "bun run src/daemon/server.ts",
    "dev:web": "vite",
    "dev:tui": "bun run src/tui/index.ts",
    "build": "bun build src/cli/index.ts --outdir dist/cli --target bun && bun run build:web",
    "build:web": "vite build",
    "test": "bun test"
  }
}
```

**Step 7: Create directory structure**

```bash
mkdir -p src/{daemon,tui/components,web/src/{panels,layouts,contexts,artifact,styles},hooks,shared,cli/commands}
```

**Step 8: Commit**

```bash
git add package.json tsconfig.json vite.config.ts bun.lockb
git commit -m "feat: project scaffold with Bun, TypeScript, Vite"
```

---

### Task 2: Shared Event Types

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/types.test.ts`

**Step 1: Write `src/shared/types.ts`**

```typescript
export type ToolType = 'bash' | 'file' | 'web' | 'task' | 'other';

export interface BaseEvent {
  id: string;
  sessionId: string;
  agentId: string;
  timestamp: number;
}

export interface ToolStartEvent extends BaseEvent {
  type: 'tool_start';
  toolName: string;
  toolType: ToolType;
}

export interface ToolEndEvent extends BaseEvent {
  type: 'tool_end';
  toolName: string;
  toolType: ToolType;
  durationMs: number;
  success: boolean;
  outputSize?: number;
}

export interface NotificationEvent extends BaseEvent {
  type: 'notification';
  message: string;
  level: 'info' | 'warning' | 'error';
}

export interface SessionEndEvent extends BaseEvent {
  type: 'session_end';
  totalInputTokens: number;
  totalOutputTokens: number;
  model: string;
}

export interface CompactEvent extends BaseEvent {
  type: 'compact_start' | 'compact_end';
  tokensBefore?: number;
  tokensAfter?: number;
}

export interface AgentSpawnEvent extends BaseEvent {
  type: 'agent_spawn';
  parentAgentId: string;
  childAgentId: string;
}

export interface AgentCompleteEvent extends BaseEvent {
  type: 'agent_complete';
  parentAgentId: string;
  childAgentId: string;
}

export type TraceEvent =
  | ToolStartEvent
  | ToolEndEvent
  | NotificationEvent
  | SessionEndEvent
  | CompactEvent
  | AgentSpawnEvent
  | AgentCompleteEvent;

export interface SessionStats {
  sessionId: string;
  startTime: number;
  endTime?: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  toolCallCount: number;
  toolCallsByType: Record<ToolType, number>;
  agentCount: number;
  model?: string;
}
```

**Step 2: Write `src/shared/types.test.ts`**

```typescript
import { expect, test } from 'bun:test';
import type { ToolStartEvent, ToolEndEvent } from './types';

test('ToolStartEvent has correct shape', () => {
  const e: ToolStartEvent = {
    id: 'evt-1', sessionId: 'sess-1', agentId: 'agent-0',
    timestamp: Date.now(), type: 'tool_start', toolName: 'Read', toolType: 'file',
  };
  expect(e.type).toBe('tool_start');
  expect(e.toolType).toBe('file');
});

test('ToolEndEvent has correct shape', () => {
  const e: ToolEndEvent = {
    id: 'evt-2', sessionId: 'sess-1', agentId: 'agent-0',
    timestamp: Date.now(), type: 'tool_end', toolName: 'Bash',
    toolType: 'bash', durationMs: 250, success: true,
  };
  expect(e.durationMs).toBe(250);
  expect(e.success).toBe(true);
});
```

**Step 3: Run tests**

```bash
bun test src/shared/types.test.ts
```

Expected: PASS (2 tests)

**Step 4: Commit**

```bash
git add src/shared/
git commit -m "feat: add shared event type definitions"
```

---

### Task 3: Event Normalizer

Converts raw Claude Code hook payloads to typed `TraceEvent` objects.

**Files:**
- Create: `src/daemon/normalizer.ts`
- Create: `src/daemon/normalizer.test.ts`

**Step 1: Write failing tests in `src/daemon/normalizer.test.ts`**

```typescript
import { expect, test } from 'bun:test';
import { normalizeHookPayload } from './normalizer';

test('PreToolUse → tool_start with correct toolType', () => {
  const event = normalizeHookPayload(
    { hook: 'PreToolUse', tool_name: 'Read', session_id: 'sess-1' },
    'agent-0'
  );
  expect(event?.type).toBe('tool_start');
  expect(event?.toolType).toBe('file');
});

test('PostToolUse → tool_end with duration', () => {
  const event = normalizeHookPayload(
    { hook: 'PostToolUse', tool_name: 'Bash', duration_ms: 250, session_id: 'sess-1' },
    'agent-0'
  );
  expect(event?.type).toBe('tool_end');
  expect(event?.toolType).toBe('bash');
  if (event?.type === 'tool_end') expect(event.durationMs).toBe(250);
});

test('Notification → notification event', () => {
  const event = normalizeHookPayload(
    { hook: 'Notification', message: 'hello', session_id: 'sess-1' },
    'agent-0'
  );
  expect(event?.type).toBe('notification');
});

test('Task tool spawn → agent_spawn event', () => {
  const event = normalizeHookPayload(
    { hook: 'PreToolUse', tool_name: 'Task', tool_input: { subagent_id: 'agent-1' }, session_id: 'sess-1' },
    'agent-0'
  );
  expect(event?.type).toBe('agent_spawn');
});

test('unknown hook → null', () => {
  expect(normalizeHookPayload({ hook: 'Unknown' }, 'agent-0')).toBeNull();
});
```

**Step 2: Run to verify failure**

```bash
bun test src/daemon/normalizer.test.ts
```

Expected: FAIL — "Cannot find module './normalizer'"

**Step 3: Write `src/daemon/normalizer.ts`**

```typescript
import { randomUUID } from 'crypto';
import type { TraceEvent, ToolType } from '../shared/types';

const TOOL_TYPE_MAP: Record<string, ToolType> = {
  Read: 'file', Write: 'file', Edit: 'file', Glob: 'file', Grep: 'file', NotebookEdit: 'file',
  Bash: 'bash',
  WebFetch: 'web', WebSearch: 'web',
  Task: 'task',
};

function toolType(name: string): ToolType {
  return TOOL_TYPE_MAP[name] ?? 'other';
}

export function normalizeHookPayload(
  payload: Record<string, unknown>,
  agentId: string
): TraceEvent | null {
  const base = {
    id: randomUUID(),
    sessionId: (payload.session_id as string) ?? 'unknown',
    agentId,
    timestamp: Date.now(),
  };

  switch (payload.hook) {
    case 'PreToolUse': {
      const toolName = payload.tool_name as string;
      // Detect subagent spawn from Task tool
      if (toolName === 'Task') {
        const input = payload.tool_input as Record<string, unknown> | undefined;
        const childId = (input?.subagent_id as string) ?? `agent-${base.id.slice(0, 6)}`;
        return { ...base, type: 'agent_spawn', parentAgentId: agentId, childAgentId: childId };
      }
      return { ...base, type: 'tool_start', toolName, toolType: toolType(toolName) };
    }
    case 'PostToolUse': {
      const toolName = payload.tool_name as string;
      const resp = payload.tool_response as Record<string, unknown> | undefined;
      return {
        ...base, type: 'tool_end', toolName, toolType: toolType(toolName),
        durationMs: (payload.duration_ms as number) ?? 0,
        success: !resp?.error,
        outputSize: typeof resp?.output === 'string' ? resp.output.length : undefined,
      };
    }
    case 'Notification':
      return { ...base, type: 'notification', message: (payload.message as string) ?? '', level: 'info' };
    case 'Stop':
      return {
        ...base, type: 'session_end',
        totalInputTokens: (payload.total_input_tokens as number) ?? 0,
        totalOutputTokens: (payload.total_output_tokens as number) ?? 0,
        model: (payload.model as string) ?? 'unknown',
      };
    case 'PreCompact':
      return { ...base, type: 'compact_start', tokensBefore: payload.tokens_before as number };
    case 'PostCompact':
      return { ...base, type: 'compact_end', tokensAfter: payload.tokens_after as number };
    default:
      return null;
  }
}
```

**Step 4: Run tests**

```bash
bun test src/daemon/normalizer.test.ts
```

Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/daemon/normalizer.ts src/daemon/normalizer.test.ts
git commit -m "feat: add hook payload normalizer"
```

---

### Task 4: Event Store + Session Logger

**Files:**
- Create: `src/daemon/store.ts`
- Create: `src/daemon/store.test.ts`
- Create: `src/daemon/logger.ts`

**Step 1: Write failing tests in `src/daemon/store.test.ts`**

```typescript
import { expect, test, beforeEach } from 'bun:test';
import { EventStore } from './store';

let store: EventStore;
beforeEach(() => { store = new EventStore('sess-test'); });

const base = { id: '1', sessionId: 'sess-test', agentId: 'agent-0', timestamp: Date.now() };

test('stores and retrieves events', () => {
  store.add({ ...base, type: 'notification', message: 'hi', level: 'info' });
  expect(store.getAll()).toHaveLength(1);
});

test('getStats counts tool calls by type', () => {
  store.add({ ...base, id: '1', type: 'tool_end', toolName: 'Bash', toolType: 'bash', durationMs: 100, success: true });
  store.add({ ...base, id: '2', type: 'tool_end', toolName: 'Read', toolType: 'file', durationMs: 50, success: true });
  const stats = store.getStats();
  expect(stats.toolCallCount).toBe(2);
  expect(stats.toolCallsByType.bash).toBe(1);
  expect(stats.toolCallsByType.file).toBe(1);
});

test('getStats counts unique agents', () => {
  store.add({ ...base, id: '1', agentId: 'agent-0', type: 'notification', message: '', level: 'info' });
  store.add({ ...base, id: '2', agentId: 'agent-1', type: 'notification', message: '', level: 'info' });
  expect(store.getStats().agentCount).toBe(2);
});
```

**Step 2: Run to verify failure**

```bash
bun test src/daemon/store.test.ts
```

**Step 3: Write `src/daemon/store.ts`**

```typescript
import type { TraceEvent, SessionStats, ToolType } from '../shared/types';

export class EventStore {
  private events: TraceEvent[] = [];
  private readonly startTime = Date.now();

  constructor(public readonly sessionId: string) {}

  add(event: TraceEvent): void {
    this.events.push(event);
  }

  getAll(): TraceEvent[] {
    return [...this.events];
  }

  getStats(): SessionStats {
    const toolEnds = this.events.filter(e => e.type === 'tool_end');
    const toolCallsByType: Record<ToolType, number> = { bash: 0, file: 0, web: 0, task: 0, other: 0 };
    for (const e of toolEnds) {
      if (e.type === 'tool_end') toolCallsByType[e.toolType]++;
    }
    const agentIds = new Set(this.events.map(e => e.agentId));
    const sessionEnd = this.events.find(e => e.type === 'session_end');
    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      endTime: sessionEnd ? Date.now() : undefined,
      totalInputTokens: sessionEnd?.type === 'session_end' ? sessionEnd.totalInputTokens : 0,
      totalOutputTokens: sessionEnd?.type === 'session_end' ? sessionEnd.totalOutputTokens : 0,
      toolCallCount: toolEnds.length,
      toolCallsByType,
      agentCount: agentIds.size,
      model: sessionEnd?.type === 'session_end' ? sessionEnd.model : undefined,
    };
  }
}
```

**Step 4: Run tests**

```bash
bun test src/daemon/store.test.ts
```

Expected: PASS (3 tests)

**Step 5: Write `src/daemon/logger.ts`**

```typescript
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { TraceEvent } from '../shared/types';

const SESSION_DIR = join(homedir(), '.trace-viz', 'sessions');

export class SessionLogger {
  private sink?: ReturnType<ReturnType<typeof Bun.file>['writer']>;

  constructor(private readonly sessionId: string) {}

  async init(): Promise<void> {
    await mkdir(SESSION_DIR, { recursive: true });
    const path = join(SESSION_DIR, `${this.sessionId}.jsonl`);
    this.sink = Bun.file(path).writer();
  }

  write(event: TraceEvent): void {
    this.sink?.write(JSON.stringify(event) + '\n');
  }

  async close(): Promise<void> {
    await this.sink?.flush();
    this.sink?.end();
  }
}
```

**Step 6: Commit**

```bash
git add src/daemon/store.ts src/daemon/store.test.ts src/daemon/logger.ts
git commit -m "feat: add event store and JSONL session logger"
```

---

### Task 5: Bun HTTP + WebSocket Daemon

**Files:**
- Create: `src/daemon/server.ts`
- Create: `src/daemon/server.test.ts`

**Step 1: Write failing tests in `src/daemon/server.test.ts`**

```typescript
import { expect, test, afterAll } from 'bun:test';
import { createServer } from './server';

const server = await createServer({ port: 7824, devMode: false });
afterAll(() => server.stop());

test('POST /event accepts valid payload', async () => {
  const res = await fetch('http://localhost:7824/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hook: 'Notification', message: 'test', session_id: 'test-1' }),
  });
  expect(res.status).toBe(200);
});

test('POST /event rejects invalid JSON', async () => {
  const res = await fetch('http://localhost:7824/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not-json',
  });
  expect(res.status).toBe(400);
});

test('GET /health returns 200', async () => {
  const res = await fetch('http://localhost:7824/health');
  expect(res.status).toBe(200);
});

test('GET /stats returns session stats JSON', async () => {
  const res = await fetch('http://localhost:7824/stats');
  expect(res.status).toBe(200);
  const data = await res.json() as Record<string, unknown>;
  expect(data.toolCallCount).toBeDefined();
});
```

**Step 2: Run to verify failure**

```bash
bun test src/daemon/server.test.ts
```

**Step 3: Write `src/daemon/server.ts`**

```typescript
import { randomUUID } from 'crypto';
import { EventStore } from './store';
import { SessionLogger } from './logger';
import { normalizeHookPayload } from './normalizer';

export interface ServerOptions {
  port: number;
  devMode: boolean;
  webDistPath?: string;
}

export async function createServer(options: ServerOptions) {
  const sessionId = randomUUID();
  const store = new EventStore(sessionId);
  const logger = new SessionLogger(sessionId);
  await logger.init();

  const clients = new Set<{ send(data: string): void }>();

  function broadcast(data: unknown): void {
    const str = JSON.stringify(data);
    for (const client of clients) client.send(str);
  }

  const server = Bun.serve({
    port: options.port,
    async fetch(req, server) {
      const url = new URL(req.url);

      if (server.upgrade(req)) return undefined;

      if (url.pathname === '/health') return new Response('ok');

      if (url.pathname === '/stats') return Response.json(store.getStats());

      if (url.pathname === '/events') return Response.json(store.getAll());

      if (url.pathname === '/event' && req.method === 'POST') {
        let payload: Record<string, unknown>;
        try {
          payload = await req.json() as Record<string, unknown>;
        } catch {
          return new Response('invalid json', { status: 400 });
        }
        const agentId = (payload.agent_id as string) ?? 'agent-0';
        const event = normalizeHookPayload(payload, agentId);
        if (event) {
          store.add(event);
          logger.write(event);
          broadcast(event);
        }
        return new Response('ok');
      }

      // Serve built web app in production
      if (options.webDistPath) {
        const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
        const file = Bun.file(options.webDistPath + filePath);
        if (await file.exists()) return new Response(file);
      }

      return new Response('not found', { status: 404 });
    },
    websocket: {
      open(ws) {
        clients.add(ws);
        ws.send(JSON.stringify({ type: 'snapshot', events: store.getAll(), stats: store.getStats() }));
      },
      close(ws) { clients.delete(ws); },
      message() {},
    },
  });

  return server;
}
```

**Step 4: Run tests**

```bash
bun test src/daemon/server.test.ts
```

Expected: PASS (4 tests)

**Step 5: Integration smoke test — run server and post an event manually**

```bash
bun run src/daemon/server.ts &
sleep 1
curl -s -X POST http://localhost:7823/event \
  -H 'Content-Type: application/json' \
  -d '{"hook":"Notification","message":"hello","session_id":"manual-1"}'
curl -s http://localhost:7823/events | head -c 200
kill %1
```

Expected: event JSON visible in `/events` response.

**Step 6: Commit**

```bash
git add src/daemon/server.ts src/daemon/server.test.ts
git commit -m "feat: add Bun HTTP + WebSocket daemon server"
```

---

### Task 6: Hook Scripts + Init Command

**Files:**
- Create: `src/hooks/pre-tool-use.sh`
- Create: `src/hooks/post-tool-use.sh`
- Create: `src/hooks/notification.sh`
- Create: `src/hooks/stop.sh`
- Create: `src/hooks/pre-compact.sh`
- Create: `src/hooks/post-compact.sh`
- Create: `src/cli/commands/init.ts`
- Create: `src/cli/commands/init.test.ts`

**Step 1: Write hook scripts**

Each reads stdin (Claude Code passes JSON via stdin) and POSTs to the daemon. The daemon must be running for events to be captured; hooks silently no-op if it isn't.

`src/hooks/pre-tool-use.sh`:
```bash
#!/usr/bin/env bash
INPUT=$(cat)
curl -sf -X POST http://localhost:7823/event \
  -H "Content-Type: application/json" \
  -d "{\"hook\":\"PreToolUse\",\"session_id\":\"${CLAUDE_SESSION_ID:-unknown}\",\"agent_id\":\"${CLAUDE_AGENT_ID:-agent-0}\",$(echo "$INPUT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k:d[k] for k in ["tool_name","tool_input"] if k in d})[1:-1])')}" \
  > /dev/null 2>&1 || true
```

`src/hooks/post-tool-use.sh`:
```bash
#!/usr/bin/env bash
INPUT=$(cat)
curl -sf -X POST http://localhost:7823/event \
  -H "Content-Type: application/json" \
  -d "{\"hook\":\"PostToolUse\",\"session_id\":\"${CLAUDE_SESSION_ID:-unknown}\",\"agent_id\":\"${CLAUDE_AGENT_ID:-agent-0}\",$(echo "$INPUT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k:d[k] for k in ["tool_name","tool_response","duration_ms"] if k in d})[1:-1])')}" \
  > /dev/null 2>&1 || true
```

`src/hooks/notification.sh`:
```bash
#!/usr/bin/env bash
INPUT=$(cat)
curl -sf -X POST http://localhost:7823/event \
  -H "Content-Type: application/json" \
  -d "{\"hook\":\"Notification\",\"session_id\":\"${CLAUDE_SESSION_ID:-unknown}\",\"agent_id\":\"${CLAUDE_AGENT_ID:-agent-0}\",$(echo "$INPUT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k:d[k] for k in ["message"] if k in d})[1:-1])')}" \
  > /dev/null 2>&1 || true
```

`src/hooks/stop.sh`:
```bash
#!/usr/bin/env bash
INPUT=$(cat)
curl -sf -X POST http://localhost:7823/event \
  -H "Content-Type: application/json" \
  -d "{\"hook\":\"Stop\",\"session_id\":\"${CLAUDE_SESSION_ID:-unknown}\",\"agent_id\":\"${CLAUDE_AGENT_ID:-agent-0}\",$(echo "$INPUT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k:d[k] for k in ["total_input_tokens","total_output_tokens","model"] if k in d})[1:-1])')}" \
  > /dev/null 2>&1 || true
```

`src/hooks/pre-compact.sh` and `src/hooks/post-compact.sh` follow the same pattern with `PreCompact`/`PostCompact` hook name and relevant fields.

Make all scripts executable:
```bash
chmod +x src/hooks/*.sh
```

**Step 2: Write failing test in `src/cli/commands/init.test.ts`**

```typescript
import { expect, test } from 'bun:test';
import { buildHooksConfig } from './init';

test('buildHooksConfig produces all six hook types', () => {
  const config = buildHooksConfig('/usr/local/bin/trace-viz');
  expect(Object.keys(config.hooks)).toContain('PreToolUse');
  expect(Object.keys(config.hooks)).toContain('PostToolUse');
  expect(Object.keys(config.hooks)).toContain('Notification');
  expect(Object.keys(config.hooks)).toContain('Stop');
  expect(Object.keys(config.hooks)).toContain('PreCompact');
  expect(Object.keys(config.hooks)).toContain('PostCompact');
});

test('hook commands reference the binary path', () => {
  const config = buildHooksConfig('/usr/local/bin/trace-viz');
  const preToolUse = config.hooks.PreToolUse[0].hooks[0].command;
  expect(preToolUse).toContain('/usr/local/bin/trace-viz');
});
```

**Step 3: Run to verify failure**

```bash
bun test src/cli/commands/init.test.ts
```

**Step 4: Write `src/cli/commands/init.ts`**

```typescript
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');

export function buildHooksConfig(bin: string) {
  const hook = (type: string) => ({
    hooks: [{ type: 'command', command: `${bin} hook ${type}` }],
  });
  return {
    hooks: {
      PreToolUse:  [{ matcher: '*', ...hook('pre-tool-use') }],
      PostToolUse: [{ matcher: '*', ...hook('post-tool-use') }],
      Notification: [hook('notification')],
      Stop:         [hook('stop')],
      PreCompact:   [hook('pre-compact')],
      PostCompact:  [hook('post-compact')],
    },
  };
}

export async function runInit(): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(SETTINGS_PATH, 'utf-8')) as Record<string, unknown>;
  } catch { /* file doesn't exist yet */ }

  const hookConfig = buildHooksConfig(process.execPath);
  const merged = { ...existing, hooks: { ...(existing.hooks as object ?? {}), ...hookConfig.hooks } };
  await writeFile(SETTINGS_PATH, JSON.stringify(merged, null, 2));
  console.log(`✓ trace-viz hooks installed to ${SETTINGS_PATH}`);
  console.log('  Run "trace-viz start" before starting a Claude Code session.');
}
```

**Step 5: Run tests**

```bash
bun test src/cli/commands/init.test.ts
```

Expected: PASS (2 tests)

**Step 6: Commit**

```bash
git add src/hooks/ src/cli/commands/init.ts src/cli/commands/init.test.ts
git commit -m "feat: add hook scripts and init command"
```

---

### Task 7: CLI Entry Point

**Files:**
- Create: `src/cli/index.ts`
- Create: `src/cli/open-browser.ts`
- Create: `src/cli/commands/hook.ts`

**Step 1: Write `src/cli/open-browser.ts`**

```typescript
import { spawn } from 'child_process';

export function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
}
```

**Step 2: Write `src/cli/commands/hook.ts`**

This is the internal subcommand called by hook scripts. It reads stdin and POSTs to the daemon.

```typescript
import { createInterface } from 'readline';

const HOOK_NAME_MAP: Record<string, string> = {
  'pre-tool-use':  'PreToolUse',
  'post-tool-use': 'PostToolUse',
  'notification':  'Notification',
  'stop':          'Stop',
  'pre-compact':   'PreCompact',
  'post-compact':  'PostCompact',
};

export async function runHook(hookSlug: string): Promise<void> {
  const hookName = HOOK_NAME_MAP[hookSlug];
  if (!hookName) return;

  const rl = createInterface({ input: process.stdin });
  const lines: string[] = [];
  for await (const line of rl) lines.push(line);
  const rawInput = lines.join('\n');

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(rawInput) as Record<string, unknown>; } catch { /* ignore */ }

  const body = {
    hook: hookName,
    session_id: process.env.CLAUDE_SESSION_ID ?? 'unknown',
    agent_id: process.env.CLAUDE_AGENT_ID ?? 'agent-0',
    ...payload,
  };

  try {
    await fetch('http://localhost:7823/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch { /* daemon not running, silently skip */ }
}
```

**Step 3: Write `src/cli/index.ts`**

```typescript
import { parseArgs } from 'util';

const { positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true });
const [command, ...rest] = positionals;

switch (command) {
  case 'start': {
    const { createServer } = await import('../daemon/server');
    const { openBrowser } = await import('./open-browser');
    const distPath = new URL('../../dist/web', import.meta.url).pathname;
    const server = await createServer({ port: 7823, devMode: false, webDistPath: distPath });
    console.log('⬡ trace-viz running → http://localhost:7823');
    openBrowser('http://localhost:7823');
    process.on('SIGINT', () => { server.stop(); process.exit(0); });
    break;
  }
  case 'init': {
    const { runInit } = await import('./commands/init');
    await runInit();
    break;
  }
  case 'replay': {
    const { runReplay } = await import('./commands/replay');
    await runReplay(rest[0]);
    break;
  }
  case 'export': {
    console.log('Export is triggered from the web dashboard via the ⬡ Export button.');
    break;
  }
  case 'hook': {
    const { runHook } = await import('./commands/hook');
    await runHook(rest[0]);
    break;
  }
  default:
    console.log('Usage: trace-viz <start|init|replay>\n');
    console.log('  start    Start daemon and open web dashboard');
    console.log('  init     Install Claude Code hooks');
    console.log('  replay   Replay a saved session: trace-viz replay <file.jsonl>');
}
```

**Step 4: Test CLI manually**

```bash
bun run src/cli/index.ts
```

Expected: prints usage message.

**Step 5: Commit**

```bash
git add src/cli/
git commit -m "feat: add CLI entry point with start, init, replay, hook commands"
```

---

### Task 8: TUI HUD (Ink)

**Files:**
- Create: `src/tui/components/HUD.tsx`
- Create: `src/tui/index.ts`

**Step 1: Write `src/tui/components/HUD.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { TraceEvent, SessionStats } from '../../shared/types';

const TOOL_COLORS: Record<string, string> = {
  bash: 'magenta', file: 'cyan', web: 'red', task: 'yellow', other: 'white',
};

const BLOCKS = '▁▂▃▄▅▆▇█';

function MiniViz({ activity }: { activity: number }) {
  const idx = Math.min(7, Math.floor(activity * 8));
  return <Text color="cyan">{BLOCKS[idx]}</Text>;
}

export function HUD() {
  const [lastTool, setLastTool] = useState<{ name: string; type: string } | null>(null);
  const [activity, setActivity] = useState(0);
  const [tokenStr, setTokenStr] = useState('0');
  const [subagents, setSubagents] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket;
    const connect = () => {
      ws = new WebSocket('ws://localhost:7823');
      ws.onopen = () => setConnected(true);
      ws.onclose = () => { setConnected(false); setTimeout(connect, 2000); };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data as string) as TraceEvent | { type: 'snapshot'; stats: SessionStats };
        if (msg.type === 'snapshot') {
          const s = (msg as { type: 'snapshot'; stats: SessionStats }).stats;
          const total = s.totalInputTokens + s.totalOutputTokens;
          setTokenStr(total > 1000 ? `${(total / 1000).toFixed(1)}k` : String(total));
          return;
        }
        if (msg.type === 'tool_start') {
          setLastTool({ name: msg.toolName, type: msg.toolType });
          setActivity(1.0);
        }
        if (msg.type === 'agent_spawn') setSubagents(s => s + 1);
      };
    };
    connect();
    return () => ws?.close();
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setActivity(a => Math.max(0, a - 0.08));
      setElapsed(e => e + 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <Box borderStyle="round" borderColor={connected ? 'cyan' : 'gray'} paddingX={1} gap={1}>
      <Text color="cyan" bold>⬡ trace-viz</Text>
      <Text color="gray">│</Text>
      {lastTool ? (
        <Box gap={0}>
          <Text color="white">agent[0] → </Text>
          <Text color={TOOL_COLORS[lastTool.type] ?? 'white'}>{lastTool.name}</Text>
        </Box>
      ) : (
        <Text color="gray">{connected ? 'waiting...' : 'connecting...'}</Text>
      )}
      <Text color="gray">│</Text>
      <MiniViz activity={activity} />
      <Text color="white"> {tokenStr} tok</Text>
      <Text color="gray">│</Text>
      <Text color="magenta">{subagents} subagents</Text>
      <Text color="gray">│</Text>
      <Text color="white">{mm}:{ss}</Text>
    </Box>
  );
}
```

**Step 2: Write `src/tui/index.ts`**

```typescript
import React from 'react';
import { render } from 'ink';
import { HUD } from './components/HUD';

render(React.createElement(HUD));
```

**Step 3: Test TUI manually (requires daemon running)**

In terminal 1:
```bash
bun run src/cli/index.ts start
```

In terminal 2:
```bash
bun run src/tui/index.ts
```

Expected: HUD renders with `⬡ trace-viz │ waiting... │ ▁ 0 tok │ 0 subagents │ 00:00`

Post a test event to see it update:
```bash
curl -s -X POST http://localhost:7823/event \
  -H 'Content-Type: application/json' \
  -d '{"hook":"PreToolUse","tool_name":"Read","session_id":"test"}'
```

**Step 4: Commit**

```bash
git add src/tui/
git commit -m "feat: add Ink TUI HUD with WebSocket connection and mini visualizer"
```

---

### Task 9: Web App Scaffold + EventContext

**Files:**
- Create: `src/web/index.html`
- Create: `src/web/src/main.tsx`
- Create: `src/web/src/App.tsx`
- Create: `src/web/src/contexts/EventContext.tsx`
- Create: `src/web/src/styles/theme.ts`
- Create: `src/web/src/styles/globals.css`

**Step 1: Write `src/web/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>⬡ trace-viz</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

**Step 2: Write `src/web/src/styles/theme.ts`**

```typescript
export const theme = {
  bg:             '#0a0a0f',
  bgPanel:        '#0d0d16',
  bgPanelBorder:  '#1e1e32',
  purple:         '#9d00ff',
  cyan:           '#00f5ff',
  pink:           '#ff2d78',
  gold:           '#ffd700',
  text:           '#e8e8e8',
  textDim:        '#4a4a6a',
  glow: {
    purple: '0 0 12px #9d00ff88, 0 0 24px #9d00ff44',
    cyan:   '0 0 12px #00f5ff88, 0 0 24px #00f5ff44',
    pink:   '0 0 12px #ff2d7888, 0 0 24px #ff2d7844',
  },
} as const;

export type Theme = typeof theme;
```

**Step 3: Write `src/web/src/styles/globals.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, #root {
  height: 100%;
  overflow: hidden;
}

body {
  background: #0a0a0f;
  color: #e8e8e8;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
}

/* Scanline overlay */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.04) 2px,
    rgba(0, 0, 0, 0.04) 4px
  );
  pointer-events: none;
  z-index: 9999;
}

button { font-family: inherit; }

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: #0a0a0f; }
::-webkit-scrollbar-thumb { background: #1e1e32; border-radius: 2px; }
```

**Step 4: Write `src/web/src/contexts/EventContext.tsx`**

```tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { TraceEvent, SessionStats } from '../../../shared/types';

interface EventContextValue {
  events: TraceEvent[];
  stats: SessionStats | null;
  connected: boolean;
  latestEvent: TraceEvent | null;
}

const EventContext = createContext<EventContextValue>({
  events: [], stats: null, connected: false, latestEvent: null,
});

export function EventProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [connected, setConnected] = useState(false);
  const [latestEvent, setLatestEvent] = useState<TraceEvent | null>(null);

  useEffect(() => {
    // Check for snapshot data (HTML export replay mode)
    const snap = (window as Record<string, unknown>).__TRACE_VIZ_SNAPSHOT__ as
      { events: TraceEvent[]; stats: SessionStats } | undefined;
    if (snap) {
      setEvents(snap.events);
      setStats(snap.stats);
      return;
    }

    const ws = new WebSocket(`ws://${window.location.host}`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as
        TraceEvent | { type: 'snapshot'; events: TraceEvent[]; stats: SessionStats };
      if (msg.type === 'snapshot') {
        setEvents((msg as { type: 'snapshot'; events: TraceEvent[]; stats: SessionStats }).events);
        setStats((msg as { type: 'snapshot'; events: TraceEvent[]; stats: SessionStats }).stats);
      } else {
        const event = msg as TraceEvent;
        setEvents(prev => [...prev, event]);
        setLatestEvent(event);
      }
    };
    return () => ws.close();
  }, []);

  return (
    <EventContext.Provider value={{ events, stats, connected, latestEvent }}>
      {children}
    </EventContext.Provider>
  );
}

export const useEvents = () => useContext(EventContext);
```

**Step 5: Write `src/web/src/App.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import { EventProvider, useEvents } from './contexts/EventContext';
import { theme } from './styles/theme';
import './styles/globals.css';

type Layout = 'balanced' | 'vibe' | 'mission' | 'debrief';

const LAYOUT_KEYS: Record<string, Layout> = { b: 'balanced', v: 'vibe', m: 'mission', d: 'debrief' };

function Header({ layout, setLayout }: { layout: Layout; setLayout: (l: Layout) => void }) {
  const { connected } = useEvents();
  return (
    <header style={{
      height: 44, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 20,
      borderBottom: `1px solid ${theme.bgPanelBorder}`, flexShrink: 0,
    }}>
      <span style={{ color: theme.cyan, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>⬡ TRACE-VIZ</span>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: connected ? theme.cyan : theme.textDim,
        boxShadow: connected ? theme.glow.cyan : 'none',
        display: 'inline-block',
      }} />
      <nav style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
        {(['balanced', 'vibe', 'mission', 'debrief'] as Layout[]).map(l => (
          <button key={l} onClick={() => setLayout(l)} style={{
            background: layout === l ? `${theme.purple}22` : 'transparent',
            color: layout === l ? theme.purple : theme.textDim,
            border: `1px solid ${layout === l ? theme.purple : theme.bgPanelBorder}`,
            padding: '3px 12px', borderRadius: 3, cursor: 'pointer',
            fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
            boxShadow: layout === l ? theme.glow.purple : 'none',
            transition: 'all 0.15s',
          }}>
            {l[0].toUpperCase()}
          </button>
        ))}
      </nav>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <ExportButton />
      </div>
    </header>
  );
}

function ExportButton() {
  return (
    <button onClick={() => {/* wired up in Task 14 */}} style={{
      background: 'transparent', color: theme.gold,
      border: `1px solid ${theme.gold}44`, padding: '3px 14px',
      borderRadius: 3, cursor: 'pointer', fontSize: 10,
      letterSpacing: 1.5, fontFamily: 'inherit',
    }}>
      ⬡ EXPORT
    </button>
  );
}

function LayoutArea({ layout }: { layout: Layout }) {
  // Panels imported and wired in Tasks 10-13
  return (
    <div style={{ flex: 1, overflow: 'hidden', padding: 8 }}>
      <div style={{ color: theme.textDim, fontSize: 11 }}>[ {layout} layout — panels wired in next tasks ]</div>
    </div>
  );
}

export function App() {
  const [layout, setLayout] = useState<Layout>('balanced');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const l = LAYOUT_KEYS[e.key.toLowerCase()];
      if (l) setLayout(l);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <EventProvider>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.bg }}>
        <Header layout={layout} setLayout={setLayout} />
        <LayoutArea layout={layout} />
      </div>
    </EventProvider>
  );
}
```

**Step 6: Write `src/web/src/main.tsx`**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
```

**Step 7: Start dev server and verify scaffold**

```bash
bun run dev:web
```

Open http://localhost:5173. Expected: dark header with ⬡ TRACE-VIZ, layout buttons, scanline overlay visible.

**Step 8: Commit**

```bash
git add src/web/
git commit -m "feat: add web app scaffold with EventContext, synthwave theme, keyboard layout switching"
```

---

### Task 10: Visualizer Panel (Canvas 2D)

**Files:**
- Create: `src/web/src/panels/Visualizer.tsx`

**Step 1: Write `src/web/src/panels/Visualizer.tsx`**

```tsx
import React, { useRef, useEffect, useCallback } from 'react';
import { useEvents } from '../contexts/EventContext';
import { theme } from '../styles/theme';
import type { ToolType } from '../../../shared/types';

const TOOL_LABELS: ToolType[] = ['bash', 'file', 'web', 'task', 'other'];
const TOOL_COLORS: Record<ToolType, string> = {
  bash: theme.purple, file: theme.cyan, web: theme.pink, task: theme.gold, other: theme.text,
};
const BAR_COUNT = 40;
const BARS_PER_TYPE = BAR_COUNT / TOOL_LABELS.length;

export function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heights = useRef(new Float32Array(BAR_COUNT).fill(0.02));
  const { latestEvent } = useEvents();

  // Spike bars on tool call
  useEffect(() => {
    if (!latestEvent || latestEvent.type !== 'tool_start') return;
    const typeIdx = TOOL_LABELS.indexOf(latestEvent.toolType);
    const center = Math.round(typeIdx * BARS_PER_TYPE + BARS_PER_TYPE / 2);
    const h = heights.current;
    for (let i = 0; i < BAR_COUNT; i++) {
      const dist = Math.abs(i - center);
      h[i] = Math.min(1, h[i] + Math.max(0, 1 - dist * 0.25));
    }
  }, [latestEvent]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width: W, height: H } = canvas;
    const h = heights.current;
    const now = Date.now();

    ctx.clearRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 0.5;
    for (let y = H; y > 0; y -= H * 0.2) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const bw = W / BAR_COUNT;
    const gap = Math.max(1, bw * 0.15);

    for (let i = 0; i < BAR_COUNT; i++) {
      // Organic decay + idle pulse
      const idle = Math.sin(now * 0.0008 + i * 0.6) * 0.012 + 0.015;
      h[i] = Math.max(idle, h[i] * 0.94);

      const typeIdx = Math.floor(i / BARS_PER_TYPE);
      const color = TOOL_COLORS[TOOL_LABELS[typeIdx]];
      const barH = h[i] * H * 0.88;
      const x = i * bw + gap / 2;
      const y = H - barH;

      // Glow
      ctx.save();
      ctx.shadowBlur = 14;
      ctx.shadowColor = color;

      // Main bar with vertical gradient
      const grad = ctx.createLinearGradient(0, y, 0, H);
      grad.addColorStop(0, color);
      grad.addColorStop(1, color + '44');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, bw - gap, barH);

      // Bright top cap
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, bw - gap, Math.max(2, barH * 0.04));

      ctx.restore();
    }
  }, []);

  // Animation loop
  useEffect(() => {
    let raf: number;
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  // Hi-DPI resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      const ctx = canvas.getContext('2d');
      ctx?.scale(dpr, dpr);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: theme.bgPanel, borderRadius: 6, overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 10, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 20, pointerEvents: 'none',
      }}>
        {TOOL_LABELS.map(t => (
          <span key={t} style={{ color: TOOL_COLORS[t], fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' }}>
            ▪ {t}
          </span>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Test visually**

With dev server running and daemon running, open the dashboard. Switch to Vibe layout once layouts are wired (Task 13). Post a tool event and confirm bars spike with glow.

**Step 3: Commit**

```bash
git add src/web/src/panels/Visualizer.tsx
git commit -m "feat: add synthwave Canvas 2D visualizer panel"
```

---

### Task 11: Agent Topology Panel (D3)

**Files:**
- Create: `src/web/src/panels/Topology.tsx`

**Step 1: Write `src/web/src/panels/Topology.tsx`**

```tsx
import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { useEvents } from '../contexts/EventContext';
import { theme } from '../styles/theme';

interface AgentNode extends d3.SimulationNodeDatum {
  id: string;
  parentId: string | null;
  tokenCount: number;
  active: boolean;
}

export function Topology() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { events } = useEvents();

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const W = el.clientWidth || 400;
    const H = el.clientHeight || 300;

    const svg = d3.select(el);
    svg.selectAll('*').remove();

    // Build node map from events
    const nodeMap = new Map<string, AgentNode>();
    nodeMap.set('agent-0', { id: 'agent-0', parentId: null, tokenCount: 0, active: true });

    for (const e of events) {
      if (e.type === 'agent_spawn') {
        nodeMap.set(e.childAgentId, { id: e.childAgentId, parentId: e.parentAgentId, tokenCount: 0, active: true });
      }
      if (e.type === 'agent_complete') {
        const n = nodeMap.get(e.childAgentId);
        if (n) n.active = false;
      }
      if (e.type === 'session_end') {
        const n = nodeMap.get(e.agentId);
        if (n) { n.tokenCount = e.totalInputTokens + e.totalOutputTokens; }
      }
    }

    const nodes = Array.from(nodeMap.values());
    const links = nodes
      .filter(n => n.parentId && nodeMap.has(n.parentId))
      .map(n => ({ source: n.parentId as string, target: n.id }));

    // Defs
    const defs = svg.append('defs');

    // Grid pattern
    const pat = defs.append('pattern')
      .attr('id', 'topo-grid').attr('width', 40).attr('height', 40).attr('patternUnits', 'userSpaceOnUse');
    pat.append('path').attr('d', 'M 40 0 L 0 0 0 40').attr('fill', 'none')
      .attr('stroke', '#1a1a2e').attr('stroke-width', 0.5);

    // Glow filter
    const f = defs.append('filter').attr('id', 'node-glow');
    f.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
    const m = f.append('feMerge');
    m.append('feMergeNode').attr('in', 'blur');
    m.append('feMergeNode').attr('in', 'SourceGraphic');

    svg.append('rect').attr('width', '100%').attr('height', '100%').attr('fill', 'url(#topo-grid)');

    const g = svg.append('g');

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<AgentNode, { source: string; target: string }>(links)
        .id(d => d.id).distance(90))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(40));

    const link = g.selectAll<SVGLineElement, { source: AgentNode; target: AgentNode }>('line')
      .data(links as { source: AgentNode; target: AgentNode }[])
      .join('line')
      .attr('stroke', theme.purple + '88')
      .attr('stroke-width', 1.5);

    const node = g.selectAll<SVGGElement, AgentNode>('g.node')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .call(d3.drag<SVGGElement, AgentNode>()
        .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end',   (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    node.append('circle')
      .attr('r', d => 14 + Math.min(18, d.tokenCount / 8000))
      .attr('fill', theme.bgPanel)
      .attr('stroke', d => d.active ? theme.cyan : theme.textDim)
      .attr('stroke-width', d => d.active ? 2 : 1)
      .attr('filter', d => d.active ? 'url(#node-glow)' : 'none');

    // Pulse ring for active nodes
    node.filter(d => d.active).append('circle')
      .attr('r', d => 18 + Math.min(18, d.tokenCount / 8000))
      .attr('fill', 'none')
      .attr('stroke', theme.pink)
      .attr('stroke-width', 1)
      .attr('opacity', 0.3);

    node.append('text')
      .text(d => d.id.replace('agent-', ''))
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('fill', theme.text).attr('font-size', 10).attr('font-family', 'monospace');

    sim.on('tick', () => {
      link
        .attr('x1', d => d.source.x ?? 0).attr('y1', d => d.source.y ?? 0)
        .attr('x2', d => d.target.x ?? 0).attr('y2', d => d.target.y ?? 0);
      node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => sim.stop();
  }, [events]);

  return (
    <div style={{ width: '100%', height: '100%', background: theme.bgPanel, borderRadius: 6, overflow: 'hidden' }}>
      <svg ref={svgRef} width="100%" height="100%" />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/web/src/panels/Topology.tsx
git commit -m "feat: add D3 force-directed agent topology panel"
```

---

### Task 12: Analytics Panel

**Files:**
- Create: `src/web/src/panels/Analytics.tsx`

**Step 1: Write `src/web/src/panels/Analytics.tsx`**

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { useEvents } from '../contexts/EventContext';
import { theme } from '../styles/theme';
import type { ToolType } from '../../../shared/types';

const COST_INPUT  = 0.003 / 1000;   // per token
const COST_OUTPUT = 0.015 / 1000;

const TOOL_COLORS: Record<ToolType, string> = {
  bash: theme.purple, file: theme.cyan, web: theme.pink, task: theme.gold, other: theme.text,
};

function RollingNumber({ value, format = (v: number) => v.toLocaleString() }: {
  value: number; format?: (v: number) => string;
}) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (value === prev.current) return;
    const start = prev.current; const end = value;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 500);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + (end - start) * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    prev.current = value;
  }, [value]);

  return <>{format(Math.round(display))}</>;
}

export function Analytics() {
  const { stats } = useEvents();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const inputTok  = stats?.totalInputTokens  ?? 0;
  const outputTok = stats?.totalOutputTokens ?? 0;
  const totalTok  = inputTok + outputTok;
  const cost      = inputTok * COST_INPUT + outputTok * COST_OUTPUT;
  const counts    = stats?.toolCallsByType ?? { bash: 0, file: 0, web: 0, task: 0, other: 0 };
  const maxCount  = Math.max(1, ...Object.values(counts));
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  const statCard = (label: string, value: React.ReactNode, color: string) => (
    <div style={{
      background: theme.bg, border: `1px solid ${theme.bgPanelBorder}`,
      borderRadius: 6, padding: '14px 10px', textAlign: 'center',
    }}>
      <div style={{ color: theme.textDim, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{value}</div>
    </div>
  );

  return (
    <div style={{
      width: '100%', height: '100%', background: theme.bgPanel, borderRadius: 6,
      padding: 18, display: 'flex', flexDirection: 'column', gap: 18, overflow: 'auto',
    }}>
      {/* Stat trio */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {statCard('TOKENS', <RollingNumber value={totalTok} />, theme.cyan)}
        {statCard('COST',   `$${cost.toFixed(4)}`,              theme.pink)}
        {statCard('TIME',   `${mm}:${ss}`,                      theme.purple)}
      </div>

      {/* Tool breakdown */}
      <div>
        <div style={{ color: theme.textDim, fontSize: 9, letterSpacing: 2, marginBottom: 14 }}>TOOL BREAKDOWN</div>
        {(Object.entries(counts) as [ToolType, number][]).map(([type, count]) => (
          <div key={type} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ color: TOOL_COLORS[type], fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>{type}</span>
              <span style={{ color: theme.text, fontSize: 10 }}>{count}</span>
            </div>
            <div style={{ height: 3, background: theme.bg, borderRadius: 2 }}>
              <div style={{
                height: '100%',
                width: `${(count / maxCount) * 100}%`,
                background: TOOL_COLORS[type],
                borderRadius: 2,
                boxShadow: `0 0 6px ${TOOL_COLORS[type]}88`,
                transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 'auto', fontSize: 10, color: theme.textDim }}>
        <span style={{ color: theme.gold }}>{stats?.agentCount ?? 1}</span> agent{(stats?.agentCount ?? 1) !== 1 ? 's' : ''}
        {stats?.model && <> · <span>{stats.model}</span></>}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/web/src/panels/Analytics.tsx
git commit -m "feat: add analytics panel with rolling number animation and neon bars"
```

---

### Task 13: Layout System

**Files:**
- Create: `src/web/src/layouts/Panel.tsx`
- Create: `src/web/src/layouts/Balanced.tsx`
- Create: `src/web/src/layouts/Vibe.tsx`
- Create: `src/web/src/layouts/MissionControl.tsx`
- Create: `src/web/src/layouts/Debrief.tsx`
- Modify: `src/web/src/App.tsx`

**Step 1: Write `src/web/src/layouts/Panel.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import { theme } from '../styles/theme';

interface PanelProps {
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Panel({ title, children, style }: PanelProps) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen]);

  return (
    <div
      onDoubleClick={() => setFullscreen(f => !f)}
      style={{
        position: fullscreen ? 'fixed' : 'relative',
        inset: fullscreen ? 0 : undefined,
        zIndex: fullscreen ? 200 : undefined,
        display: 'flex', flexDirection: 'column',
        border: `1px solid ${theme.bgPanelBorder}`,
        borderRadius: 6, overflow: 'hidden',
        background: theme.bgPanel,
        ...style,
      }}
    >
      <div style={{
        padding: '5px 12px', flexShrink: 0,
        borderBottom: `1px solid ${theme.bgPanelBorder}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ color: theme.textDim, fontSize: 9, letterSpacing: 2 }}>{title.toUpperCase()}</span>
        {fullscreen && (
          <span
            onClick={e => { e.stopPropagation(); setFullscreen(false); }}
            style={{ color: theme.textDim, fontSize: 9, cursor: 'pointer', letterSpacing: 1 }}
          >ESC ✕</span>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}
```

**Step 2: Write the four layout components**

`src/web/src/layouts/Balanced.tsx`:
```tsx
import React from 'react';
import { Panel } from './Panel';
import { Visualizer } from '../panels/Visualizer';
import { Topology } from '../panels/Topology';
import { Analytics } from '../panels/Analytics';

export function Balanced() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, height: '100%' }}>
      <Panel title="Visualizer"><Visualizer /></Panel>
      <Panel title="Agent Topology"><Topology /></Panel>
      <Panel title="Analytics"><Analytics /></Panel>
    </div>
  );
}
```

`src/web/src/layouts/Vibe.tsx`:
```tsx
import React from 'react';
import { Visualizer } from '../panels/Visualizer';

export function Vibe() {
  return <Visualizer />;
}
```

`src/web/src/layouts/MissionControl.tsx`:
```tsx
import React from 'react';
import { Panel } from './Panel';
import { Visualizer } from '../panels/Visualizer';
import { Topology } from '../panels/Topology';
import { Analytics } from '../panels/Analytics';

export function MissionControl() {
  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr 160px', gap: 8, height: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 8 }}>
        <Panel title="Agent Topology"><Topology /></Panel>
        <Panel title="Analytics"><Analytics /></Panel>
      </div>
      <Panel title="Activity"><Visualizer /></Panel>
    </div>
  );
}
```

`src/web/src/layouts/Debrief.tsx`:
```tsx
import React from 'react';
import { Panel } from './Panel';
import { Visualizer } from '../panels/Visualizer';
import { Analytics } from '../panels/Analytics';

export function Debrief() {
  return (
    <div style={{ display: 'grid', gridTemplateRows: '100px 1fr', gap: 8, height: '100%' }}>
      <Panel title="Session Activity"><Visualizer /></Panel>
      <Panel title="Analytics"><Analytics /></Panel>
    </div>
  );
}
```

**Step 3: Update `App.tsx` — wire layouts into LayoutArea**

Replace the `LayoutArea` function body:

```tsx
import { Balanced }      from './layouts/Balanced';
import { Vibe }          from './layouts/Vibe';
import { MissionControl } from './layouts/MissionControl';
import { Debrief }       from './layouts/Debrief';

const LAYOUTS: Record<Layout, React.ComponentType> = {
  balanced: Balanced,
  vibe:     Vibe,
  mission:  MissionControl,
  debrief:  Debrief,
};

function LayoutArea({ layout }: { layout: Layout }) {
  const Component = LAYOUTS[layout];
  return (
    <div style={{ flex: 1, overflow: 'hidden', padding: 8 }}>
      <Component />
    </div>
  );
}
```

**Step 4: Verify all four layouts visually**

Start dev server, press B/V/M/D to switch layouts. Double-click a panel to fullscreen, press Escape to return.

**Step 5: Commit**

```bash
git add src/web/src/layouts/ src/web/src/App.tsx
git commit -m "feat: add four preset layouts with fullscreen panel support"
```

---

### Task 14: Session Artifact — PNG Card

**Files:**
- Create: `src/web/src/artifact/ArtifactCard.tsx`
- Create: `src/web/src/artifact/generatePNG.ts`
- Modify: `src/web/src/App.tsx` (wire Export button)

**Step 1: Write `src/web/src/artifact/ArtifactCard.tsx`**

```tsx
import React from 'react';
import { theme } from '../styles/theme';
import type { SessionStats, TraceEvent, ToolType } from '../../../shared/types';

const TOOL_COLORS: Record<ToolType, string> = {
  bash: theme.purple, file: theme.cyan, web: theme.pink, task: theme.gold, other: theme.text,
};

function SessionWaveform({ events }: { events: TraceEvent[] }) {
  const toolEnds = events.filter(e => e.type === 'tool_end');
  if (toolEnds.length === 0) {
    return <div style={{ height: 120, background: theme.bgPanel, borderRadius: 4 }} />;
  }

  const W = 960; const H = 120;
  const points = toolEnds.map((e, i) => {
    const x = (i / (toolEnds.length - 1 || 1)) * W;
    const dur = e.type === 'tool_end' ? e.durationMs : 0;
    const y = H * 0.5 + Math.sin(i * 1.4) * H * 0.2 + Math.min(H * 0.25, dur / 20);
    return [x, Math.max(8, Math.min(H - 8, y))] as [number, number];
  });

  const pathD = `M ${points.map(([x, y]) => `${x},${y}`).join(' L ')}`;
  const fillD = `${pathD} L ${W},${H} L 0,${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 120 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="wg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={theme.purple} />
          <stop offset="50%"  stopColor={theme.cyan} />
          <stop offset="100%" stopColor={theme.pink} />
        </linearGradient>
        <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={theme.cyan} stopOpacity="0.2" />
          <stop offset="100%" stopColor={theme.cyan} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillD} fill="url(#fg)" />
      <path d={pathD} fill="none" stroke="url(#wg)" strokeWidth="2.5" />
      {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 20)) === 0).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={theme.cyan} opacity="0.7" />
      ))}
    </svg>
  );
}

interface ArtifactCardProps {
  events: TraceEvent[];
  stats: SessionStats;
  format: '1080x1920' | '1080x1080';
}

export function ArtifactCard({ events, stats, format }: ArtifactCardProps) {
  const [cardW, cardH] = format === '1080x1920' ? [1080, 1920] : [1080, 1080];
  const totalTok = stats.totalInputTokens + stats.totalOutputTokens;
  const cost = stats.totalInputTokens * 0.003 / 1000 + stats.totalOutputTokens * 0.015 / 1000;
  const dur = (stats.endTime ?? Date.now()) - stats.startTime;
  const mm = String(Math.floor(dur / 60000)).padStart(2, '0');
  const ss = String(Math.floor((dur % 60000) / 1000)).padStart(2, '0');
  const date = new Date(stats.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div id="artifact-card" style={{
      position: 'fixed', left: -9999, top: 0,
      width: cardW, height: cardH,
      background: theme.bg,
      fontFamily: "'JetBrains Mono', monospace",
      color: theme.text,
      padding: 72,
      display: 'flex', flexDirection: 'column', gap: 48,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: theme.cyan, fontSize: 32, fontWeight: 700, letterSpacing: 4 }}>⬡ TRACE-VIZ</div>
          <div style={{ color: theme.textDim, fontSize: 14, letterSpacing: 3, marginTop: 6 }}>SESSION REPORT</div>
        </div>
        <div style={{ textAlign: 'right', color: theme.textDim, fontSize: 12 }}>
          <div>{date}</div>
          <div style={{ color: theme.textDim, marginTop: 4 }}>{stats.sessionId.slice(0, 12)}</div>
        </div>
      </div>

      {/* Waveform */}
      <div>
        <div style={{ color: theme.textDim, fontSize: 10, letterSpacing: 3, marginBottom: 12 }}>SESSION WAVEFORM</div>
        <SessionWaveform events={events} />
      </div>

      {/* Stat trio */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
        {[
          ['TOKENS', totalTok.toLocaleString(), theme.cyan],
          ['COST',   `$${cost.toFixed(4)}`,     theme.pink],
          ['TIME',   `${mm}:${ss}`,              theme.purple],
        ].map(([label, val, color]) => (
          <div key={String(label)} style={{
            background: theme.bgPanel, border: `1px solid ${theme.bgPanelBorder}`,
            borderRadius: 8, padding: '24px 16px', textAlign: 'center',
          }}>
            <div style={{ color: theme.textDim, fontSize: 11, letterSpacing: 3, marginBottom: 10 }}>{label}</div>
            <div style={{ color: String(color), fontSize: 32, fontWeight: 700 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Tool breakdown */}
      <div>
        <div style={{ color: theme.textDim, fontSize: 10, letterSpacing: 3, marginBottom: 20 }}>TOOL BREAKDOWN</div>
        {(Object.entries(stats.toolCallsByType) as [ToolType, number][])
          .filter(([, c]) => c > 0)
          .map(([type, count]) => (
            <div key={type} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: TOOL_COLORS[type], fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>{type}</span>
                <span style={{ color: theme.text, fontSize: 12 }}>{count}</span>
              </div>
              <div style={{ height: 5, background: theme.bgPanel, borderRadius: 3 }}>
                <div style={{
                  height: '100%',
                  width: `${(count / stats.toolCallCount) * 100}%`,
                  background: TOOL_COLORS[type],
                  borderRadius: 3,
                }} />
              </div>
            </div>
          ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', color: theme.textDim, fontSize: 11 }}>
        <span>{stats.model ?? 'claude'}</span>
        <span style={{ color: theme.cyan, letterSpacing: 2 }}>⬡ TRACE-VIZ</span>
      </div>
    </div>
  );
}
```

**Step 2: Write `src/web/src/artifact/generatePNG.ts`**

```typescript
import html2canvas from 'html2canvas';

export async function exportPNG(cardEl: HTMLElement): Promise<void> {
  const canvas = await html2canvas(cardEl, {
    backgroundColor: '#0a0a0f',
    scale: 1,
    useCORS: true,
    logging: false,
  });
  const link = document.createElement('a');
  link.download = `trace-viz-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
```

**Step 3: Write `src/web/src/artifact/generateHTML.ts`**

```typescript
import type { TraceEvent, SessionStats } from '../../../shared/types';

export function exportHTML(events: TraceEvent[], stats: SessionStats): void {
  const snapshot = JSON.stringify({ events, stats });
  const injected = document.documentElement.outerHTML.replace(
    '</head>',
    `<script>window.__TRACE_VIZ_SNAPSHOT__ = ${snapshot};</script></head>`
  );
  const blob = new Blob([injected], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `trace-viz-snapshot-${Date.now()}.html`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
```

**Step 4: Wire Export button in `App.tsx`**

Add state for format selector modal and hook up the Export button to render `ArtifactCard` offscreen then call `exportPNG` and `exportHTML`.

Replace the `ExportButton` component:

```tsx
import { useRef, useState } from 'react';
import { ArtifactCard } from './artifact/ArtifactCard';
import { exportPNG } from './artifact/generatePNG';
import { exportHTML } from './artifact/generateHTML';

function ExportButton() {
  const { events, stats } = useEvents();
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (!stats || exporting) return;
    setExporting(true);
    await new Promise(r => setTimeout(r, 100)); // let card render
    const el = document.getElementById('artifact-card');
    if (el) await exportPNG(el);
    exportHTML(events, stats);
    setExporting(false);
  };

  return (
    <>
      {stats && <ArtifactCard events={events} stats={stats} format="1080x1080" />}
      <button onClick={handleExport} disabled={exporting} style={{
        background: 'transparent', color: theme.gold,
        border: `1px solid ${theme.gold}44`, padding: '3px 14px',
        borderRadius: 3, cursor: 'pointer', fontSize: 10,
        letterSpacing: 1.5, fontFamily: 'inherit',
        opacity: exporting ? 0.5 : 1,
      }}>
        {exporting ? '...' : '⬡ EXPORT'}
      </button>
    </>
  );
}
```

**Step 5: Commit**

```bash
git add src/web/src/artifact/
git commit -m "feat: add PNG session card and HTML snapshot artifact export"
```

---

### Task 15: Replay Command

**Files:**
- Create: `src/cli/commands/replay.ts`
- Create: `src/cli/commands/replay.test.ts`

**Step 1: Write failing test**

```typescript
import { expect, test } from 'bun:test';
import { parseJSONL } from './replay';

test('parseJSONL parses valid lines', () => {
  const events = parseJSONL('{"type":"notification"}\n{"type":"tool_start"}\n');
  expect(events).toHaveLength(2);
  expect(events[0].type).toBe('notification');
});

test('parseJSONL skips invalid lines silently', () => {
  const events = parseJSONL('{"type":"notification"}\nnot-json\n{"type":"tool_start"}');
  expect(events).toHaveLength(2);
});

test('parseJSONL handles empty string', () => {
  expect(parseJSONL('')).toHaveLength(0);
});
```

**Step 2: Run to verify failure**

```bash
bun test src/cli/commands/replay.test.ts
```

**Step 3: Write `src/cli/commands/replay.ts`**

```typescript
import { readFile } from 'fs/promises';
import type { TraceEvent } from '../../shared/types';

export function parseJSONL(content: string): TraceEvent[] {
  return content
    .split('\n')
    .filter(Boolean)
    .flatMap(line => {
      try { return [JSON.parse(line) as TraceEvent]; }
      catch { return []; }
    });
}

export async function runReplay(filePath: string, speed = 1): Promise<void> {
  if (!filePath) {
    console.error('Usage: trace-viz replay <session.jsonl> [speed]');
    process.exit(1);
  }
  const content = await readFile(filePath, 'utf-8');
  const events = parseJSONL(content);

  const { createServer } = await import('../../daemon/server');
  const { openBrowser } = await import('../open-browser');
  await createServer({ port: 7823, devMode: false });
  openBrowser('http://localhost:7823');

  console.log(`⬡ Replaying ${events.length} events at ${speed}x...`);

  for (let i = 0; i < events.length; i++) {
    await fetch('http://localhost:7823/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook: '__replay__', ...events[i] }),
    });
    const next = events[i + 1];
    if (next) {
      const delay = Math.min(2000, (next.timestamp - events[i].timestamp) / speed);
      if (delay > 10) await Bun.sleep(delay);
    }
  }
  console.log('⬡ Replay complete.');
}
```

**Step 4: Run tests**

```bash
bun test src/cli/commands/replay.test.ts
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/cli/commands/replay.ts src/cli/commands/replay.test.ts
git commit -m "feat: add JSONL session replay command"
```

---

### Task 16: Integration Test + Full Test Suite

**Files:**
- Create: `src/daemon/integration.test.ts`

**Step 1: Write integration test**

```typescript
import { expect, test, beforeAll, afterAll } from 'bun:test';
import { createServer } from './server';

let server: Awaited<ReturnType<typeof createServer>>;

beforeAll(async () => {
  server = await createServer({ port: 7826, devMode: false });
});

afterAll(() => server.stop());

test('full pipeline: POST event → /events contains it', async () => {
  await fetch('http://localhost:7826/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hook: 'Notification', message: 'integration', session_id: 'integ' }),
  });
  const res = await fetch('http://localhost:7826/events');
  const events = await res.json() as unknown[];
  expect(events.length).toBeGreaterThan(0);
});

test('WebSocket receives broadcast event', () =>
  new Promise<void>((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:7826');
    const timeout = setTimeout(() => reject(new Error('timeout')), 3000);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as Record<string, unknown>;
      if (msg.type === 'notification') {
        clearTimeout(timeout); ws.close(); resolve();
      }
    };
    ws.onopen = () => fetch('http://localhost:7826/event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook: 'Notification', message: 'ws-test', session_id: 'ws' }),
    });
  })
);
```

**Step 2: Run full test suite**

```bash
bun test
```

Expected: All tests PASS. If any fail, fix before continuing.

**Step 3: Commit**

```bash
git add src/daemon/integration.test.ts
git commit -m "test: add integration test for full event pipeline"
```

---

### Task 17: CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

**Step 1: Write `CLAUDE.md`**

Create a `CLAUDE.md` at repo root covering:
- Build, dev, and test commands
- Architecture overview (daemon → WebSocket → TUI + web)
- Key file paths (entry points, shared types, panels, artifact)
- How to run the full stack locally
- Hook installation process

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md"
```

---

## Running the Full Stack

After all tasks complete, verify end-to-end:

```bash
# Terminal 1: Start daemon + web dashboard
bun run src/cli/index.ts start

# Terminal 2: Start TUI HUD
bun run src/tui/index.ts

# Terminal 3: Send test events
curl -s -X POST http://localhost:7823/event \
  -H 'Content-Type: application/json' \
  -d '{"hook":"PreToolUse","tool_name":"Bash","session_id":"demo-1"}'

curl -s -X POST http://localhost:7823/event \
  -H 'Content-Type: application/json' \
  -d '{"hook":"PostToolUse","tool_name":"Bash","duration_ms":1200,"session_id":"demo-1"}'
```

Expected: TUI HUD updates, web dashboard bars spike and glow.

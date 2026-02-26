# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run all tests (21 tests across 7 files)
bun test

# Run a single test file
bun test src/daemon/server.test.ts

# Start the daemon (port 7823)
bun run dev:daemon

# Start Vite dev server (port 5173)
bun run dev:web

# Start the Ink TUI HUD
bun run dev:tui

# Build web app to dist/web/
bun run build:web

# Start daemon + open browser (production mode, serves dist/web/)
bun run src/cli/index.ts start

# Install Claude Code hooks into the current project
bun run src/cli/index.ts init

# Replay a saved session
bun run src/cli/index.ts replay ~/.trace-viz/sessions/<uuid>.jsonl
```

## Architecture

trace-viz is a real-time Claude Code session visualizer with three runtime components. The **daemon** (`src/daemon/server.ts`) is a Bun HTTP + WebSocket server on port 7823 that receives hook events via `POST /event`, normalizes them, appends to an in-memory `EventStore`, writes to a per-session JSONL file, and broadcasts to all connected WebSocket clients. The **TUI HUD** (`src/tui/`) is an Ink React component that renders a compact live status bar in the terminal. The **web dashboard** (`src/web/`) is a Vite + React app with synthwave styling featuring a Canvas visualizer, D3 agent topology graph, and analytics panel, organized into 4 preset layouts (Balanced, Vibe, Mission Control, Debrief) with panel fullscreen on double-click and keyboard shortcuts B/V/M/D.

## Key Files

| File | Purpose |
|------|---------|
| `src/shared/types.ts` | Canonical event schema — `TraceEvent`, `SessionStats`, all event interfaces. Both daemon and web import from here. |
| `src/daemon/server.ts` | Bun HTTP + WebSocket server; `createServer(options)` wires EventStore, SessionLogger, normalizer, and broadcast. |
| `src/daemon/normalizer.ts` | Converts raw Claude Code hook payloads to typed `TraceEvent` objects. |
| `src/daemon/store.ts` | In-memory `EventStore`; accumulates events and computes `SessionStats`. |
| `src/daemon/logger.ts` | `SessionLogger` streams events as JSONL to `~/.trace-viz/sessions/<uuid>.jsonl`. |
| `src/web/src/contexts/EventContext.tsx` | WebSocket client; auto-detects `window.__TRACE_VIZ_SNAPSHOT__` for HTML replay mode. |
| `src/web/src/panels/` | `Visualizer.tsx` (Canvas 2D), `Topology.tsx` (D3), `Analytics.tsx` |
| `src/web/src/layouts/` | `Balanced.tsx`, `Vibe.tsx`, `MissionControl.tsx`, `Debrief.tsx`, `Panel.tsx` |
| `src/web/src/artifact/` | `generatePNG.ts`, `generateHTML.ts`, `ArtifactCard.tsx` — session export via the ⬡ EXPORT button |
| `src/cli/index.ts` | CLI entry point dispatching `start`, `init`, `replay`, `hook` commands. |
| `src/hooks/` | Bash scripts installed as Claude Code hooks: `pre-tool-use.sh`, `post-tool-use.sh`, `notification.sh`, `pre-compact.sh`, `post-compact.sh`, `stop.sh`. |
| `vite.config.ts` | Root `src/web`, builds to `dist/web/`, aliases `@shared` to `src/shared`. |

## Data Flow

```
Claude Code hook fires
  → bash script in src/hooks/
    → POST http://localhost:7823/event  (raw hook payload)
      → normalizer.ts  (converts to TraceEvent)
        → EventStore (in-memory accumulation + stats)
        → SessionLogger (append to ~/.trace-viz/sessions/<uuid>.jsonl)
        → WebSocket broadcast to all clients
          → EventContext (React state update)
            → panels re-render (Visualizer / Topology / Analytics)
```

For HTML exports, `generateHTML.ts` embeds `window.__TRACE_VIZ_SNAPSHOT__ = { events, stats }` into the file; `EventContext` detects this and skips the WebSocket connection, loading snapshot data directly.

## Development Notes

**Bun PATH**: Bun installs to `~/.bun/bin/bun`. If `bun` is not in PATH, either run `export PATH="$HOME/.bun/bin:$PATH"` or invoke it directly. Install with `curl -fsSL https://bun.sh/install | bash` if absent.

**Port assignments**:
- `7823` — daemon (production and `dev:daemon`)
- `7824` — `server.test.ts` test server
- `7826` — `integration.test.ts` test server
- `5173` — Vite dev server

**Dev setup for web + daemon**: The Vite config (`vite.config.ts`) does not include a proxy to the daemon, so in dev you have two options: (1) run `bun run build:web` then `bun run src/cli/index.ts start` to serve the built app from the daemon on port 7823, or (2) manually add a proxy in `vite.config.ts` pointing `/` (WebSocket upgrade) and `/event` to `localhost:7823` and run `bun run dev:daemon` alongside `bun run dev:web`.

**Sessions**: Each daemon run creates a new UUID session. JSONL logs accumulate at `~/.trace-viz/sessions/`. The `replay` command loads a JSONL file and re-broadcasts events so the web dashboard can review past sessions.

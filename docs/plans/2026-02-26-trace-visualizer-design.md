# trace-viz Design Document

**Date:** 2026-02-26
**Status:** Approved

## Overview

A real-time visualizer and analytics tool for Claude Code sessions. Part old-school audio visualizer, part observability dashboard — it surfaces the rhythm, topology, and statistics of agentic AI work in a way that is both beautiful and informative.

Two simultaneous outputs: a lightweight TUI HUD that lives in the terminal alongside Claude Code, and a full web dashboard that opens in the browser for rich visualization.

---

## Architecture

### Data Flow

```
Claude Code (hooks)
       │
       │ HTTP POST  (bash hook scripts, ~1 line each)
       ▼
┌─────────────────────┐
│  trace-viz daemon   │  ← single Bun process
│  (localhost:7823)   │
│                     │
│  • Event normalizer │
│  • In-memory store  │──→ ~/.trace-viz/sessions/<id>.jsonl
│  • WebSocket hub    │
└──────────┬──────────┘
           │  WebSocket
    ┌──────┴──────┐
    ▼             ▼
 TUI HUD     Web Dashboard
 (Ink)       (React + Vite, auto-opened in browser)
```

### Event Types

Captured via Claude Code hooks configured by `trace-viz init`:

| Hook | Event emitted | Data |
|------|--------------|------|
| `PreToolUse` | `tool_start` | tool name, agent ID, input (sanitized) |
| `PostToolUse` | `tool_end` | duration, success/error, output size |
| `Notification` | `notification` | message text, level |
| `Stop` | `session_end` | token totals, model |
| `PreCompact` / `PostCompact` | `compact_start` / `compact_end` | context size before/after |

Synthetic events derived from data:
- `agent_spawn` — inferred from `Task` tool calls in `tool_start`
- `agent_complete` — inferred from matching `tool_end` for `Task` tool calls

### Replay

`trace-viz replay <session.jsonl>` feeds stored events through the same pipeline at configurable speed (1x, 2x, 5x, or instant scrub).

---

## Project Structure

```
src/
  daemon/       ← Bun HTTP + WebSocket server, event store, session logger
  tui/          ← Ink HUD component
  web/          ← Vite + React app (served statically by daemon)
    panels/
      Visualizer.tsx    ← Canvas 2D frequency-bar animation
      Topology.tsx      ← D3 force-directed agent graph
      Analytics.tsx     ← live stats panel
    layouts/            ← Vibe / Balanced / Mission Control / Debrief
    artifact/           ← PNG card + HTML snapshot generators
  hooks/        ← bash hook scripts + `trace-viz init` installer
  shared/       ← event type definitions, shared schemas (used by all)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Language | TypeScript throughout |
| TUI | Ink (React for CLI) |
| Web framework | Vite + React + TypeScript |
| Visualizer animation | Canvas 2D API |
| Agent topology | D3 force-directed graph |
| Artifact PNG export | `html2canvas` (offscreen Canvas render) |
| Artifact HTML export | Self-contained inline bundle |

---

## Web Dashboard

### Panel Layouts

Four preset layouts switchable via keyboard shortcuts. All synthwave-styled.

| Key | Name | Description |
|-----|------|-------------|
| `V` | **Vibe** | Full-screen visualizer — ambient/screensaver mode |
| `B` | **Balanced** | Three-panel default: visualizer / topology / analytics |
| `M` | **Mission Control** | Topology dominates center, visualizer strip across the bottom |
| `D` | **Debrief** | Analytics full-width, visualizer as pulsing header bar |

- Double-click any panel → fullscreen that panel; `Esc` → return to layout
- Active layout persists to `localStorage`
- Layout switcher in header as both keyboard shortcuts and an icon strip

### Visualizer Panel

Canvas 2D frequency-bar animation. Each bar represents a tool type; bar height encodes call frequency/recency; idle state pulses slowly, tool calls spike hard.

Tool-type color mapping (synthwave palette):
- Bash/shell → `#9d00ff` (purple)
- File ops (read/write/edit) → `#00f5ff` (cyan)
- Web/search → `#ff2d78` (pink)
- Task/subagent → `#ffd700` (gold)
- Other → `#ffffff` (white)

Bars rendered with `drop-shadow` glow filter. Scanline texture overlay via `repeating-linear-gradient` across the full page.

### Agent Topology Panel

D3 force-directed graph on dark canvas. Nodes = agents/subagents. Edges = spawn relationships.

- Node size encodes current context token usage
- Active agent: pulsing pink ring
- Completed agents: dimmed, retain position
- Subtle synthwave grid background

### Analytics Panel

Live-updating counters with digit-roll animation on change. Includes: total tokens, estimated cost, tool call breakdown by type (neon thin progress bars), time-in-thinking vs time-in-tools ratio.

---

## TUI HUD

Single richly-colored status bar rendered by Ink. Appears as a persistent line in the terminal session.

```
 ⬡ trace-viz  │  agent[0] → read_file  │  ▁▂▄▇▄▂▁  42k tok  │  3 subagents  │  02:14
```

- Unicode block chars (`▁▂▃▄▅▆▇█`) for a mini inline activity visualizer
- Chalk colors: cyan for agent names, purple for tool names, pink for errors
- Subtle spinner during model thinking phases

---

## Session Artifact

Generated at session end or via the `⬡ Export` button in the dashboard header.

### PNG Session Card

Exported at 1080×1920 (portrait) or 1080×1080 (square), user-selectable. Generated via offscreen Canvas render → `toBlob()` → download.

Contents:
1. **Session waveform** — centerpiece abstract visualization. Each tool call event maps to a frequency/amplitude value; rendered as a flowing waveform unique to this session's activity pattern. No two sessions look the same.
2. **Agent topology** — miniature snapshot of the final force graph
3. **Stat trio** — tokens / cost / duration in a styled grid
4. **Tool breakdown** — horizontal bar chart by tool type
5. **Footer** — date, session ID, model name, trace-viz branding

### HTML Snapshot

Self-contained `.html` file with all CSS, JS, and session data inlined. Renders the full dashboard in its final state with animations intact. Includes an embedded replay mode that re-animates the session from the inlined event log.

Shareable as a file or hostable on any static host.

---

## Visual Aesthetic

**Synthwave / cyberpunk dark:**

| Token | Value |
|-------|-------|
| Background | `#0a0a0f` |
| Primary accent | `#9d00ff` (purple) |
| Secondary accent | `#00f5ff` (cyan) |
| Highlight | `#ff2d78` (pink) |
| Text | `#e8e8e8` |
| Subtle text | `#4a4a6a` |
| Glow | `drop-shadow` / `box-shadow` with accent colors |
| Texture | Scanline overlay, subtle grid on topology panel |

---

## CLI Commands

```bash
trace-viz start          # start daemon + open web dashboard
trace-viz init           # install Claude Code hooks into ~/.claude/settings.json
trace-viz stop           # stop daemon
trace-viz replay <file>  # replay a saved session JSONL
trace-viz export <file>  # export PNG + HTML artifact from a session JSONL
```

---

## Key Design Constraints

- **Beautiful by default** — every preset layout and the artifact must look intentional and polished, not utilitarian
- **Non-intrusive TUI** — the HUD must not disrupt Claude Code's own terminal output
- **Shared event pipeline** — TUI and web consume the same WebSocket stream; no duplicated data logic
- **Local-first** — no external services; all data stays on the user's machine
- **YAGNI on configurability** — preset layouts only; drag-to-resize is a future concern

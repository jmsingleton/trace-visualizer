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

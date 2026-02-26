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

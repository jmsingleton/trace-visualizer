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

import { expect, test, beforeAll, afterAll } from 'bun:test';
import { createServer } from './server';

let server: Awaited<ReturnType<typeof createServer>>;

beforeAll(async () => {
  server = await createServer({ port: 7826, devMode: false });
});

afterAll(() => server.stop(true));

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

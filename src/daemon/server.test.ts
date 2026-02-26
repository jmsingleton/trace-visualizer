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

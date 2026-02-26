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

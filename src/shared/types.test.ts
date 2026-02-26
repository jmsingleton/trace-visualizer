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

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

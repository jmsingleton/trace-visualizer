import { expect, test } from 'bun:test';
import { buildHooksConfig } from './init';

test('buildHooksConfig produces all six hook types', () => {
  const config = buildHooksConfig('/usr/local/bin/trace-viz');
  expect(Object.keys(config.hooks)).toContain('PreToolUse');
  expect(Object.keys(config.hooks)).toContain('PostToolUse');
  expect(Object.keys(config.hooks)).toContain('Notification');
  expect(Object.keys(config.hooks)).toContain('Stop');
  expect(Object.keys(config.hooks)).toContain('PreCompact');
  expect(Object.keys(config.hooks)).toContain('PostCompact');
});

test('hook commands reference the binary path', () => {
  const config = buildHooksConfig('/usr/local/bin/trace-viz');
  const preToolUse = config.hooks.PreToolUse[0].hooks[0].command;
  expect(preToolUse).toContain('/usr/local/bin/trace-viz');
});

import { expect, test } from 'bun:test';
import { parseJSONL } from './replay';

test('parseJSONL parses valid lines', () => {
  const events = parseJSONL('{"type":"notification"}\n{"type":"tool_start"}\n');
  expect(events).toHaveLength(2);
  expect(events[0].type).toBe('notification');
});

test('parseJSONL skips invalid lines silently', () => {
  const events = parseJSONL('{"type":"notification"}\nnot-json\n{"type":"tool_start"}');
  expect(events).toHaveLength(2);
});

test('parseJSONL handles empty string', () => {
  expect(parseJSONL('')).toHaveLength(0);
});

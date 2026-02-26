import { randomUUID } from 'crypto';
import type { TraceEvent, ToolType } from '../shared/types';

const TOOL_TYPE_MAP: Record<string, ToolType> = {
  Read: 'file', Write: 'file', Edit: 'file', Glob: 'file', Grep: 'file', NotebookEdit: 'file',
  Bash: 'bash',
  WebFetch: 'web', WebSearch: 'web',
  Task: 'task',
};

function toolType(name: string): ToolType {
  return TOOL_TYPE_MAP[name] ?? 'other';
}

export function normalizeHookPayload(
  payload: Record<string, unknown>,
  agentId: string
): TraceEvent | null {
  const base = {
    id: randomUUID(),
    sessionId: (payload.session_id as string) ?? 'unknown',
    agentId,
    timestamp: Date.now(),
  };

  switch (payload.hook) {
    case 'PreToolUse': {
      const toolName = payload.tool_name as string;
      if (toolName === 'Task') {
        const input = payload.tool_input as Record<string, unknown> | undefined;
        const childId = (input?.subagent_id as string) ?? `agent-${base.id.slice(0, 6)}`;
        return { ...base, type: 'agent_spawn', parentAgentId: agentId, childAgentId: childId };
      }
      return { ...base, type: 'tool_start', toolName, toolType: toolType(toolName) };
    }
    case 'PostToolUse': {
      const toolName = payload.tool_name as string;
      const resp = payload.tool_response as Record<string, unknown> | undefined;
      return {
        ...base, type: 'tool_end', toolName, toolType: toolType(toolName),
        durationMs: (payload.duration_ms as number) ?? 0,
        success: !resp?.error,
        outputSize: typeof resp?.output === 'string' ? resp.output.length : undefined,
      };
    }
    case 'Notification':
      return { ...base, type: 'notification', message: (payload.message as string) ?? '', level: 'info' };
    case 'Stop':
      return {
        ...base, type: 'session_end',
        totalInputTokens: (payload.total_input_tokens as number) ?? 0,
        totalOutputTokens: (payload.total_output_tokens as number) ?? 0,
        model: (payload.model as string) ?? 'unknown',
      };
    case 'PreCompact':
      return { ...base, type: 'compact_start', tokensBefore: payload.tokens_before as number };
    case 'PostCompact':
      return { ...base, type: 'compact_end', tokensAfter: payload.tokens_after as number };
    case '__replay__': {
      // Pass through already-normalized replay events
      const replayEvent = payload as unknown as TraceEvent;
      if (replayEvent.type) return { ...replayEvent, id: base.id, timestamp: base.timestamp };
      return null;
    }
    default:
      return null;
  }
}

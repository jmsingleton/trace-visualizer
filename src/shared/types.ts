export type ToolType = 'bash' | 'file' | 'web' | 'task' | 'other';

export interface BaseEvent {
  id: string;
  sessionId: string;
  agentId: string;
  timestamp: number;
}

export interface ToolStartEvent extends BaseEvent {
  type: 'tool_start';
  toolName: string;
  toolType: ToolType;
}

export interface ToolEndEvent extends BaseEvent {
  type: 'tool_end';
  toolName: string;
  toolType: ToolType;
  durationMs: number;
  success: boolean;
  outputSize?: number;
}

export interface NotificationEvent extends BaseEvent {
  type: 'notification';
  message: string;
  level: 'info' | 'warning' | 'error';
}

export interface SessionEndEvent extends BaseEvent {
  type: 'session_end';
  totalInputTokens: number;
  totalOutputTokens: number;
  model: string;
}

export interface CompactEvent extends BaseEvent {
  type: 'compact_start' | 'compact_end';
  tokensBefore?: number;
  tokensAfter?: number;
}

export interface AgentSpawnEvent extends BaseEvent {
  type: 'agent_spawn';
  parentAgentId: string;
  childAgentId: string;
}

export interface AgentCompleteEvent extends BaseEvent {
  type: 'agent_complete';
  parentAgentId: string;
  childAgentId: string;
}

export type TraceEvent =
  | ToolStartEvent
  | ToolEndEvent
  | NotificationEvent
  | SessionEndEvent
  | CompactEvent
  | AgentSpawnEvent
  | AgentCompleteEvent;

export interface SessionStats {
  sessionId: string;
  startTime: number;
  endTime?: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  toolCallCount: number;
  toolCallsByType: Record<ToolType, number>;
  agentCount: number;
  model?: string;
}

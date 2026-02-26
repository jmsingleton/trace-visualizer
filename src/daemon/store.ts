import type { TraceEvent, SessionStats, ToolType } from '../shared/types';

export class EventStore {
  private events: TraceEvent[] = [];
  private readonly startTime = Date.now();

  constructor(public readonly sessionId: string) {}

  add(event: TraceEvent): void {
    this.events.push(event);
  }

  getAll(): TraceEvent[] {
    return [...this.events];
  }

  getStats(): SessionStats {
    const toolEnds = this.events.filter(e => e.type === 'tool_end');
    const toolCallsByType: Record<ToolType, number> = { bash: 0, file: 0, web: 0, task: 0, other: 0 };
    for (const e of toolEnds) {
      if (e.type === 'tool_end') toolCallsByType[e.toolType]++;
    }
    const agentIds = new Set(this.events.map(e => e.agentId));
    const sessionEnd = this.events.find(e => e.type === 'session_end');
    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      endTime: sessionEnd ? Date.now() : undefined,
      totalInputTokens: sessionEnd?.type === 'session_end' ? sessionEnd.totalInputTokens : 0,
      totalOutputTokens: sessionEnd?.type === 'session_end' ? sessionEnd.totalOutputTokens : 0,
      toolCallCount: toolEnds.length,
      toolCallsByType,
      agentCount: agentIds.size,
      model: sessionEnd?.type === 'session_end' ? sessionEnd.model : undefined,
    };
  }
}

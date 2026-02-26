import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { TraceEvent, SessionStats } from '../../shared/types';

const TOOL_COLORS: Record<string, string> = {
  bash: 'magenta', file: 'cyan', web: 'red', task: 'yellow', other: 'white',
};

const BLOCKS = '▁▂▃▄▅▆▇█';

function MiniViz({ activity }: { activity: number }) {
  const idx = Math.min(7, Math.floor(activity * 8));
  return <Text color="cyan">{BLOCKS[idx]}</Text>;
}

export function HUD() {
  const [lastTool, setLastTool] = useState<{ name: string; type: string } | null>(null);
  const [activity, setActivity] = useState(0);
  const [tokenStr, setTokenStr] = useState('0');
  const [subagents, setSubagents] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket;
    const connect = () => {
      try {
        ws = new WebSocket('ws://localhost:7823');
        ws.onopen = () => setConnected(true);
        ws.onclose = () => { setConnected(false); setTimeout(connect, 2000); };
        ws.onerror = () => { /* retry handled by onclose */ };
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data as string) as TraceEvent | { type: 'snapshot'; stats: SessionStats };
          if (msg.type === 'snapshot') {
            const s = (msg as { type: 'snapshot'; stats: SessionStats }).stats;
            const total = s.totalInputTokens + s.totalOutputTokens;
            setTokenStr(total > 1000 ? `${(total / 1000).toFixed(1)}k` : String(total));
            return;
          }
          if (msg.type === 'tool_start') {
            setLastTool({ name: msg.toolName, type: msg.toolType });
            setActivity(1.0);
          }
          if (msg.type === 'agent_spawn') setSubagents(s => s + 1);
        };
      } catch { /* connection failed, retry */ }
    };
    connect();
    return () => { try { ws?.close(); } catch { /* ignore */ } };
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setActivity(a => Math.max(0, a - 0.08));
      setElapsed(e => e + 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <Box borderStyle="round" borderColor={connected ? 'cyan' : 'gray'} paddingX={1} gap={1}>
      <Text color="cyan" bold>⬡ trace-viz</Text>
      <Text color="gray">│</Text>
      {lastTool ? (
        <Box gap={0}>
          <Text color="white">agent[0] → </Text>
          <Text color={TOOL_COLORS[lastTool.type] ?? 'white'}>{lastTool.name}</Text>
        </Box>
      ) : (
        <Text color="gray">{connected ? 'waiting...' : 'connecting...'}</Text>
      )}
      <Text color="gray">│</Text>
      <MiniViz activity={activity} />
      <Text color="white"> {tokenStr} tok</Text>
      <Text color="gray">│</Text>
      <Text color="magenta">{subagents} subagents</Text>
      <Text color="gray">│</Text>
      <Text color="white">{mm}:{ss}</Text>
    </Box>
  );
}

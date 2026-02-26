import React, { useState, useEffect, useRef } from 'react';
import { useEvents } from '../contexts/EventContext';
import { theme } from '../styles/theme';
import type { ToolType } from '../../../shared/types';

const COST_INPUT  = 0.003 / 1000;
const COST_OUTPUT = 0.015 / 1000;

const TOOL_COLORS: Record<ToolType, string> = {
  bash: theme.purple, file: theme.cyan, web: theme.pink, task: theme.gold, other: theme.text,
};

function RollingNumber({ value, format = (v: number) => v.toLocaleString() }: {
  value: number; format?: (v: number) => string;
}) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (value === prev.current) return;
    const start = prev.current;
    const end = value;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 500);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + (end - start) * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    prev.current = value;
  }, [value]);

  return <>{format(Math.round(display))}</>;
}

export function Analytics() {
  const { stats } = useEvents();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const inputTok  = stats?.totalInputTokens  ?? 0;
  const outputTok = stats?.totalOutputTokens ?? 0;
  const totalTok  = inputTok + outputTok;
  const cost      = inputTok * COST_INPUT + outputTok * COST_OUTPUT;
  const counts    = stats?.toolCallsByType ?? { bash: 0, file: 0, web: 0, task: 0, other: 0 };
  const maxCount  = Math.max(1, ...Object.values(counts));
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  const statCard = (label: string, value: React.ReactNode, color: string) => (
    <div key={label} style={{
      background: theme.bg, border: `1px solid ${theme.bgPanelBorder}`,
      borderRadius: 6, padding: '14px 10px', textAlign: 'center',
    }}>
      <div style={{ color: theme.textDim, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{value}</div>
    </div>
  );

  return (
    <div style={{
      width: '100%', height: '100%', background: theme.bgPanel, borderRadius: 6,
      padding: 18, display: 'flex', flexDirection: 'column', gap: 18, overflow: 'auto',
    }}>
      {/* Stat trio */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {statCard('TOKENS', <RollingNumber value={totalTok} />, theme.cyan)}
        {statCard('COST',   `$${cost.toFixed(4)}`,              theme.pink)}
        {statCard('TIME',   `${mm}:${ss}`,                      theme.purple)}
      </div>

      {/* Tool breakdown */}
      <div>
        <div style={{ color: theme.textDim, fontSize: 9, letterSpacing: 2, marginBottom: 14 }}>TOOL BREAKDOWN</div>
        {(Object.entries(counts) as [ToolType, number][]).map(([type, count]) => (
          <div key={type} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ color: TOOL_COLORS[type], fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>{type}</span>
              <span style={{ color: theme.text, fontSize: 10 }}>{count}</span>
            </div>
            <div style={{ height: 3, background: theme.bg, borderRadius: 2 }}>
              <div style={{
                height: '100%',
                width: `${(count / maxCount) * 100}%`,
                background: TOOL_COLORS[type],
                borderRadius: 2,
                boxShadow: `0 0 6px ${TOOL_COLORS[type]}88`,
                transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 'auto', fontSize: 10, color: theme.textDim }}>
        <span style={{ color: theme.gold }}>{stats?.agentCount ?? 1}</span> agent{(stats?.agentCount ?? 1) !== 1 ? 's' : ''}
        {stats?.model && <> · <span>{stats.model}</span></>}
      </div>
    </div>
  );
}

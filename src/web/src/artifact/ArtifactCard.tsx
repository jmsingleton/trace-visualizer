import React from 'react';
import { theme } from '../styles/theme';
import type { SessionStats, TraceEvent, ToolType } from '../../../shared/types';

const TOOL_COLORS: Record<ToolType, string> = {
  bash: theme.purple, file: theme.cyan, web: theme.pink, task: theme.gold, other: theme.text,
};

function SessionWaveform({ events }: { events: TraceEvent[] }) {
  const toolEnds = events.filter(e => e.type === 'tool_end');
  if (toolEnds.length === 0) {
    return <div style={{ height: 120, background: theme.bgPanel, borderRadius: 4 }} />;
  }

  const W = 960; const H = 120;
  const points = toolEnds.map((e, i) => {
    const x = (i / Math.max(1, toolEnds.length - 1)) * W;
    const dur = e.type === 'tool_end' ? e.durationMs : 0;
    const y = H * 0.5 + Math.sin(i * 1.4) * H * 0.2 + Math.min(H * 0.25, dur / 20);
    return [x, Math.max(8, Math.min(H - 8, y))] as [number, number];
  });

  const pathD = `M ${points.map(([x, y]) => `${x},${y}`).join(' L ')}`;
  const fillD = `${pathD} L ${W},${H} L 0,${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 120 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="wg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={theme.purple} />
          <stop offset="50%"  stopColor={theme.cyan} />
          <stop offset="100%" stopColor={theme.pink} />
        </linearGradient>
        <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={theme.cyan} stopOpacity="0.2" />
          <stop offset="100%" stopColor={theme.cyan} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillD} fill="url(#fg)" />
      <path d={pathD} fill="none" stroke="url(#wg)" strokeWidth="2.5" />
      {points
        .filter((_, i) => i % Math.max(1, Math.floor(points.length / 20)) === 0)
        .map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill={theme.cyan} opacity="0.7" />
        ))}
    </svg>
  );
}

interface ArtifactCardProps {
  events: TraceEvent[];
  stats: SessionStats;
  format: '1080x1920' | '1080x1080';
}

export function ArtifactCard({ events, stats, format }: ArtifactCardProps) {
  const [cardW, cardH] = format === '1080x1920' ? [1080, 1920] : [1080, 1080];
  const totalTok = stats.totalInputTokens + stats.totalOutputTokens;
  const cost = stats.totalInputTokens * 0.003 / 1000 + stats.totalOutputTokens * 0.015 / 1000;
  const dur = (stats.endTime ?? Date.now()) - stats.startTime;
  const mm = String(Math.floor(dur / 60000)).padStart(2, '0');
  const ss = String(Math.floor((dur % 60000) / 1000)).padStart(2, '0');
  const date = new Date(stats.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div id="artifact-card" style={{
      position: 'fixed', left: -9999, top: 0,
      width: cardW, height: cardH,
      background: theme.bg,
      fontFamily: "'JetBrains Mono', monospace",
      color: theme.text,
      padding: 72,
      display: 'flex', flexDirection: 'column', gap: 48,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: theme.cyan, fontSize: 32, fontWeight: 700, letterSpacing: 4 }}>⬡ TRACE-VIZ</div>
          <div style={{ color: theme.textDim, fontSize: 14, letterSpacing: 3, marginTop: 6 }}>SESSION REPORT</div>
        </div>
        <div style={{ textAlign: 'right', color: theme.textDim, fontSize: 12 }}>
          <div>{date}</div>
          <div style={{ color: theme.textDim, marginTop: 4 }}>{stats.sessionId.slice(0, 12)}</div>
        </div>
      </div>

      {/* Waveform */}
      <div>
        <div style={{ color: theme.textDim, fontSize: 10, letterSpacing: 3, marginBottom: 12 }}>SESSION WAVEFORM</div>
        <SessionWaveform events={events} />
      </div>

      {/* Stat trio */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
        {([
          ['TOKENS', totalTok.toLocaleString(), theme.cyan],
          ['COST',   `$${cost.toFixed(4)}`,     theme.pink],
          ['TIME',   `${mm}:${ss}`,              theme.purple],
        ] as [string, string, string][]).map(([label, val, color]) => (
          <div key={label} style={{
            background: theme.bgPanel, border: `1px solid ${theme.bgPanelBorder}`,
            borderRadius: 8, padding: '24px 16px', textAlign: 'center',
          }}>
            <div style={{ color: theme.textDim, fontSize: 11, letterSpacing: 3, marginBottom: 10 }}>{label}</div>
            <div style={{ color, fontSize: 32, fontWeight: 700 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Tool breakdown */}
      <div>
        <div style={{ color: theme.textDim, fontSize: 10, letterSpacing: 3, marginBottom: 20 }}>TOOL BREAKDOWN</div>
        {(Object.entries(stats.toolCallsByType) as [ToolType, number][])
          .filter(([, c]) => c > 0)
          .map(([type, count]) => (
            <div key={type} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: TOOL_COLORS[type], fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>{type}</span>
                <span style={{ color: theme.text, fontSize: 12 }}>{count}</span>
              </div>
              <div style={{ height: 5, background: theme.bgPanel, borderRadius: 3 }}>
                <div style={{
                  height: '100%',
                  width: `${(count / stats.toolCallCount) * 100}%`,
                  background: TOOL_COLORS[type],
                  borderRadius: 3,
                }} />
              </div>
            </div>
          ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', color: theme.textDim, fontSize: 11 }}>
        <span>{stats.model ?? 'claude'}</span>
        <span style={{ color: theme.cyan, letterSpacing: 2 }}>⬡ TRACE-VIZ</span>
      </div>
    </div>
  );
}

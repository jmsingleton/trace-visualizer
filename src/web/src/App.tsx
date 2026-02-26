import React, { useState, useEffect } from 'react';
import { EventProvider, useEvents } from './contexts/EventContext';
import { theme } from './styles/theme';
import { Balanced } from './layouts/Balanced';
import { Vibe } from './layouts/Vibe';
import { MissionControl } from './layouts/MissionControl';
import { Debrief } from './layouts/Debrief';
import './styles/globals.css';

type Layout = 'balanced' | 'vibe' | 'mission' | 'debrief';

const LAYOUT_KEYS: Record<string, Layout> = { b: 'balanced', v: 'vibe', m: 'mission', d: 'debrief' };
const LAYOUTS: Record<Layout, React.ComponentType> = {
  balanced: Balanced,
  vibe:     Vibe,
  mission:  MissionControl,
  debrief:  Debrief,
};

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span style={{
      width: 8, height: 8, borderRadius: '50%',
      background: connected ? theme.cyan : theme.textDim,
      boxShadow: connected ? theme.glow.cyan : 'none',
      display: 'inline-block',
      transition: 'all 0.3s',
    }} />
  );
}

function Header({ layout, setLayout }: { layout: Layout; setLayout: (l: Layout) => void }) {
  const { connected } = useEvents();
  return (
    <header style={{
      height: 44, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16,
      borderBottom: `1px solid ${theme.bgPanelBorder}`, flexShrink: 0,
      background: theme.bg,
    }}>
      <span style={{ color: theme.cyan, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>⬡ TRACE-VIZ</span>
      <StatusDot connected={connected} />
      <nav style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
        {(['balanced', 'vibe', 'mission', 'debrief'] as Layout[]).map(l => (
          <button key={l} onClick={() => setLayout(l)} style={{
            background: layout === l ? `${theme.purple}22` : 'transparent',
            color: layout === l ? theme.purple : theme.textDim,
            border: `1px solid ${layout === l ? theme.purple : theme.bgPanelBorder}`,
            padding: '3px 12px', borderRadius: 3, cursor: 'pointer',
            fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
            boxShadow: layout === l ? theme.glow.purple : 'none',
            transition: 'all 0.15s',
          }}>
            {l[0].toUpperCase()}
          </button>
        ))}
      </nav>
      <div style={{ marginLeft: 'auto' }}>
        <button id="export-btn" style={{
          background: 'transparent', color: theme.gold,
          border: `1px solid ${theme.gold}44`, padding: '3px 14px',
          borderRadius: 3, cursor: 'pointer', fontSize: 10,
          letterSpacing: 1.5,
        }}>
          ⬡ EXPORT
        </button>
      </div>
    </header>
  );
}

export function App() {
  const [layout, setLayout] = useState<Layout>('balanced');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const l = LAYOUT_KEYS[e.key.toLowerCase()];
      if (l) setLayout(l);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const LayoutComponent = LAYOUTS[layout];

  return (
    <EventProvider>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.bg }}>
        <Header layout={layout} setLayout={setLayout} />
        <div style={{ flex: 1, overflow: 'hidden', padding: 8 }}>
          <LayoutComponent />
        </div>
      </div>
    </EventProvider>
  );
}

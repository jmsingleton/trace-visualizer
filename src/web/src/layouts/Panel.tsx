import React, { useState, useEffect } from 'react';
import { theme } from '../styles/theme';

interface PanelProps {
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Panel({ title, children, style }: PanelProps) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen]);

  return (
    <div
      onDoubleClick={() => setFullscreen(f => !f)}
      style={{
        position: fullscreen ? 'fixed' : 'relative',
        inset: fullscreen ? 0 : undefined,
        zIndex: fullscreen ? 200 : undefined,
        display: 'flex', flexDirection: 'column',
        border: `1px solid ${theme.bgPanelBorder}`,
        borderRadius: 6, overflow: 'hidden',
        background: theme.bgPanel,
        ...style,
      }}
    >
      <div style={{
        padding: '5px 12px', flexShrink: 0,
        borderBottom: `1px solid ${theme.bgPanelBorder}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ color: theme.textDim, fontSize: 9, letterSpacing: 2 }}>{title.toUpperCase()}</span>
        {fullscreen && (
          <span
            onClick={e => { e.stopPropagation(); setFullscreen(false); }}
            style={{ color: theme.textDim, fontSize: 9, cursor: 'pointer', letterSpacing: 1 }}
          >ESC ✕</span>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

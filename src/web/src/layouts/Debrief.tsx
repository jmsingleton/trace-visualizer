import React from 'react';
import { Panel } from './Panel';
import { Visualizer } from '../panels/Visualizer';
import { Analytics } from '../panels/Analytics';

export function Debrief() {
  return (
    <div style={{ display: 'grid', gridTemplateRows: '100px 1fr', gap: 8, height: '100%' }}>
      <Panel title="Session Activity"><Visualizer /></Panel>
      <Panel title="Analytics"><Analytics /></Panel>
    </div>
  );
}

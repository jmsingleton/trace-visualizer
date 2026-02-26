import React from 'react';
import { Panel } from './Panel';
import { Visualizer } from '../panels/Visualizer';
import { Topology } from '../panels/Topology';
import { Analytics } from '../panels/Analytics';

export function Balanced() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, height: '100%' }}>
      <Panel title="Visualizer"><Visualizer /></Panel>
      <Panel title="Agent Topology"><Topology /></Panel>
      <Panel title="Analytics"><Analytics /></Panel>
    </div>
  );
}
